import { desc, eq, sql } from "drizzle-orm";
import {
  CURRENT_LEGAL_VERSION,
  LEGAL_DOCUMENTS,
  LEGAL_VERSION_HISTORY,
  type LegalAcceptancePayload,
} from "../../shared/legal";
import { db } from "../db";
import { legalAcceptances, legalPolicyVersions } from "../../drizzle/schema";
import logger from "../logger";

export async function recordLegalAcceptance(
  userId: number,
  input: LegalAcceptancePayload & { ipAddress?: string | null },
): Promise<void> {
  if (input.legalVersion !== CURRENT_LEGAL_VERSION) {
    throw new Error(`Unsupported legal version: ${input.legalVersion}`);
  }

  await db.insert(legalAcceptances).values({
    userId,
    legalVersion: input.legalVersion,
    termsAcceptedAt: new Date(input.termsAcceptedAt),
    privacyAcceptedAt: new Date(input.privacyAcceptedAt),
    communityAcceptedAt: new Date(input.communityAcceptedAt),
    ipAddress: input.ipAddress ?? null,
    deviceInfo: input.deviceInfo ?? null,
    createdAt: new Date(),
  });
}

export async function getLatestLegalAcceptance(userId: number) {
  const rows = await db
    .select()
    .from(legalAcceptances)
    .where(eq(legalAcceptances.userId, userId))
    .orderBy(desc(legalAcceptances.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function userNeedsLegalReacceptance(userId: number): Promise<boolean> {
  const latest = await getLatestLegalAcceptance(userId);
  if (!latest) return true;
  return latest.legalVersion !== CURRENT_LEGAL_VERSION;
}

export async function getLegalComplianceStats() {
  const [totalUsersRow] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(DISTINCT userId) AS count FROM legal_acceptances`,
  );
  const [currentVersionRow] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(DISTINCT userId) AS count FROM legal_acceptances WHERE legalVersion = ${CURRENT_LEGAL_VERSION}`,
  );
  const versionBreakdown = await db
    .select({
      legalVersion: legalAcceptances.legalVersion,
      count: sql<number>`COUNT(*)`,
    })
    .from(legalAcceptances)
    .groupBy(legalAcceptances.legalVersion);

  return {
    currentVersion: CURRENT_LEGAL_VERSION,
    totalAcceptanceRecords: versionBreakdown.reduce((s, r) => s + Number(r.count), 0),
    uniqueUsersAccepted: Number((totalUsersRow as any)?.[0]?.count ?? 0),
    usersOnCurrentVersion: Number((currentVersionRow as any)?.[0]?.count ?? 0),
    versionBreakdown: versionBreakdown.map((r) => ({
      version: r.legalVersion,
      count: Number(r.count),
    })),
    versionHistory: LEGAL_VERSION_HISTORY,
    documents: LEGAL_DOCUMENTS.map((d) => ({
      slug: d.slug,
      title: d.title,
      version: d.version,
      lastUpdated: d.lastUpdated,
      sectionCount: d.sections.length,
    })),
  };
}

export async function listLegalAcceptances(limit = 50, offset = 0) {
  return db
    .select()
    .from(legalAcceptances)
    .orderBy(desc(legalAcceptances.createdAt))
    .limit(limit)
    .offset(offset);
}

/** Seed policy version row if missing — idempotent. */
export async function ensureLegalPolicyVersionsSeeded(): Promise<void> {
  for (const v of LEGAL_VERSION_HISTORY) {
    try {
      await db
        .insert(legalPolicyVersions)
        .values({
          version: v.version,
          effectiveDate: new Date(v.effectiveDate),
          summary: v.summary,
          requiresReacceptance: true,
        })
        .onDuplicateKeyUpdate({ set: { summary: v.summary } });
    } catch (err) {
      logger.warn({ err, version: v.version }, "[legal] seed version failed");
    }
  }
}

export function getClientIp(req: { headers?: Record<string, string | string[] | undefined>; ip?: string }): string | null {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  if (Array.isArray(forwarded)) return forwarded[0]?.trim() ?? null;
  return req.ip ?? null;
}
