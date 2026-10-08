/**
 * Fraud intelligence — scores 0-100 with explanations from real account/ride data.
 */
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  userProfiles,
  rides,
  ridePassengers,
  fraudFlags,
  abuseFlags,
  referrals,
  payments,
  stripePayments,
} from "../../drizzle/schema";

export async function computeFraudScore(userId: number) {
  const explanations: string[] = [];
  let score = 0;

  const flags = await db
    .select()
    .from(fraudFlags)
    .where(eq(fraudFlags.userId, userId))
    .orderBy(desc(fraudFlags.score))
    .limit(10);

  if (flags.length > 0) {
    const maxFlag = Math.max(...flags.map((f) => Number(f.score)));
    score += Math.min(40, Math.round(maxFlag * 0.4));
    explanations.push(`${flags.length} fraud flag(s) on record (max score ${maxFlag})`);
    for (const f of flags.filter((x) => x.status === "open").slice(0, 3)) {
      explanations.push(`Open flag: ${f.flagType.replace(/_/g, " ")}`);
    }
  }

  const abuse = await db
    .select()
    .from(abuseFlags)
    .where(and(eq(abuseFlags.userId, userId), eq(abuseFlags.status, "open")));
  if (abuse.length > 0) {
    score += Math.min(25, abuse.length * 8);
    for (const a of abuse) {
      explanations.push(`Wallet abuse: ${a.flagType} (${a.severity})`);
    }
  }

  const sevenDays = new Date(Date.now() - 7 * 86400000);
  const [cancelStats] = await db
    .select({
      total: count(),
      cancelled: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' THEN 1 ELSE 0 END)`,
    })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(and(eq(ridePassengers.passengerId, userId), gte(rides.createdAt, sevenDays)));

  const total = Number(cancelStats?.total ?? 0);
  const cancelled = Number(cancelStats?.cancelled ?? 0);
  if (total >= 5 && cancelled / total > 0.6) {
    score += 20;
    explanations.push(`High cancellation rate: ${Math.round((cancelled / total) * 100)}% (${cancelled}/${total} in 7d)`);
  }

  const [zeroDist] = await db
    .select({ count: count() })
    .from(ridePassengers)
    .innerJoin(rides, eq(ridePassengers.rideId, rides.id))
    .where(and(
      eq(ridePassengers.passengerId, userId),
      eq(rides.status, "completed"),
      gte(rides.createdAt, sevenDays),
      sql`${rides.distanceKm} < 0.1`,
    ));
  if (Number(zeroDist?.count ?? 0) >= 2) {
    score += 25;
    explanations.push(`GPS anomaly: ${zeroDist?.count} zero-distance completed rides`);
  }

  const [user] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (user) {
    const signupPlus2Min = new Date(new Date(user.createdAt).getTime() + 120000);
    const [earlyPay] = await db
      .select({ id: stripePayments.id })
      .from(stripePayments)
      .where(and(eq(stripePayments.riderId, userId), sql`${stripePayments.createdAt} <= ${signupPlus2Min}`))
      .limit(1);
    if (!earlyPay) {
      const [legacyPay] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.passengerId, userId), sql`${payments.createdAt} <= ${signupPlus2Min}`))
        .limit(1);
      if (legacyPay) {
        score += 15;
        explanations.push("Payment within 2 minutes of signup — possible promo abuse");
      }
    } else {
      score += 15;
      explanations.push("Payment within 2 minutes of signup — possible promo abuse");
    }
  }

  const [referralCount] = await db
    .select({ count: count() })
    .from(referrals)
    .where(and(eq(referrals.referrerId, userId), gte(referrals.createdAt, sevenDays)));
  if (Number(referralCount?.count ?? 0) >= 5) {
    score += 15;
    explanations.push(`${referralCount?.count} referrals in 7 days — possible referral abuse`);
  }

  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (profile?.isBanned) {
    score = Math.max(score, 80);
    explanations.push("Account is banned");
  }

  score = Math.min(100, Math.max(0, score));
  const riskLevel = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";

  return { userId, score, riskLevel, explanations: explanations.length ? explanations : ["No significant fraud signals detected"] };
}

export async function getFraudIntelligence() {
  const thirtyDays = new Date(Date.now() - 30 * 86400000);

  const [openFlags] = await db.select({ count: count() }).from(fraudFlags).where(eq(fraudFlags.status, "open"));
  const [blockedFlags] = await db.select({ count: count() }).from(fraudFlags).where(eq(fraudFlags.status, "blocked"));
  const [openAbuse] = await db.select({ count: count() }).from(abuseFlags).where(eq(abuseFlags.status, "open"));
  const [avgScoreRow] = await db.select({ avg: sql<string>`AVG(${fraudFlags.score})` }).from(fraudFlags).where(gte(fraudFlags.createdAt, thirtyDays));

  const trend = await db
    .select({
      date: sql<string>`DATE(${fraudFlags.createdAt})`,
      count: count(),
      avgScore: sql<string>`AVG(${fraudFlags.score})`,
    })
    .from(fraudFlags)
    .where(gte(fraudFlags.createdAt, thirtyDays))
    .groupBy(sql`DATE(${fraudFlags.createdAt})`)
    .orderBy(sql`DATE(${fraudFlags.createdAt})`);

  const topFlagged = await db
    .select({
      userId: fraudFlags.userId,
      maxScore: sql<string>`MAX(${fraudFlags.score})`,
      flagCount: count(),
      userName: users.name,
      userEmail: users.email,
    })
    .from(fraudFlags)
    .leftJoin(users, eq(fraudFlags.userId, users.id))
    .where(sql`${fraudFlags.userId} IS NOT NULL`)
    .groupBy(fraudFlags.userId, users.name, users.email)
    .orderBy(sql`MAX(${fraudFlags.score}) DESC`)
    .limit(15);

  const scoredUsers = await Promise.all(
    topFlagged
      .filter((u) => u.userId)
      .slice(0, 10)
      .map(async (u) => {
        const scored = await computeFraudScore(u.userId!);
        return {
          userId: u.userId!,
          userName: u.userName,
          userEmail: u.userEmail,
          flagCount: Number(u.flagCount),
          score: scored.score,
          riskLevel: scored.riskLevel,
          explanations: scored.explanations,
        };
      }),
  );

  const byType = await db
    .select({ flagType: fraudFlags.flagType, count: count() })
    .from(fraudFlags)
    .where(gte(fraudFlags.createdAt, thirtyDays))
    .groupBy(fraudFlags.flagType)
    .orderBy(sql`COUNT(*) DESC`);

  return {
    summary: {
      openFlags: Number(openFlags?.count ?? 0),
      blockedAccounts: Number(blockedFlags?.count ?? 0),
      openAbuseFlags: Number(openAbuse?.count ?? 0),
      avgFlagScore: Math.round(Number(avgScoreRow?.avg ?? 0) * 10) / 10,
    },
    trend: trend.map((r) => ({
      date: r.date,
      count: Number(r.count),
      avgScore: Math.round(Number(r.avgScore ?? 0) * 10) / 10,
    })),
    topRiskUsers: scoredUsers.sort((a, b) => b.score - a.score),
    flagsByType: byType.map((r) => ({ type: r.flagType, count: Number(r.count) })),
    timestamp: new Date().toISOString(),
  };
}
