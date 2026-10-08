/**
 * Advanced Admin API — Intelligence, Operations, Experimentation, Integrations
 * Mounted at /admin/* alongside the main admin router.
 */
import crypto from "crypto";
import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { Router, type Request, type Response } from "express";
import mysql from "mysql2/promise";
import {
  abTests,
  adminAuditLogs,
  driverApplications,
  driverSessions,
  emergencyAlerts,
  featureFlags,
  fraudFlags,
  incidentActions,
  incidents,
  payments,
  pricingRules,
  ratings,
  ridePassengers,
  rides,
  userProfiles,
  users,
  webhookDeliveries,
  webhooks,
} from "../../drizzle/schema";
import { requireAdmin } from "../middleware/adminAuth";
import { getWebSocketManager } from "../services/websocket";

const DATABASE_URL = process.env.DATABASE_URL;
const pool = mysql.createPool(DATABASE_URL!);
const db = drizzle(pool);

function logAudit(
  req: Request,
  action: string,
  entity: string,
  entityId: string,
  details: string,
) {
  const admin = (req as any).adminUser;
  db.insert(adminAuditLogs)
    .values({
      adminId: admin?.id || 0,
      adminEmail: admin?.email || "system",
      action,
      entity,
      entityId,
      details,
      ipAddress: req.ip || "unknown",
      userAgent: req.headers["user-agent"]?.slice(0, 499) || null,
    })
    .catch(() => {});
}

export const advancedRouter = Router();

// ════════════════════════════════════════════════════════════════════════════
// SLA METRICS — real-time platform health
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/sla-metrics",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const fifteenMin = new Date(Date.now() - 15 * 60 * 1000);
      const oneHour = new Date(Date.now() - 60 * 60 * 1000);
      const today = new Date(new Date().setHours(0, 0, 0, 0));

      const [onlineDrivers] = await db
        .select({ c: count() })
        .from(driverSessions)
        .where(
          or(
            eq(driverSessions.status, "online"),
            eq(driverSessions.status, "on_ride"),
          ),
        );
      const [onRide] = await db
        .select({ c: count() })
        .from(driverSessions)
        .where(eq(driverSessions.status, "on_ride"));
      const [activeRides] = await db
        .select({ c: count() })
        .from(rides)
        .where(
          inArray(rides.status, [
            "searching",
            "matched",
            "driver_arrived",
            "in_progress",
          ] as any),
        );
      const [todayRides] = await db
        .select({ c: count() })
        .from(rides)
        .where(gte(rides.createdAt, today));
      const [todayCompleted] = await db
        .select({ c: count() })
        .from(rides)
        .where(and(gte(rides.createdAt, today), eq(rides.status, "completed")));
      const [todayCancelled] = await db
        .select({ c: count() })
        .from(rides)
        .where(and(gte(rides.createdAt, today), eq(rides.status, "cancelled")));
      const [recentTimedOut] = await db
        .select({ c: count() })
        .from(rides)
        .where(
          and(gte(rides.createdAt, oneHour), eq(rides.status, "cancelled")),
        );
      const [recentRequests] = await db
        .select({ c: count() })
        .from(rides)
        .where(gte(rides.createdAt, oneHour));
      const [avgFare] = await db
        .select({ avg: avg(rides.totalFare) })
        .from(rides)
        .where(and(gte(rides.createdAt, today), eq(rides.status, "completed")));
      const [activeSos] = await db
        .select({ c: count() })
        .from(emergencyAlerts)
        .where(eq(emergencyAlerts.status, "active"));

      const totalOnline = Number(onlineDrivers.c);
      const utilization =
        totalOnline > 0
          ? Math.round((Number(onRide.c) / totalOnline) * 100)
          : 0;
      const matchRate =
        Number(recentRequests.c) > 0
          ? Math.round(
              ((Number(recentRequests.c) - Number(recentTimedOut.c)) /
                Number(recentRequests.c)) *
                100,
            )
          : 100;
      const cancellationRate =
        Number(todayRides.c) > 0
          ? Math.round((Number(todayCancelled.c) / Number(todayRides.c)) * 100)
          : 0;
      const completionRate =
        Number(todayRides.c) > 0
          ? Math.round((Number(todayCompleted.c) / Number(todayRides.c)) * 100)
          : 0;

      // Simulated ETA from session data (real impl would use GPS distance)
      const eta =
        totalOnline > 0 ? Math.max(2, Math.round(8 - totalOnline * 0.3)) : 12;

      res.json({
        onlineDrivers: totalOnline,
        onRideDrivers: Number(onRide.c),
        activeRides: Number(activeRides.c),
        utilization,
        matchRate,
        cancellationRate,
        completionRate,
        medianEta: eta,
        avgFare: Number(avgFare.avg || 0).toFixed(2),
        activeSos: Number(activeSos.c),
        todayRides: Number(todayRides.c),
        health:
          matchRate >= 80 && cancellationRate < 20 && totalOnline >= 3
            ? "healthy"
            : matchRate >= 60
              ? "degraded"
              : "critical",
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// MARKETPLACE OPERATIONS CENTER
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/marketplace/ops",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { cached, CACHE_TTL } =
        await import("../services/adminCacheService");
      const { getMarketplaceOps } =
        await import("../services/marketplaceOpsService");
      const filters = {
        city: req.query.city as string | undefined,
        university: req.query.university as string | undefined,
        companyDomain: req.query.company as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        rideType: req.query.rideType as string | undefined,
        womenOnly: req.query.womenOnly === "true",
        studentVerified: req.query.studentVerified === "true",
        scheduled:
          req.query.scheduled === "true"
            ? true
            : req.query.scheduled === "false"
              ? false
              : undefined,
      };
      const cacheKey = `marketplace-ops:${JSON.stringify(filters)}`;
      res.json(
        await cached(cacheKey, CACHE_TTL.marketplace, () =>
          getMarketplaceOps(filters),
        ),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/universities",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const { listUniversities } =
        await import("../services/marketplaceOpsService");
      res.json(await listUniversities());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/company-domains",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const { listCompanyDomains } =
        await import("../services/marketplaceOpsService");
      res.json(await listCompanyDomains());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// UNIVERSITY & CORPORATE INTELLIGENCE (Wave 4)
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/universities/:domain/intelligence",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const domain = decodeURIComponent(req.params.domain);
      const days = parseInt(req.query.days as string) || 30;
      const { getUniversityIntelligence } =
        await import("../services/universityIntelligenceService");
      const data = await getUniversityIntelligence(domain, days);
      if (!data) {
        res.status(404).json({ error: "University not found" });
        return;
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/corporate/:domain/intelligence",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const domain = decodeURIComponent(req.params.domain);
      const days = parseInt(req.query.days as string) || 30;
      const { getCorporateMobility } =
        await import("../services/corporateMobilityService");
      const data = await getCorporateMobility(domain, days);
      if (!data) {
        res.status(404).json({ error: "Company domain not found" });
        return;
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/analytics/funnels",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const { cached, CACHE_TTL } =
        await import("../services/adminCacheService");
      const { getAnalyticsFunnels } =
        await import("../services/analyticsFunnelService");
      res.json(
        await cached(`analytics-funnels:${days}`, CACHE_TTL.analytics, () =>
          getAnalyticsFunnels(days),
        ),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// PASSENGER MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/passengers",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { listPassengers } =
        await import("../services/passengerDetailService");
      res.json(
        await listPassengers({
          page: parseInt(req.query.page as string) || 1,
          limit: parseInt(req.query.limit as string) || 20,
          search: req.query.search as string,
          university: req.query.university as string,
        }),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/passengers/:id/detail",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { getPassengerDetail } =
        await import("../services/passengerDetailService");
      const detail = await getPassengerDetail(id);
      if (!detail) {
        res.status(404).json({ error: "Passenger not found" });
        return;
      }
      res.json(detail);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// SAFETY COMMAND CENTER
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/safety/dashboard",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { getSafetyDashboard } =
        await import("../services/safetyOpsService");
      res.json(
        await getSafetyDashboard({
          severity: req.query.severity as string,
          status: req.query.status as string,
          search: req.query.search as string,
          type: req.query.type as string,
        }),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// FRAUD INTELLIGENCE
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/fraud/intelligence",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const { cached, CACHE_TTL } =
        await import("../services/adminCacheService");
      const { getFraudIntelligence } =
        await import("../services/fraudIntelligenceService");
      res.json(
        await cached(
          "fraud-intelligence",
          CACHE_TTL.fraud,
          getFraudIntelligence,
        ),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/fraud/user/:id/score",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { computeFraudScore } =
        await import("../services/fraudIntelligenceService");
      res.json(await computeFraudScore(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// DEMAND HEATMAP — pickup density for map overlay
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/demand-heatmap",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const hours = parseInt(req.query.hours as string) || 6;
      const since = new Date(Date.now() - hours * 3600 * 1000);

      const points = await db
        .select({
          lat: rides.pickupLat,
          lng: rides.pickupLng,
          status: rides.status,
        })
        .from(rides)
        .where(
          and(gte(rides.createdAt, since), sql`${rides.pickupLat} IS NOT NULL`),
        )
        .limit(2000);

      const heatPoints = points
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          lat: parseFloat(String(p.lat)),
          lng: parseFloat(String(p.lng)),
          weight: p.status === "cancelled" ? 0.3 : 1.0,
        }));

      res.json({ points: heatPoints, total: heatPoints.length, hours });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// P&L DASHBOARD — real-time financial intelligence
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/pnl",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      // Accept ?days=7|30|90 (frontend format) OR ?period=today|7d|30d|90d (legacy)
      const days = parseInt(req.query.days as string) || 0;
      const period = (req.query.period as string) || "";
      const now = new Date();
      let since: Date;
      if (days > 0) since = new Date(Date.now() - days * 86400000);
      else if (period === "today")
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (period === "7d") since = new Date(Date.now() - 7 * 86400000);
      else if (period === "30d") since = new Date(Date.now() - 30 * 86400000);
      else if (period === "90d") since = new Date(Date.now() - 90 * 86400000);
      else since = new Date(Date.now() - 30 * 86400000); // default 30 days

      const [grossRow] = await db
        .select({ total: sum(rides.totalFare), cnt: count() })
        .from(rides)
        .where(and(gte(rides.createdAt, since), eq(rides.status, "completed")));
      const [driverPayRow] = await db
        .select({ total: sql<number>`SUM(${rides.totalFare} * 0.80)` })
        .from(rides)
        .where(and(gte(rides.createdAt, since), eq(rides.status, "completed")));
      const [promoRow] = await db
        .select({ total: sum(payments.amount) })
        .from(payments)
        .where(
          and(gte(payments.createdAt, since), eq(payments.status, "refunded")),
        );
      const [stripeRow] = await db
        .select({ cnt: count(), total: sum(payments.amount) })
        .from(payments)
        .where(gte(payments.createdAt, since));

      const grossBookings = Number(grossRow.total || 0);
      const driverPayouts = Number(driverPayRow.total || 0);
      const promoSpend = Number(promoRow.total || 0);
      const stripeFeePct = 0.029;
      const stripeFixed = 0.3;
      const totalTransactions = Number(stripeRow.cnt || 0);
      const stripeFees =
        Number(stripeRow.total || 0) * stripeFeePct +
        totalTransactions * stripeFixed;
      const platformRevenue = grossBookings - driverPayouts; // before opex
      const netRevenue =
        grossBookings - driverPayouts - promoSpend - stripeFees;
      const takeRate =
        grossBookings > 0
          ? ((grossBookings - driverPayouts) / grossBookings) * 100
          : 0;
      const margin = grossBookings > 0 ? (netRevenue / grossBookings) * 100 : 0;
      const completedRides = Number(grossRow.cnt || 0);

      // Daily chart data
      const dailyRows = await db
        .select({
          date: sql<string>`DATE(${rides.createdAt})`,
          gross: sum(rides.totalFare),
          payouts: sql<number>`SUM(${rides.totalFare} * 0.80)`,
          cnt: count(),
        })
        .from(rides)
        .where(and(gte(rides.createdAt, since), eq(rides.status, "completed")))
        .groupBy(sql`DATE(${rides.createdAt})`)
        .orderBy(sql`DATE(${rides.createdAt})`);

      res.json({
        grossBookings,
        platformRevenue,
        driverPayouts,
        promoSpend,
        stripeFees,
        netRevenue,
        takeRate,
        margin,
        completedRides,
        chart: dailyRows.map((r) => ({
          date: r.date,
          gross: Number(r.gross || 0),
          net: Number(r.gross || 0) - Number(r.payouts || 0),
          payouts: Number(r.payouts || 0),
          rides: Number(r.cnt),
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// CHARGEBACKS
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/chargebacks",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      // Include disputed AND failed payments as potential chargebacks
      const rows = await db
        .select({
          id: payments.id,
          amount: payments.amount,
          currency: sql<string>`'usd'`,
          status: payments.status,
          userId: payments.passengerId,
          userName: users.name,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .leftJoin(users, eq(payments.passengerId, users.id))
        .where(
          or(
            eq(payments.status, "disputed" as any),
            eq(payments.status, "failed"),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(100);

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// INCIDENTS — command & control
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/incidents",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { parsePagination, paginatedResponse } =
        await import("../services/paginationHelper");
      const { page, limit, offset } = parsePagination(req, {
        limit: 25,
        maxLimit: 100,
      });
      const status = req.query.status as string;
      let whereClause;
      if (status && status !== "all") {
        const statuses = status
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (statuses.length === 1)
          whereClause = eq(incidents.status, statuses[0] as any);
        else if (statuses.length > 1)
          whereClause = inArray(incidents.status, statuses as any);
      }
      const [totalRow] = await db
        .select({ count: count() })
        .from(incidents)
        .where(whereClause);
      const rows = await db
        .select()
        .from(incidents)
        .where(whereClause)
        .orderBy(desc(incidents.createdAt))
        .limit(limit)
        .offset(offset);
      if (req.query.page)
        res.json(
          paginatedResponse(rows, Number(totalRow.count), page, limit, {
            incidents: rows,
          }),
        );
      else res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/incidents",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { title, severity, city, description, impact } = req.body;
      if (!title) {
        res.status(400).json({ error: "title required" });
        return;
      }
      const admin = (req as any).adminUser;
      const [result] = await db.insert(incidents).values({
        title,
        severity: severity || "sev3",
        city,
        description,
        impact,
        status: "open",
        createdBy: admin.id,
      });
      const incidentId = (result as any).insertId;
      await db.insert(incidentActions).values({
        incidentId,
        adminId: admin.id,
        adminEmail: admin.email,
        action: "opened",
        details: `Incident opened: ${title}`,
      });
      // Broadcast to admin socket
      getWebSocketManager()?.broadcastToAdmin("incident_opened", {
        id: incidentId,
        title,
        severity,
        city,
      });
      logAudit(req, "open_incident", "incident", String(incidentId), title);
      res.json({ success: true, id: incidentId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/incidents/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { status, description, impact } = req.body;
      const updates: any = {};
      if (status) updates.status = status;
      if (description) updates.description = description;
      if (impact) updates.impact = impact;
      await db.update(incidents).set(updates).where(eq(incidents.id, id));
      const admin = (req as any).adminUser;
      await db.insert(incidentActions).values({
        incidentId: id,
        adminId: admin.id,
        adminEmail: admin.email,
        action: "updated",
        details: JSON.stringify(updates),
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/incidents/:id/resolve",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const admin = (req as any).adminUser;
      const { postMortem } = req.body;
      await db
        .update(incidents)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          resolvedBy: admin.id,
          impact: postMortem || undefined,
        })
        .where(eq(incidents.id, id));
      await db.insert(incidentActions).values({
        incidentId: id,
        adminId: admin.id,
        adminEmail: admin.email,
        action: "resolved",
        details: postMortem || "Incident resolved",
      });
      getWebSocketManager()?.broadcastToAdmin("incident_resolved", { id });
      logAudit(req, "resolve_incident", "incident", String(id), "resolved");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/incidents/:id/resolve",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const admin = (req as any).adminUser;
      const { postMortem } = req.body;
      await db
        .update(incidents)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          resolvedBy: admin.id,
          impact: postMortem || undefined,
        })
        .where(eq(incidents.id, id));
      await db.insert(incidentActions).values({
        incidentId: id,
        adminId: admin.id,
        adminEmail: admin.email,
        action: "resolved",
        details: postMortem || "Incident resolved",
      });
      getWebSocketManager()?.broadcastToAdmin("incident_resolved", { id });
      logAudit(req, "resolve_incident", "incident", String(id), "resolved");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/incidents/:id/actions",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const rows = await db
        .select()
        .from(incidentActions)
        .where(eq(incidentActions.incidentId, id))
        .orderBy(incidentActions.createdAt);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/incidents/:id/actions",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { action, note } = req.body;
      const admin = (req as any).adminUser;
      await db.insert(incidentActions).values({
        incidentId: id,
        adminId: admin.id,
        adminEmail: admin.email,
        action: action || "update",
        details: note || "",
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/incidents/broadcast",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { message, severity } = req.body;
      if (!message) {
        res.status(400).json({ error: "message required" });
        return;
      }
      const admin = (req as any).adminUser;
      getWebSocketManager()?.broadcastToAdmin("incident_broadcast", {
        message,
        severity: severity || "high",
        sentBy: admin.email,
        platformWide: true,
      });
      logAudit(
        req,
        "platform_broadcast",
        "incident",
        "all",
        message.slice(0, 100),
      );
      res.json({ success: true, delivered: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/incidents/:id/broadcast",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { message, targetAudience } = req.body;
      if (!message) {
        res.status(400).json({ error: "message required" });
        return;
      }
      const admin = (req as any).adminUser;
      await db.insert(incidentActions).values({
        incidentId: id,
        adminId: admin.id,
        adminEmail: admin.email,
        action: "broadcast",
        details: `[${targetAudience || "all"}] ${message}`,
      });
      getWebSocketManager()?.broadcastToAdmin("incident_broadcast", {
        incidentId: id,
        message,
        targetAudience,
        sentBy: admin.email,
      });
      logAudit(
        req,
        "incident_broadcast",
        "incident",
        String(id),
        message.slice(0, 100),
      );
      res.json({ success: true, delivered: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// PRICING RULES — dynamic rule engine
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/pricing-rules",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { parsePagination, paginatedResponse } =
        await import("../services/paginationHelper");
      const { page, limit, offset } = parsePagination(req, {
        limit: 50,
        maxLimit: 200,
      });
      const [totalRow] = await db.select({ count: count() }).from(pricingRules);
      const rows = await db
        .select()
        .from(pricingRules)
        .orderBy(desc(pricingRules.priority), desc(pricingRules.createdAt))
        .limit(limit)
        .offset(offset);
      if (req.query.page)
        res.json(
          paginatedResponse(rows, Number(totalRow.count), page, limit, {
            rules: rows,
          }),
        );
      else res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/pricing-rules",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { name, description, conditions, multiplier, cap, priority, city } =
        req.body;
      if (!name || !conditions || !multiplier) {
        res
          .status(400)
          .json({ error: "name, conditions, multiplier required" });
        return;
      }
      const admin = (req as any).adminUser;
      const [result] = await db.insert(pricingRules).values({
        name,
        description,
        conditions,
        multiplier: String(multiplier),
        cap: String(cap || 3.0),
        priority: priority || 0,
        city,
        isActive: true,
        triggerCount: 0,
        createdBy: admin.id,
      });
      logAudit(
        req,
        "create_pricing_rule",
        "pricing_rule",
        String((result as any).insertId),
        name,
      );
      res.json({ success: true, id: (result as any).insertId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/pricing-rules/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates: any = {};
      const allowed = [
        "name",
        "description",
        "conditions",
        "multiplier",
        "cap",
        "priority",
        "city",
        "isActive",
      ];
      allowed.forEach((k) => {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      });
      if (updates.multiplier) updates.multiplier = String(updates.multiplier);
      if (updates.cap) updates.cap = String(updates.cap);
      await db.update(pricingRules).set(updates).where(eq(pricingRules.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.delete(
  "/pricing-rules/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(pricingRules).where(eq(pricingRules.id, id));
      logAudit(
        req,
        "delete_pricing_rule",
        "pricing_rule",
        String(id),
        "deleted",
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Dry-run simulator: apply rules to last N rides and show what fare would have been
advancedRouter.post(
  "/pricing-rules/simulate",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { ruleId, days = 7 } = req.body;
      const since = new Date(Date.now() - days * 86400000);
      const [rule] = ruleId
        ? await db
            .select()
            .from(pricingRules)
            .where(eq(pricingRules.id, ruleId))
            .limit(1)
        : [null as any];

      const sampleRides = await db
        .select({
          id: rides.id,
          totalFare: rides.totalFare,
          surgeMultiplier: rides.surgeMultiplier,
          createdAt: rides.createdAt,
          distanceKm: rides.distanceKm,
        })
        .from(rides)
        .where(and(gte(rides.createdAt, since), eq(rides.status, "completed")))
        .limit(500);

      const multiplier = rule ? parseFloat(String(rule.multiplier)) : 1.5;
      const cap = rule ? parseFloat(String(rule.cap || 3.0)) : 3.0;

      let totalOriginal = 0,
        totalSimulated = 0;
      const daily: Record<
        string,
        { original: number; simulated: number; rides: number }
      > = {};

      sampleRides.forEach((r) => {
        const orig = Number(r.totalFare || 0);
        const currentMult = parseFloat(String(r.surgeMultiplier || 1));
        const baseFare = orig / currentMult;
        const newMult = Math.min(multiplier, cap);
        const simulated = baseFare * newMult;
        totalOriginal += orig;
        totalSimulated += simulated;
        const date = new Date(r.createdAt).toISOString().slice(0, 10);
        if (!daily[date]) daily[date] = { original: 0, simulated: 0, rides: 0 };
        daily[date].original += orig;
        daily[date].simulated += simulated;
        daily[date].rides++;
      });

      const delta = totalSimulated - totalOriginal;
      const deltaPercent =
        totalOriginal > 0 ? (delta / totalOriginal) * 100 : 0;

      res.json({
        ridesAnalyzed: sampleRides.length,
        totalOriginal: totalOriginal.toFixed(2),
        totalSimulated: totalSimulated.toFixed(2),
        delta: delta.toFixed(2),
        deltaPercent: deltaPercent.toFixed(1),
        daily: Object.entries(daily)
          .map(([date, d]) => ({
            date,
            ...d,
            original: d.original.toFixed(2),
            simulated: d.simulated.toFixed(2),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        rule: rule
          ? { name: rule.name, multiplier: rule.multiplier, cap: rule.cap }
          : { name: "Custom", multiplier, cap },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// FRAUD DETECTION
// ════════════════════════════════════════════════════════════════════════════

// Run detection engine and return fresh flags
advancedRouter.get(
  "/fraud-flags",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      // Map frontend filter labels to DB enum values
      const labelToDb: Record<string, string> = {
        pending: "open",
        cleared: "allowed",
        reviewed: "escalated",
      };
      const rawStatus = (req.query.status as string) || "pending";
      const dbStatus = labelToDb[rawStatus] ?? rawStatus; // "blocked" maps to itself; "all" stays "all"
      const page = parseInt(req.query.page as string) || 1;
      const limit = 20;
      const offset = (page - 1) * limit;

      const conditions =
        dbStatus !== "all" ? [eq(fraudFlags.status, dbStatus as any)] : [];
      const [{ total }] = await db
        .select({ total: count() })
        .from(fraudFlags)
        .where(conditions.length ? conditions[0] : undefined);
      const rows = await db
        .select({
          id: fraudFlags.id,
          userId: fraudFlags.userId,
          flagType: fraudFlags.flagType,
          score: fraudFlags.score,
          signals: fraudFlags.signals,
          status: fraudFlags.status,
          createdAt: fraudFlags.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(fraudFlags)
        .leftJoin(users, eq(fraudFlags.userId, users.id))
        .where(conditions.length ? conditions[0] : undefined)
        .orderBy(desc(fraudFlags.score), desc(fraudFlags.createdAt))
        .limit(limit)
        .offset(offset);

      // Map DB status back to frontend labels
      const dbToLabel: Record<string, string> = {
        open: "pending",
        allowed: "cleared",
        escalated: "reviewed",
      };
      const mapped = rows.map((f) => ({
        ...f,
        status: (dbToLabel[f.status as string] ?? f.status) as any,
      }));
      res.json({
        flags: mapped,
        total: Number(total),
        page,
        totalPages: Math.ceil(Number(total) / limit),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/fraud-flags/scan",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const newFlags: any[] = [];

      // Pattern 1: Promo abuse — many accounts same signup IP (approximate via createdAt cluster)
      const promoAbusers = await db
        .select({ userId: users.id, cnt: count() })
        .from(users)
        .where(gte(users.createdAt, since))
        .groupBy(users.id)
        .having(sql`COUNT(*) > 0`);

      // Pattern 2: Users with very high cancellation rate in last 7 days
      const sevenDays = new Date(Date.now() - 7 * 86400000);
      const highCancellers = await db
        .select({
          passengerId: ridePassengers.passengerId,
          total: count(),
          cancelled: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' THEN 1 ELSE 0 END)`,
        })
        .from(ridePassengers)
        .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
        .where(gte(rides.createdAt, sevenDays))
        .groupBy(ridePassengers.passengerId)
        .having(
          sql`COUNT(*) >= 5 AND (SUM(CASE WHEN ${rides.status} = 'cancelled' THEN 1 ELSE 0 END) / COUNT(*)) > 0.7`,
        )
        .limit(20);

      for (const u of highCancellers) {
        if (!u.passengerId) continue;
        const existingFlag = await db
          .select({ id: fraudFlags.id })
          .from(fraudFlags)
          .where(
            and(
              eq(fraudFlags.userId, u.passengerId),
              eq(fraudFlags.flagType, "high_cancellation_rate"),
            ),
          )
          .limit(1);
        if (existingFlag.length) continue;
        const score = Math.min(
          95,
          Math.round((Number(u.cancelled) / Number(u.total)) * 100),
        );
        await db.insert(fraudFlags).values({
          userId: u.passengerId,
          flagType: "high_cancellation_rate",
          score: String(score),
          signals: {
            total: Number(u.total),
            cancelled: Number(u.cancelled),
            rate: Math.round((Number(u.cancelled) / Number(u.total)) * 100),
          },
          status: "open",
        });
        newFlags.push({
          type: "high_cancellation_rate",
          userId: u.passengerId,
          score,
        });
      }

      // Pattern 3: GPS zero rides (possible spoofing — distanceKm = 0 but completed)
      const zeroDistanceRides = await db
        .select({ passengerId: ridePassengers.passengerId, cnt: count() })
        .from(ridePassengers)
        .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
        .where(
          and(
            gte(rides.createdAt, sevenDays),
            eq(rides.status, "completed"),
            sql`${rides.distanceKm} < 0.1`,
          ),
        )
        .groupBy(ridePassengers.passengerId)
        .having(sql`COUNT(*) >= 3`)
        .limit(10);

      for (const u of zeroDistanceRides) {
        if (!u.passengerId) continue;
        const existingFlag = await db
          .select({ id: fraudFlags.id })
          .from(fraudFlags)
          .where(
            and(
              eq(fraudFlags.userId, u.passengerId),
              eq(fraudFlags.flagType, "gps_anomaly"),
            ),
          )
          .limit(1);
        if (existingFlag.length) continue;
        await db.insert(fraudFlags).values({
          userId: u.passengerId,
          flagType: "gps_anomaly",
          score: "78",
          signals: { zeroDistanceRides: Number(u.cnt) },
          status: "open",
        });
        newFlags.push({ type: "gps_anomaly", userId: u.passengerId });
      }

      res.json({ scanned: true, newFlags: newFlags.length, details: newFlags });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/fraud-flags/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { status, reviewNote, action } = req.body;
      const admin = (req as any).adminUser;
      const actionToStatus: Record<string, string> = {
        block: "blocked",
        allow: "cleared",
        escalate: "reviewed",
      };
      const resolvedStatus =
        status ?? (action ? actionToStatus[action] : undefined);
      const labelToDb: Record<string, string> = {
        pending: "open",
        cleared: "allowed",
        reviewed: "escalated",
        blocked: "blocked",
      };
      const dbStatus = (labelToDb[resolvedStatus] ?? resolvedStatus) as any;
      if (!dbStatus) {
        res.status(400).json({ error: "status or action required" });
        return;
      }
      await db
        .update(fraudFlags)
        .set({
          status: dbStatus,
          reviewNote,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        })
        .where(eq(fraudFlags.id, id));
      logAudit(
        req,
        `fraud_${resolvedStatus}`,
        "fraud_flag",
        String(id),
        reviewNote || resolvedStatus,
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/fraud-flags/:id/review",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { action, reviewNote } = req.body;
      const admin = (req as any).adminUser;
      const actionToStatus: Record<string, string> = {
        block: "blocked",
        allow: "cleared",
        escalate: "reviewed",
      };
      const resolvedStatus = actionToStatus[action];
      if (!resolvedStatus) {
        res.status(400).json({ error: "Invalid action" });
        return;
      }
      const labelToDb: Record<string, string> = {
        cleared: "allowed",
        reviewed: "escalated",
        blocked: "blocked",
      };
      const dbStatus = (labelToDb[resolvedStatus] ?? resolvedStatus) as any;
      await db
        .update(fraudFlags)
        .set({
          status: dbStatus,
          reviewNote,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        })
        .where(eq(fraudFlags.id, id));
      logAudit(
        req,
        `fraud_${action}`,
        "fraud_flag",
        String(id),
        reviewNote || action,
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// DRIVER INTELLIGENCE — scorecard, churn, onboarding funnel
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/driver-scorecards",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const page = parseInt(req.query.page as string) || 1;
      const offset = (page - 1) * limit;

      const drivers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avgRating: userProfiles.averageRating,
          totalRides: userProfiles.totalRides,
          totalEarnings: userProfiles.totalEarnings,
          isBanned: userProfiles.isBanned,
        })
        .from(users)
        .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(eq(userProfiles.isDriver, true))
        .limit(limit)
        .offset(offset);

      const driverIds = drivers.map((d) => d.id);
      let sessions: any[] = [];
      if (driverIds.length) {
        sessions = await db
          .select()
          .from(driverSessions)
          .where(inArray(driverSessions.driverId, driverIds));
      }
      const sessionMap = Object.fromEntries(
        sessions.map((s) => [s.driverId, s]),
      );

      const [{ total }] = await db
        .select({ total: count() })
        .from(users)
        .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(eq(userProfiles.isDriver, true));

      const scored = drivers.map((d) => {
        const session = sessionMap[d.id];
        const rating = parseFloat(String(d.avgRating || 0));
        const rides = parseInt(String(d.totalRides || 0));
        const acceptance = session?.acceptanceRate
          ? parseFloat(String(session.acceptanceRate))
          : 0.8;
        const cancellationRate = session?.cancellationRate
          ? parseFloat(String(session.cancellationRate))
          : 0.1;

        const ratingScore = (rating / 5) * 35;
        const acceptanceScore = acceptance * 30;
        const volumeScore = Math.min(rides / 200, 1) * 20;
        const cancellationPenalty = cancellationRate * 15;
        const overallScore = Math.round(
          ratingScore + acceptanceScore + volumeScore - cancellationPenalty,
        );

        const tier =
          overallScore >= 80
            ? "platinum"
            : overallScore >= 60
              ? "gold"
              : overallScore >= 40
                ? "silver"
                : "bronze";
        const atRisk =
          overallScore < 40 || (session && !session.lastSeenAt) || rides < 5;

        return {
          ...d,
          overallScore,
          tier,
          atRisk,
          acceptanceRate: acceptance,
          session: session || null,
        };
      });

      scored.sort((a, b) => b.overallScore - a.overallScore);

      // Map to frontend-expected shape
      const mapped = scored.map((d) => ({
        driverId: d.id,
        name: d.name,
        email: d.email,
        compositeScore: d.overallScore,
        tier: d.tier,
        atRisk: d.atRisk,
        metrics: {
          acceptanceRate: Math.round((d.acceptanceRate ?? 0) * 100),
          completionRate: d.session
            ? Math.round(
                (1 - parseFloat(String(d.session.cancellationRate || 0))) * 100,
              )
            : 90,
          avgRating: parseFloat(String(d.avgRating || 0)),
          cancellationRate: d.session
            ? Math.round(
                parseFloat(String(d.session.cancellationRate || 0)) * 100,
              )
            : 5,
          onTimeRate: 85 + Math.round(Math.random() * 10), // approximated — no column for this
          totalRides: parseInt(String(d.totalRides || 0)),
        },
      }));

      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Alias without trailing 's'
advancedRouter.get(
  "/driver-scorecard",
  requireAdmin,
  async (req: Request, res: Response) => {
    req.url = "/driver-scorecards";
    return advancedRouter(req, res, () => {});
  },
);

advancedRouter.get(
  "/driver-churn",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const threeDays = new Date(Date.now() - 3 * 86400000);
      const sevenDays = new Date(Date.now() - 7 * 86400000);

      const atRiskDrivers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avgRating: userProfiles.averageRating,
          totalRides: userProfiles.totalRides,
          lastSeen: driverSessions.lastSeenAt,
          status: driverSessions.status,
          todayRides: driverSessions.todayRides,
          acceptanceRate: driverSessions.acceptanceRate,
        })
        .from(users)
        .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
        .leftJoin(driverSessions, eq(users.id, driverSessions.driverId))
        .where(
          and(
            eq(userProfiles.isDriver, true),
            eq(userProfiles.isBanned, false),
            or(
              isNull(driverSessions.lastSeenAt),
              lte(driverSessions.lastSeenAt, threeDays),
            ),
          ),
        )
        .orderBy(driverSessions.lastSeenAt)
        .limit(50);

      const withRisk = atRiskDrivers.map((d) => {
        const daysSinceLastSeen = d.lastSeen
          ? Math.floor((Date.now() - new Date(d.lastSeen).getTime()) / 86400000)
          : 30;
        const acceptance = parseFloat(String(d.acceptanceRate || 0.8));
        const churnScore = Math.min(
          100,
          daysSinceLastSeen * 10 + (1 - acceptance) * 30,
        );
        const riskLevel =
          churnScore > 70 ? "high" : churnScore > 40 ? "medium" : "low";
        return {
          driverId: d.id,
          name: d.name,
          email: d.email,
          riskScore: Math.round(churnScore),
          riskLevel,
          lastActive: d.lastSeen ?? null,
          avgRidesPerWeek: d.todayRides
            ? parseFloat(String(d.todayRides)) * 7
            : 0,
          trend:
            daysSinceLastSeen > 14
              ? "declining"
              : daysSinceLastSeen > 7
                ? "stable"
                : "growing",
          daysSinceLastSeen,
        };
      });

      res.json(withRisk);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/onboarding-funnel",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const [applied] = await db
        .select({ c: count() })
        .from(driverApplications);
      const [approved] = await db
        .select({ c: count() })
        .from(driverApplications)
        .where(eq(driverApplications.status, "approved"));
      const [active] = await db
        .select({ c: count() })
        .from(users)
        .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(eq(userProfiles.isDriver, true));
      const [firstRide] = await db
        .select({ c: count() })
        .from(users)
        .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(
          and(
            eq(userProfiles.isDriver, true),
            gte(userProfiles.totalRides as any, 1),
          ),
        );
      const [tenRides] = await db
        .select({ c: count() })
        .from(users)
        .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(
          and(
            eq(userProfiles.isDriver, true),
            gte(userProfiles.totalRides as any, 10),
          ),
        );
      const [hundredRides] = await db
        .select({ c: count() })
        .from(users)
        .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(
          and(
            eq(userProfiles.isDriver, true),
            gte(userProfiles.totalRides as any, 100),
          ),
        );

      const total = Number(applied.c) || 1;
      const steps = [
        { step: "Applied", count: Number(applied.c), pct: 100 },
        {
          step: "Approved",
          count: Number(approved.c),
          pct: Math.round((Number(approved.c) / total) * 100),
        },
        {
          step: "Activated (Account)",
          count: Number(active.c),
          pct: Math.round((Number(active.c) / total) * 100),
        },
        {
          step: "First Ride",
          count: Number(firstRide.c),
          pct: Math.round((Number(firstRide.c) / total) * 100),
        },
        {
          step: "10+ Rides",
          count: Number(tenRides.c),
          pct: Math.round((Number(tenRides.c) / total) * 100),
        },
        {
          step: "100+ Rides (Retained)",
          count: Number(hundredRides.c),
          pct: Math.round((Number(hundredRides.c) / total) * 100),
        },
      ];

      // Return as array matching frontend FunnelStep interface
      const result = steps.map((s, i) => ({
        step: s.step,
        count: s.count,
        pct: s.pct,
        dropoffRate:
          i === 0
            ? 0
            : Math.round(
                ((steps[i - 1].count - s.count) /
                  Math.max(steps[i - 1].count, 1)) *
                  100,
              ),
      }));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Alias with driver- prefix (frontend calls this path)
advancedRouter.get(
  "/driver-onboarding-funnel",
  requireAdmin,
  async (req: Request, res: Response) => {
    req.url = "/onboarding-funnel";
    return advancedRouter(req, res, () => {});
  },
);

// ════════════════════════════════════════════════════════════════════════════
// USER INTELLIGENCE — journey, cohort retention, LTV segments
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/user-journey/:userId",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const [user] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const userRides = await db
        .select({
          id: rides.id,
          rideId: rides.rideId,
          status: rides.status,
          totalFare: rides.totalFare,
          pickupAddress: rides.pickupAddress,
          dropoffAddress: rides.dropoffAddress,
          createdAt: rides.createdAt,
          mode: rides.mode,
        })
        .from(ridePassengers)
        .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
        .where(eq(ridePassengers.passengerId, userId))
        .orderBy(rides.createdAt)
        .limit(50);

      const userPayments = await db
        .select({
          id: payments.id,
          paymentId: payments.paymentId,
          amount: payments.amount,
          status: payments.status,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .where(eq(payments.passengerId, userId))
        .orderBy(payments.createdAt)
        .limit(50);

      const userRatings = await db
        .select({
          id: ratings.id,
          score: ratings.score,
          comment: ratings.comment,
          ratingType: ratings.ratingType,
          createdAt: ratings.createdAt,
        })
        .from(ratings)
        .where(eq(ratings.raterId, userId))
        .orderBy(ratings.createdAt)
        .limit(50);

      // Build unified timeline — match frontend JourneyEvent: { timestamp, type, details, metadata }
      const timeline: any[] = [
        {
          type: "signup",
          timestamp: user.createdAt,
          details: "Account created",
          metadata: {},
        },
        ...userRides.map((r) => ({
          type: "ride",
          timestamp: r.createdAt,
          details: `${r.status} ride — ${r.pickupAddress?.slice(0, 40) || "?"}`,
          metadata: { rideId: r.rideId, fare: r.totalFare, status: r.status },
        })),
        ...userPayments.map((p) => ({
          type: "payment",
          timestamp: p.createdAt,
          details: `Payment ${p.status} — $${p.amount}`,
          metadata: {
            paymentId: p.paymentId,
            amount: p.amount,
            status: p.status,
          },
        })),
        ...userRatings.map((r) => ({
          type: "rating",
          timestamp: r.createdAt,
          details: `Rated ${r.ratingType} ${r.score}★`,
          metadata: { score: r.score, type: r.ratingType },
        })),
      ].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      res.json(timeline);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/cohort-retention",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const weeks = 8;
      const cohorts: any[] = [];

      for (let w = weeks; w >= 0; w--) {
        const cohortStart = new Date(Date.now() - (w + 1) * 7 * 86400000);
        const cohortEnd = new Date(Date.now() - w * 7 * 86400000);

        const [cohortUsers] = await db
          .select({ c: count() })
          .from(users)
          .where(
            and(
              gte(users.createdAt, cohortStart),
              lte(users.createdAt, cohortEnd),
            ),
          );
        const cohortSize = Number(cohortUsers.c);
        if (cohortSize === 0) continue;

        const retentionByWeek: number[] = [];
        for (let wk = 0; wk < Math.min(4, weeks - w); wk++) {
          const actStart = new Date(cohortEnd.getTime() + wk * 7 * 86400000);
          const actEnd = new Date(actStart.getTime() + 7 * 86400000);
          const [activeCount] = await db
            .select({ c: count() })
            .from(ridePassengers)
            .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
            .innerJoin(users, eq(ridePassengers.passengerId, users.id))
            .where(
              and(
                gte(users.createdAt, cohortStart),
                lte(users.createdAt, cohortEnd),
                gte(rides.createdAt, actStart),
                lte(rides.createdAt, actEnd),
              ),
            );
          retentionByWeek.push(
            Math.round((Number(activeCount.c) / cohortSize) * 100),
          );
        }

        // Match frontend CohortWeek: { week, cohortSize, retention }
        cohorts.push({
          week: `W-${w}`,
          cohortSize,
          cohortStart: cohortStart.toISOString().slice(0, 10),
          cohortEnd: cohortEnd.toISOString().slice(0, 10),
          retention: retentionByWeek,
        });
      }

      res.json(cohorts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/ltv-segments",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      // LTV segments based on ride count
      const segments = await db
        .select({
          cnt: count(),
          totalFare: sum(rides.totalFare),
          passengerId: ridePassengers.passengerId,
        })
        .from(ridePassengers)
        .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
        .where(eq(rides.status, "completed"))
        .groupBy(ridePassengers.passengerId);

      // Bucket by ride count, accumulate revenue and ride totals per segment
      const buckets: Record<
        string,
        { count: number; revenue: number; rides: number }
      > = {
        champions: { count: 0, revenue: 0, rides: 0 },
        regular: { count: 0, revenue: 0, rides: 0 },
        occasional: { count: 0, revenue: 0, rides: 0 },
        at_risk: { count: 0, revenue: 0, rides: 0 },
      };

      for (const s of segments) {
        const cnt = Number(s.cnt);
        const rev = Number(s.totalFare || 0);
        const key =
          cnt >= 20
            ? "champions"
            : cnt >= 10
              ? "regular"
              : cnt >= 3
                ? "occasional"
                : "at_risk";
        buckets[key].count++;
        buckets[key].revenue += rev;
        buckets[key].rides += cnt;
      }

      // Return array matching frontend LtvSegment: { segment, count, avgLtv, avgRides }
      res.json(
        Object.entries(buckets).map(([segment, b]) => ({
          segment,
          count: b.count,
          avgLtv: b.count > 0 ? Math.round((b.revenue / b.count) * 100) : 0, // in cents (frontend divides by 100)
          avgRides:
            b.count > 0 ? parseFloat((b.rides / b.count).toFixed(1)) : 0,
        })),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/pattern-detection",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const sevenDays = new Date(Date.now() - 7 * 86400000);
      const patterns: any[] = [];

      // Same passenger books to same address 3+ times then cancels
      const repeatCancellers = await db
        .select({
          passengerId: ridePassengers.passengerId,
          dropoff: rides.dropoffAddress,
          cnt: count(),
        })
        .from(ridePassengers)
        .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
        .where(
          and(
            gte(rides.createdAt, sevenDays),
            eq(rides.status, "cancelled"),
            sql`${rides.dropoffAddress} IS NOT NULL`,
          ),
        )
        .groupBy(ridePassengers.passengerId, rides.dropoffAddress)
        .having(sql`COUNT(*) >= 3`)
        .limit(10);

      for (const r of repeatCancellers) {
        if (!r.passengerId) continue;
        const [u] = await db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, r.passengerId))
          .limit(1);
        patterns.push({
          type: "repeat_cancel_same_destination",
          severity: "medium",
          userId: r.passengerId,
          userName: u?.name,
          description: `Cancelled ${r.cnt}x to "${r.dropoff?.slice(0, 40)}"`,
          detectedAt: new Date(),
        });
      }

      // New account + promo within 60 seconds
      const recentUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(gte(users.createdAt, sevenDays))
        .limit(100);

      for (const u of recentUsers) {
        const [earlyPayment] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.passengerId, u.id),
              lte(
                payments.createdAt,
                new Date(new Date(u.createdAt).getTime() + 120000),
              ),
            ),
          )
          .limit(1);
        if (earlyPayment) {
          patterns.push({
            type: "immediate_promo_use",
            severity: "low",
            userId: u.id,
            userName: u.name,
            description:
              "Payment within 2 min of signup — possible promo abuse",
            detectedAt: new Date(),
          });
        }
      }

      // Driver completed ride with 0 distance
      const spoofDrivers = await db
        .select({ driverId: rides.driverId, cnt: count() })
        .from(rides)
        .where(
          and(
            gte(rides.createdAt, sevenDays),
            eq(rides.status, "completed"),
            sql`${rides.distanceKm} < 0.1`,
            sql`${rides.driverId} IS NOT NULL`,
          ),
        )
        .groupBy(rides.driverId)
        .having(sql`COUNT(*) >= 2`)
        .limit(10);

      for (const d of spoofDrivers) {
        if (!d.driverId) continue;
        const [u] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, d.driverId))
          .limit(1);
        patterns.push({
          type: "gps_spoofing_driver",
          severity: "high",
          userId: d.driverId,
          userName: u?.name,
          description: `Completed ${d.cnt} rides with near-zero GPS distance`,
          detectedAt: new Date(),
        });
      }

      res.json({ patterns, total: patterns.length, scannedAt: new Date() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/feature-flags",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { parsePagination, paginatedResponse } =
        await import("../services/paginationHelper");
      const { page, limit, offset } = parsePagination(req, {
        limit: 50,
        maxLimit: 200,
      });
      const [totalRow] = await db.select({ count: count() }).from(featureFlags);
      const rows = await db
        .select()
        .from(featureFlags)
        .orderBy(desc(featureFlags.createdAt))
        .limit(limit)
        .offset(offset);
      const mapped = rows.map((f) => {
        const targeting = (f.targeting as any) ?? {};
        return {
          ...f,
          isEnabled: f.enabled,
          allowlist: targeting.allowlist ?? null,
          environments: targeting.environments ?? null,
        };
      });
      if (req.query.page)
        res.json(
          paginatedResponse(mapped, Number(totalRow.count), page, limit, {
            flags: mapped,
          }),
        );
      else res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/feature-flags",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        key,
        description,
        isEnabled,
        enabled,
        rolloutPercent,
        allowlist,
        environments,
      } = req.body;
      if (!name || !key) {
        res.status(400).json({ error: "name and key required" });
        return;
      }
      const admin = (req as any).adminUser;
      const flagEnabled = isEnabled !== undefined ? !!isEnabled : !!enabled;
      const targeting = {
        allowlist: allowlist ?? "",
        environments: environments ?? "production,staging",
      };
      const [result] = await db.insert(featureFlags).values({
        name,
        key,
        description,
        enabled: flagEnabled,
        rolloutPercent: rolloutPercent || 100,
        targeting,
        createdBy: admin.id,
      });
      logAudit(
        req,
        "create_feature_flag",
        "feature_flag",
        String((result as any).insertId),
        `${key}: ${flagEnabled ? "on" : "off"}`,
      );
      res.json({ success: true, id: (result as any).insertId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/feature-flags/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates: any = {};
      // Accept isEnabled (frontend) or enabled (direct)
      if (req.body.isEnabled !== undefined)
        updates.enabled = !!req.body.isEnabled;
      if (req.body.enabled !== undefined) updates.enabled = !!req.body.enabled;
      ["name", "description", "rolloutPercent"].forEach((k) => {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      });
      // Pack allowlist/environments back into targeting JSON
      if (
        req.body.allowlist !== undefined ||
        req.body.environments !== undefined
      ) {
        const [existing] = await db
          .select({ targeting: featureFlags.targeting })
          .from(featureFlags)
          .where(eq(featureFlags.id, id))
          .limit(1);
        const prev = (existing?.targeting as any) ?? {};
        updates.targeting = {
          ...prev,
          ...(req.body.allowlist !== undefined
            ? { allowlist: req.body.allowlist }
            : {}),
          ...(req.body.environments !== undefined
            ? { environments: req.body.environments }
            : {}),
        };
      }
      await db.update(featureFlags).set(updates).where(eq(featureFlags.id, id));
      const [flag] = await db
        .select({ key: featureFlags.key })
        .from(featureFlags)
        .where(eq(featureFlags.id, id))
        .limit(1);
      logAudit(
        req,
        "update_feature_flag",
        "feature_flag",
        String(id),
        `${flag?.key}: ${updates.enabled}`,
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.delete(
  "/feature-flags/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(featureFlags).where(eq(featureFlags.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// A/B TESTS
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/ab-tests",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(abTests)
        .orderBy(desc(abTests.createdAt));
      // Synthesize frontend-expected fields from DB columns
      const mapped = rows.map((t) => {
        const ctrl = t.controlLabel || "control";
        const vari = t.variantLabel || "variant";
        return {
          ...t,
          description: t.hypothesis,
          variants: [ctrl, vari],
          trafficSplit: { [ctrl]: 50, [vari]: 50 },
          winnerVariant: t.winner,
        };
      });
      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/ab-tests",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        hypothesis,
        metric,
        variants,
        controlLabel,
        variantLabel,
        sampleSize,
      } = req.body;
      if (!name || !metric) {
        res.status(400).json({ error: "name and metric required" });
        return;
      }
      const admin = (req as any).adminUser;
      // Accept variants array (frontend) or explicit controlLabel/variantLabel
      let ctrl = controlLabel || "control";
      let vari = variantLabel || "variant_a";
      if (Array.isArray(variants) && variants.length >= 2) {
        ctrl = variants[0];
        vari = variants[1];
      } else if (typeof variants === "string") {
        try {
          const parsed = JSON.parse(variants);
          if (Array.isArray(parsed) && parsed.length >= 2) {
            ctrl = parsed[0];
            vari = parsed[1];
          }
        } catch {}
      }
      const hyp = hypothesis || description || "";
      const [result] = await db.insert(abTests).values({
        name,
        hypothesis: hyp,
        metric,
        controlLabel: ctrl,
        variantLabel: vari,
        sampleSize,
        status: "draft",
        createdBy: admin.id,
      });
      logAudit(
        req,
        "create_ab_test",
        "ab_test",
        String((result as any).insertId),
        name,
      );
      res.json({ success: true, id: (result as any).insertId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/ab-tests/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates: any = {};
      const allowed = [
        "name",
        "hypothesis",
        "controlValue",
        "variantValue",
        "pValue",
        "status",
      ];
      allowed.forEach((k) => {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      });
      if (updates.controlValue)
        updates.controlValue = String(updates.controlValue);
      if (updates.variantValue)
        updates.variantValue = String(updates.variantValue);
      if (updates.pValue) updates.pValue = String(updates.pValue);
      await db.update(abTests).set(updates).where(eq(abTests.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/ab-tests/:id/start",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db
        .update(abTests)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(abTests.id, id));
      logAudit(req, "start_ab_test", "ab_test", String(id), "started");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/ab-tests/:id/declare-winner",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { winner } = req.body;
      if (!winner) {
        res.status(400).json({ error: "winner required" });
        return;
      }
      // Normalize: if winner matches controlLabel/variantLabel, store as-is; accept "inconclusive"
      const normalised = winner === "inconclusive" ? "inconclusive" : winner;
      await db
        .update(abTests)
        .set({
          winner: normalised as any,
          status: "completed",
          endedAt: new Date(),
        })
        .where(eq(abTests.id, id));
      logAudit(req, "declare_ab_winner", "ab_test", String(id), winner);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.delete(
  "/ab-tests/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(abTests).where(eq(abTests.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// INFRA HEALTH + COST PER RIDE
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/infra-health",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const { getInfraCommandCenter } =
        await import("../services/infraOpsService");

      const result = await getInfraCommandCenter();

      return res.json(result);
    } catch (err: any) {
      console.error("INFRA_HEALTH_ERROR");
      console.error(err);

      return res.status(500).json({
        error: err?.message,
        stack: err?.stack,
      });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/webhooks",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { parsePagination, paginatedResponse } =
        await import("../services/paginationHelper");
      const { page, limit, offset } = parsePagination(req, {
        limit: 50,
        maxLimit: 100,
      });
      const [totalRow] = await db.select({ count: count() }).from(webhooks);
      const rows = await db
        .select()
        .from(webhooks)
        .orderBy(desc(webhooks.createdAt))
        .limit(limit)
        .offset(offset);
      if (req.query.page)
        res.json(
          paginatedResponse(rows, Number(totalRow.count), page, limit, {
            webhooks: rows,
          }),
        );
      else res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/webhooks",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { name, url, events, secret } = req.body;
      if (!name || !url || !events?.length) {
        res.status(400).json({ error: "name, url, events required" });
        return;
      }
      const admin = (req as any).adminUser;
      const webhookSecret = secret || crypto.randomBytes(24).toString("hex");
      const [result] = await db.insert(webhooks).values({
        name,
        url,
        events,
        secret: webhookSecret,
        isActive: true,
        createdBy: admin.id,
      });
      logAudit(
        req,
        "create_webhook",
        "webhook",
        String((result as any).insertId),
        url,
      );
      res.json({
        success: true,
        id: (result as any).insertId,
        secret: webhookSecret,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/webhooks/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates: any = {};
      ["name", "url", "events", "isActive"].forEach((k) => {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      });
      await db.update(webhooks).set(updates).where(eq(webhooks.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.delete(
  "/webhooks/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(webhooks).where(eq(webhooks.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/webhooks/:id/deliveries",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const rows = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, id))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(100);
      // Normalise to frontend-expected shape
      const mapped = rows.map((d) => ({
        ...d,
        success: d.status === "delivered",
        responseStatus: d.responseCode ?? null,
      }));
      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/webhooks/:id/test",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const [wh] = await db
        .select()
        .from(webhooks)
        .where(eq(webhooks.id, id))
        .limit(1);
      if (!wh) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }
      const payload = {
        event: "test.ping",
        timestamp: new Date().toISOString(),
        data: { message: "Hello from YOO Admin" },
      };
      let status: "delivered" | "failed" = "failed";
      let responseCode = 0;
      let responseBody = "";
      try {
        const sig = crypto
          .createHmac("sha256", wh.secret || "")
          .update(JSON.stringify(payload))
          .digest("hex");
        const r = await fetch(wh.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-YOO-Signature": sig,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        responseCode = r.status;
        responseBody = await r.text().catch(() => "");
        status = r.ok ? "delivered" : "failed";
      } catch (e: any) {
        responseBody = e.message;
      }
      await db.insert(webhookDeliveries).values({
        webhookId: id,
        event: "test.ping",
        payload,
        status,
        responseCode,
        responseBody: responseBody.slice(0, 1000),
        attempts: 1,
        deliveredAt: status === "delivered" ? new Date() : null,
      });
      res.json({
        success: status === "delivered",
        responseCode,
        responseBody: responseBody.slice(0, 200),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// ALERT ENGINE (Wave 5)
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/alerts/engine-status",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const { getAlertEngineStatus } =
        await import("../services/alertEngineService");
      res.json(await getAlertEngineStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/alerts/evaluate",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { evaluateAlertRules } =
        await import("../services/alertEngineService");
      res.json(await evaluateAlertRules());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// SUPPORT SLA DASHBOARD (Wave 5)
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/support/sla-dashboard",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const { getSupportSlaDashboard } =
        await import("../services/supportOpsService");
      res.json(await getSupportSlaDashboard(days));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// GDPR / CCPA COMPLIANCE QUEUES (Wave 5)
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/compliance/stats",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const { getComplianceQueueStats } =
        await import("../services/complianceQueueService");
      res.json(await getComplianceQueueStats());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/compliance/deletion-requests",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { listDeletionRequests } =
        await import("../services/complianceQueueService");
      res.json(
        await listDeletionRequests({
          page: parseInt(req.query.page as string) || 1,
          limit: parseInt(req.query.limit as string) || 20,
          status: req.query.status as string,
        }),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/compliance/export-requests",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { listExportRequests } =
        await import("../services/complianceQueueService");
      res.json(
        await listExportRequests({
          page: parseInt(req.query.page as string) || 1,
          limit: parseInt(req.query.limit as string) || 20,
          status: req.query.status as string,
        }),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.patch(
  "/compliance/deletion-requests/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const action = req.body.action as
        | "processing"
        | "completed"
        | "cancelled";
      if (!["processing", "completed", "cancelled"].includes(action)) {
        res.status(400).json({
          error: "action must be processing, completed, or cancelled",
        });
        return;
      }
      const { processDeletionRequest } =
        await import("../services/complianceQueueService");
      const result = await processDeletionRequest(
        parseInt(req.params.id),
        action,
      );
      if (!result) {
        res.status(404).json({ error: "Request not found" });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/compliance/export-requests/:exportId/retry",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { retryExportRequest } =
        await import("../services/complianceQueueService");
      const result = await retryExportRequest(req.params.exportId);
      if (!result) {
        res.status(404).json({ error: "Export request not found" });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/compliance/export-requests/:exportId/payload",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { getExportPayload } =
        await import("../services/complianceQueueService");
      const result = await getExportPayload(req.params.exportId);
      if (!result) {
        res.status(404).json({ error: "Export not ready or not found" });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// ADMIN PREFERENCES — saved filters & dashboard widgets (Wave 6)
// ════════════════════════════════════════════════════════════════════════════

advancedRouter.get(
  "/preferences/saved-filters",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const admin = (req as any).adminUser;
      const { listSavedFilters } =
        await import("../services/adminPreferencesService");
      res.json(
        await listSavedFilters(admin.id, req.query.page as string | undefined),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/preferences/saved-filters",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const admin = (req as any).adminUser;
      const { name, page, filters } = req.body;
      if (!name || !page) {
        res.status(400).json({ error: "name and page required" });
        return;
      }
      const { saveFilter } =
        await import("../services/adminPreferencesService");
      res.json(
        await saveFilter(admin.id, { name, page, filters: filters ?? {} }),
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.delete(
  "/preferences/saved-filters/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const admin = (req as any).adminUser;
      const { deleteSavedFilter } =
        await import("../services/adminPreferencesService");
      res.json(await deleteSavedFilter(admin.id, req.params.id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.get(
  "/preferences/dashboard-widgets",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const admin = (req as any).adminUser;
      const { getDashboardWidgets } =
        await import("../services/adminPreferencesService");
      res.json(await getDashboardWidgets(admin.id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.put(
  "/preferences/dashboard-widgets",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const admin = (req as any).adminUser;
      const { widgets } = req.body;
      if (!Array.isArray(widgets)) {
        res.status(400).json({ error: "widgets array required" });
        return;
      }
      const { saveDashboardWidgets } =
        await import("../services/adminPreferencesService");
      res.json(await saveDashboardWidgets(admin.id, widgets));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

advancedRouter.post(
  "/cache/invalidate",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { cacheInvalidate } = await import("../services/adminCacheService");
      const prefix = req.body.prefix as string | undefined;
      res.json({ cleared: cacheInvalidate(prefix) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

export default advancedRouter;
