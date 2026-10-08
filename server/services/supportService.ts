/**
 * Support Service — handles support tickets, messages, and FAQs.
 */
import crypto from "crypto";
import { and, desc, eq, sql, like, or, count, asc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  supportTickets,
  supportMessages,
  faqItems,
  users,
  type InsertSupportTicket,
  type InsertSupportMessage,
  type InsertFaqItem,
} from "../../drizzle/schema";

// ─── Input sanitisation ─────────────────────────────────────────────────────

function sanitize(input: string): string {
  return input
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ─── Ticket CRUD ─────────────────────────────────────────────────────────────

export async function createSupportTicket(
  userId: number,
  input: {
    category: InsertSupportTicket["category"];
    subject: string;
    description: string;
    rideId?: number;
    priority?: InsertSupportTicket["priority"];
  },
) {
  const ticketId = crypto.randomUUID();
  await db.insert(supportTickets).values({
    ticketId,
    userId,
    category: input.category,
    subject: sanitize(input.subject),
    description: sanitize(input.description),
    rideId: input.rideId ?? null,
    priority: input.priority ?? "medium",
    status: "open",
  });

  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.ticketId, ticketId))
    .limit(1);

  return ticket;
}

export async function getUserTickets(userId: number, status?: string) {
  const conditions = [eq(supportTickets.userId, userId)];
  if (status && ["open", "in_progress", "resolved", "closed"].includes(status)) {
    conditions.push(eq(supportTickets.status, status as any));
  }

  return db
    .select()
    .from(supportTickets)
    .where(and(...conditions))
    .orderBy(desc(supportTickets.updatedAt));
}

export async function getTicketDetail(userId: number, ticketId: string) {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(
      and(eq(supportTickets.ticketId, ticketId), eq(supportTickets.userId, userId)),
    )
    .limit(1);

  if (!ticket) return null;

  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(asc(supportMessages.createdAt));

  return { ticket, messages };
}

export async function addTicketMessage(
  ticketId: string,
  senderId: number,
  senderType: "user" | "admin",
  message: string,
) {
  await db.insert(supportMessages).values({
    ticketId,
    senderId,
    senderType,
    message: sanitize(message),
  });

  // Update ticket's updatedAt
  await db
    .update(supportTickets)
    .set({ updatedAt: new Date() })
    .where(eq(supportTickets.ticketId, ticketId));

  const [msg] = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(desc(supportMessages.createdAt))
    .limit(1);

  return msg;
}

export async function closeTicket(ticketId: string, userId: number) {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(
      and(eq(supportTickets.ticketId, ticketId), eq(supportTickets.userId, userId)),
    )
    .limit(1);

  if (!ticket) return null;

  await db
    .update(supportTickets)
    .set({ status: "closed", resolvedAt: new Date() })
    .where(eq(supportTickets.ticketId, ticketId));

  return { success: true };
}

// ─── FAQs ────────────────────────────────────────────────────────────────────

export async function getActiveFAQs(category?: string) {
  const conditions = [eq(faqItems.isActive, true)];
  if (
    category &&
    ["general", "rides", "payments", "safety", "account", "driver"].includes(category)
  ) {
    conditions.push(eq(faqItems.category, category as any));
  }

  return db
    .select()
    .from(faqItems)
    .where(and(...conditions))
    .orderBy(asc(faqItems.sortOrder), asc(faqItems.id));
}

// ─── Admin: Tickets ──────────────────────────────────────────────────────────

export async function listAllTickets(filters: {
  status?: string;
  category?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (filters.status && ["open", "in_progress", "resolved", "closed"].includes(filters.status)) {
    conditions.push(eq(supportTickets.status, filters.status as any));
  }
  if (
    filters.category &&
    ["ride_issue", "payment", "account", "driver", "safety", "app_bug", "feedback", "other"].includes(filters.category)
  ) {
    conditions.push(eq(supportTickets.category, filters.category as any));
  }
  if (filters.priority && ["low", "medium", "high", "urgent"].includes(filters.priority)) {
    conditions.push(eq(supportTickets.priority, filters.priority as any));
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(like(supportTickets.subject, term), like(supportTickets.ticketId, term)),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const tickets = await db
    .select({
      id: supportTickets.id,
      ticketId: supportTickets.ticketId,
      userId: supportTickets.userId,
      category: supportTickets.category,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      assignedTo: supportTickets.assignedTo,
      rideId: supportTickets.rideId,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      resolvedAt: supportTickets.resolvedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .where(where)
    .orderBy(desc(supportTickets.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(supportTickets)
    .where(where);

  return { tickets, total, page, limit };
}

export async function getTicketStats() {
  const rows = await db
    .select({
      status: supportTickets.status,
      count: count(),
    })
    .from(supportTickets)
    .groupBy(supportTickets.status);

  const stats: Record<string, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 };
  for (const r of rows) {
    stats[r.status] = r.count;
    stats.total += r.count;
  }
  return stats;
}

export async function updateTicketStatus(
  ticketId: string,
  status: "open" | "in_progress" | "resolved" | "closed",
  adminNotes?: string,
) {
  const updates: Record<string, any> = { status };
  if (adminNotes !== undefined) updates.adminNotes = sanitize(adminNotes);
  if (status === "resolved" || status === "closed") updates.resolvedAt = new Date();

  await db.update(supportTickets).set(updates).where(eq(supportTickets.ticketId, ticketId));
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.ticketId, ticketId)).limit(1);
  return ticket;
}

export async function assignTicket(ticketId: string, adminId: number) {
  await db
    .update(supportTickets)
    .set({ assignedTo: adminId })
    .where(eq(supportTickets.ticketId, ticketId));

  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.ticketId, ticketId)).limit(1);
  return ticket;
}

export async function adminReplyToTicket(ticketId: string, adminId: number, message: string) {
  // Add message
  const msg = await addTicketMessage(ticketId, adminId, "admin", message);

  // Auto-set to in_progress if currently open
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.ticketId, ticketId)).limit(1);
  if (ticket && ticket.status === "open") {
    await db.update(supportTickets).set({ status: "in_progress" }).where(eq(supportTickets.ticketId, ticketId));
  }

  return msg;
}

export async function getAdminTicketDetail(ticketId: string) {
  const [ticket] = await db
    .select({
      id: supportTickets.id,
      ticketId: supportTickets.ticketId,
      userId: supportTickets.userId,
      category: supportTickets.category,
      subject: supportTickets.subject,
      description: supportTickets.description,
      status: supportTickets.status,
      priority: supportTickets.priority,
      assignedTo: supportTickets.assignedTo,
      rideId: supportTickets.rideId,
      adminNotes: supportTickets.adminNotes,
      resolvedAt: supportTickets.resolvedAt,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .where(eq(supportTickets.ticketId, ticketId))
    .limit(1);

  if (!ticket) return null;

  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(asc(supportMessages.createdAt));

  return { ticket, messages };
}

// ─── Admin: FAQs ─────────────────────────────────────────────────────────────

export async function getAllFAQs() {
  return db.select().from(faqItems).orderBy(asc(faqItems.category), asc(faqItems.sortOrder));
}

export async function createFAQ(data: {
  category: InsertFaqItem["category"];
  question: string;
  answer: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  await db.insert(faqItems).values({
    category: data.category,
    question: sanitize(data.question),
    answer: sanitize(data.answer),
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive ?? true,
  });

  const [faq] = await db.select().from(faqItems).orderBy(desc(faqItems.id)).limit(1);
  return faq;
}

export async function updateFAQ(
  id: number,
  data: Partial<{
    category: InsertFaqItem["category"];
    question: string;
    answer: string;
    sortOrder: number;
    isActive: boolean;
  }>,
) {
  const updates: Record<string, any> = {};
  if (data.category) updates.category = data.category;
  if (data.question) updates.question = sanitize(data.question);
  if (data.answer) updates.answer = sanitize(data.answer);
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  await db.update(faqItems).set(updates).where(eq(faqItems.id, id));
  const [faq] = await db.select().from(faqItems).where(eq(faqItems.id, id)).limit(1);
  return faq;
}

export async function deleteFAQ(id: number) {
  await db.delete(faqItems).where(eq(faqItems.id, id));
  return { success: true };
}

export async function reorderFAQs(ids: number[]) {
  for (let i = 0; i < ids.length; i++) {
    await db.update(faqItems).set({ sortOrder: i }).where(eq(faqItems.id, ids[i]));
  }
  return { success: true };
}

// ─── Seed default FAQs ──────────────────────────────────────────────────────

export async function seedDefaultFAQs() {
  const [{ total }] = await db.select({ total: count() }).from(faqItems);
  if (total > 0) return { seeded: false, message: "FAQs already exist" };

  const defaults: Omit<InsertFaqItem, "id" | "createdAt" | "updatedAt">[] = [
    // General
    { category: "general", question: "How do I create an account?", answer: "Download the YOO app and sign up using your phone number or email. You will receive an OTP to verify your identity.", sortOrder: 0, isActive: true },
    { category: "general", question: "How do I update my profile?", answer: "Go to your Profile tab, tap on your name or settings icon to edit your personal information including name, email, and profile photo.", sortOrder: 1, isActive: true },
    { category: "general", question: "Is my personal data secure?", answer: "Yes, we use industry-standard encryption and security practices to protect your personal data. We never share your information with third parties without your consent.", sortOrder: 2, isActive: true },
    // Rides
    { category: "rides", question: "How do I book a ride?", answer: "From the home screen, enter your pickup and destination locations, choose your ride type (solo or shared), and tap 'Book Ride'. A nearby driver will be matched to you.", sortOrder: 0, isActive: true },
    { category: "rides", question: "Can I schedule rides in advance?", answer: "Yes! Use the 'Recurring Rides' feature to schedule rides for specific days and times. You can also set one-time future rides.", sortOrder: 1, isActive: true },
    { category: "rides", question: "How do I cancel a ride?", answer: "You can cancel a ride from the active ride screen before the driver arrives. Note that cancellations made after a driver is assigned may incur a small fee.", sortOrder: 2, isActive: true },
    { category: "rides", question: "What if my driver doesn't show up?", answer: "If your driver hasn't arrived within the expected time, you can cancel the ride for free and request a new one. Contact support if issues persist.", sortOrder: 3, isActive: true },
    // Payments
    { category: "payments", question: "What payment methods are accepted?", answer: "We accept all major credit and debit cards (Visa, Mastercard, Amex, Discover) through our secure Stripe integration. You can also use your YOO wallet balance.", sortOrder: 0, isActive: true },
    { category: "payments", question: "How do I add a payment method?", answer: "Go to Profile > Payment Methods > Manage Payment Methods. Tap 'Add Card' to securely add a new credit or debit card.", sortOrder: 1, isActive: true },
    { category: "payments", question: "How are fares calculated?", answer: "Fares are based on distance, estimated time, ride type, and current demand. Shared rides split the cost between passengers, offering significant savings.", sortOrder: 2, isActive: true },
    { category: "payments", question: "How do I get a refund?", answer: "If you were overcharged or experienced an issue, go to your ride history, select the ride, and tap 'Request Refund'. Our team will review and process it within 3-5 business days.", sortOrder: 3, isActive: true },
    // Safety
    { category: "safety", question: "What safety features are available?", answer: "We offer Emergency SOS (calls 911), real-time ride tracking shared with trusted contacts, driver verification, and an in-app safety center with preferences.", sortOrder: 0, isActive: true },
    { category: "safety", question: "How do I report a safety concern?", answer: "Use the Emergency SOS button during a ride for immediate help. For non-emergency concerns, submit a support ticket under the 'Safety' category or contact us directly.", sortOrder: 1, isActive: true },
    { category: "safety", question: "Is there an emergency button?", answer: "Yes! During an active ride, tap the SOS button to immediately call emergency services. Your live location and ride details are shared automatically.", sortOrder: 2, isActive: true },
    // Account
    { category: "account", question: "How do I reset my password?", answer: "We use OTP-based authentication, so there is no password to reset. Simply sign in with your phone number or email and verify with the code sent to you.", sortOrder: 0, isActive: true },
    { category: "account", question: "How do I delete my account?", answer: "Contact our support team through the Help & Support section. Account deletion requests are processed within 30 days in compliance with data privacy regulations.", sortOrder: 1, isActive: true },
    { category: "account", question: "How do I change my phone number?", answer: "Go to Profile > Settings and update your phone number. You will need to verify the new number with an OTP before the change takes effect.", sortOrder: 2, isActive: true },
    // Driver
    { category: "driver", question: "How do I become a driver?", answer: "Go to Profile and tap 'Become a Driver'. Complete the application with your driver's license, vehicle information, and insurance details. We will review your application.", sortOrder: 0, isActive: true },
    { category: "driver", question: "What are the driver requirements?", answer: "You need a valid driver's license, vehicle registration, auto insurance, and must pass a background check. Your vehicle must meet our safety standards.", sortOrder: 1, isActive: true },
    { category: "driver", question: "How do I receive payouts?", answer: "Set up your Stripe Connected Account from the Driver Dashboard. Earnings are transferred to your linked bank account on a regular schedule.", sortOrder: 2, isActive: true },
  ];

  await db.insert(faqItems).values(defaults);
  return { seeded: true, count: defaults.length };
}
