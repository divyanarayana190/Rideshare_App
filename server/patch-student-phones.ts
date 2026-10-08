import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { userProfiles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

if (ENV.databaseUrl) process.env.DATABASE_URL = ENV.databaseUrl;

const patches = [
  { email: "priya.sharma@mit.edu",     phone: "6175550101" },
  { email: "ethan.brooks@stanford.edu",phone: "6505550102" },
  { email: "sofia.ramirez@berkeley.edu",phone: "5105550103" },
  { email: "marcus.j@umich.edu",       phone: "7345550104" },
  { email: "aisha.patel@gatech.edu",   phone: "4045550105" },
  { email: "lchen@ucla.edu",           phone: "3105550106" },
  { email: "zara.williams@nyu.edu",    phone: "2125550107" },
  { email: "dmehta@purdue.edu",        phone: "7655550108" },
];

async function main() {
  const pool = mysql.createPool(process.env.DATABASE_URL!);
  const db = drizzle(pool);

  for (const p of patches) {
    const openId = `otp:email:${p.email}`;
    const row = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    if (!row[0]) { console.log("not found:", p.email); continue; }
    await db.update(userProfiles).set({ phoneNumber: p.phone }).where(eq(userProfiles.userId, row[0].id));
    console.log(`✅ ${p.email}  →  ${p.phone}`);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
