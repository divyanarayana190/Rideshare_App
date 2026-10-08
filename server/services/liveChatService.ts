import crypto from "crypto";
import { db } from "../db";
import { eq, desc, and, sql, or, like, count, isNull } from "drizzle-orm";
import { liveChatSessions, liveChatMessages, users, userProfiles } from "../../drizzle/schema";

function sanitize(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

// ── User Functions ──────────────────────────────────────────────────────

/** User requests a live chat session */
export async function requestLiveChat(userId: number, input: {
  category: string;
  issueDescription: string;
}) {
  // Check if user already has an active/waiting session
  const [existing] = await db.select().from(liveChatSessions)
    .where(and(
      eq(liveChatSessions.userId, userId),
      or(
        eq(liveChatSessions.status, "waiting"),
        eq(liveChatSessions.status, "active")
      )
    )).limit(1);

  if (existing) {
    return { session: existing, isExisting: true };
  }

  const sessionId = crypto.randomUUID();
  await db.insert(liveChatSessions).values({
    sessionId,
    userId,
    category: input.category as any,
    issueDescription: sanitize(input.issueDescription),
    status: "waiting",
  });

  const [session] = await db.select().from(liveChatSessions)
    .where(eq(liveChatSessions.sessionId, sessionId));

  // Add system message
  await db.insert(liveChatMessages).values({
    sessionId,
    senderId: userId,
    senderType: "system",
    messageType: "system",
    content: "Chat request submitted. Waiting for an agent to connect...",
  });

  return { session, isExisting: false };
}

/** Get user's chat sessions */
export async function getUserChatSessions(userId: number) {
  const sessions = await db.select({
    session: liveChatSessions,
    adminName: users.name,
  })
    .from(liveChatSessions)
    .leftJoin(users, eq(liveChatSessions.adminId, users.id))
    .where(eq(liveChatSessions.userId, userId))
    .orderBy(desc(liveChatSessions.createdAt))
    .limit(20);

  return sessions.map(s => ({
    ...s.session,
    adminName: s.adminName || "Support Agent",
  }));
}

/** Get chat session detail with messages */
export async function getChatSessionDetail(userId: number, sessionId: string) {
  const [session] = await db.select({
    session: liveChatSessions,
    adminName: users.name,
  })
    .from(liveChatSessions)
    .leftJoin(users, eq(liveChatSessions.adminId, users.id))
    .where(and(
      eq(liveChatSessions.sessionId, sessionId),
      eq(liveChatSessions.userId, userId)
    ));

  if (!session) throw new Error("Chat session not found");

  const messages = await db.select().from(liveChatMessages)
    .where(eq(liveChatMessages.sessionId, sessionId))
    .orderBy(liveChatMessages.createdAt);

  return {
    ...session.session,
    adminName: session.adminName || "Support Agent",
    messages,
  };
}

/** User sends a message */
export async function sendChatMessage(sessionId: string, senderId: number, senderType: "user" | "admin", content: string) {
  // Verify session is active or waiting
  const [session] = await db.select().from(liveChatSessions)
    .where(eq(liveChatSessions.sessionId, sessionId));

  if (!session) throw new Error("Session not found");
  if (session.status === "ended" || session.status === "rejected" || session.status === "missed") {
    throw new Error("This chat session has ended");
  }

  await db.insert(liveChatMessages).values({
    sessionId,
    senderId,
    senderType,
    messageType: "text",
    content: sanitize(content),
  });

  // Get the inserted message
  const messages = await db.select().from(liveChatMessages)
    .where(eq(liveChatMessages.sessionId, sessionId))
    .orderBy(desc(liveChatMessages.createdAt))
    .limit(1);

  return messages[0];
}

/** User ends chat */
export async function endChat(sessionId: string, userId: number) {
  const [session] = await db.select().from(liveChatSessions)
    .where(and(
      eq(liveChatSessions.sessionId, sessionId),
      eq(liveChatSessions.userId, userId)
    ));

  if (!session) throw new Error("Session not found");

  await db.update(liveChatSessions)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(liveChatSessions.sessionId, sessionId));

  await db.insert(liveChatMessages).values({
    sessionId,
    senderId: userId,
    senderType: "system",
    messageType: "system",
    content: "User ended the chat session.",
  });

  return { success: true };
}

/** User rates chat */
export async function rateChat(sessionId: string, userId: number, rating: number, feedback?: string) {
  const [session] = await db.select().from(liveChatSessions)
    .where(and(
      eq(liveChatSessions.sessionId, sessionId),
      eq(liveChatSessions.userId, userId)
    ));

  if (!session) throw new Error("Session not found");

  await db.update(liveChatSessions)
    .set({ rating, ratingFeedback: feedback ? sanitize(feedback) : null })
    .where(eq(liveChatSessions.sessionId, sessionId));

  return { success: true };
}

// ── Admin Functions ─────────────────────────────────────────────────────

/** Get all waiting/active chat requests for admin */
export async function getAdminChatQueue(filters?: {
  status?: string;
  category?: string;
}) {
  const conditions: any[] = [];

  if (filters?.status) {
    conditions.push(eq(liveChatSessions.status, filters.status as any));
  } else {
    // Default: show waiting and active
    conditions.push(
      or(
        eq(liveChatSessions.status, "waiting"),
        eq(liveChatSessions.status, "active")
      )
    );
  }

  if (filters?.category) {
    conditions.push(eq(liveChatSessions.category, filters.category as any));
  }

  const sessions = await db.select({
    session: liveChatSessions,
    userName: users.name,
    userPhone: userProfiles.phoneNumber,
  })
    .from(liveChatSessions)
    .leftJoin(users, eq(liveChatSessions.userId, users.id))
    .leftJoin(userProfiles, eq(liveChatSessions.userId, userProfiles.userId))
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(liveChatSessions.createdAt));

  return sessions.map(s => ({
    ...s.session,
    userName: s.userName || "Unknown User",
    userPhone: s.userPhone || null,
  }));
}

/** Admin accepts a chat request */
export async function acceptChatRequest(sessionId: string, adminId: number) {
  const [session] = await db.select().from(liveChatSessions)
    .where(eq(liveChatSessions.sessionId, sessionId));

  if (!session) throw new Error("Session not found");
  if (session.status !== "waiting") throw new Error("This chat is no longer waiting");

  await db.update(liveChatSessions)
    .set({ adminId, status: "active", startedAt: new Date() })
    .where(eq(liveChatSessions.sessionId, sessionId));

  // System message
  const [admin] = await db.select().from(users).where(eq(users.id, adminId));
  await db.insert(liveChatMessages).values({
    sessionId,
    senderId: adminId,
    senderType: "system",
    messageType: "system",
    content: `${admin?.name || "Support Agent"} has joined the chat.`,
  });

  return { success: true };
}

/** Admin rejects a chat request */
export async function rejectChatRequest(sessionId: string, adminId: number, reason?: string) {
  const [session] = await db.select().from(liveChatSessions)
    .where(eq(liveChatSessions.sessionId, sessionId));

  if (!session) throw new Error("Session not found");
  if (session.status !== "waiting") throw new Error("This chat is no longer waiting");

  await db.update(liveChatSessions)
    .set({
      adminId,
      status: "rejected",
      rejectionReason: reason ? sanitize(reason) : "Chat request declined",
      endedAt: new Date()
    })
    .where(eq(liveChatSessions.sessionId, sessionId));

  await db.insert(liveChatMessages).values({
    sessionId,
    senderId: adminId,
    senderType: "system",
    messageType: "system",
    content: reason
      ? `Chat request declined: ${sanitize(reason)}`
      : "Chat request was declined. Please try again later or submit a support ticket.",
  });

  return { success: true };
}

/** Admin ends a chat */
export async function adminEndChat(sessionId: string, adminId: number) {
  await db.update(liveChatSessions)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(liveChatSessions.sessionId, sessionId));

  await db.insert(liveChatMessages).values({
    sessionId,
    senderId: adminId,
    senderType: "system",
    messageType: "system",
    content: "Support agent ended the chat session.",
  });

  return { success: true };
}

/** Admin get chat detail with messages */
export async function getAdminChatDetail(sessionId: string) {
  const [session] = await db.select({
    session: liveChatSessions,
    userName: users.name,
    userPhone: userProfiles.phoneNumber,
  })
    .from(liveChatSessions)
    .leftJoin(users, eq(liveChatSessions.userId, users.id))
    .leftJoin(userProfiles, eq(liveChatSessions.userId, userProfiles.userId))
    .where(eq(liveChatSessions.sessionId, sessionId));

  if (!session) throw new Error("Session not found");

  const messages = await db.select().from(liveChatMessages)
    .where(eq(liveChatMessages.sessionId, sessionId))
    .orderBy(liveChatMessages.createdAt);

  return {
    ...session.session,
    userName: session.userName || "Unknown User",
    userPhone: session.userPhone || null,
    messages,
  };
}

/** Get chat stats for admin */
export async function getChatStats() {
  const [waiting] = await db.select({ count: count() }).from(liveChatSessions)
    .where(eq(liveChatSessions.status, "waiting"));
  const [active] = await db.select({ count: count() }).from(liveChatSessions)
    .where(eq(liveChatSessions.status, "active"));
  const [ended] = await db.select({ count: count() }).from(liveChatSessions)
    .where(eq(liveChatSessions.status, "ended"));
  const [rejected] = await db.select({ count: count() }).from(liveChatSessions)
    .where(eq(liveChatSessions.status, "rejected"));
  const [total] = await db.select({ count: count() }).from(liveChatSessions);

  return {
    waiting: waiting.count,
    active: active.count,
    ended: ended.count,
    rejected: rejected.count,
    total: total.count,
  };
}

/** Get all chat history for admin */
export async function getAdminChatHistory(filters?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (filters?.status && filters.status !== "all") {
    conditions.push(eq(liveChatSessions.status, filters.status as any));
  }

  const query = db.select({
    session: liveChatSessions,
    userName: users.name,
    userPhone: userProfiles.phoneNumber,
  })
    .from(liveChatSessions)
    .leftJoin(users, eq(liveChatSessions.userId, users.id))
    .leftJoin(userProfiles, eq(liveChatSessions.userId, userProfiles.userId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sessions = await (whereClause
    ? query.where(whereClause)
    : query
  ).orderBy(desc(liveChatSessions.createdAt))
   .limit(limit)
   .offset(offset);

  const [totalResult] = await (whereClause
    ? db.select({ count: count() }).from(liveChatSessions).where(whereClause)
    : db.select({ count: count() }).from(liveChatSessions)
  );

  return {
    sessions: sessions.map(s => ({
      ...s.session,
      userName: s.userName || "Unknown User",
      userPhone: s.userPhone || null,
    })),
    total: totalResult.count,
    page,
    totalPages: Math.ceil(totalResult.count / limit),
  };
}
