import crypto from "crypto";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  communities,
  communityInvites,
  communityMembers,
  communityRides,
  communityRules,
  rides,
  userProfiles,
  users,
  type Community,
  type CommunityMember,
} from "../../drizzle/schema";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_VERIFICATION_TYPES,
  COMMUNITY_VISIBILITY,
  DEFAULT_COMMUNITY_RULES,
  slugifyCommunityName,
  type CommunityCategory,
  type CommunityMemberRole,
  type CommunityMemberStatus,
  type CommunityVerificationType,
  type CommunityVisibility,
} from "../../shared/community";
import { parseCommunityMetadata, type CommunityMetadata } from "../../shared/communityMetadata";
import { db } from "../db";
import { getRideOrganizerId } from "../db";
import logger from "../logger";

export { slugifyCommunityName };

const MANAGER_ROLES: CommunityMemberRole[] = ["owner", "admin", "moderator"];

export type MembershipInfo = {
  status: CommunityMemberStatus | null;
  role: CommunityMemberRole | null;
  memberId: number | null;
};

export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, "");
}

export function emailMatchesDomain(email: string | null | undefined, domain: string): boolean {
  if (!email || !domain) return false;
  const norm = normalizeDomain(domain);
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  return email.trim().toLowerCase().slice(at + 1) === norm;
}

export function resolveJoinStatus(params: {
  visibility: CommunityVisibility;
  verificationType: CommunityVerificationType;
  hasValidInvite: boolean;
  emailDomainOk: boolean;
}): "active" | "pending" | "rejected" {
  const { visibility, verificationType, hasValidInvite, emailDomainOk } = params;

  if (visibility === "invite_only" && !hasValidInvite) {
    return "pending";
  }

  if (verificationType === "edu_email" || verificationType === "company_email") {
    if (!emailDomainOk) return "rejected";
  }

  if (verificationType === "invite_code" && !hasValidInvite) {
    return "pending";
  }

  if (
    verificationType === "manual_approval" ||
    visibility === "private"
  ) {
    return "pending";
  }

  return "active";
}

export async function ensureUniqueSlug(baseName: string): Promise<string> {
  const base = slugifyCommunityName(baseName);
  let candidate = base;
  let n = 1;
  while (true) {
    const [existing] = await db
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`.slice(0, 64);
  }
}

export async function getMembership(
  communityId: number,
  userId: number,
): Promise<CommunityMember | null> {
  const [row] = await db
    .select()
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

export function isActiveMember(m: CommunityMember | null | undefined): boolean {
  return m?.status === "active";
}

export function canManageMembers(m: CommunityMember | null | undefined): boolean {
  return m?.status === "active" && MANAGER_ROLES.includes(m.role as CommunityMemberRole);
}

export async function getCommunityById(id: number): Promise<Community | null> {
  const [row] = await db.select().from(communities).where(eq(communities.id, id)).limit(1);
  return row ?? null;
}

export async function getCommunityBySlug(slug: string): Promise<Community | null> {
  const [row] = await db.select().from(communities).where(eq(communities.slug, slug)).limit(1);
  return row ?? null;
}

export async function getCommunityRules(communityId: number) {
  return db
    .select()
    .from(communityRules)
    .where(eq(communityRules.communityId, communityId))
    .orderBy(asc(communityRules.sortOrder));
}

export async function canViewCommunityRides(
  community: Community,
  membership: CommunityMember | null,
): Promise<boolean> {
  if (community.status !== "active") return isActiveMember(membership);
  if (community.visibility === "public") return true;
  return isActiveMember(membership);
}

export async function canViewCommunityMembers(
  community: Community,
  membership: CommunityMember | null,
): Promise<boolean> {
  if (community.visibility === "public") return true;
  return isActiveMember(membership);
}

export async function canPostCommunityRide(
  community: Community,
  membership: CommunityMember | null,
): Promise<boolean> {
  return community.status === "active" && isActiveMember(membership);
}

async function incrementMemberCount(communityId: number, delta: number) {
  await db
    .update(communities)
    .set({ memberCount: sql`GREATEST(0, ${communities.memberCount} + ${delta})` })
    .where(eq(communities.id, communityId));
}

async function incrementRideCount(communityId: number, delta: number) {
  await db
    .update(communities)
    .set({ rideCount: sql`GREATEST(0, ${communities.rideCount} + ${delta})` })
    .where(eq(communities.id, communityId));
}

export async function createCommunity(params: {
  userId: number;
  userEmail: string | null;
  name: string;
  description: string;
  category: CommunityCategory;
  visibility: CommunityVisibility;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  verificationType: CommunityVerificationType;
  verificationDomain?: string | null;
  customInviteCode?: string | null;
  rules?: string[];
}) {
  const slug = await ensureUniqueSlug(params.name);
  const inviteCode =
    params.verificationType === "invite_code"
      ? (params.customInviteCode?.trim().toUpperCase() || generateInviteCode())
      : null;

  const rules = (params.rules?.length ? params.rules : [...DEFAULT_COMMUNITY_RULES]).slice(0, 10);

  await db.insert(communities).values({
    name: params.name.trim(),
    slug,
    description: params.description.trim(),
    category: params.category,
    visibility: params.visibility,
    logoUrl: params.logoUrl ?? null,
    bannerUrl: params.bannerUrl ?? null,
    verificationType: params.verificationType,
    verificationDomain: params.verificationDomain
      ? normalizeDomain(params.verificationDomain)
      : null,
    inviteCode,
    createdBy: params.userId,
    memberCount: 1,
    rideCount: 0,
    status: "active",
  });

  const created = await getCommunityBySlug(slug);
  if (!created) throw new Error("Failed to create community");

  await db.insert(communityMembers).values({
    communityId: created.id,
    userId: params.userId,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
    approvedAt: new Date(),
    approvedBy: params.userId,
  });

  if (rules.length > 0) {
    await db.insert(communityRules).values(
      rules.map((text, i) => ({
        communityId: created.id,
        text: text.trim(),
        sortOrder: i,
      })),
    );
  }

  if (inviteCode) {
    await db.insert(communityInvites).values({
      communityId: created.id,
      inviteCode,
      createdBy: params.userId,
      maxUses: null,
      usedCount: 0,
    });
  }

  logger.info({ communityId: created.id, userId: params.userId }, "[communities] created");
  return created;
}

export async function listMyCommunities(userId: number, search?: string, limit = 20) {
  const conditions = [
    eq(communityMembers.userId, userId),
    inArray(communityMembers.status, ["active", "pending"]),
    eq(communities.status, "active"),
  ];
  if (search?.trim()) {
    conditions.push(
      or(
        like(communities.name, `%${search.trim()}%`),
        like(communities.description, `%${search.trim()}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      community: communities,
      membership: communityMembers,
    })
    .from(communityMembers)
    .innerJoin(communities, eq(communityMembers.communityId, communities.id))
    .where(and(...conditions))
    .orderBy(desc(communityMembers.updatedAt))
    .limit(Math.min(limit, 50));

  return rows.map((r) => ({
    ...r.community,
    membershipStatus: r.membership.status,
    membershipRole: r.membership.role,
  }));
}

export async function discoverCommunities(
  userId: number,
  opts: { search?: string; category?: CommunityCategory; limit?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const conditions = [
    eq(communities.visibility, "public"),
    eq(communities.status, "active"),
  ];
  if (opts.category) conditions.push(eq(communities.category, opts.category));
  if (opts.search?.trim()) {
    conditions.push(
      or(
        like(communities.name, `%${opts.search.trim()}%`),
        like(communities.description, `%${opts.search.trim()}%`),
      )!,
    );
  }

  const rows = await db
    .select({ community: communities })
    .from(communities)
    .where(and(...conditions))
    .orderBy(desc(communities.memberCount))
    .limit(limit);

  const communityIds = rows.map((r) => r.community.id);
  const memberships =
    communityIds.length > 0
      ? await db
          .select()
          .from(communityMembers)
          .where(
            and(
              eq(communityMembers.userId, userId),
              inArray(communityMembers.communityId, communityIds),
            ),
          )
      : [];

  const memByCommunity = new Map(memberships.map((m) => [m.communityId, m]));

  return rows
    .map((r) => {
      const mem = memByCommunity.get(r.community.id);
      return {
        ...r.community,
        membershipStatus: mem?.status ?? null,
        membershipRole: mem?.role ?? null,
      };
    })
    .filter((c) => c.membershipStatus !== "active" && c.membershipStatus !== "banned");
}

export type CommunityListItem = Community & {
  membershipStatus?: CommunityMemberStatus | null;
  membershipRole?: CommunityMemberRole | null;
  onlineCount: number;
  isVerified: boolean;
  themeColor: string | null;
  tags: string[];
  featured: boolean;
  trendingScore: number;
  locationCity: string | null;
};

const ONLINE_WINDOW_MINUTES = 15;

function computeTrendingScore(c: Community, meta: CommunityMetadata): number {
  if (meta.trendingScore != null) return meta.trendingScore;
  const featuredBoost = meta.featured ? 500 : 0;
  return c.memberCount * 2 + c.rideCount * 8 + featuredBoost;
}

function isCommunityVerified(c: Community, meta: CommunityMetadata): boolean {
  if (meta.isVerified === true) return true;
  return c.verificationType === "edu_email" || c.verificationType === "company_email";
}

export async function getOnlineCountsByCommunity(
  communityIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (communityIds.length === 0) return map;

  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60_000);

  const rows = await db
    .select({
      communityId: communityMembers.communityId,
      onlineCount: sql<number>`COUNT(DISTINCT ${communityMembers.userId})`,
    })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .where(
      and(
        eq(communityMembers.status, "active"),
        inArray(communityMembers.communityId, communityIds),
        sql`${users.lastSignedIn} >= ${cutoff}`,
      ),
    )
    .groupBy(communityMembers.communityId);

  for (const row of rows) {
    map.set(row.communityId, Number(row.onlineCount));
  }
  return map;
}

export function enrichCommunityRow(
  c: Community,
  extras: {
    onlineCount?: number;
    membershipStatus?: CommunityMemberStatus | null;
    membershipRole?: CommunityMemberRole | null;
  } = {},
): CommunityListItem {
  const meta = parseCommunityMetadata(c.metadata);
  return {
    ...c,
    membershipStatus: extras.membershipStatus ?? null,
    membershipRole: extras.membershipRole ?? null,
    onlineCount: extras.onlineCount ?? 0,
    isVerified: isCommunityVerified(c, meta),
    themeColor: meta.themeColor ?? null,
    tags: meta.tags ?? [],
    featured: meta.featured ?? false,
    trendingScore: computeTrendingScore(c, meta),
    locationCity: meta.location?.city ?? null,
  };
}

async function enrichMany(
  rows: Array<{
    community: Community;
    membershipStatus?: CommunityMemberStatus | null;
    membershipRole?: CommunityMemberRole | null;
  }>,
): Promise<CommunityListItem[]> {
  const ids = rows.map((r) => r.community.id);
  const onlineMap = await getOnlineCountsByCommunity(ids);
  return rows.map((r) =>
    enrichCommunityRow(r.community, {
      onlineCount: onlineMap.get(r.community.id) ?? 0,
      membershipStatus: r.membershipStatus,
      membershipRole: r.membershipRole,
    }),
  );
}

export type CommunityBrowseSort =
  | "trending"
  | "newest"
  | "largest"
  | "most_active"
  | "recommended";

export async function browseCommunities(
  userId: number,
  opts: {
    search?: string;
    category?: CommunityCategory;
    visibility?: CommunityVisibility;
    verifiedOnly?: boolean;
    featuredOnly?: boolean;
    sort?: CommunityBrowseSort;
    limit?: number;
    offset?: number;
  } = {},
) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const conditions = [eq(communities.status, "active")];

  if (opts.category) conditions.push(eq(communities.category, opts.category));
  if (opts.visibility) conditions.push(eq(communities.visibility, opts.visibility));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        like(communities.name, q),
        like(communities.description, q),
        sql`JSON_UNQUOTE(JSON_EXTRACT(${communities.metadata}, '$.searchKeywords')) LIKE ${q}`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${communities.metadata}, '$.location.city')) LIKE ${q}`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${communities.metadata}, '$.universityRef')) LIKE ${q}`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${communities.metadata}, '$.companyRef')) LIKE ${q}`,
      )!,
    );
  }
  if (opts.verifiedOnly) {
    conditions.push(
      sql`(
        ${communities.verificationType} IN ('edu_email', 'company_email')
        OR JSON_EXTRACT(${communities.metadata}, '$.isVerified') = true
      )`,
    );
  }
  if (opts.featuredOnly) {
    conditions.push(sql`JSON_EXTRACT(${communities.metadata}, '$.featured') = true`);
  }

  const sort = opts.sort ?? "trending";
  const order =
    sort === "newest"
      ? desc(communities.createdAt)
      : sort === "largest"
        ? desc(communities.memberCount)
        : sort === "most_active"
          ? desc(communities.rideCount)
          : desc(communities.memberCount);

  const rows = await db
    .select({ community: communities })
    .from(communities)
    .where(and(...conditions))
    .orderBy(order)
    .limit(limit)
    .offset(offset);

  const communityIds = rows.map((r) => r.community.id);
  const memberships =
    communityIds.length > 0
      ? await db
          .select()
          .from(communityMembers)
          .where(
            and(
              eq(communityMembers.userId, userId),
              inArray(communityMembers.communityId, communityIds),
            ),
          )
      : [];
  const memByCommunity = new Map(memberships.map((m) => [m.communityId, m]));

  let enriched = await enrichMany(
    rows.map((r) => ({
      community: r.community,
      membershipStatus: memByCommunity.get(r.community.id)?.status ?? null,
      membershipRole: memByCommunity.get(r.community.id)?.role ?? null,
    })),
  );

  if (sort === "trending" || sort === "recommended") {
    enriched = [...enriched].sort((a, b) => b.trendingScore - a.trendingScore);
  }

  return { items: enriched, limit, offset, hasMore: enriched.length === limit };
}

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type CommunityWithDistance = CommunityListItem & { distanceMiles: number };

export async function getNearbyCommunities(
  userId: number,
  lat: number,
  lng: number,
  opts: { maxMiles?: number; minMiles?: number; limit?: number; offset?: number } = {},
) {
  const maxMiles = opts.maxMiles ?? 5;
  const minMiles = opts.minMiles ?? 0;
  const limit = Math.min(opts.limit ?? 20, 50);
  const offset = Math.max(opts.offset ?? 0, 0);

  const rows = await db
    .select({ community: communities })
    .from(communities)
    .where(
      and(
        eq(communities.status, "active"),
        sql`JSON_EXTRACT(${communities.metadata}, '$.location.lat') IS NOT NULL`,
        sql`JSON_EXTRACT(${communities.metadata}, '$.location.lng') IS NOT NULL`,
      ),
    )
    .limit(300);

  const communityIds = rows.map((r) => r.community.id);
  const memberships =
    communityIds.length > 0
      ? await db
          .select()
          .from(communityMembers)
          .where(
            and(
              eq(communityMembers.userId, userId),
              inArray(communityMembers.communityId, communityIds),
            ),
          )
      : [];
  const memByCommunity = new Map(memberships.map((m) => [m.communityId, m]));

  type Scored = { community: Community; distanceMiles: number };
  const scored: Scored[] = [];
  for (const row of rows) {
    const meta = parseCommunityMetadata(row.community.metadata);
    const cLat = meta.location?.lat;
    const cLng = meta.location?.lng;
    if (cLat == null || cLng == null || !Number.isFinite(cLat) || !Number.isFinite(cLng)) {
      continue;
    }
    const distanceMiles = haversineMiles(lat, lng, cLat, cLng);
    if (distanceMiles < minMiles || distanceMiles > maxMiles) continue;
    scored.push({ community: row.community, distanceMiles });
  }

  scored.sort((a, b) => {
    if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles;
    const scoreA = computeTrendingScore(a.community, parseCommunityMetadata(a.community.metadata));
    const scoreB = computeTrendingScore(b.community, parseCommunityMetadata(b.community.metadata));
    return scoreB - scoreA;
  });

  const page = scored.slice(offset, offset + limit);
  const enriched = await enrichMany(
    page.map((s) => ({
      community: s.community,
      membershipStatus: memByCommunity.get(s.community.id)?.status ?? null,
      membershipRole: memByCommunity.get(s.community.id)?.role ?? null,
    })),
  );

  const items: CommunityWithDistance[] = enriched.map((c, i) => ({
    ...c,
    distanceMiles: page[i]!.distanceMiles,
  }));

  return {
    items,
    limit,
    offset,
    hasMore: offset + limit < scored.length,
    total: scored.length,
  };
}

export async function getTopCommunities(
  userId: number,
  opts: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const offset = Math.max(opts.offset ?? 0, 0);

  const result = await browseCommunities(userId, {
    sort: "trending",
    limit: limit + offset + 50,
    offset: 0,
  });

  const sorted = [...result.items].sort((a, b) => {
    if (b.trendingScore !== a.trendingScore) return b.trendingScore - a.trendingScore;
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    if (b.rideCount !== a.rideCount) return b.rideCount - a.rideCount;
    if (b.onlineCount !== a.onlineCount) return b.onlineCount - a.onlineCount;
    return b.id - a.id;
  });

  const items = sorted.slice(offset, offset + limit);
  return { items, limit, offset, hasMore: offset + limit < sorted.length };
}

export async function searchCommunitiesGrouped(
  userId: number,
  search: string,
  coords?: { lat: number; lng: number },
) {
  const q = search.trim();
  if (!q) {
    return { joined: [], nearby: [], top: [], other: [] as CommunityListItem[] };
  }

  const [myRaw, browseResult, nearbyResult, topResult] = await Promise.all([
    listMyCommunities(userId, q, 30),
    browseCommunities(userId, { search: q, sort: "trending", limit: 40 }),
    coords
      ? getNearbyCommunities(userId, coords.lat, coords.lng, { maxMiles: 5, limit: 20 })
      : Promise.resolve({ items: [] as CommunityWithDistance[] }),
    browseCommunities(userId, { sort: "trending", limit: 15 }),
  ]);

  const myIds = new Set(myRaw.map((c) => c.id));
  const myOnline = await getOnlineCountsByCommunity(myRaw.map((c) => c.id));
  const joined = myRaw.map((c) =>
    enrichCommunityRow(c, {
      onlineCount: myOnline.get(c.id) ?? 0,
      membershipStatus: c.membershipStatus as CommunityMemberStatus,
      membershipRole: c.membershipRole as CommunityMemberRole,
    }),
  );

  const nearbyIds = new Set<number>();
  const nearby = nearbyResult.items.filter((c) => {
    if (myIds.has(c.id)) return false;
    const hay = `${c.name} ${c.locationCity ?? ""} ${c.tags.join(" ")}`.toLowerCase();
    if (!hay.includes(q.toLowerCase())) return false;
    nearbyIds.add(c.id);
    return true;
  });

  const topIds = new Set<number>();
  const top = topResult.items
    .filter((c) => {
      const matches =
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        (c.locationCity?.toLowerCase().includes(q.toLowerCase()) ?? false) ||
        c.tags.some((t) => t.toLowerCase().includes(q.toLowerCase()));
      if (!matches || myIds.has(c.id) || nearbyIds.has(c.id)) return false;
      topIds.add(c.id);
      return true;
    })
    .slice(0, 10);

  const other = browseResult.items.filter(
    (c) => !myIds.has(c.id) && !nearbyIds.has(c.id) && !topIds.has(c.id),
  );

  return { joined, nearby, top, other };
}

export async function getCommunityHomeFeed(userId: number) {
  const myRaw = await listMyCommunities(userId, undefined, 8);
  const myIds = new Set(myRaw.map((c) => c.id));
  const myOnline = await getOnlineCountsByCommunity(myRaw.map((c) => c.id));
  const myCommunities = myRaw.map((c) =>
    enrichCommunityRow(c, { onlineCount: myOnline.get(c.id) ?? 0, membershipStatus: c.membershipStatus as CommunityMemberStatus, membershipRole: c.membershipRole as CommunityMemberRole }),
  );

  const [trending, recommended, newest, university, company, city, interests] = await Promise.all([
    browseCommunities(userId, { sort: "trending", limit: 8 }),
    browseCommunities(userId, { sort: "recommended", featuredOnly: true, limit: 8 }),
    browseCommunities(userId, { sort: "newest", limit: 8 }),
    browseCommunities(userId, { category: "university", sort: "largest", limit: 8 }),
    browseCommunities(userId, { category: "company", sort: "largest", limit: 8 }),
    browseCommunities(userId, { category: "city", sort: "largest", limit: 8 }),
    browseCommunities(userId, { category: "travel", sort: "most_active", limit: 8 }),
  ]);

  const notJoined = (items: CommunityListItem[]) =>
    items.filter((c) => !myIds.has(c.id) && c.membershipStatus !== "active");

  return {
    myCommunities,
    trending: notJoined(trending.items),
    recommended: notJoined(recommended.items),
    newest: notJoined(newest.items),
    discoverByCategory: {
      university: notJoined(university.items),
      company: notJoined(company.items),
      city: notJoined(city.items),
      interests: notJoined(interests.items),
    },
  };
}

export async function syncCommunityMemberCount(communityId: number) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.status, "active")));
  const count = Number(row?.count ?? 0);
  await db.update(communities).set({ memberCount: count }).where(eq(communities.id, communityId));
  return count;
}

export async function syncCommunityRideCount(communityId: number) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(communityRides)
    .where(eq(communityRides.communityId, communityId));
  const count = Number(row?.count ?? 0);
  await db.update(communities).set({ rideCount: count }).where(eq(communities.id, communityId));
  return count;
}

async function validateInviteCode(
  communityId: number,
  code: string | undefined,
  communityInviteCode: string | null,
): Promise<boolean> {
  if (!code?.trim()) return false;
  const norm = code.trim().toUpperCase();
  if (communityInviteCode && communityInviteCode.toUpperCase() === norm) return true;

  const [invite] = await db
    .select()
    .from(communityInvites)
    .where(
      and(
        eq(communityInvites.communityId, communityId),
        eq(communityInvites.inviteCode, norm),
      ),
    )
    .limit(1);

  if (!invite) return false;
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return false;
  if (invite.maxUses != null && invite.usedCount >= invite.maxUses) return false;
  return true;
}

export async function joinCommunity(params: {
  communityId: number;
  userId: number;
  userEmail: string | null;
  inviteCode?: string;
}) {
  const community = await getCommunityById(params.communityId);
  if (!community || community.status !== "active") {
    throw new Error("Community not found");
  }

  const existing = await getMembership(params.communityId, params.userId);
  if (existing?.status === "active") throw new Error("You are already a member");
  if (existing?.status === "pending") throw new Error("Your join request is already pending");
  if (existing?.status === "banned") throw new Error("You cannot join this community");

  const hasValidInvite = await validateInviteCode(
    community.id,
    params.inviteCode,
    community.inviteCode,
  );

  const emailDomainOk =
    community.verificationDomain != null
      ? emailMatchesDomain(params.userEmail, community.verificationDomain)
      : true;

  const nextStatus = resolveJoinStatus({
    visibility: community.visibility as CommunityVisibility,
    verificationType: community.verificationType as CommunityVerificationType,
    hasValidInvite,
    emailDomainOk,
  });

  if (nextStatus === "rejected") {
    throw new Error(
      community.verificationType === "edu_email"
        ? `A verified @${community.verificationDomain} email is required to join`
        : `A verified @${community.verificationDomain} company email is required to join`,
    );
  }

  if (community.visibility === "invite_only" && !hasValidInvite) {
    throw new Error("A valid invite code is required to join this community");
  }

  const now = new Date();

  if (existing) {
    await db
      .update(communityMembers)
      .set({
        status: nextStatus,
        role: "member",
        requestedAt: now,
        joinedAt: nextStatus === "active" ? now : null,
        approvedAt: nextStatus === "active" ? now : null,
        approvedBy: nextStatus === "active" ? params.userId : null,
      })
      .where(eq(communityMembers.id, existing.id));
  } else {
    await db.insert(communityMembers).values({
      communityId: params.communityId,
      userId: params.userId,
      role: "member",
      status: nextStatus,
      requestedAt: now,
      joinedAt: nextStatus === "active" ? now : null,
      approvedAt: nextStatus === "active" ? now : null,
      approvedBy: nextStatus === "active" ? params.userId : null,
    });
  }

  if (nextStatus === "active") {
    await incrementMemberCount(params.communityId, 1);
    if (hasValidInvite && params.inviteCode) {
      await db
        .update(communityInvites)
        .set({ usedCount: sql`${communityInvites.usedCount} + 1` })
        .where(
          and(
            eq(communityInvites.communityId, params.communityId),
            eq(communityInvites.inviteCode, params.inviteCode.trim().toUpperCase()),
          ),
        );
    }
  }

  return { status: nextStatus };
}

export async function leaveCommunity(communityId: number, userId: number) {
  const membership = await getMembership(communityId, userId);
  if (!membership || membership.status !== "active") {
    throw new Error("You are not an active member");
  }

  if (membership.role === "owner") {
    const owners = await db
      .select({ id: communityMembers.id })
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.role, "owner"),
          eq(communityMembers.status, "active"),
        ),
      );
    if (owners.length <= 1) {
      throw new Error("Transfer ownership before leaving — you are the only owner");
    }
  }

  await db
    .update(communityMembers)
    .set({ status: "left", joinedAt: null })
    .where(eq(communityMembers.id, membership.id));

  await incrementMemberCount(communityId, -1);
  return { success: true };
}

export async function approveMember(
  communityId: number,
  targetUserId: number,
  approverId: number,
) {
  const approver = await getMembership(communityId, approverId);
  if (!canManageMembers(approver)) throw new Error("Not authorized");

  const target = await getMembership(communityId, targetUserId);
  if (!target || target.status !== "pending") throw new Error("No pending request found");

  const now = new Date();
  await db
    .update(communityMembers)
    .set({
      status: "active",
      joinedAt: now,
      approvedAt: now,
      approvedBy: approverId,
    })
    .where(eq(communityMembers.id, target.id));

  await incrementMemberCount(communityId, 1);
  return { success: true };
}

export async function rejectMember(
  communityId: number,
  targetUserId: number,
  approverId: number,
) {
  const approver = await getMembership(communityId, approverId);
  if (!canManageMembers(approver)) throw new Error("Not authorized");

  const target = await getMembership(communityId, targetUserId);
  if (!target || target.status !== "pending") throw new Error("No pending request found");

  await db
    .update(communityMembers)
    .set({ status: "rejected" })
    .where(eq(communityMembers.id, target.id));

  return { success: true };
}

export async function listCommunityMembers(
  communityId: number,
  opts: {
    search?: string;
    role?: CommunityMemberRole;
    status?: CommunityMemberStatus;
    limit?: number;
  } = {},
) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const conditions = [eq(communityMembers.communityId, communityId)];

  if (opts.role) conditions.push(eq(communityMembers.role, opts.role));
  if (opts.status) {
    conditions.push(eq(communityMembers.status, opts.status));
  } else {
    conditions.push(inArray(communityMembers.status, ["active", "pending"]));
  }

  const rows = await db
    .select({
      member: communityMembers,
      user: users,
      profile: userProfiles,
    })
    .from(communityMembers)
    .innerJoin(users, eq(communityMembers.userId, users.id))
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(and(...conditions))
    .orderBy(desc(communityMembers.role), asc(communityMembers.joinedAt))
    .limit(limit);

  let result = rows.map((r) => ({
    id: r.member.id,
    userId: r.user.id,
    name: r.user.name ?? "Member",
    email: r.user.email,
    profilePhoto: r.profile?.profilePhoto ?? r.user.profilePhotoUrl,
    role: r.member.role,
    status: r.member.status,
    joinedAt: r.member.joinedAt,
    isStudentVerified: r.profile?.isStudentVerified ?? false,
    isDriver: r.profile?.isDriver ?? false,
  }));

  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    result = result.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.email?.toLowerCase().includes(q) ?? false),
    );
  }

  return result;
}

function dateFilterSql(filter: "all" | "today" | "tomorrow" | "week") {
  if (filter === "today") {
    return sql`DATE(${rides.departureTime}) = CURDATE()`;
  }
  if (filter === "tomorrow") {
    return sql`DATE(${rides.departureTime}) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`;
  }
  if (filter === "week") {
    return sql`${rides.departureTime} >= NOW() AND ${rides.departureTime} < DATE_ADD(NOW(), INTERVAL 7 DAY)`;
  }
  return sql`1=1`;
}

export async function listCommunityRides(
  communityId: number,
  viewerUserId: number,
  opts: {
    dateFilter?: "all" | "today" | "tomorrow" | "week";
    limit?: number;
  } = {},
) {
  const community = await getCommunityById(communityId);
  if (!community) throw new Error("Community not found");

  const membership = await getMembership(communityId, viewerUserId);
  if (!(await canViewCommunityRides(community, membership))) {
    throw new Error("You do not have access to community rides");
  }

  const limit = Math.min(opts.limit ?? 30, 50);
  const dateFilter = opts.dateFilter ?? "all";

  const rows = await db
    .select({ ride: rides, link: communityRides })
    .from(communityRides)
    .innerJoin(rides, eq(communityRides.rideId, rides.id))
    .where(
      and(
        eq(communityRides.communityId, communityId),
        inArray(rides.status, ["searching", "matched", "driver_arrived", "in_progress"]),
        sql`${rides.availableSeats} > 0`,
        sql`(${rides.departureTime} IS NULL OR ${rides.departureTime} >= DATE_SUB(NOW(), INTERVAL 10 MINUTE))`,
        dateFilterSql(dateFilter),
      ),
    )
    .orderBy(asc(rides.departureTime))
    .limit(limit);

  const enriched = await Promise.all(
    rows.map(async ({ ride }) => {
      const organizerId = await getRideOrganizerId(ride);
      const [organizer] = await db
        .select({ name: users.name, profilePhotoUrl: users.profilePhotoUrl })
        .from(users)
        .where(eq(users.id, organizerId))
        .limit(1);
      const [profile] = organizerId
        ? await db
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.userId, organizerId))
            .limit(1)
        : [null];

      return {
        rideId: ride.rideId,
        pickup: ride.pickupAddress,
        dropoff: ride.dropoffAddress,
        pickupShort: ride.pickupAddress.split(",")[0],
        dropoffShort: ride.dropoffAddress.split(",")[0],
        departureTime: ride.departureTime,
        pricePerSeat: ride.pricePerSeat != null ? Number(ride.pricePerSeat) : 0,
        seatsLeft: ride.availableSeats ?? 0,
        totalSeats: ride.totalSeats ?? 1,
        mode: ride.mode,
        posterRole: ride.posterRole,
        title: ride.carpoolTitle,
        organizerName: organizer?.name ?? "Organizer",
        organizerPhoto: profile?.profilePhoto ?? organizer?.profilePhotoUrl,
        isVerified: profile?.isStudentVerified ?? false,
        isOwnRide: organizerId === viewerUserId,
        approvalRequired: ride.approvalRequired,
      };
    }),
  );

  return enriched;
}

export async function attachRideToCommunity(params: {
  communityId: number;
  rideDbId: number;
  postedBy: number;
}) {
  const community = await getCommunityById(params.communityId);
  if (!community || community.status !== "active") {
    throw new Error("Community not found");
  }

  const membership = await getMembership(params.communityId, params.postedBy);
  if (!isActiveMember(membership)) {
    throw new Error("Only active community members can post community rides");
  }

  const [existing] = await db
    .select()
    .from(communityRides)
    .where(eq(communityRides.rideId, params.rideDbId))
    .limit(1);
  if (existing) return existing;

  await db.insert(communityRides).values({
    communityId: params.communityId,
    rideId: params.rideDbId,
    postedBy: params.postedBy,
    visibility: "community_only",
  });

  await incrementRideCount(params.communityId, 1);
  return { success: true };
}

export async function getCommunityOnlyRideIds(): Promise<number[]> {
  const rows = await db.select({ rideId: communityRides.rideId }).from(communityRides);
  return rows.map((r) => r.rideId);
}

export async function isRideCommunityOnly(rideDbId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: communityRides.id })
    .from(communityRides)
    .where(eq(communityRides.rideId, rideDbId))
    .limit(1);
  return !!row;
}

export const communityInputSchemas = {
  category: COMMUNITY_CATEGORIES,
  visibility: COMMUNITY_VISIBILITY,
  verificationType: COMMUNITY_VERIFICATION_TYPES,
};
