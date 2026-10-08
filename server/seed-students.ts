// server/seed-students.ts
// Seeds 8 verified student users you can log in with.
// Password for ALL accounts: Student123!
// Run: pnpm tsx server/seed-students.ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { studentVerifications, userProfiles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

if (ENV.databaseUrl) process.env.DATABASE_URL = ENV.databaseUrl;

const PASSWORD = "Student123!";

const STUDENTS = [
  {
    firstName: "Priya",
    lastName: "Sharma",
    email: "priya.sharma@mit.edu",
    phone: "6175550101",
    gender: "female" as const,
    universityName: "Massachusetts Institute of Technology",
    universityDomain: "mit.edu",
    totalRides: 24,
  },
  {
    firstName: "Ethan",
    lastName: "Brooks",
    email: "ethan.brooks@stanford.edu",
    phone: "6505550102",
    gender: "male" as const,
    universityName: "Stanford University",
    universityDomain: "stanford.edu",
    totalRides: 12,
  },
  {
    firstName: "Sofia",
    lastName: "Ramirez",
    email: "sofia.ramirez@berkeley.edu",
    phone: "5105550103",
    gender: "female" as const,
    universityName: "University of California, Berkeley",
    universityDomain: "berkeley.edu",
    totalRides: 8,
  },
  {
    firstName: "Marcus",
    lastName: "Johnson",
    email: "marcus.j@umich.edu",
    phone: "7345550104",
    gender: "male" as const,
    universityName: "University of Michigan",
    universityDomain: "umich.edu",
    totalRides: 31,
  },
  {
    firstName: "Aisha",
    lastName: "Patel",
    email: "aisha.patel@gatech.edu",
    phone: "4045550105",
    gender: "female" as const,
    universityName: "Georgia Institute of Technology",
    universityDomain: "gatech.edu",
    totalRides: 17,
  },
  {
    firstName: "Lucas",
    lastName: "Chen",
    email: "lchen@ucla.edu",
    phone: "3105550106",
    gender: "male" as const,
    universityName: "University of California, Los Angeles",
    universityDomain: "ucla.edu",
    totalRides: 5,
  },
  {
    firstName: "Zara",
    lastName: "Williams",
    email: "zara.williams@nyu.edu",
    phone: "2125550107",
    gender: "female" as const,
    universityName: "New York University",
    universityDomain: "nyu.edu",
    totalRides: 42,
  },
  {
    firstName: "Dev",
    lastName: "Mehta",
    email: "dmehta@purdue.edu",
    phone: "7655550108",
    gender: "male" as const,
    universityName: "Purdue University",
    universityDomain: "purdue.edu",
    totalRides: 9,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing");
  console.log("[seed-students] DATABASE_URL =", url);

  const pool = mysql.createPool(url);
  const db = drizzle(pool);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();

  console.log(`\nSeeding ${STUDENTS.length} verified student accounts...\n`);

  for (const s of STUDENTS) {
    const openId = `otp:email:${s.email.toLowerCase()}`;

    // Skip if already exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);

    if (existing.length > 0) {
      console.log(`⚠️  Skipping ${s.email} (already exists)`);
      continue;
    }

    // Insert user
    await db.insert(users).values({
      openId,
      name: `${s.firstName} ${s.lastName}`,
      email: s.email.toLowerCase(),
      loginMethod: "password",
      passwordHash,
      role: "user",
      lastSignedIn: now,
    });

    const row = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);

    const userId = Number(row?.[0]?.id);
    if (!userId) throw new Error(`Failed to read back userId for ${s.email}`);

    // Insert profile — verified student
    await db.insert(userProfiles).values({
      userId,
      phoneNumber: s.phone,
      gender: s.gender,
      isDriver: false,
      isStudent: true,
      collegeEmail: s.email.toLowerCase(),
      studentFreeRidesUsed: 0,
      studentFreeRidesEarned: 2,
      isStudentVerified: true,
      studentVerifiedAt: now,
      studentUniversityName: s.universityName,
      studentUniversityDomain: s.universityDomain,
      averageRating: "4.90",
      totalRides: s.totalRides,
      totalEarnings: "0.00",
    });

    // Insert a verified studentVerification record
    const verificationId = `seed-${userId}-${Date.now()}`;
    await db.insert(studentVerifications).values({
      verificationId,
      userId,
      email: s.email.toLowerCase(),
      otpHash: passwordHash, // placeholder hash — record is already verified
      status: "verified",
      attempts: 1,
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365), // 1 year
      lastSentAt: now,
      verifiedAt: now,
      universityName: s.universityName,
      universityDomain: s.universityDomain,
    });

    console.log(`✅ ${s.firstName} ${s.lastName}`);
    console.log(`   Email:      ${s.email}`);
    console.log(`   Phone:      ${s.phone}`);
    console.log(`   Password:   ${PASSWORD}`);
    console.log(`   University: ${s.universityName}`);
    console.log(`   Rides:      ${s.totalRides}`);
    console.log();
  }

  console.log("Done. Log in with any email above and password: Student123!");
  await pool.end();
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
