/**
 * Admin REST API routes
 * Mounted at /admin/* on the Express server.
 * JWT-based auth for the standalone admin panel.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, sql, gte, lte, like, or, count, sum, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import crypto from "crypto";
import logger from "../logger";
import {
  users,
  userProfiles,
  rides,
  ridePassengers,
  payments,
  transactions,
  wallets,
  driverSessions,
  emergencyAlerts,
  promoCodes,
  promoUsage,
  referrals,
  ratings,
  surgeZones,
  notifications,
  chatMessages,
  analytics,
  driverApplications,
  fileUploads,
  supportTickets,
  supportMessages,
  faqItems,
  liveChatSessions,
  liveChatMessages,
  adminAuditLogs,
  platformConfig,
  systemAlerts,
  alertRules,
  connectedAccounts,
} from "../../drizzle/schema";

// ─── DB Connection ──────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const pool = mysql.createPool(DATABASE_URL!);
const db = drizzle(pool);

// ─── Password Helpers ───────────────────────────────────────────────────────

import bcryptAdmin from "bcryptjs";

async function hashAdminPassword(password: string): Promise<string> {
  return bcryptAdmin.hash(password, 12);
}

async function verifyAdminPassword(password: string, hash: string): Promise<boolean> {
  return bcryptAdmin.compare(password, hash);
}

import { createAdminToken, requireAdmin, type AdminRequest } from "../middleware/adminAuth";
import { getAdminRole, listAdminRoles, setAdminRole } from "../services/adminRbacService";
import type { AdminRole } from "../../shared/adminRbac";

// ─── Audit Log (DB-persistent) ──────────────────────────────────────────────

function logAudit(
  req: Request,
  action: string,
  entity: string,
  entityId: string,
  details: string,
  beforeState?: any,
  afterState?: any,
) {
  const adminUser = (req as any).adminUser;
  db.insert(adminAuditLogs).values({
    adminId: adminUser?.id || 0,
    adminEmail: adminUser?.email || "system",
    action,
    entity,
    entityId,
    details,
    beforeState: beforeState ?? null,
    afterState: afterState ?? null,
    ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
    userAgent: req.headers?.["user-agent"]?.slice(0, 499) || null,
  }).catch((err) => logger.error({ err }, "[audit] Failed to write log"));
}

// ─── Admin Login Rate Limiting ──────────────────────────────────────────────

const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const ADMIN_WINDOW_MS = 60 * 1000; // 1 minute window for general rate limiting

interface AdminLoginEntry { count: number; lockedUntil: number }
const adminLoginAttempts = new Map<string, AdminLoginEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of adminLoginAttempts) {
    if (now > v.lockedUntil + ADMIN_LOGIN_LOCKOUT_MS) adminLoginAttempts.delete(k);
  }
}, 5 * 60 * 1000);

function checkAdminLoginRateLimit(ip: string): void {
  const entry = adminLoginAttempts.get(ip);
  if (entry && Date.now() < entry.lockedUntil && entry.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
    const minsLeft = Math.ceil((entry.lockedUntil - Date.now()) / 60_000);
    throw new Error(`TOO_MANY: Too many failed login attempts. Try again in ${minsLeft} minutes.`);
  }
}

function recordAdminLoginFailure(ip: string): void {
  const entry = adminLoginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + ADMIN_LOGIN_LOCKOUT_MS;
    logger.warn({ ip, count: entry.count }, "[admin] Login account locked after repeated failures");
  }
  adminLoginAttempts.set(ip, entry);
}

function clearAdminLoginAttempts(ip: string): void { adminLoginAttempts.delete(ip); }

// ─── Router ─────────────────────────────────────────────────────────────────

const adminRouter = Router();

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.post("/auth/login", async (req: Request, res: Response) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  try {
    checkAdminLoginRateLimit(ip);

    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Find user by email with admin role
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.role, "admin")))
      .limit(1);

    if (!user) {
      const [adminCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.role, "admin"));
      if ((adminCount?.count ?? 0) === 0) {
        res.status(401).json({ error: "No admin configured", needsSetup: true });
        return;
      }
      recordAdminLoginFailure(ip);
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Verify password using bcrypt hash stored in passwordHash column
    if (!user.passwordHash) {
      res.status(401).json({ error: "Admin account not configured. Please set a password." });
      return;
    }

    const isValid = await verifyAdminPassword(password, user.passwordHash);
    if (!isValid) {
      recordAdminLoginFailure(ip);
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    clearAdminLoginAttempts(ip);
    const adminRole = await getAdminRole(user.id);
    const token = createAdminToken({ id: user.id, email: user.email!, role: user.role });

    logAudit(
      { ...req, adminUser: { id: user.id, name: user.name } } as any,
      "login",
      "admin",
      String(user.id),
      `Admin login: ${user.email}`,
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: adminRole,
        avatar: null,
      },
    });
  } catch (err: any) {
    if (err.message?.startsWith("TOO_MANY:")) {
      res.status(429).json({ error: err.message.replace("TOO_MANY: ", "") });
      return;
    }
    res.status(500).json({ error: "Login failed" });
  }
});

adminRouter.post("/auth/setup", async (req: Request, res: Response) => {
  try {
    const [adminCount] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    if ((adminCount?.count ?? 0) > 0) {
      res.status(403).json({ error: "Admin account already configured" });
      return;
    }

    const { email, password, name } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    if (String(password).length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const passwordHash = await hashAdminPassword(password);
    const openId = `admin-${crypto.randomUUID()}`;
    const [result] = await db.insert(users).values({
      openId,
      name: name || "Admin",
      email,
      role: "admin",
      passwordHash,
      loginMethod: "email",
    });
    const userId = (result as { insertId: number }).insertId;

    await db.insert(userProfiles).values({ userId, isDriver: false });

    await setAdminRole(userId, "super_admin");
    const token = createAdminToken({ id: userId, email, role: "admin" });
    logAudit(
      { ...req, adminUser: { id: userId, name: name || "Admin", email } } as any,
      "setup",
      "admin",
      String(userId),
      `Initial admin setup: ${email}`,
    );

    res.json({
      token,
      user: { id: userId, name: name || "Admin", email, role: "super_admin" as AdminRole, avatar: null },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Setup failed" });
  }
});

adminRouter.get("/auth/me", requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as AdminRequest).adminUser!;
  res.json({
    user: { id: admin.id, name: admin.name, email: admin.email, role: admin.adminRole, avatar: null },
  });
});

adminRouter.get("/rbac/roles", requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as AdminRequest).adminUser!;
  if (admin.adminRole !== "super_admin") {
    res.status(403).json({ error: "Requires super_admin role" });
    return;
  }
  res.json(await listAdminRoles());
});

adminRouter.patch("/rbac/roles/:userId", requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as AdminRequest).adminUser!;
  if (admin.adminRole !== "super_admin") {
    res.status(403).json({ error: "Requires super_admin role" });
    return;
  }
  const targetId = parseInt(req.params.userId, 10);
  const { role } = req.body as { role: AdminRole };
  if (!targetId || !role) {
    res.status(400).json({ error: "userId and role required" });
    return;
  }
  if (targetId === admin.id && role !== "super_admin") {
    res.status(400).json({ error: "Cannot demote yourself" });
    return;
  }
  await setAdminRole(targetId, role);
  logAudit(req, "role_change", "admin", String(targetId), `Department role set to ${role}`);
  res.json({ ok: true, userId: targetId, role });
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [driverCount] = await db
      .select({ count: count() })
      .from(userProfiles)
      .where(eq(userProfiles.isDriver, true));
    const [rideCount] = await db.select({ count: count() }).from(rides);
    const [activeRideCount] = await db
      .select({ count: count() })
      .from(rides)
      .where(inArray(rides.status, ["searching", "matched", "driver_arrived", "in_progress"]));
    const [onlineDriverCount] = await db
      .select({ count: count() })
      .from(driverSessions)
      .where(eq(driverSessions.status, "online"));
    const { getLedgerRevenueTotal } = await import("../services/paymentLedgerService");
    const totalRevenue = await getLedgerRevenueTotal();
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const todayRevenue = await getLedgerRevenueTotal(todayStart);
    const [todayRideCount] = await db
      .select({ count: count() })
      .from(rides)
      .where(gte(rides.createdAt, new Date(new Date().setHours(0, 0, 0, 0))));
    const [alertCount] = await db
      .select({ count: count() })
      .from(emergencyAlerts)
      .where(eq(emergencyAlerts.status, "active"));
    const [avgRating] = await db
      .select({ avg: sql<string>`AVG(${ratings.score})` })
      .from(ratings);

    res.json({
      totalUsers: userCount.count,
      totalDrivers: driverCount.count,
      totalRides: rideCount.count,
      activeRides: activeRideCount.count,
      onlineDrivers: onlineDriverCount.count,
      totalRevenue,
      todayRides: todayRideCount.count,
      todayRevenue,
      pendingAlerts: alertCount.count,
      avgRating: parseFloat(avgRating.avg || "5.0"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/executive-metrics", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { cached, CACHE_TTL } = await import("../services/adminCacheService");
    const { getExecutiveMetrics } = await import("../services/executiveMetricsService");
    const data = await cached("executive-metrics", CACHE_TTL.executive, getExecutiveMetrics);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/stats/revenue", requireAdmin, async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || "30d";
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { getLedgerRevenueByDay } = await import("../services/paymentLedgerService");
    res.json(await getLedgerRevenueByDay(since));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/stats/rides-by-status", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ status: rides.status, count: count() })
      .from(rides)
      .groupBy(rides.status);
    res.json(rows.map((r) => ({ status: r.status, count: r.count })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/stats/recent-activity", requireAdmin, async (_req: Request, res: Response) => {
  try {
    // Recent rides
    const recentRides = await db
      .select()
      .from(rides)
      .orderBy(desc(rides.createdAt))
      .limit(10);

    const { getRecentLedgerPayments } = await import("../services/paymentLedgerService");
    const recentPayments = await getRecentLedgerPayments(5);

    // Recent alerts
    const recentAlerts = await db
      .select()
      .from(emergencyAlerts)
      .orderBy(desc(emergencyAlerts.createdAt))
      .limit(5);

    const activity = [
      ...recentRides.map((r) => ({
        type: "ride" as const,
        id: r.rideId,
        description: `Ride ${r.rideId} — ${r.status}`,
        timestamp: r.createdAt,
      })),
      ...recentPayments.map((p: { paymentId: string; amountCents: number; status: string; createdAt: Date }) => ({
        type: "payment" as const,
        id: p.paymentId,
        description: `Payment $${(p.amountCents / 100).toFixed(2)} — ${p.status}`,
        timestamp: p.createdAt,
      })),
      ...recentAlerts.map((a) => ({
        type: "alert" as const,
        id: a.alertId,
        description: `${a.alertType} alert — ${a.status}`,
        timestamp: a.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);

    res.json(activity);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/users", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const filter = (req.query.filter as string) || "all";
    const gender = (req.query.gender as string) || "all";
    const offset = (page - 1) * limit;

    let conditions: any[] = [];

    if (search) {
      conditions.push(
        or(
          like(users.name, `%${search}%`),
          like(users.email, `%${search}%`),
        ),
      );
    }

    if (filter === "admins") conditions.push(eq(users.role, "admin"));

    // Gender filter — applied via JOIN on userProfiles
    let profileConditions: any[] = [];
    const VALID_GENDERS = ["male", "female", "non_binary", "prefer_not_to_say"] as const;
    type GenderEnum = typeof VALID_GENDERS[number];
    if (gender !== "all" && VALID_GENDERS.includes(gender as GenderEnum)) {
      profileConditions.push(eq(userProfiles.gender, gender as GenderEnum));
    }

    const allConditions = [...conditions, ...profileConditions];

    const [totalResult] = await db
      .select({ count: count() })
      .from(users)
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(allConditions.length ? and(...allConditions) : undefined);

    const rows = await db
      .select()
      .from(users)
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(allConditions.length ? and(...allConditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const result = rows.map((r) => ({
      ...r.users,
      profile: r.user_profiles || null,
    }));

    // Apply post-query filter for driver/passenger/students
    let filtered = result;
    if (filter === "drivers") filtered = result.filter((u) => u.profile?.isDriver);
    if (filter === "passengers") filtered = result.filter((u) => !u.profile?.isDriver);
    if (filter === "students") filtered = result.filter((u) => u.profile?.isStudentVerified);

    res.json({
      users: filtered,
      total: totalResult.count,
      page,
      totalPages: Math.ceil(totalResult.count / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/users/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, id))
      .limit(1);

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, id)).limit(1);

    const recentRides = await db
      .select()
      .from(rides)
      .where(eq(rides.driverId, id))
      .orderBy(desc(rides.createdAt))
      .limit(5);

    const recentTx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, id))
      .orderBy(desc(transactions.createdAt))
      .limit(5);

    const userRatings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.ratedUserId, id))
      .orderBy(desc(ratings.createdAt))
      .limit(10);

    res.json({
      ...user,
      profile: profile || null,
      wallet: wallet || null,
      recentRides,
      recentTransactions: recentTx,
      ratings: userRatings,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/users/:id/role", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }
    await db.update(users).set({ role }).where(eq(users.id, id));
    logAudit(req, "role_change", "user", String(id), `Role changed to ${role}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/users/:id/driver-status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { isDriver } = req.body;
    if (typeof isDriver !== "boolean") {
      res.status(400).json({ error: "isDriver must be a boolean" });
      return;
    }

    const now = new Date();

    // 1. Upsert user_profiles.isDriver flag
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, id)).limit(1);
    if (!profile) {
      await db.insert(userProfiles).values({ userId: id, isDriver });
    } else {
      await db.update(userProfiles).set({ isDriver }).where(eq(userProfiles.userId, id));
    }

    // 2. Sync driver_applications — the mobile app grants access ONLY when
    //    driver_applications.status = 'approved'. user_profiles.isDriver alone is
    //    explicitly ignored by getDriverAccessStatus. We must write both.
    const [latestApp] = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.userId, id))
      .orderBy(desc(driverApplications.createdAt))
      .limit(1);

    if (isDriver) {
      if (!latestApp || latestApp.status !== "approved") {
        if (!latestApp) {
          // No application on file — create a synthetic admin-approved record so
          // the mobile app's getDriverAccessStatus returns canAccessDriverMode=true.
          const [userRow] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, id))
            .limit(1);
          await db.insert(driverApplications).values({
            applicationId: crypto.randomUUID(),
            userId: id,
            fullName: userRow?.name || "Admin Approved Driver",
            phoneNumber: "",
            licenseNumber: "ADMIN_OVERRIDE",
            licenseState: "N/A",
            licenseExpiry: "N/A",
            vehicleMake: "N/A",
            vehicleModel: "N/A",
            vehicleYear: new Date().getFullYear(),
            vehicleColor: "N/A",
            plateNumber: "N/A",
            vehicleType: "sedan",
            insurancePolicyNumber: "N/A",
            insuranceProvider: "N/A",
            insuranceExpiry: "N/A",
            status: "approved",
            reviewedAt: now,
            approvedAt: now,
          } as any);
        } else {
          // Existing non-approved application — promote it to approved
          await db
            .update(driverApplications)
            .set({ status: "approved", reviewedAt: now, approvedAt: now, actionRequiredReason: null } as any)
            .where(eq(driverApplications.applicationId, latestApp.applicationId));
        }
        // Notify user
        await db.insert(notifications).values({
          notificationId: `notif_${crypto.randomUUID().slice(0, 8)}`,
          userId: id,
          type: "system",
          title: "You're Approved as a Driver!",
          body: "Your driver access has been approved. Toggle Driver Mode in your Profile to start accepting ride requests.",
          data: JSON.stringify({ type: "driver_application_approved" }),
          deepLink: "/driver/dashboard",
        });
      }
    } else {
      // Revoking: mark latest approved application as rejected so mobile stops granting access
      if (latestApp && latestApp.status === "approved") {
        await db
          .update(driverApplications)
          .set({
            status: "rejected",
            rejectionReason: "Driver access revoked by administrator",
            reviewedAt: now,
            rejectedAt: now,
          } as any)
          .where(eq(driverApplications.applicationId, latestApp.applicationId));
      }
    }

    logAudit(req, "role_change", "user", String(id), `Driver status changed to ${isDriver}`);
    res.json({ success: true, isDriver });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/users/:id/gender", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { gender } = req.body;
    const valid = ["male", "female", "non_binary", "prefer_not_to_say"];
    if (!valid.includes(gender)) {
      res.status(400).json({ error: "Invalid gender value" });
      return;
    }
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, id)).limit(1);
    if (profile) {
      await db.update(userProfiles).set({ gender }).where(eq(userProfiles.userId, id));
    } else {
      await db.insert(userProfiles).values({ userId: id, gender } as any);
    }
    logAudit(req, "gender_change", "user", String(id), `Gender set to ${gender}`);
    res.json({ success: true, gender });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/users/:id/ban", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;
    const [before] = await db.select({ isBanned: userProfiles.isBanned }).from(userProfiles).where(eq(userProfiles.userId, id)).limit(1);
    await db.update(userProfiles).set({
      isBanned: true,
      bannedAt: new Date(),
      banReason: reason || "Banned by admin",
      bannedBy: (req as any).adminUser?.id || null,
    }).where(eq(userProfiles.userId, id));
    logAudit(req, "ban", "user", String(id), `User banned: ${reason || "No reason given"}`, before, { isBanned: true });
    res.json({ success: true, message: "User banned" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/users/:id/unban", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(userProfiles).set({
      isBanned: false,
      bannedAt: null,
      banReason: null,
      bannedBy: null,
    }).where(eq(userProfiles.userId, id));
    logAudit(req, "unban", "user", String(id), `User unbanned`);
    res.json({ success: true, message: "User unbanned" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new user (admin can create drivers, passengers, admins)
adminRouter.post("/users", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, phone, role, gender, isDriver, vehicleType, vehicleColor, licensePlate, driverLicense } = req.body;
    if (!name || !email) {
      res.status(400).json({ error: "Name and email are required" });
      return;
    }

    // Check for duplicate email
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }

    // Insert user
    const openId = `admin_created_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(users).values({
      openId,
      name,
      email,
      role: role || "user",
      loginMethod: "admin_created",
    });

    // Get the created user
    const [newUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!newUser) {
      res.status(500).json({ error: "Failed to create user" });
      return;
    }

    // Create profile
    await db.insert(userProfiles).values({
      userId: newUser.id,
      phoneNumber: phone || null,
      gender: gender || null,
      isDriver: isDriver || false,
      vehicleType: isDriver ? (vehicleType || null) : null,
      vehicleColor: isDriver ? (vehicleColor || null) : null,
      licensePlate: isDriver ? (licensePlate || null) : null,
      driverLicense: isDriver ? (driverLicense || null) : null,
    });

    // Create wallet
    await db.insert(wallets).values({ userId: newUser.id });

    // If driver, create driver session
    if (isDriver) {
      await db.insert(driverSessions).values({
        driverId: newUser.id,
        status: "offline",
      });
    }

    logAudit(req, "create", "user", String(newUser.id), `Created ${isDriver ? 'driver' : 'user'}: ${name} (${email})`);
    res.json({ success: true, user: { ...newUser, profile: { phoneNumber: phone, gender, isDriver } } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete("/users/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    logAudit(req, "delete", "user", String(id), `User deleted`);
    // Soft delete — in production, don't actually delete
    res.json({ success: true, message: "User deletion scheduled" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RIDES
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/rides", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const mode = req.query.mode as string;
    const search = req.query.search as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (status && status !== "all") conditions.push(eq(rides.status, status as any));
    if (mode && mode !== "all") conditions.push(eq(rides.mode, mode as any));
    if (search) conditions.push(like(rides.rideId, `%${search}%`));

    const [totalResult] = await db
      .select({ count: count() })
      .from(rides)
      .where(conditions.length ? and(...conditions) : undefined);

    const rows = await db
      .select()
      .from(rides)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(rides.createdAt))
      .limit(limit)
      .offset(offset);

    // Attach driver names
    const driverIds = [...new Set(rows.map((r) => r.driverId).filter((id): id is number => id != null))];
    const drivers =
      driverIds.length > 0
        ? await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, driverIds))
        : [];
    const driverMap = new Map(drivers.map((d) => [d.id, d.name]));

    res.json({
      rides: rows.map((r) => ({
        ...r,
        driverName: r.driverId != null ? (driverMap.get(r.driverId) || `Driver #${r.driverId}`) : null,
      })),
      total: totalResult.count,
      page,
      totalPages: Math.ceil(totalResult.count / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/rides/active", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const activeRides = await db
      .select()
      .from(rides)
      .where(inArray(rides.status, ["searching", "matched", "driver_arrived", "in_progress"]))
      .orderBy(desc(rides.createdAt))
      .limit(50);
    res.json(activeRides);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/rides/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }

    const passengers = await db
      .select()
      .from(ridePassengers)
      .where(eq(ridePassengers.rideId, ride.id));

    const ridePayments = await (async () => {
      const { getLedgerPaymentsForRide } = await import("../services/paymentLedgerService");
      return getLedgerPaymentsForRide(ride.id);
    })();

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.rideId, ride.id))
      .orderBy(chatMessages.createdAt);

    const [driver] = ride.driverId != null
      ? await db.select().from(users).where(eq(users.id, ride.driverId)).limit(1)
      : [undefined];

    res.json({
      ...ride,
      driver: driver || null,
      passengers,
      payments: ridePayments,
      messages,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/rides/:id/cancel", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;
    await db
      .update(rides)
      .set({
        status: "cancelled",
        rideStep: "cancelled",
        cancelledAt: new Date(),
        cancelReason: reason || "Cancelled by admin",
      })
      .where(eq(rides.id, id));
    logAudit(req, "cancel", "ride", String(id), `Ride cancelled: ${reason || "admin action"}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/payments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const { listLedgerPayments } = await import("../services/paymentLedgerService");
    const result = await listLedgerPayments({ page, limit, status });
    res.json({
      payments: result.payments.map((p) => ({
        id: p.id,
        paymentId: p.paymentId,
        rideId: p.rideId,
        passengerId: p.riderId,
        amount: (p.amountCents / 100).toFixed(2),
        status: p.status === "succeeded" ? "completed" : p.status,
        stripePaymentIntentId: p.stripePaymentIntentId,
        createdAt: p.createdAt,
        source: p.source,
      })),
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/payments/:id/refund", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { amount, reason } = req.body;

    await db
      .update(payments)
      .set({ status: "refunded", refundedAt: new Date() })
      .where(eq(payments.id, id));

    logAudit(req, "refund", "payment", String(id), `Refund $${amount}: ${reason}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/transactions", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string;
    const offset = (page - 1) * limit;

    let conditions: any[] = [];
    if (type && type !== "all") conditions.push(eq(transactions.type, type as any));

    const [totalResult] = await db
      .select({ count: count() })
      .from(transactions)
      .where(conditions.length ? and(...conditions) : undefined);

    const rows = await db
      .select()
      .from(transactions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      transactions: rows,
      total: totalResult.count,
      page,
      totalPages: Math.ceil(totalResult.count / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SAFETY & EMERGENCY
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/safety/alerts", requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    let conditions: any[] = [];
    if (status && status !== "all") conditions.push(eq(emergencyAlerts.status, status as any));

    const rows = await db
      .select()
      .from(emergencyAlerts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(emergencyAlerts.createdAt))
      .limit(100);

    // Attach user names
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const alertUsers =
      userIds.length > 0
        ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
        : [];
    const userMap = new Map(alertUsers.map((u) => [u.id, u.name]));

    res.json(
      rows.map((r) => ({
        ...r,
        userName: userMap.get(r.userId) || `User #${r.userId}`,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/safety/alerts/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { status, notes } = req.body;
    const updates: any = { status };
    if (status === "resolved") updates.resolvedAt = new Date();

    await db.update(emergencyAlerts).set(updates).where(eq(emergencyAlerts.id, id));
    logAudit(req, "update", "emergency_alert", String(id), notes ? `Alert ${status}: ${notes}` : `Alert status: ${status}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PROMOS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/promos", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const [totalResult] = await db.select({ count: count() }).from(promoCodes);
    const rows = await db
      .select()
      .from(promoCodes)
      .orderBy(desc(promoCodes.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ promos: rows, total: totalResult.count, page, totalPages: Math.ceil(totalResult.count / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/promos", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { code, description, discountType, discountValue, maxUses, minRideAmount, maxDiscount, validFrom, validUntil } = req.body;

    await db.insert(promoCodes).values({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue: String(discountValue),
      maxUses: maxUses || null,
      minRideAmount: String(minRideAmount || 0),
      maxDiscount: maxDiscount ? String(maxDiscount) : null,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      isActive: true,
    });

    logAudit(req, "create", "promo", code, `Promo created: ${discountType} ${discountValue}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/promos/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    await db.update(promoCodes).set(updates).where(eq(promoCodes.id, id));
    logAudit(req, "update", "promo", String(id), `Promo updated`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete("/promos/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(promoCodes).where(eq(promoCodes.id, id));
    logAudit(req, "delete", "promo", String(id), `Promo deleted`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REFERRALS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/referrals", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { parsePagination, paginatedResponse } = await import("../services/paginationHelper");
    const { page, limit, offset } = parsePagination(req, { limit: 25, maxLimit: 100 });
    const [totalRow] = await db.select({ count: count() }).from(referrals);
    const rows = await db
      .select()
      .from(referrals)
      .orderBy(desc(referrals.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(paginatedResponse(rows, Number(totalRow.count), page, limit, { referrals: rows }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// OPERATIONS - Surge Zones
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/surge-zones", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(surgeZones).orderBy(desc(surgeZones.createdAt)).limit(500);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/surge-zones", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, centerLat, centerLng, radiusKm, multiplier, reason, activeFrom, activeUntil } = req.body;
    await db.insert(surgeZones).values({
      name,
      centerLat: String(centerLat),
      centerLng: String(centerLng),
      radiusKm: String(radiusKm),
      multiplier: String(multiplier),
      reason,
      activeFrom: new Date(activeFrom),
      activeUntil: new Date(activeUntil),
      isActive: true,
    });
    logAudit(req, "create", "surge_zone", name, `Surge zone: ${multiplier}x`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/surge-zones/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(surgeZones).set(req.body).where(eq(surgeZones.id, id));
    logAudit(req, "update", "surge_zone", String(id), `Surge zone updated`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete("/surge-zones/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(surgeZones).where(eq(surgeZones.id, id));
    logAudit(req, "delete", "surge_zone", String(id), `Surge zone deleted`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/analytics/rides-per-day", requireAdmin, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db
      .select({
        date: sql<string>`DATE(${rides.createdAt})`,
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${rides.status} = 'completed' THEN 1 ELSE 0 END)`,
        cancelled: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' THEN 1 ELSE 0 END)`,
      })
      .from(rides)
      .where(gte(rides.createdAt, since))
      .groupBy(sql`DATE(${rides.createdAt})`)
      .orderBy(sql`DATE(${rides.createdAt})`);

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/analytics/user-growth", requireAdmin, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db
      .select({
        date: sql<string>`DATE(${users.createdAt})`,
        newUsers: count(),
      })
      .from(users)
      .where(gte(users.createdAt, since))
      .groupBy(sql`DATE(${users.createdAt})`)
      .orderBy(sql`DATE(${users.createdAt})`);

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/analytics/popular-routes", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        pickupAddress: rides.pickupAddress,
        dropoffAddress: rides.dropoffAddress,
        count: count(),
        avgFare: sql<string>`AVG(${rides.totalFare})`,
      })
      .from(rides)
      .where(eq(rides.status, "completed"))
      .groupBy(rides.pickupAddress, rides.dropoffAddress)
      .orderBy(desc(count()))
      .limit(10);

    res.json(
      rows.map((r) => ({
        pickup: r.pickupAddress,
        dropoff: r.dropoffAddress,
        count: r.count,
        avgFare: parseFloat(r.avgFare || "0").toFixed(2),
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RATINGS
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS (admin-sent)
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.post("/notifications/send", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, target, title, body, type, gender } = req.body;
    // gender: 'all' | 'male' | 'female' | 'non_binary' — only applied when not targeting a specific user
    const genderFilter = gender && gender !== "all" ? gender : null;

    let targetUsers: { id: number }[] = [];

    if (userId) {
      // Send to specific user — gender filter does not apply
      targetUsers = [{ id: userId }];
    } else if (target === "drivers") {
      const conditions: any[] = [eq(userProfiles.isDriver, true)];
      if (genderFilter) conditions.push(eq(userProfiles.gender, genderFilter));
      const drivers = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(and(...conditions))
        .limit(1000);
      targetUsers = drivers;
    } else if (target === "users") {
      const riderCondition = or(isNull(userProfiles.isDriver), eq(userProfiles.isDriver, false));
      const conditions: any[] = [riderCondition!];
      if (genderFilter) conditions.push(eq(userProfiles.gender, genderFilter));
      const riders = await db
        .select({ id: users.id })
        .from(users)
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(and(...conditions))
        .limit(1000);
      targetUsers = riders;
    } else {
      // All users — optionally filtered by gender
      if (genderFilter) {
        const filtered = await db
          .select({ id: users.id })
          .from(users)
          .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
          .where(eq(userProfiles.gender, genderFilter))
          .limit(1000);
        targetUsers = filtered;
      } else {
        const allUsers = await db.select({ id: users.id }).from(users).limit(1000);
        targetUsers = allUsers;
      }
    }

    if (targetUsers.length > 0) {
      // Batch inserts in chunks of 20 to avoid MySQL query size limits
      const BATCH_SIZE = 20;
      for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
        const chunk = targetUsers.slice(i, i + BATCH_SIZE);
        const values = chunk.map((u) => ({
          notificationId: `notif_admin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${u.id}`,
          userId: u.id,
          type: (type || "system") as any,
          title,
          body,
          isRead: false,
        }));
        await db.insert(notifications).values(values);
      }
    }

    const targetLabel = userId ? String(userId) : target || "all";
    logAudit(req, "send_notification", "notification", targetLabel, `${title} → ${targetUsers.length} users`);
    res.json({ success: true, sentTo: targetUsers.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/audit-logs", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const action = req.query.action as string;
    const entity = req.query.entity as string;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (action && action !== "all") conditions.push(eq(adminAuditLogs.action, action));
    if (entity && entity !== "all") conditions.push(eq(adminAuditLogs.entity, entity));

    const [{ total }] = await db
      .select({ total: count() })
      .from(adminAuditLogs)
      .where(conditions.length ? and(...conditions) : undefined);

    const logs = await db
      .select()
      .from(adminAuditLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DRIVER SESSIONS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/drivers/online", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(driverSessions)
      .where(eq(driverSessions.status, "online"));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/drivers/top", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const topDrivers = await db
      .select({
        driverId: userProfiles.userId,
        totalRides: userProfiles.totalRides,
        totalEarnings: userProfiles.totalEarnings,
        averageRating: userProfiles.averageRating,
        vehicleType: userProfiles.vehicleType,
      })
      .from(userProfiles)
      .where(eq(userProfiles.isDriver, true))
      .orderBy(desc(userProfiles.totalRides))
      .limit(10);

    // Get names
    const driverIds = topDrivers.map((d) => d.driverId);
    const driverUsers =
      driverIds.length > 0
        ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, driverIds))
        : [];
    const nameMap = new Map(driverUsers.map((u) => [u.id, u.name]));

    res.json(
      topDrivers.map((d) => ({
        ...d,
        name: nameMap.get(d.driverId) || `Driver #${d.driverId}`,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Payment Stats ──────────────────────────────────────────────────────────

adminRouter.get("/stats/payments", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [configRow] = await db
      .select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, "commission_pct"))
      .limit(1);
    const commissionPct = parseFloat(configRow?.value ?? "15") || 15;
    const { getLedgerPaymentStats } = await import("../services/paymentLedgerService");
    res.json(await getLedgerPaymentStats(commissionPct));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Driver Payouts ─────────────────────────────────────────────────────────

adminRouter.get("/drivers/payouts", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const driverRows = await db
      .select({
        driverId: rides.driverId,
        pendingEarnings: sql<string>`COALESCE(SUM(${rides.totalFare} * 0.85), 0)`,
        rideCount: sql<number>`COUNT(*)`,
      })
      .from(rides)
      .where(and(eq(rides.status, "completed")))
      .groupBy(rides.driverId)
      .orderBy(sql`pendingEarnings DESC`)
      .limit(20);

    const driverIds = driverRows.map((d) => d.driverId).filter(Boolean) as number[];
    let nameMap = new Map<number, string>();
    if (driverIds.length > 0) {
      const names = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, driverIds));
      names.forEach((n) => nameMap.set(n.id, n.name || `Driver #${n.id}`));
    }

    res.json(
      driverRows.map((d) => ({
        driverId: d.driverId,
        name: nameMap.get(d.driverId!) || `Driver #${d.driverId}`,
        pendingEarnings: Number(d.pendingEarnings || 0).toFixed(2),
        rideCount: d.rideCount,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Notification History ───────────────────────────────────────────────────

adminRouter.get("/notifications/history", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 20;

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: notifications.id,
          notificationId: notifications.notificationId,
          userId: notifications.userId,
          userName: users.name,
          type: notifications.type,
          title: notifications.title,
          body: notifications.body,
          isRead: notifications.isRead,
          createdAt: notifications.createdAt,
          readAt: notifications.readAt,
        })
        .from(notifications)
        .leftJoin(users, eq(notifications.userId, users.id))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ total: count() }).from(notifications),
    ]);

    const total = totalRows[0]?.total || 0;
    res.json({ notifications: rows, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Peak Hours Analytics ───────────────────────────────────────────────────

adminRouter.get("/analytics/peak-hours", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        hour: sql<number>`HOUR(${rides.createdAt})`,
        dayOfWeek: sql<number>`DAYOFWEEK(${rides.createdAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(rides)
      .where(gte(rides.createdAt, sql`DATE_SUB(NOW(), INTERVAL 30 DAY)`))
      .groupBy(sql`HOUR(${rides.createdAt})`, sql`DAYOFWEEK(${rides.createdAt})`);

    // Build 24x7 matrix
    const matrix: Record<string, any>[] = [];
    const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const maxCount = Math.max(1, ...rows.map((r) => r.count));

    for (let h = 0; h < 24; h++) {
      const entry: any = { hour: `${h.toString().padStart(2, "0")}:00` };
      for (let d = 0; d < 7; d++) {
        const match = rows.find((r) => r.hour === h && r.dayOfWeek === d + 1);
        entry[dayNames[d]] = match ? Math.round((match.count / maxCount) * 100) / 100 : 0;
      }
      matrix.push(entry);
    }

    res.json(matrix);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analytics Summary Stats ────────────────────────────────────────────────

adminRouter.get("/analytics/summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const period = String(req.query.period || "30D");
    let days = 30;
    if (period === "Today" || period === "1D") days = 1;
    else if (period === "7D") days = 7;
    else if (period === "90D") days = 90;

    const since = sql`DATE_SUB(NOW(), INTERVAL ${days} DAY)`;
    const [ridesRow] = await db.select({ total: sql<number>`COUNT(*)` }).from(rides).where(gte(rides.createdAt, since));
    const [completedRow] = await db.select({ total: sql<number>`COUNT(*)` }).from(rides).where(and(gte(rides.createdAt, since), eq(rides.status, "completed")));
    const [fareRow] = await db.select({ avg: sql<string>`COALESCE(AVG(${rides.totalFare}), 0)` }).from(rides).where(and(gte(rides.createdAt, since), eq(rides.status, "completed")));
    const [ratingRow] = await db.select({ avg: sql<string>`COALESCE(AVG(${ratings.score}), 0)` }).from(ratings).where(gte(ratings.createdAt, since));

    const totalRides = ridesRow?.total || 0;
    const completedRides = completedRow?.total || 0;
    const completionRate = totalRides > 0 ? Math.round((completedRides / totalRides) * 1000) / 10 : 0;

    res.json({
      totalRides,
      avgFare: Number(fareRow?.avg || 0).toFixed(2),
      completionRate,
      avgRating: Number(ratingRow?.avg || 0).toFixed(2),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER APPLICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** List driver applications by status */
adminRouter.get("/driver-applications", requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || "pending");
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const validStatuses = ["draft", "pending", "under_review", "action_required", "approved", "rejected", "all"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status filter" });
      return;
    }

    const whereClause = status === "all"
      ? undefined
      : eq(driverApplications.status, status as any);

    const apps = await db
      .select({
        id: driverApplications.id,
        applicationId: driverApplications.applicationId,
        userId: driverApplications.userId,
        fullName: driverApplications.fullName,
        phoneNumber: driverApplications.phoneNumber,
        profilePhotoUrl: driverApplications.profilePhotoUrl,
        licenseNumber: driverApplications.licenseNumber,
        licenseState: driverApplications.licenseState,
        licenseExpiry: driverApplications.licenseExpiry,
        licenseFrontUrl: driverApplications.licenseFrontUrl,
        licenseBackUrl: driverApplications.licenseBackUrl,
        vehicleMake: driverApplications.vehicleMake,
        vehicleModel: driverApplications.vehicleModel,
        vehicleYear: driverApplications.vehicleYear,
        vehicleColor: driverApplications.vehicleColor,
        plateNumber: driverApplications.plateNumber,
        vehicleType: driverApplications.vehicleType,
        insurancePolicyNumber: driverApplications.insurancePolicyNumber,
        insuranceProvider: driverApplications.insuranceProvider,
        insuranceExpiry: driverApplications.insuranceExpiry,
        insuranceDocUrl: driverApplications.insuranceDocUrl,
        bankName: driverApplications.bankName,
        accountLast4: driverApplications.accountLast4,
        routingLast4: driverApplications.routingLast4,
        status: driverApplications.status,
        rejectionReason: driverApplications.rejectionReason,
        reviewedAt: driverApplications.reviewedAt,
        approvedAt: driverApplications.approvedAt,
        rejectedAt: driverApplications.rejectedAt,
        createdAt: driverApplications.createdAt,
        // User info
        userName: users.name,
        userEmail: users.email,
      })
      .from(driverApplications)
      .leftJoin(users, eq(driverApplications.userId, users.id))
      .where(whereClause)
      .orderBy(desc(driverApplications.createdAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(driverApplications)
      .where(whereClause);

    const total = Number(countRow?.total || 0);

    res.json({
      applications: apps,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Get driver application stats */
adminRouter.get("/driver-applications/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await db
      .select({
        status: driverApplications.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(driverApplications)
      .groupBy(driverApplications.status);

    const result: Record<string, number> = { draft: 0, pending: 0, under_review: 0, action_required: 0, approved: 0, rejected: 0, total: 0 };
    for (const row of stats) {
      result[row.status] = Number(row.count);
      result.total += Number(row.count);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Get single driver application detail */
adminRouter.get("/driver-applications/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const apps = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.applicationId, req.params.id))
      .limit(1);

    if (apps.length === 0) { res.status(404).json({ error: "Application not found" }); return; }

    const app = apps[0]!;
    const user = await db.select().from(users).where(eq(users.id, app.userId)).limit(1);

    res.json({ ...app, user: user[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Approve a driver application */
adminRouter.post("/driver-applications/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  try {
    const applicationId = req.params.id;
    const reviewerId = (req as any).adminUser?.id ?? 0;

    const apps = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.applicationId, applicationId))
      .limit(1);

    if (apps.length === 0) { res.status(404).json({ error: "Application not found" }); return; }
    const app = apps[0]!;

    if (app.status === "approved") { res.status(400).json({ error: "Already approved" }); return; }
    if (app.status === "rejected") { res.status(400).json({ error: "Already rejected. User must reapply." }); return; }

    const now = new Date();

    // Update application
    await db.update(driverApplications).set({
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt: now,
      approvedAt: now,
    }).where(eq(driverApplications.applicationId, applicationId));

    // Update user profile
    const existingProfile = await db.select().from(userProfiles).where(eq(userProfiles.userId, app.userId)).limit(1);
    if (existingProfile.length === 0) {
      await db.insert(userProfiles).values({
        userId: app.userId,
        isDriver: true,
        driverLicense: app.licenseNumber,
        vehicleType: app.vehicleType,
        vehicleColor: app.vehicleColor,
        licensePlate: app.plateNumber,
        profilePhoto: app.profilePhotoUrl,
      } as any);
    } else {
      await db.update(userProfiles).set({
        isDriver: true,
        driverLicense: app.licenseNumber,
        vehicleType: app.vehicleType,
        vehicleColor: app.vehicleColor,
        licensePlate: app.plateNumber,
        ...(app.profilePhotoUrl ? { profilePhoto: app.profilePhotoUrl } : {}),
      }).where(eq(userProfiles.userId, app.userId));
    }

    // Send notification
    await db.insert(notifications).values({
      notificationId: `notif_${crypto.randomUUID().slice(0, 8)}`,
      userId: app.userId,
      type: "system",
      title: "You're Approved as a Driver!",
      body: "Congratulations! Your driver application has been approved. Toggle Driver Mode in your Profile to start accepting rides.",
      data: JSON.stringify({ applicationId, type: "driver_application_approved" }),
      deepLink: "/profile",
    });

    res.json({ success: true, status: "approved" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Reject a driver application */
adminRouter.post("/driver-applications/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  try {
    const applicationId = req.params.id;
    const { reason } = req.body;
    const reviewerId = (req as any).adminUser?.id ?? 0;

    if (!reason) { res.status(400).json({ error: "Rejection reason is required" }); return; }

    const apps = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.applicationId, applicationId))
      .limit(1);

    if (apps.length === 0) { res.status(404).json({ error: "Application not found" }); return; }
    const app = apps[0]!;

    if (app.status === "approved") { res.status(400).json({ error: "Cannot reject an approved application" }); return; }
    if (app.status === "rejected") { res.status(400).json({ error: "Already rejected" }); return; }

    const now = new Date();

    await db.update(driverApplications).set({
      status: "rejected",
      rejectionReason: reason,
      reviewedBy: reviewerId,
      reviewedAt: now,
      rejectedAt: now,
    }).where(eq(driverApplications.applicationId, applicationId));

    // Send notification
    await db.insert(notifications).values({
      notificationId: `notif_${crypto.randomUUID().slice(0, 8)}`,
      userId: app.userId,
      type: "system",
      title: "Driver Application Update",
      body: `Your driver application was not approved. Reason: ${reason}. You may reapply after addressing the issues.`,
      data: JSON.stringify({ applicationId, type: "driver_application_rejected", reason }),
      deepLink: "/driver-application-status",
    });

    res.json({ success: true, status: "rejected" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Request changes on a driver application — sets status to action_required */
adminRouter.post("/driver-applications/:id/request-changes", requireAdmin, async (req: Request, res: Response) => {
  try {
    const applicationId = req.params.id;
    const { reason } = req.body;
    const reviewerId = (req as any).adminUser?.id ?? 0;

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: "A reason for the requested changes is required" });
      return;
    }

    const apps = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.applicationId, applicationId))
      .limit(1);

    if (apps.length === 0) { res.status(404).json({ error: "Application not found" }); return; }
    const app = apps[0]!;

    if (app.status === "approved") { res.status(400).json({ error: "Cannot request changes on an approved application" }); return; }
    if (app.status === "rejected") { res.status(400).json({ error: "Application is rejected. Driver must reapply." }); return; }
    if (app.status === "draft") { res.status(400).json({ error: "Application has not been submitted yet." }); return; }

    const now = new Date();

    await db.update(driverApplications).set({
      status: "action_required",
      actionRequiredReason: reason.trim(),
      reviewedBy: reviewerId,
      reviewedAt: now,
      actionRequiredAt: now,
    } as any).where(eq(driverApplications.applicationId, applicationId));

    // Notify driver
    await db.insert(notifications).values({
      notificationId: `notif_${crypto.randomUUID().slice(0, 8)}`,
      userId: app.userId,
      type: "system",
      title: "Action Required on Your Driver Application",
      body: `Your driver application needs updates: ${reason.trim()}. Please open the app and resubmit.`,
      data: JSON.stringify({ applicationId, type: "driver_application_action_required", reason: reason.trim() }),
      deepLink: "/driver-onboarding",
    });

    logAudit(req, "request_changes", "driver_application", applicationId, `Changes requested: ${reason.trim()}`);
    res.json({ success: true, status: "action_required" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Support Tickets ───────────────────────────────────────────────────────

import {
  listAllTickets,
  getTicketStats,
  getAdminTicketDetail,
  updateTicketStatus,
  assignTicket,
  adminReplyToTicket,
  getAllFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  seedDefaultFAQs,
} from "../services/supportService";

/** GET /admin/support/tickets — list with filters */
adminRouter.get("/support/tickets", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, category, priority, search, page, limit } = req.query;
    const result = await listAllTickets({
      status: status as string | undefined,
      category: category as string | undefined,
      priority: priority as string | undefined,
      search: search as string | undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /admin/support/tickets/stats — counts by status */
adminRouter.get("/support/tickets/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await getTicketStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /admin/support/tickets/:id — ticket detail with messages */
adminRouter.get("/support/tickets/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const detail = await getAdminTicketDetail(req.params.id);
    if (!detail) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /admin/support/tickets/:id/status — update status */
adminRouter.patch("/support/tickets/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, adminNotes } = req.body;
    if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
      res.status(400).json({ error: "Invalid status" }); return;
    }
    const ticket = await updateTicketStatus(req.params.id, status, adminNotes);
    logAudit(req, "update_ticket_status", "support_ticket", req.params.id, `Status changed to ${status}`);
    res.json(ticket);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /admin/support/tickets/:id/assign — assign to admin */
adminRouter.patch("/support/tickets/:id/assign", requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser;
    const ticket = await assignTicket(req.params.id, adminUser.id);
    logAudit(req, "assign_ticket", "support_ticket", req.params.id, `Assigned to admin ${adminUser.id}`);
    res.json(ticket);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /admin/support/tickets/:id/reply — admin reply */
adminRouter.post("/support/tickets/:id/reply", requireAdmin, async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser;
    const { message } = req.body;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "Message required" }); return;
    }
    const msg = await adminReplyToTicket(req.params.id, adminUser.id, message);
    logAudit(req, "reply_ticket", "support_ticket", req.params.id, "Admin replied");
    res.json(msg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /admin/support/faqs — list all FAQs */
adminRouter.get("/support/faqs", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const faqs = await getAllFAQs();
    res.json(faqs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /admin/support/faqs — create FAQ */
adminRouter.post("/support/faqs", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { category, question, answer, sortOrder, isActive } = req.body;
    const faq = await createFAQ({ category, question, answer, sortOrder, isActive });
    logAudit(req, "create_faq", "faq", String(faq.id), `Created FAQ: ${question.slice(0, 60)}`);
    res.json(faq);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /admin/support/faqs/:id — update FAQ */
adminRouter.patch("/support/faqs/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const faq = await updateFAQ(id, req.body);
    logAudit(req, "update_faq", "faq", req.params.id, "Updated FAQ");
    res.json(faq);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /admin/support/faqs/:id — delete FAQ */
adminRouter.delete("/support/faqs/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await deleteFAQ(id);
    logAudit(req, "delete_faq", "faq", req.params.id, "Deleted FAQ");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /admin/support/faqs/seed — seed default FAQs */
adminRouter.post("/support/faqs/seed", requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await seedDefaultFAQs();
    if (result.seeded) {
      logAudit(req, "seed_faqs", "faq", "all", `Seeded ${result.count} default FAQs`);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// LIVE CHAT
// ══════════════════════════════════════════════════════════════════════════════

import {
  getAdminChatQueue,
  acceptChatRequest,
  rejectChatRequest,
  adminEndChat,
  getAdminChatDetail,
  getChatStats,
  getAdminChatHistory,
  sendChatMessage as sendLiveChatMessage,
} from "../services/liveChatService";

// Get chat queue (waiting + active)
adminRouter.get("/chat/queue", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, category } = req.query;
    const sessions = await getAdminChatQueue({
      status: status as string | undefined,
      category: category as string | undefined,
    });
    res.json({ sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get chat stats
adminRouter.get("/chat/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await getChatStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get chat history (all sessions)
adminRouter.get("/chat/history", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, search, page, limit } = req.query;
    const result = await getAdminChatHistory({
      status: status as string | undefined,
      search: search as string | undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get chat detail
adminRouter.get("/chat/:sessionId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const detail = await getAdminChatDetail(req.params.sessionId);
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Accept chat request
adminRouter.post("/chat/:sessionId/accept", requireAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).adminUser;
    const result = await acceptChatRequest(req.params.sessionId, admin.id);
    logAudit(req, "chat_accept", "chat", req.params.sessionId, `Admin accepted chat`);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Reject chat request
adminRouter.post("/chat/:sessionId/reject", requireAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).adminUser;
    const { reason } = req.body;
    const result = await rejectChatRequest(req.params.sessionId, admin.id, reason);
    logAudit(req, "chat_reject", "chat", req.params.sessionId, `Admin rejected chat: ${reason || "No reason"}`);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin send message
adminRouter.post("/chat/:sessionId/message", requireAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).adminUser;
    const { content } = req.body;
    if (!content || !content.trim()) {
      res.status(400).json({ error: "Message content is required" });
      return;
    }
    const msg = await sendLiveChatMessage(req.params.sessionId, admin.id, "admin", content);
    res.json(msg);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin end chat
adminRouter.post("/chat/:sessionId/end", requireAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).adminUser;
    const result = await adminEndChat(req.params.sessionId, admin.id);
    logAudit(req, "chat_end", "chat", req.params.sessionId, `Admin ended chat`);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PLATFORM CONFIG
// ══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: Array<{ key: string; value: string; description: string; type: "number" | "string" | "boolean" | "json" }> = [
  { key: "base_fare_economy", value: "2.50", description: "Base fare for economy rides ($)", type: "number" },
  { key: "per_km_rate", value: "1.50", description: "Rate per kilometer ($)", type: "number" },
  { key: "per_min_rate", value: "0.25", description: "Rate per minute ($)", type: "number" },
  { key: "commission_pct", value: "15", description: "Platform commission percentage (%)", type: "number" },
  { key: "max_surge", value: "3.0", description: "Maximum surge pricing multiplier", type: "number" },
  { key: "driver_timeout_sec", value: "30", description: "Seconds driver has to accept a ride", type: "number" },
  { key: "max_search_radius_km", value: "10", description: "Max driver search radius (km)", type: "number" },
  { key: "min_driver_rating", value: "4.0", description: "Minimum driver rating to stay active", type: "number" },
  { key: "share_discount_pct", value: "40", description: "Discount percentage for shared rides (%)", type: "number" },
  { key: "booking_fee", value: "0.99", description: "Fixed booking fee per ride ($)", type: "number" },
];

adminRouter.get("/config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(platformConfig).orderBy(platformConfig.key);
    if (rows.length === 0) {
      await db.insert(platformConfig).values(DEFAULT_CONFIG).onDuplicateKeyUpdate({ set: { value: sql`VALUES(value)` } });
      const seeded = await db.select().from(platformConfig).orderBy(platformConfig.key);
      res.json(seeded);
      return;
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/config/:key", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined || value === null || String(value).trim() === "") {
      res.status(400).json({ error: "Value is required" });
      return;
    }
    const [before] = await db.select().from(platformConfig).where(eq(platformConfig.key, key)).limit(1);
    await db.update(platformConfig).set({
      value: String(value),
      updatedBy: (req as any).adminUser?.id,
    }).where(eq(platformConfig.key, key));
    logAudit(req, "update_config", "config", key, `Config ${key} changed to ${value}`, { value: before?.value }, { value: String(value) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/config/reset", requireAdmin, async (req: Request, res: Response) => {
  try {
    for (const cfg of DEFAULT_CONFIG) {
      await db.update(platformConfig).set({ value: cfg.value, updatedBy: (req as any).adminUser?.id }).where(eq(platformConfig.key, cfg.key));
    }
    logAudit(req, "reset_config", "config", "all", "All config reset to defaults");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// USER PROFILE EDIT
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.patch("/users/:id/profile", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phoneNumber, vehicleType, vehicleColor, licensePlate, driverLicense } = req.body;

    const [before] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id)).limit(1);

    if (name || email) {
      const updates: any = {};
      if (name) updates.name = name;
      if (email) updates.email = email;
      await db.update(users).set(updates).where(eq(users.id, id));
    }

    const profileUpdates: any = {};
    if (phoneNumber !== undefined) profileUpdates.phoneNumber = phoneNumber;
    if (vehicleType !== undefined) profileUpdates.vehicleType = vehicleType;
    if (vehicleColor !== undefined) profileUpdates.vehicleColor = vehicleColor;
    if (licensePlate !== undefined) profileUpdates.licensePlate = licensePlate;
    if (driverLicense !== undefined) profileUpdates.driverLicense = driverLicense;

    if (Object.keys(profileUpdates).length > 0) {
      await db.update(userProfiles).set(profileUpdates).where(eq(userProfiles.userId, id));
    }

    logAudit(req, "update_profile", "user", String(id), `Profile updated`, before, { name, email });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DRIVERS PAGE
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/drivers/documents/expiring", requireAdmin, async (req: Request, res: Response) => {
  try {
    const withinDays = parseInt(req.query.withinDays as string) || 30;
    const { listExpiringDocuments } = await import("../services/driverDetailService");
    res.json(await listExpiringDocuments(withinDays));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/drivers/:id/detail", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { getDriverDetail } = await import("../services/driverDetailService");
    const detail = await getDriverDetail(id);
    if (!detail) { res.status(404).json({ error: "Driver not found" }); return; }
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/drivers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search as string;
    const statusFilter = req.query.status as string;
    const university = req.query.university as string;
    const offset = (page - 1) * limit;

    const conditions: any[] = [eq(userProfiles.isDriver, true)];
    if (search) {
      conditions.push(or(like(users.name, `%${search}%`), like(users.email, `%${search}%`)));
    }
    if (university) {
      conditions.push(eq(userProfiles.studentUniversityDomain, university));
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(and(...conditions));

    const driversQuery = db
      .select({
        id: users.id, name: users.name, email: users.email, createdAt: users.createdAt,
        phoneNumber: userProfiles.phoneNumber, vehicleType: userProfiles.vehicleType,
        vehicleColor: userProfiles.vehicleColor, licensePlate: userProfiles.licensePlate,
        averageRating: userProfiles.averageRating, totalRides: userProfiles.totalRides,
        totalEarnings: userProfiles.totalEarnings, isBanned: userProfiles.isBanned,
        stripeConnectId: userProfiles.stripeConnectId,
      })
      .from(users)
      .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(and(...conditions))
      .orderBy(desc(userProfiles.totalRides))
      .limit(limit)
      .offset(offset);

    const drivers = await driversQuery;

    // Attach online session status
    const driverIds = drivers.map((d) => d.id);
    let sessions: any[] = [];
    if (driverIds.length > 0) {
      sessions = await db
        .select({ driverId: driverSessions.driverId, status: driverSessions.status, todayRides: driverSessions.todayRides, todayEarnings: driverSessions.todayEarnings, acceptanceRate: driverSessions.acceptanceRate, lastSeenAt: driverSessions.lastSeenAt })
        .from(driverSessions)
        .where(inArray(driverSessions.driverId, driverIds));
    }
    const sessionMap = Object.fromEntries(sessions.map((s) => [s.driverId, s]));

    const result = drivers.map((d) => ({ ...d, session: sessionMap[d.id] || null }));

    if (statusFilter && statusFilter !== "all") {
      const filtered = result.filter((d) => (statusFilter === "online" ? d.session?.status === "online" || d.session?.status === "on_ride" : statusFilter === "banned" ? d.isBanned : !d.isBanned));
      res.json({ drivers: filtered, total: filtered.length, page, totalPages: 1 });
      return;
    }

    res.json({ drivers: result, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/drivers/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { action, reason } = req.body;
    if (action === "suspend") {
      await db.update(userProfiles).set({ isBanned: true, bannedAt: new Date(), banReason: reason || "Suspended by admin", bannedBy: (req as any).adminUser?.id }).where(eq(userProfiles.userId, id));
      logAudit(req, "suspend_driver", "driver", String(id), reason || "Suspended");
    } else if (action === "activate") {
      await db.update(userProfiles).set({ isBanned: false, bannedAt: null, banReason: null, bannedBy: null }).where(eq(userProfiles.userId, id));
      logAudit(req, "activate_driver", "driver", String(id), "Driver activated");
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RATINGS PAGE
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/ratings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const flagged = req.query.flagged === "true";
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (flagged) conditions.push(eq(ratings.reportedUnsafeBehavior, true));

    const [{ total }] = await db.select({ total: count() }).from(ratings).where(conditions.length ? and(...conditions) : undefined);

    const rows = await db
      .select({
        id: ratings.id, ratingId: ratings.ratingId, rideId: ratings.rideId,
        raterId: ratings.raterId, ratedUserId: ratings.ratedUserId,
        ratingType: ratings.ratingType, score: ratings.score, comment: ratings.comment,
        reportedUnsafeBehavior: ratings.reportedUnsafeBehavior, createdAt: ratings.createdAt,
        raterName: sql<string>`rater.name`, ratedName: sql<string>`rated.name`,
      })
      .from(ratings)
      .leftJoin(sql`users as rater`, sql`rater.id = ${ratings.raterId}`)
      .leftJoin(sql`users as rated`, sql`rated.id = ${ratings.ratedUserId}`)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ratings.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ ratings: rows, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// BULK OPERATIONS
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.post("/users/bulk-ban", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userIds, reason } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: "userIds array is required" });
      return;
    }
    await db.update(userProfiles).set({ isBanned: true, bannedAt: new Date(), banReason: reason || "Bulk ban by admin", bannedBy: (req as any).adminUser?.id }).where(inArray(userProfiles.userId, userIds));
    logAudit(req, "bulk_ban", "user", userIds.join(","), `Bulk banned ${userIds.length} users: ${reason || ""}`);
    res.json({ success: true, count: userIds.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/rides/bulk-cancel", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { rideIds, reason } = req.body;
    if (!Array.isArray(rideIds) || rideIds.length === 0) {
      res.status(400).json({ error: "rideIds array is required" });
      return;
    }
    await db.update(rides).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason || "Bulk cancel by admin" }).where(inArray(rides.id, rideIds));
    logAudit(req, "bulk_cancel", "ride", rideIds.join(","), `Bulk cancelled ${rideIds.length} rides`);
    res.json({ success: true, count: rideIds.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/search", requireAdmin, async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q || q.length < 2) {
      res.json({ users: [], rides: [], payments: [] });
      return;
    }

    const [usersResult, ridesResult, paymentsResult] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(or(like(users.name, `%${q}%`), like(users.email, `%${q}%`)))
        .limit(5),
      db.select({ id: rides.id, rideId: rides.rideId, status: rides.status, pickupAddress: rides.pickupAddress, dropoffAddress: rides.dropoffAddress, totalFare: rides.totalFare, createdAt: rides.createdAt })
        .from(rides)
        .where(like(rides.rideId, `%${q}%`))
        .limit(5),
      db.select({ id: payments.id, paymentId: payments.paymentId, amount: payments.amount, status: payments.status, createdAt: payments.createdAt })
        .from(payments)
        .where(like(payments.paymentId, `%${q}%`))
        .limit(5),
    ]);

    res.json({ users: usersResult, rides: ridesResult, payments: paymentsResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// LEGAL COMPLIANCE
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/legal/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { getLegalComplianceStats } = await import("../services/legalService");
    res.json(await getLegalComplianceStats());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/legal/acceptances", requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const { listLegalAcceptances } = await import("../services/legalService");
    const rows = await listLegalAcceptances(limit, offset);
    res.json({ acceptances: rows, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CSV EXPORT
// ══════════════════════════════════════════════════════════════════════════════

function toCsv(headers: string[], rows: any[][]): string {
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

adminRouter.get("/export/users", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { parseExportFormat, sendExport } = await import("../services/exportFormatService");
    const format = parseExportFormat(req.query.format);
    const cursor = parseInt(req.query.cursor as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 5000, 10000);
    const rows = cursor > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt, phone: userProfiles.phoneNumber, isDriver: userProfiles.isDriver, rating: userProfiles.averageRating, totalRides: userProfiles.totalRides, isBanned: userProfiles.isBanned })
          .from(users).leftJoin(userProfiles, eq(users.id, userProfiles.userId))
          .where(sql`${users.id} < ${cursor}`)
          .orderBy(desc(users.id)).limit(limit)
      : await db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt, phone: userProfiles.phoneNumber, isDriver: userProfiles.isDriver, rating: userProfiles.averageRating, totalRides: userProfiles.totalRides, isBanned: userProfiles.isBanned })
          .from(users).leftJoin(userProfiles, eq(users.id, userProfiles.userId))
          .orderBy(desc(users.id)).limit(limit);
    const headers = ["ID", "Name", "Email", "Role", "Phone", "Is Driver", "Rating", "Total Rides", "Banned", "Created At"];
    const data = rows.map((r) => [r.id, r.name, r.email, r.role, r.phone, r.isDriver, r.rating, r.totalRides, r.isBanned, r.createdAt]);
    const nextCursor = rows.length === limit ? rows[rows.length - 1]?.id : null;
    if (format === "json" && !req.query.download) {
      res.json({ rows: rows, nextCursor, limit });
      return;
    }
    await sendExport(res, format, "users", headers, data, rows);
    if (nextCursor) res.setHeader("X-Next-Cursor", String(nextCursor));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/export/rides", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { parseExportFormat, sendExport } = await import("../services/exportFormatService");
    const format = parseExportFormat(req.query.format);
    const cursor = parseInt(req.query.cursor as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 5000, 10000);
    const rows = cursor > 0
      ? await db.select({ id: rides.id, rideId: rides.rideId, mode: rides.mode, status: rides.status, pickupAddress: rides.pickupAddress, dropoffAddress: rides.dropoffAddress, totalFare: rides.totalFare, distanceKm: rides.distanceKm, surgeMultiplier: rides.surgeMultiplier, createdAt: rides.createdAt, completedAt: rides.completedAt })
          .from(rides).where(sql`${rides.id} < ${cursor}`).orderBy(desc(rides.id)).limit(limit)
      : await db.select({ id: rides.id, rideId: rides.rideId, mode: rides.mode, status: rides.status, pickupAddress: rides.pickupAddress, dropoffAddress: rides.dropoffAddress, totalFare: rides.totalFare, distanceKm: rides.distanceKm, surgeMultiplier: rides.surgeMultiplier, createdAt: rides.createdAt, completedAt: rides.completedAt })
          .from(rides).orderBy(desc(rides.id)).limit(limit);
    const headers = ["ID", "Ride ID", "Mode", "Status", "Pickup", "Dropoff", "Fare", "Distance (km)", "Surge", "Created", "Completed"];
    const data = rows.map((r) => [r.id, r.rideId, r.mode, r.status, r.pickupAddress, r.dropoffAddress, r.totalFare, r.distanceKm, r.surgeMultiplier, r.createdAt, r.completedAt]);
    if (format === "json" && req.query.download !== "1") {
      res.json({ rows, nextCursor: rows.length === limit ? rows[rows.length - 1]?.id : null, limit });
      return;
    }
    await sendExport(res, format, "rides", headers, data, rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/export/payments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db.select({ id: payments.id, paymentId: payments.paymentId, amount: payments.amount, status: payments.status, paymentMethod: payments.paymentMethod, createdAt: payments.createdAt }).from(payments).orderBy(desc(payments.createdAt)).limit(10000);
    const csv = toCsv(["ID", "Payment ID", "Amount", "Status", "Method", "Created At"], rows.map((r) => [r.id, r.paymentId, r.amount, r.status, r.paymentMethod, r.createdAt]));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="payments_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/export/audit-logs", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { parseExportFormat, sendExport } = await import("../services/exportFormatService");
    const format = parseExportFormat(req.query.format);
    const rows = await db
      .select({ id: adminAuditLogs.id, adminEmail: adminAuditLogs.adminEmail, action: adminAuditLogs.action, entity: adminAuditLogs.entity, entityId: adminAuditLogs.entityId, details: adminAuditLogs.details, ipAddress: adminAuditLogs.ipAddress, createdAt: adminAuditLogs.createdAt })
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(10000);
    const headers = ["ID", "Admin Email", "Action", "Entity", "Entity ID", "Details", "IP Address", "Created At"];
    const data = rows.map((r) => [r.id, r.adminEmail, r.action, r.entity, r.entityId, r.details, r.ipAddress, r.createdAt]);
    if (format === "json" && req.query.download !== "1") {
      res.json({ rows, limit: rows.length });
      return;
    }
    await sendExport(res, format, "audit_logs", headers, data, rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/export/compliance", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { parseExportFormat, sendExport } = await import("../services/exportFormatService");
    const { listDeletionRequests, listExportRequests } = await import("../services/complianceQueueService");
    const format = parseExportFormat(req.query.format);
    const type = String(req.query.type || "deletions");
    const page = parseInt(req.query.page as string) || 1;

    if (type === "exports") {
      const result = await listExportRequests({ page, limit: 100, status: "all" });
      const headers = ["ID", "Export ID", "User ID", "Status", "Requested At", "Completed At", "User Email"];
      const data = result.requests.map((r) => [r.id, r.exportId, r.userId, r.status, r.requestedAt, r.completedAt, r.userEmail]);
      await sendExport(res, format, "compliance_exports", headers, data, result.requests);
      return;
    }

    const result = await listDeletionRequests({ page, limit: 100, status: "all" });
    const headers = ["ID", "User ID", "Status", "Reason", "Requested At", "Completed At", "User Email"];
    const data = result.requests.map((r) => [r.id, r.userId, r.status, r.reason, r.requestedAt, r.completedAt, r.userEmail]);
    await sendExport(res, format, "compliance_deletions", headers, data, result.requests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM ALERTS (anomaly detection)
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/system-alerts", requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string || "active";
    const { parsePagination, paginatedResponse } = await import("../services/paginationHelper");
    const { page, limit, offset } = parsePagination(req, { limit: 50, maxLimit: 200 });
    const conditions = status !== "all" ? [eq(systemAlerts.status, status as any)] : [];
    const where = conditions.length ? and(...conditions) : undefined;
    const [totalRow] = await db.select({ count: count() }).from(systemAlerts).where(where);
    const rows = await db.select().from(systemAlerts).where(where).orderBy(desc(systemAlerts.createdAt)).limit(limit).offset(offset);
    if (req.query.page) {
      res.json(paginatedResponse(rows, Number(totalRow.count), page, limit, { alerts: rows }));
    } else {
      res.json(rows);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/system-alerts/:id/dismiss", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(systemAlerts).set({ status: "dismissed", dismissedBy: (req as any).adminUser?.id, dismissedAt: new Date() }).where(eq(systemAlerts.id, id));
    logAudit(req, "dismiss_alert", "system_alert", String(id), "Alert dismissed");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ALERT RULES
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/alert-rules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(alertRules).orderBy(desc(alertRules.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/alert-rules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, metric, operator, threshold, severity } = req.body;
    if (!name || !metric || !operator || threshold === undefined) {
      res.status(400).json({ error: "name, metric, operator and threshold are required" });
      return;
    }
    const [result] = await db.insert(alertRules).values({ name, metric, operator, threshold: String(threshold), severity: severity || "warning", createdBy: (req as any).adminUser?.id, isActive: true });
    logAudit(req, "create_alert_rule", "alert_rule", String((result as any).insertId), `Rule: ${name}`);
    res.json({ success: true, id: (result as any).insertId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch("/alert-rules/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, metric, operator, threshold, severity, isActive } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (metric !== undefined) updates.metric = metric;
    if (operator !== undefined) updates.operator = operator;
    if (threshold !== undefined) updates.threshold = String(threshold);
    if (severity !== undefined) updates.severity = severity;
    if (isActive !== undefined) updates.isActive = isActive;
    await db.update(alertRules).set(updates).where(eq(alertRules.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete("/alert-rules/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(alertRules).where(eq(alertRules.id, id));
    logAudit(req, "delete_alert_rule", "alert_rule", String(id), "Rule deleted");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AI INSIGHTS
// ══════════════════════════════════════════════════════════════════════════════

let insightsCache: { data: any; ts: number } | null = null;
const INSIGHTS_TTL = 5 * 60 * 1000; // 5 min

adminRouter.get("/ai/insights", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (insightsCache && Date.now() - insightsCache.ts < INSIGHTS_TTL) {
      res.json(insightsCache.data);
      return;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [statsRow] = await db.select({
      totalUsers: count(users.id),
    }).from(users);

    const [todayRidesRow] = await db.select({ c: count() }).from(rides).where(gte(rides.createdAt, todayStart));
    const [weekRidesRow] = await db.select({ c: count() }).from(rides).where(gte(rides.createdAt, weekAgo));
    const [onlineDriversRow] = await db.select({ c: count() }).from(driverSessions).where(eq(driverSessions.status, "online"));
    const [cancelledTodayRow] = await db.select({ c: count() }).from(rides).where(and(gte(rides.createdAt, todayStart), eq(rides.status, "cancelled")));
    const [activeSosRow] = await db.select({ c: count() }).from(emergencyAlerts).where(eq(emergencyAlerts.status, "active"));

    const todayRides = Number(todayRidesRow.c);
    const weekRides = Number(weekRidesRow.c);
    const onlineDrivers = Number(onlineDriversRow.c);
    const cancelledToday = Number(cancelledTodayRow.c);
    const activeSos = Number(activeSosRow.c);
    const cancellationRate = todayRides > 0 ? Math.round((cancelledToday / todayRides) * 100) : 0;
    const avgDailyRides = weekRides / 7;

    const insights: Array<{ severity: string; title: string; description: string; action?: string }> = [];

    if (activeSos > 0) {
      insights.push({ severity: "critical", title: `${activeSos} Active SOS Alert${activeSos > 1 ? "s" : ""}`, description: "Immediate attention required. Review the Safety page.", action: "/safety" });
    }
    if (onlineDrivers < 3) {
      insights.push({ severity: "warning", title: "Low Driver Supply", description: `Only ${onlineDrivers} driver${onlineDrivers !== 1 ? "s" : ""} online. Consider incentive push to bring drivers online.`, action: "/notifications" });
    }
    if (cancellationRate > 20) {
      insights.push({ severity: "warning", title: `High Cancellation Rate — ${cancellationRate}%`, description: "Cancellations are above the 20% threshold today. Review active drivers and wait times.", action: "/rides" });
    }
    if (todayRides < avgDailyRides * 0.7 && avgDailyRides > 5) {
      insights.push({ severity: "info", title: "Ride Volume Below Average", description: `Today has ${todayRides} rides vs ${avgDailyRides.toFixed(0)} daily average (${Math.round((todayRides / avgDailyRides) * 100)}%). Consider a surge zone or promotion.`, action: "/operations" });
    }
    if (insights.length === 0) {
      insights.push({ severity: "info", title: "Platform Running Smoothly", description: `${todayRides} rides today, ${onlineDrivers} drivers online, cancellation rate ${cancellationRate}%. All metrics within normal range.` });
    }

    const result = { insights, generatedAt: new Date().toISOString(), metrics: { todayRides, onlineDrivers, cancellationRate, avgDailyRides: Math.round(avgDailyRides) } };
    insightsCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PREDICTIVE ANALYTICS — demand / revenue forecast
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/analytics/forecast", requireAdmin, async (req: Request, res: Response) => {
  try {
    const metric = (req.query.metric as string) || "demand";
    const days = Math.min(parseInt(req.query.days as string) || 7, 30);
    const lookback = 30;

    const since = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);

    const historical = await db
      .select({ date: sql<string>`DATE(${rides.createdAt})`, count: count(), revenue: sum(rides.totalFare) })
      .from(rides)
      .where(and(gte(rides.createdAt, since), eq(rides.status, "completed")))
      .groupBy(sql`DATE(${rides.createdAt})`)
      .orderBy(sql`DATE(${rides.createdAt})`);

    const n = historical.length;
    if (n < 3) {
      res.json({ forecast: [], historical: [] });
      return;
    }

    const xs = historical.map((_, i) => i);
    const ys = historical.map((r) => metric === "revenue" ? Number(r.revenue || 0) : Number(r.count));

    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    const slope = xs.reduce((acc, x, i) => acc + (x - xMean) * (ys[i] - yMean), 0) / xs.reduce((acc, x) => acc + (x - xMean) ** 2, 0);
    const intercept = yMean - slope * xMean;

    const forecast = Array.from({ length: days }, (_, i) => {
      const xi = n + i;
      const date = new Date(Date.now() + i * 86400000);
      return {
        date: date.toISOString().split("T")[0],
        value: Math.max(0, Math.round((slope * xi + intercept) * 100) / 100),
        isForecast: true,
      };
    });

    const historicalFormatted = historical.map((r, i) => ({
      date: r.date,
      value: ys[i],
      isForecast: false,
    }));

    res.json({ forecast, historical: historicalFormatted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DRIVER PAYOUT (Stripe Transfer)
// ══════════════════════════════════════════════════════════════════════════════

adminRouter.post("/drivers/:id/payout", requireAdmin, async (req: Request, res: Response) => {
  try {
    const driverId = parseInt(req.params.id);
    const { amountCents } = req.body;
    if (!amountCents || amountCents < 100) {
      res.status(400).json({ error: "Minimum payout is $1.00 (100 cents)" });
      return;
    }

    const [profile] = await db.select({ stripeConnectId: userProfiles.stripeConnectId }).from(userProfiles).where(eq(userProfiles.userId, driverId)).limit(1);
    if (!profile?.stripeConnectId) {
      res.status(400).json({ error: "Driver does not have a connected Stripe account" });
      return;
    }

    const [account] = await db.select({ payoutsEnabled: connectedAccounts.payoutsEnabled, stripeAccountId: connectedAccounts.stripeAccountId }).from(connectedAccounts).where(eq(connectedAccounts.userId, driverId)).limit(1);
    if (!account?.payoutsEnabled) {
      res.status(400).json({ error: "Driver Stripe account is not enabled for payouts" });
      return;
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      res.status(503).json({ error: "Stripe not configured" });
      return;
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: account.stripeAccountId,
      description: `Admin manual payout for driver ${driverId}`,
    });

    logAudit(req, "driver_payout", "driver", String(driverId), `Payout $${(amountCents / 100).toFixed(2)} via Stripe transfer ${transfer.id}`);
    res.json({ success: true, transferId: transfer.id, amount: amountCents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// R2 STORAGE — ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a short-lived signed URL for any R2 object (admin only) */
adminRouter.get("/files/signed-url", requireAdmin, async (req: Request, res: Response) => {
  const key = typeof req.query.key === "string" ? req.query.key.trim() : "";
  if (!key) {
    res.status(400).json({ error: "Missing key parameter" });
    return;
  }
  try {
    const { getSignedDownloadUrl } = await import("../services/r2Service");
    const signedUrl = await getSignedDownloadUrl(key, 300);
    res.json({ signedUrl, expiresInSeconds: 300 });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate signed URL" });
  }
});

/** R2 health check — validates env vars, upload, signed URL generation, and delete */
adminRouter.get("/r2-health", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { r2HealthCheck } = await import("../services/r2Service");
    const result = await r2HealthCheck();
    res.status(result.ok ? 200 : 503).json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message || "R2 health check failed" });
  }
});

export default adminRouter;
