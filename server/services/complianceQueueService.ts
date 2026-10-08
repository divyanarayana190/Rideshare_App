/**
 * GDPR/CCPA compliance queues — admin views for deletion and data export requests.
 */
import { and, count, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  accountDeletionRequests,
  dataExportRequests,
  users,
  userProfiles,
} from "../../drizzle/schema";

export async function listDeletionRequests(opts: { page?: number; limit?: number; status?: string }) {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (opts.status && opts.status !== "all") {
    conditions.push(eq(accountDeletionRequests.status, opts.status as any));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ c: count() }).from(accountDeletionRequests).where(where);
  const rows = await db
    .select({
      id: accountDeletionRequests.id,
      userId: accountDeletionRequests.userId,
      status: accountDeletionRequests.status,
      reason: accountDeletionRequests.reason,
      requestedAt: accountDeletionRequests.requestedAt,
      scheduledFor: accountDeletionRequests.scheduledFor,
      cancelledAt: accountDeletionRequests.cancelledAt,
      completedAt: accountDeletionRequests.completedAt,
      userName: users.name,
      userEmail: users.email,
      isBanned: userProfiles.isBanned,
    })
    .from(accountDeletionRequests)
    .leftJoin(users, eq(accountDeletionRequests.userId, users.id))
    .leftJoin(userProfiles, eq(accountDeletionRequests.userId, userProfiles.userId))
    .where(where)
    .orderBy(desc(accountDeletionRequests.requestedAt))
    .limit(limit)
    .offset(offset);

  return {
    requests: rows,
    total: Number(totalRow.c),
    page,
    limit,
  };
}

export async function listExportRequests(opts: { page?: number; limit?: number; status?: string }) {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (opts.status && opts.status !== "all") {
    conditions.push(eq(dataExportRequests.status, opts.status as any));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ c: count() }).from(dataExportRequests).where(where);
  const rows = await db
    .select({
      id: dataExportRequests.id,
      exportId: dataExportRequests.exportId,
      userId: dataExportRequests.userId,
      status: dataExportRequests.status,
      errorMessage: dataExportRequests.errorMessage,
      requestedAt: dataExportRequests.requestedAt,
      completedAt: dataExportRequests.completedAt,
      expiresAt: dataExportRequests.expiresAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(dataExportRequests)
    .leftJoin(users, eq(dataExportRequests.userId, users.id))
    .where(where)
    .orderBy(desc(dataExportRequests.requestedAt))
    .limit(limit)
    .offset(offset);

  return {
    requests: rows,
    total: Number(totalRow.c),
    page,
    limit,
  };
}

export async function getComplianceQueueStats() {
  const [pendingDeletion] = await db
    .select({ c: count() })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.status, "pending"));
  const [dueSoon] = await db
    .select({ c: count() })
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.status, "pending"),
        lte(accountDeletionRequests.scheduledFor, new Date(Date.now() + 7 * 86400000)),
      ),
    );
  const [processingDeletion] = await db
    .select({ c: count() })
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.status, "processing"));
  const [exportRequested] = await db
    .select({ c: count() })
    .from(dataExportRequests)
    .where(inArray(dataExportRequests.status, ["requested", "processing"]));
  const [exportReady] = await db
    .select({ c: count() })
    .from(dataExportRequests)
    .where(eq(dataExportRequests.status, "ready"));
  const [exportFailed] = await db
    .select({ c: count() })
    .from(dataExportRequests)
    .where(eq(dataExportRequests.status, "failed"));

  return {
    deletion: {
      pending: Number(pendingDeletion.c),
      dueWithin7Days: Number(dueSoon.c),
      processing: Number(processingDeletion.c),
    },
    export: {
      inProgress: Number(exportRequested.c),
      ready: Number(exportReady.c),
      failed: Number(exportFailed.c),
    },
  };
}

export async function processDeletionRequest(id: number, action: "processing" | "completed" | "cancelled") {
  const [row] = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.id, id)).limit(1);
  if (!row) return null;

  const updates: Partial<typeof accountDeletionRequests.$inferInsert> = { status: action };
  if (action === "completed") updates.completedAt = new Date();
  if (action === "cancelled") updates.cancelledAt = new Date();

  await db.update(accountDeletionRequests).set(updates).where(eq(accountDeletionRequests.id, id));

  if (action === "completed") {
    await db.update(userProfiles).set({ isBanned: true }).where(eq(userProfiles.userId, row.userId));
    await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, row.userId));
  }

  return { success: true, userId: row.userId, status: action };
}

export async function retryExportRequest(exportId: string) {
  const [row] = await db.select().from(dataExportRequests).where(eq(dataExportRequests.exportId, exportId)).limit(1);
  if (!row) return null;

  const { requestDataExport } = await import("./accountLifecycleService");
  await db
    .update(dataExportRequests)
    .set({ status: "failed", errorMessage: "Superseded by admin retry" })
    .where(eq(dataExportRequests.exportId, exportId));

  const result = await requestDataExport(row.userId);
  return { success: true, ...result };
}

export async function getExportPayload(exportId: string) {
  const [row] = await db
    .select({ payloadJson: dataExportRequests.payloadJson, status: dataExportRequests.status, userId: dataExportRequests.userId })
    .from(dataExportRequests)
    .where(eq(dataExportRequests.exportId, exportId))
    .limit(1);
  if (!row || row.status !== "ready") return null;
  return { exportId, userId: row.userId, payload: row.payloadJson };
}
