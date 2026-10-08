/**
 * Shared admin JWT auth + department RBAC enforcement.
 */
import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../../drizzle/schema";
import logger from "../logger";
import { assertApiPermission, getAdminRole, type AdminRole } from "../services/adminRbacService";

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || "";
if (!JWT_SECRET) logger.warn("[admin] ADMIN_JWT_SECRET is not configured. Admin auth will fail.");

export interface AdminUser {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  adminRole: AdminRole;
}

export interface AdminRequest extends Request {
  adminUser?: AdminUser;
}

interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export function createAdminToken(user: { id: number; email: string; role: string }): string {
  if (!JWT_SECRET) throw new Error("ADMIN_JWT_SECRET is not configured — cannot issue admin tokens");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payloadB64}`).digest("base64url");
  return `${header}.${payloadB64}.${signature}`;
}

export function verifyAdminToken(token: string): JwtPayload | null {
  if (!JWT_SECRET) return null;
  try {
    const [header, payload, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (signature !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as JwtPayload;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyAdminToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const adminRole = await getAdminRole(user.id);
  (req as AdminRequest).adminUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    adminRole,
  };

  const denied = assertApiPermission(adminRole, req.path, req.method);
  if (denied) {
    res.status(403).json({ error: denied });
    return;
  }

  next();
}
