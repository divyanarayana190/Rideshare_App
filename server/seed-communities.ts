/**
 * Seeds premium YOO Communities using existing DB users and rides.
 * Run: pnpm seed:communities
 * Force re-seed missing slugs: FORCE_SEED=1 pnpm seed:communities
 */
import "dotenv/config";
import crypto from "crypto";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  communities,
  communityMembers,
  communityRides,
  communityRules,
  rides,
  users,
} from "../drizzle/schema";
import { slugifyCommunityName } from "../shared/community";
import { createNotification } from "./db";
import {
  SEED_COMMUNITIES,
  SEED_COMMUNITY_RULES,
  type SeedCommunityDef,
} from "./seed-communities-data";
import {
  syncCommunityMemberCount,
  syncCommunityRideCount,
} from "./services/communityService";

const FORCE = process.env.FORCE_SEED === "1";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function takeUsers(
  pool: number[],
  cursor: { idx: number },
  count: number,
  exclude: Set<number>,
): number[] {
  const out: number[] = [];
  let guard = 0;
  while (out.length < count && guard < pool.length * 3) {
    const uid = pool[cursor.idx % pool.length]!;
    cursor.idx += 1;
    guard += 1;
    if (exclude.has(uid)) continue;
    exclude.add(uid);
    out.push(uid);
  }
  return out;
}

function rideMatchesKeywords(
  ride: { pickupAddress: string; dropoffAddress: string; carpoolTitle: string | null },
  keywords: string[],
): boolean {
  const hay = `${ride.pickupAddress} ${ride.dropoffAddress} ${ride.carpoolTitle ?? ""}`.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

async function seedCommunity(
  db: any,
  def: SeedCommunityDef,
  userPool: number[],
  cursor: { idx: number },
) {
  const slug = slugifyCommunityName(def.name);
  const [existing] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.slug, slug))
    .limit(1);

  if (existing && !FORCE) {
    console.log(`  • skip ${def.name} (exists)`);
    return { skipped: true, communityId: existing.id };
  }

  const used = new Set<number>();
  const ownerId = userPool[cursor.idx % userPool.length]!;
  cursor.idx += 1;
  used.add(ownerId);

  const modCount = Math.min(def.moderatorCount, Math.max(0, userPool.length - 2));
  const mods = takeUsers(userPool, cursor, modCount, used);

  const maxMembers = Math.min(def.targetMembers, userPool.length - 1);
  const memberCount = Math.max(maxMembers - mods.length, Math.min(20, userPool.length - 1));
  const members = takeUsers(userPool, cursor, memberCount, used);

  const createdAt = new Date(Date.now() - Math.floor(Math.random() * 180) * 86400000);

  let communityId: number;
  if (existing) {
    communityId = existing.id;
    await db
      .update(communities)
      .set({
        name: def.name,
        description: def.description,
        category: def.category,
        visibility: def.visibility,
        verificationType: def.verificationType,
        verificationDomain: def.verificationDomain ?? null,
        logoUrl: def.logoUrl,
        bannerUrl: def.bannerUrl,
        metadata: def.metadata,
        status: "active",
      })
      .where(eq(communities.id, communityId));
    await db.delete(communityMembers).where(eq(communityMembers.communityId, communityId));
    await db.delete(communityRules).where(eq(communityRules.communityId, communityId));
  } else {
    await db.insert(communities).values({
      name: def.name,
      slug,
      description: def.description,
      category: def.category,
      visibility: def.visibility,
      logoUrl: def.logoUrl,
      bannerUrl: def.bannerUrl,
      verificationType: def.verificationType,
      verificationDomain: def.verificationDomain ?? null,
      createdBy: ownerId,
      memberCount: 0,
      rideCount: 0,
      status: "active",
      metadata: def.metadata,
      createdAt,
    });
    const [row] = await db
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.slug, slug))
      .limit(1);
    communityId = row!.id;
  }

  const now = new Date();
  await db.insert(communityMembers).values({
    communityId,
    userId: ownerId,
    role: "owner",
    status: "active",
    joinedAt: createdAt,
    requestedAt: createdAt,
    approvedAt: createdAt,
    approvedBy: ownerId,
  });

  for (const modId of mods) {
    const joined = new Date(createdAt.getTime() + Math.random() * 30 * 86400000);
    await db.insert(communityMembers).values({
      communityId,
      userId: modId,
      role: "moderator",
      status: "active",
      joinedAt: joined,
      requestedAt: joined,
      approvedAt: joined,
      approvedBy: ownerId,
    });
  }

  for (const memberId of members) {
    const joined = new Date(createdAt.getTime() + Math.random() * 90 * 86400000);
    await db.insert(communityMembers).values({
      communityId,
      userId: memberId,
      role: "member",
      status: "active",
      joinedAt: joined,
      requestedAt: joined,
      approvedAt: joined,
      approvedBy: ownerId,
    });
  }

  // Few pending / banned for realism
  const extras = takeUsers(userPool, cursor, Math.min(3, userPool.length), used);
  for (const uid of extras.slice(0, 1)) {
    await db.insert(communityMembers).values({
      communityId,
      userId: uid,
      role: "member",
      status: "pending",
      requestedAt: now,
    });
  }
  const banned = takeUsers(userPool, cursor, Math.min(1, userPool.length), used);
  for (const uid of banned) {
    await db.insert(communityMembers).values({
      communityId,
      userId: uid,
      role: "member",
      status: "banned",
      requestedAt: now,
    });
  }

  await db.insert(communityRules).values(
    SEED_COMMUNITY_RULES.map((text, i) => ({
      communityId,
      text,
      sortOrder: i,
    })),
  );

  await syncCommunityMemberCount(communityId);

  console.log(`  ✓ ${def.name} (${slug}) — owner #${ownerId}, ${mods.length} mods, ${members.length} members`);
  return { skipped: false, communityId, ownerId, memberIds: [ownerId, ...mods, ...members] };
}

async function associateRides(
  db: any,
  communityId: number,
  keywords: string[],
  postedBy: number,
) {
  const linked = await db.select({ rideId: communityRides.rideId }).from(communityRides);
  const linkedIds = linked.map((r: { rideId: number }) => r.rideId);

  const conditions = [
    eq(rides.mode, "share"),
    inArray(rides.status, ["searching", "matched", "driver_arrived", "in_progress"]),
  ];
  if (linkedIds.length > 0) {
    conditions.push(notInArray(rides.id, linkedIds));
  }

  const candidates = await db
    .select()
    .from(rides)
    .where(and(...conditions))
    .limit(200);

  let attached = 0;
  for (const ride of candidates) {
    if (!rideMatchesKeywords(ride, keywords)) continue;
    try {
      await db.insert(communityRides).values({
        communityId,
        rideId: ride.id,
        postedBy: ride.driverId ?? postedBy,
        visibility: "community_only",
      });
      attached += 1;
    } catch {
      // duplicate ride-community
    }
    if (attached >= 12) break;
  }

  await syncCommunityRideCount(communityId);
  return attached;
}

async function seedNotifications(
  communityId: number,
  communityName: string,
  memberIds: number[],
) {
  const kinds = ["joined", "ride_posted", "ride_updated"] as const;
  const samples = shuffle(memberIds).slice(0, Math.min(5, memberIds.length));
  for (let i = 0; i < samples.length; i++) {
    const userId = samples[i]!;
    const type = kinds[i % kinds.length]!;
    const titles: Record<typeof type, string> = {
      joined: `Welcome to ${communityName}`,
      ride_posted: `New ride in ${communityName}`,
      ride_updated: `Ride updated in ${communityName}`,
    };
    const bodies: Record<typeof type, string> = {
      joined: "You are now part of this community. Browse rides or post your own.",
      ride_posted: "A member posted a new community ride. Tap to view details.",
      ride_updated: "A community ride schedule was updated.",
    };
    await createNotification({
      notificationId: `notif_${crypto.randomUUID()}`,
      userId,
      type: "system",
      title: titles[type],
      body: bodies[type],
      data: { communityId, communityName, seed: true },
      deepLink: `/communities/${communityId}`,
      recipientRole: "passenger",
    });
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const pool = mysql.createPool(url);
  const db = drizzle(pool);

  console.log("🌱 Seeding YOO Communities…\n");

  const userRows = await db.select({ id: users.id }).from(users).orderBy(users.id);
  if (userRows.length < 3) {
    throw new Error(
      `Need at least 3 users in DB (found ${userRows.length}). Run pnpm seed:users or sign up users first.`,
    );
  }

  const userPool = shuffle(userRows.map((u) => u.id));
  console.log(`  Found ${userPool.length} users for membership assignment\n`);

  const cursor = { idx: 0 };
  let created = 0;
  let skipped = 0;
  let totalMemberships = 0;
  let totalRideLinks = 0;

  for (const def of SEED_COMMUNITIES) {
    const result = await seedCommunity(db, def, userPool, cursor);
    if (result.skipped) {
      skipped += 1;
      continue;
    }
    created += 1;

    const [memCount] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(communityMembers)
      .where(eq(communityMembers.communityId, result.communityId));
    totalMemberships += Number(memCount?.c ?? 0);

    const ridesLinked = await associateRides(
      db,
      result.communityId,
      def.rideKeywords,
      result.ownerId!,
    );
    totalRideLinks += ridesLinked;

    if (result.memberIds) {
      await seedNotifications(result.communityId, def.name, result.memberIds);
    }
  }

  const [communityTotal] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(communities);

  console.log("\n✅ Communities seed complete");
  console.log(`   Communities created/updated: ${created}`);
  console.log(`   Skipped (already exist):     ${skipped}`);
  console.log(`   Total communities in DB:     ${communityTotal?.c ?? 0}`);
  console.log(`   Membership rows (this run):  ${totalMemberships}`);
  console.log(`   Ride associations (this run):  ${totalRideLinks}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
