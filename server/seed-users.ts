// server/seed-users.ts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { userProfiles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

// Force DATABASE_URL from ENV (so running under tsx always works)
if (ENV.databaseUrl) process.env.DATABASE_URL = ENV.databaseUrl;

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]) {
  return arr[randInt(0, arr.length - 1)];
}
function makeName() {
  const first = pick([
    "Alex",
    "Sam",
    "Jordan",
    "Taylor",
    "Chris",
    "Riya",
    "Asha",
    "Vikram",
    "Maya",
    "Noah",
  ]);
  const last = pick([
    "Johnson",
    "Patel",
    "Lee",
    "Brown",
    "Garcia",
    "Khan",
    "Singh",
    "Kim",
    "Nguyen",
    "Wilson",
  ]);
  return { full: `${first} ${last}`.trim() };
}
function normalizePhone(p: string) {
  return (p || "").replace(/\D/g, "");
}
function normalizeEmail(e: string) {
  return (e || "").trim().toLowerCase();
}
function makeOtpOpenId(method: "phone" | "email", destination: string) {
  const norm =
    method === "phone"
      ? normalizePhone(destination)
      : normalizeEmail(destination);
  return `otp:${method}:${norm}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  console.log("[seed] DATABASE_URL =", url);

  if (!url) throw new Error("DATABASE_URL is missing");

  const pool = mysql.createPool(url);
  const db = drizzle(pool);

  const created: Array<{
    userId: number;
    openId: string;
    email?: string;
    phone?: string;
  }> = [];

  for (let i = 0; i < 10; i++) {
    const { full } = makeName();
    const useEmail = i % 2 === 0;

    const method: "email" | "phone" = useEmail ? "email" : "phone";
    const destination = useEmail
      ? `seed.user${Date.now()}_${i}@example.com`
      : `201555${randInt(1000, 9999)}`;

    const openId = makeOtpOpenId(method, destination);
    const email = useEmail ? normalizeEmail(destination) : null;
    const phone = !useEmail ? normalizePhone(destination) : null;

    await db.insert(users).values({
      openId,
      name: full,
      email,
      loginMethod: "otp",
      role: "user",
      lastSignedIn: new Date(),
    });

    const row = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);

    const userId = Number(row?.[0]?.id);
    if (!userId) throw new Error("Insert user failed: could not read id back");

    await db.insert(userProfiles).values({
      userId,
      phoneNumber: phone,
      isDriver: false,
      averageRating: "5.00",
      totalRides: randInt(0, 120),
      totalEarnings: "0.00",
    });

    created.push({
      userId,
      openId,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    });
  }

  console.log("✅ Seeded OTP-loggable users:");
  for (const u of created) {
    console.log(
      `- id=${u.userId} openId=${u.openId}` +
        (u.email ? ` email=${u.email}` : "") +
        (u.phone ? ` phone=${u.phone}` : ""),
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
