// server/routers.ts
import crypto from "crypto";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { TRPCError } from "@trpc/server";
import { driverProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

import {
  getOrCreateStripeCustomer,
  getConnectedAccount,
  createConnectedAccount as createStripeConnectedAccount,
  generateOnboardingLink,
  generateDashboardLink,
  syncConnectedAccountStatus,
  createSetupIntent as createStripeSetupIntent,
  listPaymentMethods as listStripePaymentMethods,
  setDefaultPaymentMethod as setDefaultStripePM,
  removePaymentMethod as removeStripePM,
  getDefaultPaymentMethod as getDefaultStripePM,
  syncPaymentMethodFromSetupIntent,
  isStripeConfigured,
  chargeRide as chargeRideStripe,
  refundRidePayment,
  attachPaymentMethod,
} from "./services/stripeService";
import {
  stripePayments,
  driverApplications,
  users,
  rides,
  referrals,
  ridePassengers,
  stripePaymentMethods,
  communities,
  communityMembers,
  communityRides,
} from "../drizzle/schema";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { eq, desc, sql, and, inArray, or, isNull, isNotNull } from "drizzle-orm";
import { submitDriverApplication, saveDriverApplicationDraft } from "./services/driverApplicationService";
import {
  createSupportTicket,
  getUserTickets,
  getTicketDetail,
  addTicketMessage,
  closeTicket,
  getActiveFAQs,
} from "./services/supportService";
import {
  requestLiveChat,
  getUserChatSessions,
  getChatSessionDetail,
  sendChatMessage as sendLiveChatMsg,
  endChat as endLiveChat,
  rateChat as rateLiveChat,
} from "./services/liveChatService";

import {
  addPaymentMethod,
  addRidePassenger,
  applyPromoCode,
  createEmergencyAlert,
  createJoinRequest,
  createNotification,
  createPayment,
  createRating,
  createRecurringRide,
  createRide,
  createRideRequest,
  createTransaction,
  createUserProfile,
  deletePaymentMethod,
  findMatchingSharedRides,
  getAverageRating,
  getCreatedRides,
  getOrganizerRides,
  getRideOrganizerId,
  getDefaultPaymentMethod,
  getDriverRides,
  getDriverSession,
  getExistingJoinRequest,
  getJoinRequest,
  getJoinRequestsByPassenger,
  getJoinRequestsForRide,
  getOnlineDriversNear,
  getOpenCarpoolRides,
  searchCarpoolRides,
  getOrCreateUserPreferences,
  getOrCreateWallet,
  getPaymentMethodsByUserId,
  getPassengerRides,
  getRecentDestinations,
  getPendingRideRequestForDriver,
  getRecurringRideById,
  getUnreadNotificationCount,
  getUserById,
  getUserByOpenId,
  getUserByPhone,
  getUserNotifications,
  getUserPayments,
  getUserProfileByUserId,
  getUserRecurringRides,
  getUserRides,
  getPassengerRidesForUser,
  getUserTransactions,
  markMessagesAsRead,
  markNotificationRead,
  markAllNotificationsRead,
  deleteOldNotifications,
  deleteNotification,
  deleteAllNotifications,
  getRide,
  getRideByRideId,
  getRideMessages,
  getRidePassengers,
  sendChatMessage,
  setDefaultPaymentMethod,
  atomicTransitionRideStep,
  updateDriverLocation,
  updateEmergencyAlert,
  updateJoinRequest,
  updateRecurringRide,
  updateRide,
  updateRidePassengerStatus,
  updateRideRequest,
  updateUserPreferences,
  updateUserName,
  updateUserProfile,
  updateWalletBalance,
  deductWalletBalanceAtomic,
  upsertDriverSession,
  upsertUser,
  updateUserLastSignedIn,
  validatePromoCode,
  findJoinableSharedRides,
  createRideStop,
  getRideStopsFromDb,
  updateRideStop,
  deleteRideStopsByPassenger,
  getOrCreateRewardPointsDb,
  getPointsLedgerDb,
  deleteRecurringRide,
  getDriverScheduledRides,
  getUnreadMessageCount,
  getUnreadMessageRides,
  getDriverEarnings,
  getDriverEarningsSummary,
  submitEnhancedRating,
  updateDriverOnboarding,
  getDriverOnboardingStatus,
  decrementRideSeat,
  incrementRideSeat,
  updateRidePassengerFare,
  upsertPushToken,
} from "./db";

import {
  rankCarpools,
  rankAndGroupCarpools,
  haversineKm as carpoolHaversine,
  isSafetyCompatible,
  type CarpoolSearchInput,
  type CarpoolMatchResult,
  type RouteCluster,
  type GroupedCarpoolResult,
} from "./services/carpoolMatcher";
import { broadcastPassengerRequest } from "./services/passengerBroadcast";
import { passengerRequests } from "../drizzle/schema";
import {
  buildDriverFeedRequest,
  getPassengerMetaMap,
  inferRideType,
  isScheduledPickup,
  isValidFeedRequest,
} from "./services/driverRequestFeed";

import { dispatchQueue, type DriverCandidate } from "./services/driverMatcher";
import { assertCanAccessRide, assertRideParticipant, isRideParticipant } from "./services/rideAccessService";
import { getRideOptionsForTrip, getPricingInsightForTrip } from "./services/rideOptionsService";
import { calculateFare, calculateJoinFare, computeSurgeMultiplier } from "./services/fareEngine";
import { findJoinableRidesAlongRoute, type RideCandidate, encodePolyline } from "./services/routeMatcher";
import { initializeStopsForRide, insertNewPassengerStops, getOrderedStops, markStopReached as markStopReachedService, getNextStop, recalculateETAs } from "./services/stopManager";
import { awardMidRideJoinPoints, awardSharedRideCompletionPoints, getOrCreateRewardPoints, getPointsHistory, POINTS } from "./services/rewardService";
import { validateTransition, getTimestampsForStep, STEP_TO_DB_STATUS, inferStepFromDbStatus, allowedSourceSteps, checkRouteDeviation } from "./services/rideStateMachine";
import { findBestSharedRides } from "./services/sharedRideMatcher";
import { sendNotification, buildNotification, pushRideStatusUpdate, sendDirectSms, notificationBus } from "./services/notificationService";
import { notifyUser, notifyDriverPickupRequest, notifyDriverRideCancelled } from "./services/userNotifications";
import {
  getDriverDashboardStats,
  getDriverEarningsDetail,
  getDriverProfileBundle,
  getEnrichedDriverRides,
} from "./services/driverStatsService";
import {
  addAvailabilitySlot,
  getDriverSchedule,
  removeAvailabilitySlot,
  updateScheduleSettings,
} from "./services/driverScheduleService";
import { acceptPassengerBroadcastRequest } from "./services/driverRequestActions";
import {
  approveMember,
  attachRideToCommunity,
  browseCommunities,
  canPostCommunityRide,
  canViewCommunityMembers,
  canViewCommunityRides,
  createCommunity,
  discoverCommunities,
  enrichCommunityRow,
  getCommunityById,
  getCommunityHomeFeed,
  getCommunityRules,
  getMembership,
  getNearbyCommunities,
  getOnlineCountsByCommunity,
  getTopCommunities,
  joinCommunity,
  leaveCommunity,
  listCommunityMembers,
  listCommunityRides,
  listMyCommunities,
  rejectMember,
  searchCommunitiesGrouped,
} from "./services/communityService";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_VERIFICATION_TYPES,
  COMMUNITY_VISIBILITY,
} from "../shared/community";
import {
  acceptDriverRequestUnified,
  fetchUnifiedDriverRequests,
  rejectDriverRequestUnified,
} from "./services/driverRequestsService";
import {
  createDriverStripeAccountLink,
  createDriverStripeConnectAccount,
  getDriverPayoutHistory,
  getDriverPayoutMethods,
  getDriverPayoutStatus,
  getDriverTipsTotal,
  requestDriverPayout,
} from "./services/driverPayoutService";
import { checkDriverSchemaHealth } from "./services/schemaHealth";
import {
  getDriverAccessStatus,
  driverAccessDeniedMessage,
} from "./services/driverAccessService";
import {
  CURRENT_LEGAL_VERSION,
  getLegalDocument,
  LEGAL_DOCUMENTS,
  LEGAL_VERSION_HISTORY,
} from "../shared/legal";
import {
  recordLegalAcceptance,
  getLatestLegalAcceptance,
  userNeedsLegalReacceptance,
  getClientIp,
} from "./services/legalService";
import {
  reconcileExpiredRideByRideId,
  reconcileExpiredRidesForUser,
} from "./services/rideExpiryReconciliation";
import { sendStudentVerificationEmail, sendEmail } from "./services/emailService";
import {
  applyReservedCredits,
  getActiveGrants,
  getCreditLedger,
  getCreditWalletBalance,
  grantPromoCredit,
  grantRideCredits,
  capCreditReserveAmount,
  previewCreditRedemption,
  refundRideCredits,
  releaseReservedCredits,
  reserveCredits,
} from "./services/walletCreditService";
import {
  cancelAccountDeletion,
  getAccountDeletionStatus,
  getDataExportStatus,
  requestAccountDeletion,
  requestDataExport,
} from "./services/accountLifecycleService";
import { getStripeDiagnostics } from "./services/stripeDiagnosticsService";
import { getFileOwner } from "./services/fileUploadService";
import {
  isEduEmail,
  getUniversityInfo,
  generateOtp,
  hashOtp,
  verifyOtp as verifyOtpHash,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_VERIFY_ATTEMPTS,
} from "./services/studentVerificationService";
import {
  createStudentVerification,
  getLatestStudentVerification,
  getStudentVerificationByEmail,
  incrementStudentVerificationAttempts,
  updateStudentVerification,
  markUserStudentVerified,
  revokeStudentVerification,
} from "./db";

// ── OTP Store (Redis-backed with in-memory fallback) ─────────────────────────
import { redis, isRedisAvailable } from "./redis";
import logger from "./logger";

type OtpPurpose = "signup" | "login";
type OtpMethod = "phone" | "email";

const OTP_EXPIRY_S = 600; // 10 minutes in seconds
const OTP_EXPIRY_MS = OTP_EXPIRY_S * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_MS = 60_000; // 1 OTP per destination per minute
const OTP_BURST_WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window

// Platform booking fee added to every fare at charge time (cents)
const PLATFORM_FEE_CENTS = 150;
const OTP_BURST_MAX = 3; // max 3 OTP sends per 15 minutes per destination

// In-memory fallback when Redis is unavailable
const OTP_FALLBACK = new Map<string, { code: string; expiresAt: number; attempts: number; purpose: OtpPurpose; method: OtpMethod; createdAt: number }>();
// In-memory OTP send-count fallback: destination → list of send timestamps
const OTP_SEND_COUNT_FALLBACK = new Map<string, number[]>();
// Cleanup expired OTP entries every 30 seconds (not 5 minutes) for tighter GC
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of OTP_FALLBACK) { if (now > v.expiresAt) OTP_FALLBACK.delete(k); }
  for (const [k, times] of OTP_SEND_COUNT_FALLBACK) {
    const fresh = times.filter(t => now - t < OTP_BURST_WINDOW_MS);
    if (fresh.length === 0) OTP_SEND_COUNT_FALLBACK.delete(k);
    else OTP_SEND_COUNT_FALLBACK.set(k, fresh);
  }
}, 30_000);

// Redis OTP helpers
async function otpSet(key: string, data: { code: string; purpose: OtpPurpose; method: OtpMethod }) {
  const redisKey = `otp:${key}`;
  const value = JSON.stringify({ ...data, attempts: 0, createdAt: Date.now() });
  try {
    if (await isRedisAvailable()) {
      await redis.set(redisKey, value, "EX", OTP_EXPIRY_S);
      return;
    }
  } catch {}
  // Fallback
  OTP_FALLBACK.set(key, { ...data, attempts: 0, expiresAt: Date.now() + OTP_EXPIRY_MS, createdAt: Date.now() });
}

async function otpGet(key: string): Promise<{ code: string; purpose: OtpPurpose; method: OtpMethod; attempts: number; createdAt: number } | null> {
  const redisKey = `otp:${key}`;
  try {
    if (await isRedisAvailable()) {
      const raw = await redis.get(redisKey);
      return raw ? JSON.parse(raw) : null;
    }
  } catch {}
  // Fallback
  const entry = OTP_FALLBACK.get(key);
  if (!entry || Date.now() > entry.expiresAt) { OTP_FALLBACK.delete(key); return null; }
  return entry;
}

async function otpIncrAttempts(key: string): Promise<number> {
  const redisKey = `otp:${key}`;
  try {
    if (await isRedisAvailable()) {
      const raw = await redis.get(redisKey);
      if (!raw) return OTP_MAX_ATTEMPTS;
      const data = JSON.parse(raw);
      data.attempts = (data.attempts || 0) + 1;
      const ttl = await redis.ttl(redisKey);
      await redis.set(redisKey, JSON.stringify(data), "EX", ttl > 0 ? ttl : OTP_EXPIRY_S);
      return data.attempts;
    }
  } catch {}
  const entry = OTP_FALLBACK.get(key);
  if (!entry) return OTP_MAX_ATTEMPTS;
  entry.attempts++;
  return entry.attempts;
}

async function otpDelete(key: string) {
  try { if (await isRedisAvailable()) { await redis.del(`otp:${key}`); return; } } catch {}
  OTP_FALLBACK.delete(key);
}

function normalizeDestination(method: OtpMethod, destination: string) {
  if (method === "phone") return (destination || "").replace(/\D/g, "");
  return (destination || "").trim().toLowerCase();
}
function otpKey(method: OtpMethod, destination: string) {
  return `${method}:${normalizeDestination(method, destination)}`;
}
function makeOpenId(method: OtpMethod, destination: string) {
  return `otp:${method}:${normalizeDestination(method, destination)}`;
}

// ── Password Reset Token Store (Redis-backed with in-memory fallback) ────────
const RESET_TOKEN_EXPIRY_S = 600; // 10 minutes
const RESET_TOKEN_EXPIRY_MS = RESET_TOKEN_EXPIRY_S * 1000;
const RESET_TOKEN_FALLBACK = new Map<string, { openId: string; expiresAt: number }>();
setInterval(() => { const now = Date.now(); for (const [k, v] of RESET_TOKEN_FALLBACK) { if (now > v.expiresAt) RESET_TOKEN_FALLBACK.delete(k); } }, 300_000);

async function resetTokenSet(token: string, openId: string) {
  const redisKey = `reset_token:${token}`;
  const value = JSON.stringify({ openId, expiresAt: Date.now() + RESET_TOKEN_EXPIRY_MS });
  try {
    if (await isRedisAvailable()) {
      await redis.set(redisKey, value, "EX", RESET_TOKEN_EXPIRY_S);
      return;
    }
  } catch {}
  RESET_TOKEN_FALLBACK.set(token, { openId, expiresAt: Date.now() + RESET_TOKEN_EXPIRY_MS });
}

async function resetTokenGet(token: string): Promise<{ openId: string; expiresAt: number } | null> {
  const redisKey = `reset_token:${token}`;
  try {
    if (await isRedisAvailable()) {
      const raw = await redis.get(redisKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() > data.expiresAt) { await redis.del(redisKey); return null; }
      return data;
    }
  } catch {}
  const entry = RESET_TOKEN_FALLBACK.get(token);
  if (!entry || Date.now() > entry.expiresAt) { RESET_TOKEN_FALLBACK.delete(token); return null; }
  return entry;
}

async function resetTokenDelete(token: string) {
  try { if (await isRedisAvailable()) { await redis.del(`reset_token:${token}`); return; } } catch {}
  RESET_TOKEN_FALLBACK.delete(token);
}

function resetOtpKey(method: OtpMethod, destination: string) {
  return `reset:${method}:${normalizeDestination(method, destination)}`;
}
function splitName(fullName: string | null | undefined) {
  const s = (fullName || "").trim();
  if (!s) return { firstName: "", lastName: "" };
  const parts = s.split(/\s+/);
  return parts.length === 1
    ? { firstName: parts[0], lastName: "" }
    : { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Module-level throttle Maps (replaces unreliable globalThis hacks) ──────────
/** driverId → { lat, lng, ts } for location update throttling */
const LOCATION_THROTTLE = new Map<string, { lat: number; lng: number; ts: number }>();
/** rideId → last deviation alert timestamp */
const DEVIATION_THROTTLE = new Map<string, number>();
/** rideId → last ETA recalc timestamp */
const ETA_THROTTLE = new Map<string, number>();
// Periodic cleanup to prevent unbounded growth
setInterval(() => {
  const stale = Date.now() - 10 * 60 * 1000; // 10 minutes
  for (const [k, v] of LOCATION_THROTTLE) { if (v.ts < stale) LOCATION_THROTTLE.delete(k); }
  for (const [k, v] of DEVIATION_THROTTLE) { if (v < stale) DEVIATION_THROTTLE.delete(k); }
  for (const [k, v] of ETA_THROTTLE) { if (v < stale) ETA_THROTTLE.delete(k); }
}, 5 * 60 * 1000);

// ── Ride creation idempotency cache ───────────────────────────────────────
const BOOK_RIDE_IDEMPOTENCY = new Map<string, { rideId: string; createdAt: number }>();
const BOOK_RIDE_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of BOOK_RIDE_IDEMPOTENCY) {
    if (now - v.createdAt > BOOK_RIDE_IDEMPOTENCY_TTL_MS) BOOK_RIDE_IDEMPOTENCY.delete(k);
  }
}, 60_000);

// ── Per-account brute force protection ────────────────────────────────────
const LOGIN_ATTEMPTS = new Map<string, { count: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
setInterval(() => { const now = Date.now(); for (const [k, v] of LOGIN_ATTEMPTS) { if (now > v.lockedUntil) LOGIN_ATTEMPTS.delete(k); } }, 60_000);

function checkLoginAttempts(key: string): void {
  const entry = LOGIN_ATTEMPTS.get(key);
  if (entry && Date.now() < entry.lockedUntil && entry.count >= MAX_LOGIN_ATTEMPTS) {
    const minsLeft = Math.ceil((entry.lockedUntil - Date.now()) / 60_000);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many failed attempts. Try again in ${minsLeft} minutes.` });
  }
}
function recordFailedLogin(key: string): void {
  const entry = LOGIN_ATTEMPTS.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  LOGIN_ATTEMPTS.set(key, entry);
}
function clearLoginAttempts(key: string): void { LOGIN_ATTEMPTS.delete(key); }
function estimateFare(distanceKm: number, mode: "solo" | "share"): number {
  // Use new fare engine for consistent calculations
  const breakdown = calculateFare({
    distanceKm,
    durationMinutes: Math.round(distanceKm * 2 + 5),
    mode,
    surgeMultiplier: computeSurgeMultiplier(),
  });
  return breakdown.totalFare;
}
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Root Router ───────────────────────────────────────────────────────────────
export const appRouter = router({

  // ── AUTH ──────────────────────────────────────────────────────────────────
  auth: router({
    requestOtp: publicProcedure
      .input(
        z.object({
          method: z.enum(["phone", "email"]),
          destination: z.string().min(3),
          purpose: z.enum(["signup", "login"]),
        }),
      )
      .mutation(async ({ input }) => {
        const norm = normalizeDestination(input.method, input.destination);
        if (input.method === "phone" && norm.length < 10) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number" });
        if (input.method === "email" && !norm.includes("@")) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid email" });

        // Enforce existence / uniqueness before sending any OTP
        const openIdForCheck = makeOpenId(input.method, input.destination);
        if (input.purpose === "login") {
          let userExists = await getUserByOpenId(openIdForCheck);
          if (!userExists && input.method === "phone") userExists = await getUserByPhone(norm) ?? undefined;
          if (!userExists) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No account found with this phone number. Please create an account first.",
            });
          }
        } else {
          // signup — reject if already registered
          let userExists = await getUserByOpenId(openIdForCheck);
          if (!userExists && input.method === "phone") userExists = await getUserByPhone(norm) ?? undefined;
          if (userExists) {
            throw new TRPCError({
              code: "CONFLICT",
              message: input.method === "phone"
                ? "An account already exists with this phone number. Please sign in instead."
                : "An account already exists with this email address. Please sign in instead.",
            });
          }
        }

        // Rate limit: 1 OTP per destination per minute
        const key = otpKey(input.method, input.destination);
        const existing = await otpGet(key);
        if (existing && Date.now() - existing.createdAt < OTP_RATE_LIMIT_MS) {
          const waitSec = Math.ceil((OTP_RATE_LIMIT_MS - (Date.now() - existing.createdAt)) / 1000);
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Please wait ${waitSec}s before requesting another OTP` });
        }

        // Burst limit: max 3 OTP sends per 15 minutes per destination
        // (reuse `norm` already computed above)
        const burstKey = `otp_burst:${input.method}:${norm}`;
        const now = Date.now();
        try {
          if (await isRedisAvailable()) {
            const raw = await redis.get(burstKey);
            const timestamps: number[] = raw ? JSON.parse(raw) : [];
            const recent = timestamps.filter(t => now - t < OTP_BURST_WINDOW_MS);
            if (recent.length >= OTP_BURST_MAX) {
              throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many OTP requests. Please try again in 15 minutes." });
            }
            recent.push(now);
            await redis.set(burstKey, JSON.stringify(recent), "EX", Math.ceil(OTP_BURST_WINDOW_MS / 1000));
          } else {
            const times = OTP_SEND_COUNT_FALLBACK.get(burstKey) ?? [];
            const recent = times.filter(t => now - t < OTP_BURST_WINDOW_MS);
            if (recent.length >= OTP_BURST_MAX) {
              throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many OTP requests. Please try again in 15 minutes." });
            }
            recent.push(now);
            OTP_SEND_COUNT_FALLBACK.set(burstKey, recent);
          }
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          // Redis error — allow request (fail open) to not block legitimate users
        }

        const code = (100000 + crypto.randomInt(900000)).toString();
        await otpSet(key, { code, purpose: input.purpose, method: input.method });

        console.log(`
\x1b[43m\x1b[30m ▌ OTP CODE ▐ \x1b[0m
\x1b[1m  Code    : ${code}\x1b[0m
  Method  : ${input.method}
  To      : ${norm}
  Purpose : ${input.purpose}
\x1b[43m\x1b[30m━━━━━━━━━━━━━━\x1b[0m
`);

        if (input.method === "phone") {
          await sendDirectSms(norm, `Your YOO verification code is: ${code}. It expires in ${OTP_EXPIRY_S / 60} minutes.`);
        } else {
          await sendEmail({
            to: norm,
            subject: "Your YOO verification code",
            text: `Your YOO verification code is: ${code}. It expires in ${OTP_EXPIRY_S / 60} minutes.`,
            html: `<p>Your YOO verification code is: <strong>${code}</strong></p><p>It expires in ${OTP_EXPIRY_S / 60} minutes.</p>`,
          });
        }

        return { success: true, expiresIn: OTP_EXPIRY_S };
      }),

    verifyOtp: publicProcedure
      .input(
        z.object({
          method: z.enum(["phone", "email"]),
          destination: z.string().min(3),
          code: z.string().length(6),
          purpose: z.enum(["signup", "login"]),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          // Advanced signup fields
          email: z.string().email().optional(),
          gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional(),
          role: z.enum(["user", "driver"]).optional(),
          isStudent: z.boolean().optional(),
          collegeEmail: z.string().email().optional(),
          // Legal acceptance — required for signup
          legalVersion: z.string().optional(),
          acceptTerms: z.boolean().optional(),
          acceptPrivacy: z.boolean().optional(),
          acceptCommunity: z.boolean().optional(),
          termsAcceptedAt: z.string().min(10).optional(),
          privacyAcceptedAt: z.string().min(10).optional(),
          communityAcceptedAt: z.string().min(10).optional(),
          deviceInfo: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.purpose === "signup") {
          if (
            input.legalVersion !== CURRENT_LEGAL_VERSION ||
            !input.acceptTerms ||
            !input.acceptPrivacy ||
            !input.acceptCommunity ||
            !input.termsAcceptedAt ||
            !input.privacyAcceptedAt ||
            !input.communityAcceptedAt
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "You must review and accept the Terms of Service, Privacy Policy, and Community Guidelines to create an account.",
            });
          }
        }

        const norm = normalizeDestination(input.method, input.destination);
        const bruteKey = `otp:${input.method}:${norm}`;
        const key = otpKey(input.method, input.destination);

        // Check brute force lockout
        checkLoginAttempts(bruteKey);

        const record = await otpGet(key);

        if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "OTP not requested" });
        if (record.method !== input.method) throw new TRPCError({ code: "BAD_REQUEST", message: "OTP method mismatch" });
        if (record.purpose !== input.purpose) throw new TRPCError({ code: "BAD_REQUEST", message: "OTP purpose mismatch" });
        if (record.attempts >= OTP_MAX_ATTEMPTS) { await otpDelete(key); throw new TRPCError({ code: "BAD_REQUEST", message: "Too many attempts. Request a new OTP." }); }
        const codeMatch = record.code.length === input.code.length &&
          crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(input.code));
        if (!codeMatch) {
          recordFailedLogin(bruteKey);
          const newAttempts = await otpIncrAttempts(key);
          if (newAttempts >= OTP_MAX_ATTEMPTS) { await otpDelete(key); throw new TRPCError({ code: "BAD_REQUEST", message: "Too many attempts. Request a new OTP." }); }
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid OTP" });
        }

        // Successful verification — clear attempts
        clearLoginAttempts(bruteKey);
        await otpDelete(key);
        const openId = makeOpenId(input.method, input.destination);

        let saved: Awaited<ReturnType<typeof getUserByOpenId>>;

        if (input.purpose === "login") {
          // LOGIN: authenticate an existing user — never create one
          saved = await getUserByOpenId(openId);
          if (!saved && input.method === "phone") saved = await getUserByPhone(norm) ?? undefined;
          if (!saved) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No account found. Please create an account first." });
          }
          if ((saved as any).deletedAt) {
            throw new TRPCError({ code: "FORBIDDEN", message: "This account has been deactivated." });
          }
          await updateUserLastSignedIn(saved.id);
        } else {
          // SIGNUP: create a new user — never log in an existing one
          const duplicate = await getUserByOpenId(openId);
          const phoneDup = !duplicate && input.method === "phone" ? await getUserByPhone(norm) : undefined;
          if (duplicate || phoneDup) {
            throw new TRPCError({ code: "CONFLICT", message: "An account already exists with this contact. Please sign in." });
          }

          if (!input.firstName || !input.lastName) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing name" });
          const name = `${input.firstName} ${input.lastName}`.trim();
          const userEmail = input.method === "email" ? norm : (input.email || null);

          await upsertUser({ openId, name: name || null, email: userEmail, loginMethod: "otp", lastSignedIn: new Date() });
          saved = await getUserByOpenId(openId);
          if (!saved) throw new TRPCError({ code: "BAD_REQUEST", message: "User creation failed" });

          const newProfile = await getUserProfileByUserId(saved.id);
          if (!newProfile) {
            await createUserProfile({
              userId: saved.id,
              phoneNumber: input.method === "phone" ? norm : null,
              gender: input.gender ?? null,
              isDriver: input.role === "driver",
              isStudent: input.isStudent ?? false,
              collegeEmail: input.collegeEmail ?? null,
            });
            await createNotification({
              notificationId: genId("notif"),
              userId: saved.id,
              type: "system",
              title: "Welcome to YOO! 🎉",
              body: `Hey ${saved.name || "there"}! Your account is ready. Book your first ride or switch to driver mode to start earning.`,
              data: {},
              deepLink: "/",
            });
            await recordLegalAcceptance(saved.id, {
              legalVersion: CURRENT_LEGAL_VERSION,
              acceptTerms: true,
              acceptPrivacy: true,
              acceptCommunity: true,
              termsAcceptedAt: input.termsAcceptedAt!,
              privacyAcceptedAt: input.privacyAcceptedAt!,
              communityAcceptedAt: input.communityAcceptedAt!,
              deviceInfo: input.deviceInfo,
              ipAddress: getClientIp(ctx.req),
            });
          } else {
            const patch: any = {};
            if (input.method === "phone" && newProfile.phoneNumber !== norm) patch.phoneNumber = norm;
            if (input.gender) patch.gender = input.gender;
            if (input.role === "driver") patch.isDriver = true;
            if (input.isStudent !== undefined) patch.isStudent = input.isStudent;
            if (input.collegeEmail) patch.collegeEmail = input.collegeEmail;
            if (Object.keys(patch).length > 0) await updateUserProfile(saved.id, patch);
          }
        }

        const sessionToken = await sdk.createSessionToken(openId, {
          name: saved!.name?.trim() || "User",
          expiresInMs: ONE_YEAR_MS,
          sessionVersion: (saved as any).sessionVersion,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        logger.debug({ cookieName: COOKIE_NAME, openId }, "[Auth] Set session cookie");

        // Return token so native clients can store it for Bearer auth
        (ctx as any)._sessionToken = sessionToken;

        // Return user data so client can skip the auth.me round-trip
        const profile = await getUserProfileByUserId(saved.id);
        const { firstName: fn, lastName: ln } = splitName(saved.name);
        return {
          success: true,
          sessionToken,
          user: {
            id: String(saved.id),
            email: saved.email ?? undefined,
            phone: profile?.phoneNumber ?? undefined,
            firstName: fn || "",
            lastName: ln || "",
            name: saved.name ?? undefined,
            createdAt: (saved.createdAt ?? new Date()).toISOString(),
            isDriver: profile?.isDriver ?? false,
            gender: profile?.gender ?? undefined,
            isStudent: profile?.isStudent ?? false,
            collegeEmail: profile?.collegeEmail ?? undefined,
            averageRating: profile?.averageRating ? Number(profile.averageRating) : 5,
            totalRides: profile?.totalRides ?? 0,
          },
        };
      }),

    me: protectedProcedure.query(async ({ ctx }) => {
      // sessionVersion is validated in sdk.authenticateRequest before this runs.
      // Tokens issued after the sv feature carry a version; old tokens (no sv) are
      // still accepted until the user logs in again and gets a fresh token.

      const profile = await getUserProfileByUserId(ctx.user.id);
      const driverAccess = await getDriverAccessStatus(ctx.user.id);
      const { firstName, lastName } = splitName(ctx.user.name);
      return {
        user: {
          id: String(ctx.user.id),
          email: ctx.user.email ?? undefined,
          phone: profile?.phoneNumber ?? undefined,
          firstName: firstName || "",
          lastName: lastName || "",
          name: ctx.user.name ?? undefined,
          createdAt: (ctx.user.createdAt ?? new Date()).toISOString(),
          isDriver: driverAccess.isDriver,
          gender: profile?.gender ?? undefined,
          isStudent: profile?.isStudent ?? false,
          collegeEmail: profile?.collegeEmail ?? undefined,
          studentFreeRidesUsed: profile?.studentFreeRidesUsed ?? 0,
          studentFreeRidesEarned: profile?.studentFreeRidesEarned ?? 0,
          isStudentVerified: profile?.isStudentVerified ?? false,
          studentUniversityName: profile?.studentUniversityName ?? undefined,
          studentUniversityDomain: profile?.studentUniversityDomain ?? undefined,
          averageRating: profile?.averageRating ? Number(profile.averageRating) : 5,
          totalRides: profile?.totalRides ?? 0,
          totalEarnings: profile?.totalEarnings ? Number(profile.totalEarnings) : 0,
          profilePhoto: profile?.profilePhoto ?? undefined,
        },
        driverAccess,
      };
    }),

    becomeDriver: protectedProcedure
      .input(z.object({
        driverLicense: z.string(),
        vehicleType: z.string(),
        vehicleColor: z.string(),
        licensePlate: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Require an admin-approved driver application before granting driver access.
        // Users must complete the full onboarding flow (submitDriverApplication → admin review).
        const [approvedApp] = await db
          .select()
          .from(driverApplications)
          .where(eq(driverApplications.userId, ctx.user.id))
          .orderBy(desc(driverApplications.createdAt))
          .limit(1);

        if (!approvedApp) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You must complete driver onboarding and receive admin approval before becoming a driver.",
          });
        }
        if (approvedApp.status !== "approved") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: approvedApp.status === "pending"
              ? "Your driver application is under review. You will be notified once approved."
              : `Your driver application was not approved. ${approvedApp.rejectionReason ?? "Contact support for details."}`,
          });
        }

        return updateUserProfile(ctx.user.id, {
          isDriver: true,
          driverLicense: input.driverLicense,
          vehicleType: input.vehicleType,
          vehicleColor: input.vehicleColor,
          licensePlate: input.licensePlate,
        });
      }),

    registerWithPassword: publicProcedure
      .input(z.object({
        method: z.enum(["phone", "email"]),
        destination: z.string().min(3),
        password: z.string().min(8, "Password must be at least 8 characters"),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional(),
        gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional(),
        role: z.enum(["user", "driver"]).optional(),
        isStudent: z.boolean().optional(),
        collegeEmail: z.string().email().optional(),
        legalVersion: z.string(),
        acceptTerms: z.literal(true),
        acceptPrivacy: z.literal(true),
        acceptCommunity: z.literal(true),
        termsAcceptedAt: z.string().min(10),
        privacyAcceptedAt: z.string().min(10),
        communityAcceptedAt: z.string().min(10),
        deviceInfo: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.legalVersion !== CURRENT_LEGAL_VERSION) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Legal version mismatch. Please refresh and try again." });
        }

        const norm = normalizeDestination(input.method, input.destination);
        if (input.method === "phone" && norm.length < 10) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number" });
        if (input.method === "email" && !norm.includes("@")) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid email" });

        const openId = makeOpenId(input.method, input.destination);

        // Check if user already exists
        const existing = await getUserByOpenId(openId);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Account already exists. Please sign in." });

        // Hash password
        const passwordHash = await bcrypt.hash(input.password, 12);
        const name = `${input.firstName} ${input.lastName}`.trim();
        const userEmail = input.method === "email" ? norm : (input.email || null);

        await upsertUser({
          openId,
          name,
          email: userEmail,
          loginMethod: "password",
          passwordHash,
          lastSignedIn: new Date(),
        });

        const saved = await getUserByOpenId(openId);
        if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Registration failed" });

        // Create profile
        const existingProfile = await getUserProfileByUserId(saved.id);
        if (!existingProfile) {
          await createUserProfile({
            userId: saved.id,
            phoneNumber: input.method === "phone" ? norm : null,
            gender: input.gender ?? null,
            isDriver: input.role === "driver",
            isStudent: input.isStudent ?? false,
            collegeEmail: input.collegeEmail ?? null,
          });
        }

        // Create session
        const sessionToken = await sdk.createSessionToken(openId, {
          name: saved.name?.trim() || name || "User",
          expiresInMs: ONE_YEAR_MS,
          sessionVersion: saved.sessionVersion,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        const profile = await getUserProfileByUserId(saved.id);
        await recordLegalAcceptance(saved.id, {
          legalVersion: CURRENT_LEGAL_VERSION,
          acceptTerms: true,
          acceptPrivacy: true,
          acceptCommunity: true,
          termsAcceptedAt: input.termsAcceptedAt,
          privacyAcceptedAt: input.privacyAcceptedAt,
          communityAcceptedAt: input.communityAcceptedAt,
          deviceInfo: input.deviceInfo,
          ipAddress: getClientIp(ctx.req),
        });
        const { firstName: fn, lastName: ln } = splitName(saved.name);
        return {
          success: true, userId: saved.id, sessionToken,
          user: {
            id: String(saved.id), email: saved.email ?? undefined,
            phone: profile?.phoneNumber ?? undefined,
            firstName: fn || "", lastName: ln || "",
            name: saved.name ?? undefined,
            createdAt: (saved.createdAt ?? new Date()).toISOString(),
            isDriver: profile?.isDriver ?? false,
          },
        };
      }),

    loginWithPassword: publicProcedure
      .input(z.object({
        method: z.enum(["phone", "email"]),
        destination: z.string().min(3),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const norm = normalizeDestination(input.method, input.destination);
        const openId = makeOpenId(input.method, input.destination);
        const bruteKey = `login:${openId}`;

        // Check brute force lockout
        checkLoginAttempts(bruteKey);

        let userRow = await getUserByOpenId(openId);

        // If phone login didn't find an account by openId, fall back to profile phoneNumber lookup.
        // This covers accounts seeded (or created via email) that still have a phone on their profile.
        if (!userRow && input.method === "phone") {
          userRow = await getUserByPhone(norm);
        }

        if (!userRow) {
          recordFailedLogin(bruteKey);
          throw new TRPCError({ code: "NOT_FOUND", message: "Account not found. Please sign up first." });
        }

        // Get full row with passwordHash (getUserByPhone already returns the full row; getUserByOpenId does too)
        if (!userRow.passwordHash) return { status: "PASSWORD_NOT_CONFIGURED" as const, success: false as const };

        const valid = await bcrypt.compare(input.password, userRow.passwordHash);
        if (!valid) {
          recordFailedLogin(bruteKey);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
        }

        // Successful login — clear attempts
        clearLoginAttempts(bruteKey);

        // Update last signed in
        await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userRow.id));

        const sessionToken = await sdk.createSessionToken(userRow.openId, {
          name: userRow.name?.trim() || "User",
          expiresInMs: ONE_YEAR_MS,
          sessionVersion: userRow.sessionVersion,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        const profile = await getUserProfileByUserId(userRow.id);
        const { firstName: fn, lastName: ln } = splitName(userRow.name);
        return {
          success: true, userId: userRow.id, sessionToken,
          user: {
            id: String(userRow.id), email: userRow.email ?? undefined,
            phone: profile?.phoneNumber ?? undefined,
            firstName: fn || "", lastName: ln || "",
            name: userRow.name ?? undefined,
            createdAt: (userRow.createdAt ?? new Date()).toISOString(),
            isDriver: profile?.isDriver ?? false,
          },
        };
      }),

    // ── Password Reset Flow ─────────────────────────────────────────────────
    requestPasswordReset: publicProcedure
      .input(z.object({
        method: z.enum(["phone", "email"]),
        destination: z.string().min(3),
      }))
      .mutation(async ({ input }) => {
        const norm = normalizeDestination(input.method, input.destination);
        if (input.method === "phone" && norm.length < 10) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number" });
        if (input.method === "email" && !norm.includes("@")) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid email" });

        const key = resetOtpKey(input.method, input.destination);

        // Rate limit: reuse same 1-per-minute limit
        const existing = await otpGet(key);
        if (existing && Date.now() - existing.createdAt < OTP_RATE_LIMIT_MS) {
          const waitSec = Math.ceil((OTP_RATE_LIMIT_MS - (Date.now() - existing.createdAt)) / 1000);
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Please wait ${waitSec}s before requesting another code` });
        }

        // Check if user exists — but always return success for security
        const openId = makeOpenId(input.method, input.destination);
        const user = await getUserByOpenId(openId);

        if (user) {
          const code = (100000 + crypto.randomInt(900000)).toString();
          await otpSet(key, { code, purpose: "login" as OtpPurpose, method: input.method });
          logger.info({ method: input.method, destination: norm }, `[DEV RESET OTP] ${input.method}:${norm} => ${code}`);
        }

        return { success: true, expiresIn: OTP_EXPIRY_S };
      }),

    verifyPasswordResetOtp: publicProcedure
      .input(z.object({
        method: z.enum(["phone", "email"]),
        destination: z.string().min(3),
        code: z.string().length(6),
      }))
      .mutation(async ({ input }) => {
        const key = resetOtpKey(input.method, input.destination);
        const record = await otpGet(key);

        if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "Reset code not requested or expired" });
        if (record.attempts >= OTP_MAX_ATTEMPTS) { await otpDelete(key); throw new TRPCError({ code: "BAD_REQUEST", message: "Too many attempts. Request a new code." }); }
        if (record.code !== input.code) {
          const newAttempts = await otpIncrAttempts(key);
          if (newAttempts >= OTP_MAX_ATTEMPTS) { await otpDelete(key); throw new TRPCError({ code: "BAD_REQUEST", message: "Too many attempts. Request a new code." }); }
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code" });
        }

        // OTP verified — generate a reset token
        await otpDelete(key);
        const openId = makeOpenId(input.method, input.destination);
        const resetToken = crypto.randomUUID();
        await resetTokenSet(resetToken, openId);

        return { success: true, resetToken };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        method: z.enum(["phone", "email"]),
        destination: z.string().min(3),
        resetToken: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }))
      .mutation(async ({ input }) => {
        // Validate reset token
        const tokenData = await resetTokenGet(input.resetToken);
        if (!tokenData) throw new TRPCError({ code: "BAD_REQUEST", message: "Reset token is invalid or expired. Please start over." });

        const openId = makeOpenId(input.method, input.destination);
        if (tokenData.openId !== openId) throw new TRPCError({ code: "BAD_REQUEST", message: "Reset token mismatch" });

        // Hash new password
        const passwordHash = await bcrypt.hash(input.newPassword, 12);

        // Update user's password and increment sessionVersion to invalidate all existing sessions
        await db.update(users).set({
          passwordHash,
          sessionVersion: sql`sessionVersion + 1`,
        }).where(eq(users.openId, openId));

        // Delete the reset token
        await resetTokenDelete(input.resetToken);

        logger.info({ method: input.method, destination: normalizeDestination(input.method, input.destination) }, "[Auth] Password reset successful — all sessions invalidated");

        return { success: true };
      }),

    // ── Social Auth (Google & Apple) ──────────────────────────────────────
    socialAuth: publicProcedure
      .input(z.object({
        provider: z.enum(["google", "apple"]),
        idToken: z.string().min(1),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        legalVersion: z.string().optional(),
        acceptTerms: z.boolean().optional(),
        acceptPrivacy: z.boolean().optional(),
        acceptCommunity: z.boolean().optional(),
        termsAcceptedAt: z.string().min(10).optional(),
        privacyAcceptedAt: z.string().min(10).optional(),
        communityAcceptedAt: z.string().min(10).optional(),
        deviceInfo: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        let socialId: string;
        let email: string | null = null;
        let name: string | null = null;
        let profilePhoto: string | null = null;

        if (input.provider === "google") {
          // Verify Google ID token cryptographically against Google's tokeninfo endpoint
          try {
            const res = await fetch(
              `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(input.idToken)}`,
              { signal: AbortSignal.timeout(5000) },
            );
            if (!res.ok) {
              throw new TRPCError({ code: "UNAUTHORIZED", message: "Google token verification failed" });
            }
            const payload = (await res.json()) as Record<string, string>;
            // Verify the token was issued for our app
            const validAudiences = [ENV.GOOGLE_CLIENT_ID, ENV.GOOGLE_CLIENT_ID_IOS, ENV.GOOGLE_CLIENT_ID_ANDROID].filter(Boolean);
            if (validAudiences.length > 0 && !validAudiences.includes(payload.aud)) {
              throw new TRPCError({ code: "UNAUTHORIZED", message: "Token audience mismatch" });
            }
            socialId = payload.sub;
            email = payload.email || null;
            name = payload.name || null;
            profilePhoto = payload.picture || null;
          } catch (e: any) {
            if (e instanceof TRPCError) throw e;
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid Google token" });
          }
        } else {
          // Apple — verify using Apple's public keys via jose
          try {
            const { createRemoteJWKSet, jwtVerify } = await import("jose");
            const JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
            const { payload } = await jwtVerify(input.idToken, JWKS, {
              issuer: "https://appleid.apple.com",
            });
            socialId = payload.sub as string;
            email = (payload.email as string) || null;
            name = [input.firstName, input.lastName].filter(Boolean).join(" ") || null;
          } catch (e: any) {
            if (e instanceof TRPCError) throw e;
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid Apple token" });
          }
        }

        if (!socialId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Could not extract user ID from token" });
        }

        const openId = `${input.provider}:${socialId}`;

        // Check if user exists with this social ID
        let existingUser = await getUserByOpenId(openId);

        // Also check if there's an existing account with same email (account linking)
        if (!existingUser && email) {
          // Look for existing user with this email
          const [emailUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
          if (emailUser) {
            // Link social account to existing email account
            await db.update(users).set({
              socialAuthProvider: input.provider,
              socialAuthId: socialId,
              profilePhotoUrl: profilePhoto,
              loginMethod: input.provider,
              lastSignedIn: new Date(),
            }).where(eq(users.id, emailUser.id));

            existingUser = emailUser;

            // Update user profile photo if available
            if (profilePhoto) {
              const profile = await getUserProfileByUserId(emailUser.id);
              if (profile && !profile.profilePhoto) {
                await updateUserProfile(emailUser.id, { profilePhoto: profilePhoto });
              }
            }
          }
        }

        let isNewUser = false;

        if (!existingUser) {
          if (
            input.legalVersion !== CURRENT_LEGAL_VERSION ||
            !input.acceptTerms ||
            !input.acceptPrivacy ||
            !input.acceptCommunity ||
            !input.termsAcceptedAt ||
            !input.privacyAcceptedAt ||
            !input.communityAcceptedAt
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Legal agreements must be reviewed and accepted before creating an account",
            });
          }

          isNewUser = true;

          // New user - create account
          await upsertUser({
            openId,
            name: name || "User",
            email,
            loginMethod: input.provider,
            socialAuthProvider: input.provider,
            socialAuthId: socialId,
            profilePhotoUrl: profilePhoto,
            lastSignedIn: new Date(),
          });

          const saved = await getUserByOpenId(openId);
          if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account creation failed" });

          // Create profile
          await createUserProfile({
            userId: saved.id,
            phoneNumber: null,
            gender: null,
            isDriver: false,
            isStudent: false,
            collegeEmail: null,
          });

          // Set profile photo
          if (profilePhoto) {
            await updateUserProfile(saved.id, { profilePhoto });
          }

          await recordLegalAcceptance(saved.id, {
            legalVersion: CURRENT_LEGAL_VERSION,
            acceptTerms: true,
            acceptPrivacy: true,
            acceptCommunity: true,
            termsAcceptedAt: input.termsAcceptedAt!,
            privacyAcceptedAt: input.privacyAcceptedAt!,
            communityAcceptedAt: input.communityAcceptedAt!,
            deviceInfo: input.deviceInfo,
            ipAddress: getClientIp(ctx.req),
          });

          existingUser = saved;
        } else {
          // Existing user - update last sign in
          await db.update(users).set({
            lastSignedIn: new Date(),
            ...(profilePhoto ? { profilePhotoUrl: profilePhoto } : {}),
          }).where(eq(users.openId, existingUser.openId));
        }

        // Re-fetch user to get current sessionVersion after any updates above
        const freshUser = await getUserByOpenId(existingUser.openId) ?? existingUser;

        // Create session
        const sessionToken = await sdk.createSessionToken(freshUser.openId, {
          name: freshUser.name?.trim() || name || "User",
          expiresInMs: ONE_YEAR_MS,
          sessionVersion: freshUser.sessionVersion,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return {
          success: true,
          userId: existingUser.id,
          isNewUser,
        };
      }),

    logout: protectedProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),

    /** Register or update an Expo push token for the authenticated user. */
    registerPushToken: protectedProcedure
      .input(z.object({
        token: z.string().min(1).max(500),
        platform: z.enum(["ios", "android", "web"]),
        deviceId: z.string().max(255).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertPushToken(ctx.user.id, input.token, input.platform, input.deviceId);
        return { success: true };
      }),
  }),

  // ── DRIVER ONBOARDING ──────────────────────────────────────────────────────
  // (Merged into the main `driver` router below to avoid duplicate keys)

  // ── RIDES ─────────────────────────────────────────────────────────────────
  rides: router({
    // Returns current surge multiplier so the client can warn before booking
    getSurge: publicProcedure.query(() => {
      const multiplier = computeSurgeMultiplier();
      return { multiplier, isSurging: multiplier > 1.2 };
    }),

    /** Real-time fare estimate for all ride tiers — replaces client-side mock. */
    estimateFare: publicProcedure
      .input(z.object({ distanceKm: z.number().min(0.1), durationMinutes: z.number().min(1) }))
      .query(({ input }) => {
        const { distanceKm, durationMinutes } = input;
        return {
          solo: calculateFare({ distanceKm, durationMinutes, mode: "solo" }),
          share: calculateFare({ distanceKm, durationMinutes, mode: "share" }),
          xl: calculateFare({ distanceKm, durationMinutes, mode: "solo", vehicleClass: "xl" }),
          economy: calculateFare({ distanceKm, durationMinutes, mode: "solo", vehicleClass: "economy" }),
        };
      }),

    /** Dynamic ride options + route + pricing insight for ride-options screen */
    getRideOptions: publicProcedure
      .input(z.object({
        pickupLat: z.number().min(-90).max(90),
        pickupLng: z.number().min(-180).max(180),
        dropoffLat: z.number().min(-90).max(90),
        dropoffLng: z.number().min(-180).max(180),
        pickupAddress: z.string().optional(),
        dropoffAddress: z.string().optional(),
        scheduledAt: z.string().optional().nullable(),
        passengerCount: z.number().int().min(1).max(6).optional(),
      }))
      .query(async ({ input }) => {
        return getRideOptionsForTrip(input);
      }),

    getPricingInsight: publicProcedure
      .input(z.object({
        pickupLat: z.number().min(-90).max(90),
        pickupLng: z.number().min(-180).max(180),
        dropoffLat: z.number().min(-90).max(90),
        dropoffLng: z.number().min(-180).max(180),
      }))
      .query(async ({ input }) => {
        return getPricingInsightForTrip(input);
      }),

    /**
     * CO2 savings estimate for the user.
     * Shared rides save ~0.12 kg CO2 per km vs solo car (climate research estimate).
     */
    getCO2Stats: protectedProcedure.query(async ({ ctx }) => {
      const userRides = await getUserRides(ctx.user.id);
      let sharedKm = 0;
      let sharedRideCount = 0;
      for (const { ride } of userRides) {
        if (ride.mode === "share" && ride.status === "completed") {
          sharedKm += parseFloat(String(ride.distanceKm ?? "0"));
          sharedRideCount++;
        }
      }
      // 0.12 kg CO2 saved per km for shared vs solo car
      const co2SavedKg = Math.round(sharedKm * 0.12 * 10) / 10;
      // Trees equivalent: 1 tree absorbs ~21 kg CO2/year
      const treesEquivalent = Math.round((co2SavedKg / 21) * 10) / 10;
      return { co2SavedKg, sharedRideCount, sharedKm: Math.round(sharedKm * 10) / 10, treesEquivalent };
    }),

    // Passenger-mode My Rides — requester/passenger only (never driver pickup jobs)
    myRides: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(20), cursor: z.number().int().min(0).default(0) }).optional())
      .query(async ({ ctx, input }) => {
      // Reconciliation is best-effort — a failure must not block the rides list
      try {
        await reconcileExpiredRidesForUser(ctx.user.id);
      } catch (err) {
        logger.warn({ err, userId: ctx.user.id }, "[rides.myRides] reconcile error (non-fatal)");
      }
      try {
        const { limit = 20, cursor = 0 } = input ?? {};
        const allUserRides = await getPassengerRidesForUser(ctx.user.id);
        // Paginate: slice from cursor
        const userRides = allUserRides.slice(cursor, cursor + limit);

        const statusMap: Record<string, string> = {
          driver_arrived: "driver_assigned",
          in_progress: "active",
        };
        const toShortName = (address: string) =>
          (address || "").split(",")[0].trim() || address;

        // Batch-fetch all driver names in parallel (eliminates N+1)
        const driverIds = [...new Set(userRides.map(u => u.ride.driverId).filter((id): id is number => id != null))];
        const driverResults = await Promise.all(driverIds.map(did => getUserById(did)));
        const driverMap = new Map<number, { name: string; avatar: string }>();
        driverIds.forEach((did, i) => {
          const driverUser = driverResults[i];
          if (driverUser) {
            const name = driverUser.name ?? "Driver";
            driverMap.set(did, { name, avatar: (name[0] ?? "D").toUpperCase() });
          }
        });

        const mapped = userRides.map(({ ride, myFareShare }) => {
          const uiStatus = statusMap[ride.status] ?? ride.status;
          let durationMin = ride.estimatedMinutes ?? 0;
          if (ride.startedAt && ride.completedAt) {
            durationMin = Math.round((ride.completedAt.getTime() - ride.startedAt.getTime()) / 60000);
          } else if (ride.createdAt && ride.completedAt) {
            durationMin = Math.round((ride.completedAt.getTime() - ride.createdAt.getTime()) / 60000);
          }

          const driverInfo = ride.driverId != null ? driverMap.get(ride.driverId) : null;

          const isPassengerPosted = !!(ride.fareBreakdown as { passengerPosted?: boolean } | null)?.passengerPosted;
          const posterRole =
            ride.mode === "share" && (isPassengerPosted || ride.driverId == null)
              ? "passenger_organizer"
              : "passenger";
          let rideType = "Standard ride";
          if (ride.mode === "share") {
            rideType = posterRole === "passenger_organizer" ? "Posted Ride" : "Share Ride";
          }
          if (ride.status === "cancelled") rideType = ride.cancelReason
            ? `Cancelled - ${ride.cancelReason}`
            : "Cancelled by you";

          return {
            id: ride.rideId,
            mode: ride.mode as "solo" | "share",
            status: (ride.status === "missed"
              ? "missed"
              : uiStatus) as
              | "searching"
              | "matched"
              | "driver_assigned"
              | "active"
              | "completed"
              | "cancelled"
              | "missed",
            rideStep: ride.rideStep ?? undefined,
            rideType,
            pickup: {
              address: ride.pickupAddress,
              lat: Number(ride.pickupLat),
              lng: Number(ride.pickupLng),
              shortName: toShortName(ride.pickupAddress),
            },
            dropoff: {
              address: ride.dropoffAddress,
              lat: Number(ride.dropoffLat),
              lng: Number(ride.dropoffLng),
              shortName: toShortName(ride.dropoffAddress),
            },
            driver: driverInfo ? { name: driverInfo.name, avatar: driverInfo.avatar } : null,
            passengers: [] as {
              id: string;
              name: string;
              avatar: string;
              rating: number;
              pickup: { address: string; lat: number; lng: number; shortName: string };
              dropoff: { address: string; lat: number; lng: number; shortName: string };
              fareShare: number;
              distanceKm: number;
            }[],
            totalFare: Number(ride.totalFare),
            myFare: Number(myFareShare ?? ride.totalFare),
            distanceKm: Number(ride.distanceKm),
            estimatedMinutes: ride.estimatedMinutes,
            durationMin,
            isDriver: false,
            createdAt: ride.createdAt.toISOString(),
            completedAt: ride.completedAt?.toISOString() ?? undefined,
            startedAt: ride.startedAt?.toISOString() ?? undefined,
            cancelledAt: ride.cancelledAt?.toISOString() ?? undefined,
            cancelReason: ride.cancelReason ?? undefined,
            myPassengerId: String(ctx.user.id),
            posterRole,
            departureTime: ride.departureTime?.toISOString() ?? undefined,
          };
        });
        return mapped;
      } catch (err) {
        logger.error({ err, userId: ctx.user.id }, "[rides.myRides] DB error — returning empty list");
        return [];
      }
    }),

    getMyRides: protectedProcedure.query(async ({ ctx }) => {
      return getPassengerRides(ctx.user.id);
    }),

    getRecentDestinations: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
      .query(async ({ ctx, input }) => {
        return getRecentDestinations(ctx.user.id, input.limit);
      }),

    getDriverRides: protectedProcedure
      .input(z.object({ status: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        await reconcileExpiredRidesForUser(ctx.user.id);
        return getDriverRides(ctx.user.id, input.status);
      }),

    getRide: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        await Promise.race([
          reconcileExpiredRideByRideId(input.rideId),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("reconcile timeout")), 5000)
          ),
        ]).catch(() => {});
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);

        // Fetch driver info if a real driver has been assigned
        let driverInfo: {
          id: string; name: string; phone: string; avatar: string; rating: number;
          vehicle: string; vehicleColor: string; licensePlate: string; totalTrips: number;
        } | null = null;

        if (ride.driverId != null && ride.rideStep !== "finding_driver") {
          const [driverUser, driverProfile] = await Promise.all([
            getUserById(ride.driverId),
            getUserProfileByUserId(ride.driverId),
          ]);
          if (driverUser) {
            const name = driverUser.name ?? "Driver";
            driverInfo = {
              id: String(ride.driverId),
              name,
              phone: driverProfile?.phoneNumber ?? driverUser.email ?? "",
              avatar: (name[0] ?? "D").toUpperCase(),
              rating: Number(driverProfile?.averageRating ?? 4.8),
              vehicle: driverProfile?.vehicleType ?? "Standard",
              vehicleColor: driverProfile?.vehicleColor ?? "",
              licensePlate: driverProfile?.licensePlate ?? "",
              totalTrips: driverProfile?.totalRides ?? 0,
            };
          }
        }

        // Per-passenger pickup/dropoff (so joiners see THEIR map coords, not the ride's original)
        let myPassengerId = 0;
        let myPickupLat: number | null = null;
        let myPickupLng: number | null = null;
        let myPickupAddress: string | null = null;
        let myDropoffLat: number | null = null;
        let myDropoffLng: number | null = null;
        let myDropoffAddress: string | null = null;

        let isOriginalPassenger = false;
        let myRideStep: string | null = null; // per-passenger step override
        let myFareShare: number | null = null;

        // Fetch passengers once; used for per-passenger coords, co-rider list, and driver manifest
        let sharedPassengers: Awaited<ReturnType<typeof getRidePassengers>> = [];
        if (ride.mode === "share") {
          sharedPassengers = await getRidePassengers(ride.id);
          const myEntry = sharedPassengers.find(p => p.passengerId === ctx.user.id);
          if (myEntry) {
            myPassengerId = myEntry.passengerId;
            myPickupLat = Number(myEntry.pickupLat);
            myPickupLng = Number(myEntry.pickupLng);
            myPickupAddress = myEntry.pickupAddress;
            myDropoffLat = Number(myEntry.dropoffLat);
            myDropoffLng = Number(myEntry.dropoffLng);
            myDropoffAddress = myEntry.dropoffAddress;
            isOriginalPassenger = !!(myEntry as any).isOriginalPassenger;
            myFareShare = Number(myEntry.fareShare ?? 0);

            // Per-passenger step override for sequential pickup.
            // DB field is primary; Redis is a fast-write fallback for the current poll cycle.
            let arrivalTarget: number | null = (ride as any).arrivalTargetPassengerId ?? null;
            if (!arrivalTarget) {
              try {
                if (await isRedisAvailable()) {
                  const r = await redis.get(`arrival_target:${ride.rideId}`);
                  if (r) arrivalTarget = Number(r);
                }
              } catch { /* non-fatal */ }
            }

            const passengerStatus = (myEntry as any).status ?? "joined";
            const globalStep = ride.rideStep ?? "";

            // Passenger was already dropped off mid-trip (another passenger still riding).
            // Override the global step so their active-ride screen advances to rating immediately.
            if (passengerStatus === "dropped_off") {
              myRideStep = "completed";
            } else if (passengerStatus === "joined" &&
                (globalStep === "ride_in_progress" || globalStep === "ride_started")) {
              // Passenger has NOT boarded yet but the ride is globally in progress.
              if (arrivalTarget && arrivalTarget === myEntry.passengerId) {
                myRideStep = "driver_arrived"; // Driver is waiting at THIS passenger's stop
              } else if (arrivalTarget && arrivalTarget !== myEntry.passengerId) {
                myRideStep = "driver_picking_copassenger"; // Driver is at another passenger's stop
              } else {
                myRideStep = "driver_en_route"; // Driver is heading to this passenger next
              }
            } else if (arrivalTarget) {
              const isTarget = arrivalTarget === myEntry.passengerId;
              if (globalStep === "driver_arrived") {
                // First pickup phase: only the target sees "driver arrived";
                // everyone else waits with a dedicated co-passenger-pickup status.
                if (!isTarget) myRideStep = "driver_picking_copassenger";
              }
              // ride_in_progress + arrivalTarget handled by the joined-status branch above
            }
          }
        }

        // Fetch passenger info for the driver
        let passengerInfo: {
          id: number; name: string; phone: string; avatar: string;
        } | null = null;

        let allPassengersList: Array<{
          passengerId: number; name: string; isOriginalPassenger: boolean;
          status: string;
          pickupLat: number; pickupLng: number; pickupAddress: string;
          dropoffLat: number; dropoffLng: number; dropoffAddress: string;
          fareShare: number;
        }> = [];

        // Co-passengers visible to every participant (other riders' names + fares)
        let coPassengersList: Array<{
          passengerId: number; name: string; avatar: string;
          fareShare: number; dropoffAddress: string;
        }> = [];

        if (ride.mode === "solo" && ride.driverId && ctx.user.id === ride.driverId) {
          // Solo ride — passenger is the first entry in ridePassengers for this ride
          const soloPassengers = await getRidePassengers(ride.id);
          const primary = soloPassengers[0];
          if (primary) {
            const [pUser, pProfile] = await Promise.all([
              getUserById(primary.passengerId),
              getUserProfileByUserId(primary.passengerId),
            ]);
            if (pUser) {
              const pName = pUser.name ?? "Passenger";
              passengerInfo = {
                id: pUser.id,
                name: pName,
                phone: pProfile?.phoneNumber ?? pUser.email ?? "",
                avatar: (pName[0] ?? "P").toUpperCase(),
              };
            }
          }
        }

        if (ride.mode === "share" && sharedPassengers.length > 0) {
          const activePassengers = sharedPassengers.filter(p => p.status !== "cancelled");

          if (ride.driverId && ctx.user.id === ride.driverId) {
            // Driver: build full sequential manifest + primary passenger info
            const primaryPassenger = activePassengers[0];
            if (primaryPassenger) {
              const [passengerUser, passengerProfile] = await Promise.all([
                getUserById(primaryPassenger.passengerId),
                getUserProfileByUserId(primaryPassenger.passengerId),
              ]);
              if (passengerUser) {
                const pName = passengerUser.name ?? "Passenger";
                passengerInfo = {
                  id: passengerUser.id,
                  name: pName,
                  phone: passengerProfile?.phoneNumber ?? passengerUser.email ?? "",
                  avatar: (pName[0] ?? "P").toUpperCase(),
                };
              }
            }
            allPassengersList = await Promise.all(
              activePassengers.map(async (p) => {
                const u = await getUserById(p.passengerId);
                return {
                  passengerId: p.passengerId,
                  name: u?.name ?? "Passenger",
                  isOriginalPassenger: !!(p as any).isOriginalPassenger,
                  status: (p as any).status ?? "joined",
                  pickupLat: Number(p.pickupLat),
                  pickupLng: Number(p.pickupLng),
                  pickupAddress: p.pickupAddress ?? "",
                  dropoffLat: Number(p.dropoffLat),
                  dropoffLng: Number(p.dropoffLng),
                  dropoffAddress: p.dropoffAddress ?? "",
                  fareShare: Number(p.fareShare ?? 0),
                };
              })
            );
            // Driver sees all passengers as co-riders
            coPassengersList = allPassengersList.map(p => ({
              passengerId: p.passengerId,
              name: p.name,
              avatar: (p.name[0] ?? "P").toUpperCase(),
              fareShare: p.fareShare,
              dropoffAddress: p.dropoffAddress,
            }));
          } else {
            // Passenger: build co-rider list (everyone except themselves)
            const others = activePassengers.filter(p => p.passengerId !== ctx.user.id);
            coPassengersList = await Promise.all(
              others.map(async (p) => {
                const u = await getUserById(p.passengerId);
                const name = u?.name ?? "Passenger";
                return {
                  passengerId: p.passengerId,
                  name,
                  avatar: (name[0] ?? "P").toUpperCase(),
                  fareShare: Number(p.fareShare ?? 0),
                  dropoffAddress: p.dropoffAddress ?? "",
                };
              })
            );
          }
        }

        return {
          ...ride,
          driverInfo,
          passengerInfo,
          allPassengersList,
          coPassengersList,
          myPassengerId,
          myFareShare,
          isOriginalPassenger,
          myRideStep,
          myPickupLat, myPickupLng, myPickupAddress,
          myDropoffLat, myDropoffLng, myDropoffAddress,
        };
      }),

    /**
     * Returns per-passenger fare shares for a shared ride — used on the trip receipt.
     * Accessible by any ride participant (passenger or driver of that ride).
     */
    getRideFareSplits: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);
        const passengers = await getRidePassengers(ride.id);

        const splits = await Promise.all(
          passengers
            .filter((p) => p.status !== "cancelled")
            .map(async (p) => {
              const user = await getUserById(p.passengerId);
              return {
                passengerId: p.passengerId,
                name: user?.name ?? "Passenger",
                fareShare: parseFloat(String(p.fareShare ?? "0")),
                isMe: p.passengerId === ctx.user.id,
                pickupAddress: p.pickupAddress,
                dropoffAddress: p.dropoffAddress,
              };
            }),
        );

        return {
          totalFare: parseFloat(String(ride.totalFare ?? "0")),
          passengerCount: splits.length,
          splits,
        };
      }),

    // ── Live driver GPS for passenger tracking ─────────────────────────────
    getDriverLocation: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride || ride.driverId == null) return null;
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);
        // In-memory location is most up-to-date (updated every 5 s from driver)
        const memLoc = dispatchQueue.getDriverLocation(ride.driverId);
        if (memLoc) return { lat: memLoc.lat, lng: memLoc.lng };
        // Fallback: last known position stored in DB
        const session = await getDriverSession(ride.driverId);
        if (!session?.currentLat) return null;
        return { lat: Number(session.currentLat), lng: Number(session.currentLng) };
      }),

    findSharedRides: protectedProcedure
      .input(z.object({
        pickupLat: z.number().min(-90).max(90), pickupLng: z.number().min(-180).max(180),
        dropoffLat: z.number().min(-90).max(90), dropoffLng: z.number().min(-180).max(180),
      }))
      .query(async ({ input }) => {
        const matches = await findMatchingSharedRides(
          input.pickupLat, input.pickupLng,
          input.dropoffLat, input.dropoffLng,
        );
        const userDistKm = haversineKm(
          input.pickupLat, input.pickupLng,
          input.dropoffLat, input.dropoffLng,
        );
        const enriched = await Promise.all(
          matches.map(async (ride) => {
            const passengers = await getRidePassengers(ride.id);
            const seatsAvailable = 3 - passengers.length;
            const rideDistKm = parseFloat(String(ride.distanceKm));
            const routeOverlapPercent = Math.min(
              Math.round((Math.min(userDistKm, rideDistKm) / Math.max(userDistKm, rideDistKm)) * 100),
              99,
            );
            return {
              ...ride,
              passengers,
              seatsAvailable,
              routeOverlapPercent,
              estimatedFareShare: estimateFare(userDistKm, "share"),
              fullFare: estimateFare(userDistKm, "solo"),
              // ETA to pickup: use scheduled departure if set, otherwise fall back to
              // driver location estimate (driverAssignedAt + est. en-route time).
              departureMinutes: (() => {
                if (ride.departureTime) {
                  const minsUntil = Math.round((new Date(ride.departureTime).getTime() - Date.now()) / 60_000);
                  if (minsUntil > 0) return minsUntil;
                }
                if (ride.driverAssignedAt) {
                  const minsElapsed = Math.round((Date.now() - new Date(ride.driverAssignedAt).getTime()) / 60_000);
                  return Math.max(1, 10 - minsElapsed); // rough: 10 min en-route
                }
                return 5; // default neutral ETA when no timing info available
              })(),
            };
          }),
        );
        return enriched.filter((r) => r.seatsAvailable > 0);
      }),

    bookRide: protectedProcedure
      .input(z.object({
        mode: z.enum(["solo", "share"]),
        pickupLat: z.number().min(-90).max(90), pickupLng: z.number().min(-180).max(180),
        pickupAddress: z.string().min(1).max(500),
        dropoffLat: z.number().min(-90).max(90), dropoffLng: z.number().min(-180).max(180),
        dropoffAddress: z.string().min(1).max(500),
        distanceKm: z.number().positive().max(500), estimatedMinutes: z.number().positive().max(600),
        vehicleType: z.enum(["economy", "standard", "comfort", "xl"]).default("standard"),
        safetyMode: z.enum(["none", "women_drivers_only", "women_companions_only", "women_only"]).default("none"),
        driverId: z.number().optional(),
        idempotencyKey: z.string().max(128).optional(),
        scheduledFor: z.string().datetime({ offset: true }).optional(),
        /** Ride credits to reserve at booking (capped server-side via previewRedemption). */
        creditAmountCents: z.number().int().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Idempotency: return the original ride object if the same key is replayed within TTL.
        // Must return the same shape as the normal path so the client never crashes.
        if (input.idempotencyKey) {
          const cacheKey = `${ctx.user.id}:${input.idempotencyKey}`;
          const cached = BOOK_RIDE_IDEMPOTENCY.get(cacheKey);
          if (cached && Date.now() - cached.createdAt < BOOK_RIDE_IDEMPOTENCY_TTL_MS) {
            const cachedRide = await getRideByRideId(cached.rideId);
            if (cachedRide) {
              const fareBreakdownCached = calculateFare({
                distanceKm: Number(cachedRide.distanceKm),
                durationMinutes: cachedRide.estimatedMinutes ?? 0,
                vehicleClass: (input.vehicleType as import("./services/fareEngine").VehicleClass) ?? "standard",
                mode: cachedRide.mode as "solo" | "share",
              });
              return { ride: cachedRide, fareShare: Number(cachedRide.totalFare), fareBreakdown: fareBreakdownCached };
            }
            // Cached rideId no longer exists in DB — fall through to create a new ride
            BOOK_RIDE_IDEMPOTENCY.delete(cacheKey);
          }
        }
        // Use production fare engine with surge detection
        const fareBreakdown = calculateFare({
          distanceKm: input.distanceKm,
          durationMinutes: input.estimatedMinutes,
          vehicleClass: input.vehicleType as import("./services/fareEngine").VehicleClass,
          mode: input.mode,
        });

        // Apply user's saved preferredSafetyMode when no explicit mode is passed by the client
        let effectiveSafetyMode = input.safetyMode;
        if (effectiveSafetyMode === "none") {
          const savedPref = await getOrCreateUserPreferences(ctx.user.id);
          if (savedPref.safetyMode && savedPref.safetyMode !== "none") {
            effectiveSafetyMode = savedPref.safetyMode as typeof effectiveSafetyMode;
          }
        }

        const rideId = genId("ride");
        const resolvedDriverId = input.driverId ?? null;
        logger.debug({ driverId: input.driverId, resolvedDriverId, mode: input.mode, userId: ctx.user.id }, "[bookRide] creating ride");
        const ride = await createRide({
          rideId,
          driverId: resolvedDriverId,
          mode: input.mode,
          status: "searching",
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          distanceKm: String(input.distanceKm),
          estimatedMinutes: input.estimatedMinutes,
          totalFare: String(fareBreakdown.totalFare),
          rideStep: "finding_driver",
          surgeMultiplier: String(fareBreakdown.surgeMultiplier),
          fareBreakdown: fareBreakdown,
          safetyMode: effectiveSafetyMode,
          // For shared dispatch rides: passenger takes 1 seat; 2 seats remain for mid-ride joins
          // For solo rides: availableSeats is irrelevant but set to 0 so no joins allowed
          totalSeats: input.mode === "share" ? 3 : 1,
          availableSeats: input.mode === "share" ? 2 : 0,
          departureTime: input.scheduledFor ? new Date(input.scheduledFor) : null,
        } as any);

        if (!ride) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create ride" });
        }

        // Fetch route polyline from OSRM for route-based matching (5s timeout)
        try {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${input.pickupLng},${input.pickupLat};${input.dropoffLng},${input.dropoffLat}?overview=full&geometries=polyline`;
          const osrmRes = await fetch(osrmUrl, { signal: AbortSignal.timeout(5_000) });
          if (osrmRes.ok) {
            const osrmData = await osrmRes.json();
            if (osrmData.routes?.[0]?.geometry) {
              await updateRide(ride.id, { routePolyline: osrmData.routes[0].geometry } as any);
            }
          }
        } catch (e) {
          logger.warn({ err: e }, "[bookRide] OSRM unavailable, haversine fallback");
        }

        const fareShare = fareBreakdown.totalFare;
        await addRidePassenger({
          rideId: ride.id,
          passengerId: ctx.user.id,
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          distanceKm: String(input.distanceKm),
          fareShare: String(fareShare),
        });

        // Reserve ride credits (two-phase: reserve now, apply on successful Stripe charge)
        let creditsReservedCents = 0;
        if (input.creditAmountCents && input.creditAmountCents > 0) {
          try {
            const fareAmountCents = Math.round(fareShare * 100) + PLATFORM_FEE_CENTS;
            const preview = await previewCreditRedemption({ userId: ctx.user.id, fareAmountCents });
            const toReserve = capCreditReserveAmount(input.creditAmountCents, preview.maxApplicable);
            if (toReserve > 0) {
              const reserved = await reserveCredits({
                userId: ctx.user.id,
                rideId: ride.id,
                amountCents: toReserve,
                idempotencyKey: `redeem_ride_${ride.id}_user_${ctx.user.id}`,
              });
              creditsReservedCents = reserved.totalReserved;
            }
          } catch (e) {
            logger.warn({ err: e, rideId: ride.rideId }, "[bookRide] Credit reserve failed — booking continues without credits");
          }
        }

        // Notify passenger: ride booked, searching for driver
        const pickupShort = input.pickupAddress.split(",")[0] || "Pickup";
        const dropoffShort = input.dropoffAddress.split(",")[0] || "Dropoff";
        await createNotification({
          notificationId: genId("notif"),
          userId: ctx.user.id,
          type: "ride_request",
          title: "Ride booked — searching for driver",
          body: `${pickupShort} → ${dropoffShort} · $${fareBreakdown.totalFare.toFixed(2)}. We're finding you a nearby driver.`,
          data: { rideId },
          deepLink: "/active-ride",
        });

        // Trigger async dispatch — find nearest available driver
        // Non-blocking: passenger gets rideId immediately and polls for driver_assigned
        // Retries up to 6 times (30s total) if no drivers found initially
        const attemptDispatch = async (attempt: number = 0): Promise<void> => {
          try {
            // Fetch nearby online drivers — wide radius to catch all
            const nearbySessions = await getOnlineDriversNear(
              input.pickupLat,
              input.pickupLng,
              50, // 50 km — very wide radius for dev/testing
            );

            // Also check in-memory driver locations (more up-to-date than DB)
            const memDrivers = dispatchQueue.getDriversNear(input.pickupLat, input.pickupLng, 50);
            logger.debug({ attempt, dbCount: nearbySessions.length, memCount: memDrivers.length }, "[bookRide] dispatch attempt");

            // Merge DB sessions with in-memory-only drivers
            const sessionDriverIds = new Set(nearbySessions.map((s) => s.driverId));
            const extraMemDrivers = memDrivers.filter((d) => !sessionDriverIds.has(d.driverId));

            if (nearbySessions.length === 0 && memDrivers.length === 0) {
              // Retry up to 6 times (every 5s = 30s total)
              if (attempt < 6) {
                logger.debug({ rideId, attempt }, "[bookRide] no drivers yet, retrying in 5s");
                setTimeout(() => attemptDispatch(attempt + 1), 5_000);
              } else {
                logger.warn({ rideId }, "[bookRide] no online drivers found after 6 retries");
                // Update ride to show "no driver found" notification
                await createNotification({
                  notificationId: genId("notif"),
                  userId: ctx.user.id,
                  type: "system",
                  title: "No drivers available",
                  body: "We couldn't find a driver for your ride. Please try again later.",
                  data: { rideId },
                  deepLink: "/",
                });
              }
              return;
            }

            // Build candidates from DB sessions (exclude booking user so they can't be dispatched to themselves)
            const candidates: DriverCandidate[] = nearbySessions
              .filter((s) => s.driverId !== ctx.user.id)
              .map((s) => {
              const memLoc = dispatchQueue.getDriverLocation(s.driverId);
              const driverLat = memLoc?.lat ?? Number(s.currentLat);
              const driverLng = memLoc?.lng ?? Number(s.currentLng);
              const distKm = haversineKm(input.pickupLat, input.pickupLng, driverLat, driverLng);
              return {
                driverId: s.driverId,
                lat: driverLat,
                lng: driverLng,
                rating: Number(s.averageRating ?? 5.0),
                acceptanceRate: Number(s.acceptanceRate ?? 100),
                distanceKm: distKm,
                etaMinutes: Math.ceil((distKm / 30) * 60),
                gender: undefined,
              };
            });

            // Add in-memory-only drivers (exclude booking user)
            for (const md of extraMemDrivers.filter(d => d.driverId !== ctx.user.id)) {
              const distKm = haversineKm(input.pickupLat, input.pickupLng, md.lat, md.lng);
              candidates.push({
                driverId: md.driverId,
                lat: md.lat,
                lng: md.lng,
                rating: 5.0,
                acceptanceRate: 100,
                distanceKm: distKm,
                etaMinutes: Math.ceil((distKm / 30) * 60),
                gender: undefined,
              });
            }

            // Sort by score (distance 50%, rating 30%, acceptance 20%)
            const sorted = dispatchQueue.sortCandidates(candidates, 50);

            const started = dispatchQueue.startDispatch({
              rideId: ride.rideId,
              passengerId: ctx.user.id,
              pickupLat: input.pickupLat,
              pickupLng: input.pickupLng,
              dropoffLat: input.dropoffLat,
              dropoffLng: input.dropoffLng,
              totalFare: fareShare,
              mode: input.mode,
              safetyMode: input.safetyMode,
              candidates: sorted,
            });

            logger.info({ rideId, started, candidates: sorted.length }, "[bookRide] dispatch initiated");
          } catch (err) {
            logger.error({ err, rideId }, "[bookRide] dispatch error");
          }
        };

        setImmediate(() => attemptDispatch(0));

        // Store idempotency key so replayed requests return the same rideId
        if (input.idempotencyKey) {
          const cacheKey = `${ctx.user.id}:${input.idempotencyKey}`;
          BOOK_RIDE_IDEMPOTENCY.set(cacheKey, { rideId, createdAt: Date.now() });
        }

        return { ride, fareShare, fareBreakdown, creditsReservedCents };
      }),

    /**
     * POST a ride as a PASSENGER — marketplace model.
     * Passenger sets their offered fare, schedule time, seats needed.
     * No driver is auto-assigned. Nearby drivers are notified to accept.
     */
    postPassengerRide: protectedProcedure
      .input(z.object({
        pickupLat: z.number().min(-90).max(90),
        pickupLng: z.number().min(-180).max(180),
        pickupAddress: z.string().min(1).max(500),
        dropoffLat: z.number().min(-90).max(90),
        dropoffLng: z.number().min(-180).max(180),
        dropoffAddress: z.string().min(1).max(500),
        distanceKm: z.number().positive().max(500),
        estimatedMinutes: z.number().positive().max(600),
        scheduledFor: z.string().datetime({ offset: true }),
        mode: z.enum(["solo", "share"]).default("solo"),
        seatsRequested: z.number().min(1).max(8).default(1),
        fareOffered: z.number().positive().max(500),
        approvalRequired: z.boolean().default(false),
        notes: z.string().max(500).optional(),
        title: z.string().min(1).max(200).optional(),
        safetyMode: z.enum(["none", "women_drivers_only", "women_companions_only", "women_only"]).default("none"),
        luggageAllowed: z.enum(["none", "small", "medium", "large"]).optional(),
        genderPreference: z.enum(["any", "female_only", "male_only"]).optional(),
        flexibleDepartureMinutes: z.number().min(0).max(120).optional(),
        quietRide: z.boolean().optional(),
        stopoverAddresses: z.array(z.string()).max(3).optional(),
        routePolyline: z.string().optional(),
        communityId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const rideId = genId("ride");
        const pickupShort = input.pickupAddress.split(",")[0] || "Pickup";
        const dropoffShort = input.dropoffAddress.split(",")[0] || "Dropoff";

        const ride = await createRide({
          rideId,
          driverId: null,
          mode: input.mode,
          status: "searching",
          rideStep: "finding_driver",
          posterRole: "passenger_organizer",
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          distanceKm: String(input.distanceKm),
          estimatedMinutes: input.estimatedMinutes,
          totalFare: String(input.fareOffered * input.seatsRequested),
          pricePerSeat: String(input.fareOffered),
          totalSeats: input.seatsRequested,
          availableSeats: Math.max(0, input.seatsRequested - 1),
          departureTime: new Date(input.scheduledFor),
          safetyMode: input.safetyMode,
          approvalRequired: input.approvalRequired,
          carpoolTitle: input.title ?? `${pickupShort} → ${dropoffShort}`,
          routePolyline: input.routePolyline ?? null,
          fareBreakdown: {
            notes: input.notes ?? null,
            passengerPosted: true,
            luggageAllowed: input.luggageAllowed ?? null,
            genderPreference: input.genderPreference ?? null,
            flexibleDepartureMinutes: input.flexibleDepartureMinutes ?? null,
            quietRide: input.quietRide ?? null,
            stopoverAddresses: input.stopoverAddresses ?? null,
          } as any,
          surgeMultiplier: "1.00",
        } as any);

        if (!ride) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create ride" });
        }

        if (input.communityId) {
          try {
            await attachRideToCommunity({
              communityId: input.communityId,
              rideDbId: ride.id,
              postedBy: ctx.user.id,
            });
          } catch (err: any) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err?.message ?? "Failed to attach ride to community",
            });
          }
        }

        await addRidePassenger({
          rideId: ride.id,
          passengerId: ctx.user.id,
          isOriginalPassenger: true,
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          distanceKm: String(input.distanceKm),
          fareShare: String(input.fareOffered),
        });

        await createNotification({
          notificationId: genId("notif"),
          userId: ctx.user.id,
          type: "ride_request",
          title: input.mode === "share" ? "Group ride posted!" : "Ride request posted!",
          body: input.mode === "share"
            ? `${pickupShort} → ${dropoffShort} · $${input.fareOffered.toFixed(2)}/seat. Others can request to join from Find Carpool.`
            : `${pickupShort} → ${dropoffShort} · $${input.fareOffered.toFixed(2)}. Nearby drivers will be notified.`,
          data: { rideId },
          deepLink: "/(tabs)/rides",
        });

        // Fan-out notification to nearby drivers (non-blocking)
        setImmediate(async () => {
          try {
            const nearbySessions = await getOnlineDriversNear(input.pickupLat, input.pickupLng, 50);
            const memDrivers = dispatchQueue.getDriversNear(input.pickupLat, input.pickupLng, 50);
            const sessionDriverIds = new Set(nearbySessions.map((s) => s.driverId));
            const allDriverIds = [
              ...nearbySessions.map((s) => s.driverId),
              ...memDrivers.filter((d) => !sessionDriverIds.has(d.driverId)).map((d) => d.driverId),
            ].filter((id) => id !== ctx.user.id);

            for (const driverId of allDriverIds.slice(0, 20)) {
              notificationBus.pushToUser(driverId, {
                type: "ride_available",
                title: "New ride request near you!",
                body: `${pickupShort} → ${dropoffShort} · $${input.fareOffered.toFixed(2)} offered`,
                data: { rideId, pickupLat: input.pickupLat, pickupLng: input.pickupLng, recipientRole: "driver" },
              });
              await notifyDriverPickupRequest(driverId, {
                rideId,
                pickupAddress: input.pickupAddress,
                dropoffAddress: input.dropoffAddress,
                offerPrice: input.fareOffered,
              }).catch(() => {});
            }
          } catch (err) {
            logger.warn({ err, rideId }, "[postPassengerRide] driver notification error");
          }
        });

        return { ride, rideId };
      }),

    joinRide: protectedProcedure
      .input(z.object({
        rideId: z.string().min(1),
        pickupLat: z.number().min(-90).max(90), pickupLng: z.number().min(-180).max(180),
        pickupAddress: z.string().min(1).max(500),
        dropoffLat: z.number().min(-90).max(90), dropoffLng: z.number().min(-180).max(180),
        dropoffAddress: z.string().min(1).max(500),
        distanceKm: z.number().positive().max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        // Allow joining shared rides in searching, matched, driver_assigned, driver_arrived, or in_progress status
        const joinableStatuses = ["searching", "matched", "driver_arrived", "in_progress"];
        if (ride.mode !== "share") throw new TRPCError({ code: "BAD_REQUEST", message: "Can only join shared rides" });
        if (!joinableStatuses.includes(ride.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Ride no longer accepting passengers" });

        const existing = await getRidePassengers(ride.id);

        // Check if user already joined
        const alreadyJoined = existing.find(p => p.passengerId === ctx.user.id);
        if (alreadyJoined) throw new TRPCError({ code: "BAD_REQUEST", message: "You are already in this ride" });

        // Atomic seat claim — prevents two concurrent joins both seeing availableSeats > 0
        const seatClaimed = await decrementRideSeat(ride.id);
        if (!seatClaimed) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This ride is full" });
        }

        const fareShare = estimateFare(input.distanceKm, "share");
        let passenger: Awaited<ReturnType<typeof addRidePassenger>>;
        try {
          passenger = await addRidePassenger({
            rideId: ride.id,
            passengerId: ctx.user.id,
            pickupLat: String(input.pickupLat),
            pickupLng: String(input.pickupLng),
            pickupAddress: input.pickupAddress,
            dropoffLat: String(input.dropoffLat),
            dropoffLng: String(input.dropoffLng),
            dropoffAddress: input.dropoffAddress,
            distanceKm: String(input.distanceKm),
            fareShare: String(fareShare),
          });
        } catch (err) {
          // Release the seat we just claimed so it's not permanently lost
          await incrementRideSeat(ride.id).catch(() => { /* best-effort */ });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to join ride. Please try again." });
        }

        // Recalculate fare savings — reduce original passengers' fares
        const updatedPassengers = await getRidePassengers(ride.id);
        const originalFare = Number(ride.totalFare);
        const combinedFares = updatedPassengers.reduce((sum, p) => sum + Number(p.fareShare), 0);

        // Notify original passengers about the co-rider joining
        const joinerUser = await getUserById(ctx.user.id);
        const joinerName = joinerUser?.name ?? "A new rider";
        const joinerPickup = input.pickupAddress.split(",")[0] || "Nearby";
        const joinerDrop = input.dropoffAddress.split(",")[0] || "Nearby";

        const notifyTargets: Array<{ userId: number; title: string; body: string }> = [
          ...existing.map(p => ({
            userId: p.passengerId,
            title: `${joinerName} joined your ride!`,
            body: `${joinerPickup} → ${joinerDrop}. Your fare may decrease. ${updatedPassengers.length}/3 seats filled.`,
          })),
          ...(ride.driverId != null ? [{
            userId: ride.driverId,
            title: `New passenger: ${joinerName}`,
            body: `Picking up at ${joinerPickup}, dropping at ${joinerDrop}. ${updatedPassengers.length} passengers total.`,
          }] : []),
        ];
        await Promise.all(notifyTargets.map(n =>
          createNotification({
            notificationId: genId("notif"),
            userId: n.userId,
            type: "system",
            title: n.title,
            body: n.body,
            data: { rideId: ride.rideId },
            deepLink: `/ride-history?id=${ride.rideId}`,
          }).catch(() => { /* non-critical */ })
        ));

        return { passenger, fareShare, totalPassengers: updatedPassengers.length };
      }),

    cancelRide: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

        // Early exit: terminal rides cannot be cancelled
        if (ride.status === "completed" || ride.status === "cancelled") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This ride has already ended and cannot be cancelled.",
          });
        }

        const pickupShort = (ride.pickupAddress || "").split(",")[0] || "Pickup";
        const dropoffShort = (ride.dropoffAddress || "").split(",")[0] || "Dropoff";

        // ── Shared ride: only remove THIS passenger ──────────────────────────
        if (ride.mode === "share") {
          const passengers = await getRidePassengers(ride.id);
          const isPassenger = passengers.some(p => p.passengerId === ctx.user.id);

          if (isPassenger) {
            // Mark this passenger as cancelled
            await updateRidePassengerStatus(ride.id, ctx.user.id, "cancelled");

            // Remove this passenger's stops
            try {
              await deleteRideStopsByPassenger(ride.id, ctx.user.id);
            } catch (_) { /* stops may not exist yet */ }

            // Increment available seats (atomic — avoids read-modify-write race)
            await incrementRideSeat(ride.id);

            // Cancel any pending join requests from this user
            try {
              const joinRequests = await getJoinRequestsForRide(input.rideId);
              for (const jr of joinRequests) {
                if (jr.passengerId === ctx.user.id && jr.status === "pending") {
                  await updateJoinRequest(jr.joinRequestId, { status: "cancelled" } as any);
                }
              }
            } catch (_) { /* join requests may not exist */ }

            // Notify this passenger
            await createNotification({
              notificationId: genId("notif"),
              userId: ctx.user.id,
              type: "ride_cancelled",
              title: "You left the shared ride",
              body: `You've been removed from the ride ${pickupShort} → ${dropoffShort}. No charges applied.`,
              data: { rideId: input.rideId },
            });

            // Notify driver that a passenger left
            if (ride.driverId != null) {
              const user = await getUserById(ctx.user.id);
              await notifyDriverRideCancelled(ride.driverId, {
                rideId: input.rideId,
                pickupAddress: ride.pickupAddress ?? pickupShort,
                dropoffAddress: ride.dropoffAddress ?? dropoffShort,
                reason: `${user?.name ?? "A passenger"} has left the shared ride.`,
              }).catch(() => {});
            }

            // Check if any active passengers remain
            const remainingActive = passengers.filter(
              p => p.passengerId !== ctx.user.id && p.status !== "cancelled"
            );

            await releaseReservedCredits({ userId: ctx.user.id, rideId: ride.id }).catch((e) =>
              logger.warn({ err: e, rideId: input.rideId }, "[cancelRide] Failed to release reserved credits"),
            );

            if (remainingActive.length === 0) {
              // No passengers left — cancel the entire ride and free driver.
              // Atomic: race-safe even if driver tries to start the ride at the
              // same instant.
              const transition = await atomicTransitionRideStep({
                rideId: input.rideId,
                fromSteps: allowedSourceSteps("cancelled"),
                toStep: "cancelled",
                toDbStatus: "cancelled",
                extraSet: {
                  cancelledAt: new Date(),
                  cancelReason: "All passengers cancelled",
                },
              });
              if (!transition.updated) {
                // Already terminal — driver may have completed/cancelled first.
                return { success: true };
              }
              dispatchQueue.cancelDispatch(input.rideId);

              if (ride.driverId != null) {
                try {
                  await upsertDriverSession(ride.driverId, {
                    status: "online",
                    currentRideId: null,
                    lastSeenAt: new Date(),
                  });
                } catch (_) { /* driver session may not exist */ }
              }
            }

            return { success: true };
          }

          // Share ride: non-passenger cannot cancel the whole ride
          throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant in this ride" });
        }

        // ── Solo ride: cancel entire ride (participant only) ──────────────────
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);
        // Atomic conditional update — if the driver completed the ride first,
        // affectedRows will be 0 and we surface a friendly error instead of
        // racing the completion.
        const cancelTransition = await atomicTransitionRideStep({
          rideId: input.rideId,
          fromSteps: allowedSourceSteps("cancelled"),
          toStep: "cancelled",
          toDbStatus: "cancelled",
          extraSet: {
            cancelledAt: new Date(),
            cancelReason: "Cancelled by passenger",
          },
        });
        if (!cancelTransition.updated) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              cancelTransition.reason ??
              "This ride can no longer be cancelled.",
          });
        }

        dispatchQueue.cancelDispatch(input.rideId);

        // Clean up ETA throttle entry
        ETA_THROTTLE.delete(`eta_${input.rideId}`);

        await releaseReservedCredits({ userId: ctx.user.id, rideId: ride.id }).catch((e) =>
          logger.warn({ err: e, rideId: input.rideId }, "[cancelRide] Failed to release reserved credits"),
        );

        await createNotification({
          notificationId: genId("notif"),
          userId: ctx.user.id,
          type: "ride_cancelled",
          title: "Ride cancelled",
          body: `Your ride ${pickupShort} → ${dropoffShort} has been cancelled. No charges applied.`,
          data: { rideId: input.rideId },
        });

        if (ride.driverId != null) {
          await notifyDriverRideCancelled(ride.driverId, {
            rideId: input.rideId,
            pickupAddress: ride.pickupAddress ?? pickupShort,
            dropoffAddress: ride.dropoffAddress ?? dropoffShort,
            reason: `The rider cancelled their trip to ${dropoffShort}.`,
          }).catch(() => {});
          try {
            await upsertDriverSession(ride.driverId, {
              status: "online",
              currentRideId: null,
              lastSeenAt: new Date(),
            });
          } catch (_) { /* driver session may not exist */ }
        }

        return { success: true };
      }),

    completeRide: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        paymentMethod: z.enum(["card", "wallet", "apple_pay", "google_pay"]),
        tipCents: z.number().int().min(0).default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);

        const passengers = await getRidePassengers(ride.id);
        const myPassenger = passengers.find((p) => p.passengerId === ctx.user.id);
        const fareAmount = myPassenger
          ? parseFloat(String(myPassenger.fareShare))
          : parseFloat(String(ride.totalFare));

        // ── Process payment FIRST — fail fast before updating ride state ──
        let stripePayment: Awaited<ReturnType<typeof chargeRideStripe>> | null = null;

        if (input.paymentMethod === "wallet") {
          // Atomic check-and-deduct: a single WHERE-guarded UPDATE prevents
          // concurrent requests from overdrafting the same balance.
          try {
            await deductWalletBalanceAtomic(ctx.user.id, fareAmount);
          } catch {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient wallet balance" });
          }
        } else {
          // Stripe card/apple_pay/google_pay — charge via destination charge (credits applied in chargeRide)
          const fareCents = Math.round(fareAmount * 100) + PLATFORM_FEE_CENTS;
          try {
            stripePayment = await chargeRideStripe({
              rideId: ride.rideId,
              rideDbId: ride.id,
              riderId: ctx.user.id,
              driverId: ride.driverId ?? null,
              fareCents,
              tipCents: input.tipCents ?? 0,
            });
          } catch (e: any) {
            // Payment failed — do NOT mark ride as completed
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: e.message ?? "Payment failed. Please check your payment method and try again.",
            });
          }
        }

        // ── Payment succeeded — ledger is stripe_payments (legacy payments table deprecated) ──
        await createTransaction({
          transactionId: genId("txn"),
          userId: ctx.user.id,
          type: "debit",
          amount: String(fareAmount),
          description: `Ride — ${ride.pickupAddress} → ${ride.dropoffAddress}`,
          relatedRideId: ride.id,
        });

        // Atomic completion — guards against double-completion and against
        // a simultaneous driver-side cancel.
        const completion = await atomicTransitionRideStep({
          rideId: input.rideId,
          fromSteps: allowedSourceSteps("completed"),
          toStep: "completed",
          toDbStatus: "completed",
          extraSet: { completedAt: new Date() },
        });
        if (!completion.updated && completion.ride?.status !== "completed") {
          // Don't throw — payment already succeeded; log and continue so the
          // user still sees their receipt.
          logger.warn({ reason: completion.reason }, "[completeRide rider] atomic transition failed but payment already charged — continuing");
        }
        if (myPassenger) {
          await updateRidePassengerStatus(ride.id, ctx.user.id, "dropped_off");
        }

        // Grant ride credits for shared rides (fire-and-forget — never block payment confirmation)
        if (ride.mode === "share") {
          grantRideCredits({
            userId: ctx.user.id,
            rideId: ride.id,
            fareAmountCents: Math.round(fareAmount * 100),
            isSharedRide: true,
            passengerCount: passengers.length,
            distanceKm: Number(ride.distanceKm ?? 0),
            idempotencyKey: `credit:${ride.id}:${ctx.user.id}`,
          }).catch((e) => logger.warn({ err: e }, "[completeRide] Failed to grant ride credits"));
        }

        return {
          fareAmount,
          stripePaymentId: stripePayment?.paymentId ?? null,
          paymentStatus: stripePayment?.status ?? (input.paymentMethod === "wallet" ? "succeeded" : null),
        };
      }),

    submitRating: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        ratedUserId: z.number(),
        ratingType: z.enum(["passenger", "driver"]),
        score: z.number().min(1).max(5),
        comment: z.string().optional(),
        reportedUnsafeBehavior: z.boolean().default(false),
        categories: z.object({
          driving: z.number().min(1).max(5).optional(),
          cleanliness: z.number().min(1).max(5).optional(),
          communication: z.number().min(1).max(5).optional(),
        }).optional(),
        tags: z.array(z.string()).optional(),
        tipAmount: z.number().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);

        const rating = await submitEnhancedRating({
          ratingId: genId("rate"),
          rideId: ride.id,
          raterId: ctx.user.id,
          ratedUserId: input.ratedUserId,
          ratingType: input.ratingType,
          score: input.score,
          comment: input.comment,
          reportedUnsafeBehavior: input.reportedUnsafeBehavior,
          categories: input.categories,
          tags: input.tags,
          tipAmount: input.tipAmount,
        });

        // Update driver's average rating
        const avg = await getAverageRating(input.ratedUserId);
        await updateUserProfile(input.ratedUserId, { averageRating: String(avg) });

        // Credit tip to driver's wallet and earnings if a tip was given
        if (input.tipAmount && input.tipAmount > 0 && input.ratingType === "driver") {
          const driverId = input.ratedUserId;
          const tipCents = Math.round(input.tipAmount * 100);
          await updateWalletBalance(driverId, input.tipAmount);
          await createTransaction({
            transactionId: genId("txn"),
            userId: driverId,
            type: "credit",
            amount: String(input.tipAmount),
            description: `Tip from ride ${input.rideId}`,
            relatedRideId: ride.id,
          });
          const payment = await db.query.stripePayments.findFirst({
            where: eq(stripePayments.rideId, ride.id),
          });
          if (payment) {
            await db
              .update(stripePayments)
              .set({
                tipCents: sql`${stripePayments.tipCents} + ${tipCents}`,
                driverAmountCents: sql`${stripePayments.driverAmountCents} + ${tipCents}`,
                amountCents: sql`${stripePayments.amountCents} + ${tipCents}`,
              })
              .where(eq(stripePayments.id, payment.id));
          }
          const driverProfile = await getUserProfileByUserId(driverId);
          if (driverProfile) {
            const currentEarnings = parseFloat(String(driverProfile.totalEarnings ?? "0"));
            await updateUserProfile(driverId, {
              totalEarnings: String(currentEarnings + input.tipAmount),
            });
          }
        }

        return rating;
      }),

    applyPromo: protectedProcedure
      .input(z.object({ code: z.string().min(1).max(50).trim(), rideAmount: z.number().positive(), rideId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return applyPromoCode(input.code, ctx.user.id, input.rideId, input.rideAmount);
      }),

    validatePromo: protectedProcedure
      .input(z.object({ code: z.string().min(1).max(50).trim(), rideAmount: z.number().positive() }))
      .query(async ({ input }) => {
        return validatePromoCode(input.code, input.rideAmount);
      }),

    // ── Mid-Ride Join Endpoints ─────────────────────────────────────────────

    /** Search for joinable rides (including in-progress) using route matching */
    searchJoinableRides: protectedProcedure
      .input(z.object({
        pickupLat: z.number(), pickupLng: z.number(),
        dropoffLat: z.number(), dropoffLng: z.number(),
        pickupAddress: z.string().optional(),
        dropoffAddress: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        // Pre-filter with bounding box from DB
        const candidates = await findJoinableSharedRides(
          input.pickupLat, input.pickupLng,
          input.dropoffLat, input.dropoffLng,
        );

        // Exclude user's own rides
        const ownFiltered = candidates.filter(r => r.driverId !== ctx.user.id);

        // Enforce safety mode: only show rides the requester is compatible with
        const requesterProfile = await getUserProfileByUserId(ctx.user.id);
        const filtered = await Promise.all(
          ownFiltered.map(async (ride) => {
            if (!ride.safetyMode || ride.safetyMode === "none") return ride;
            const driverProfile = ride.driverId ? await getUserProfileByUserId(ride.driverId) : null;
            const compatible = isSafetyCompatible(
              ride.safetyMode as string,
              requesterProfile?.gender ?? null,
              driverProfile?.gender ?? null,
            );
            return compatible ? ride : null;
          })
        ).then(results => results.filter((r): r is NonNullable<typeof r> => r !== null));

        // Build RideCandidate list for route matcher
        const rideCandidates: RideCandidate[] = await Promise.all(
          filtered.map(async (ride) => {
            const driverProfile = ride.driverId ? await getUserProfileByUserId(ride.driverId) : null;
            const driverUser = ride.driverId ? await getUserById(ride.driverId) : null;
            return {
              rideId: ride.rideId,
              id: ride.id,
              driverId: ride.driverId,
              pickupLat: Number(ride.pickupLat),
              pickupLng: Number(ride.pickupLng),
              dropoffLat: Number(ride.dropoffLat),
              dropoffLng: Number(ride.dropoffLng),
              pickupAddress: ride.pickupAddress,
              dropoffAddress: ride.dropoffAddress,
              routePolyline: (ride as any).routePolyline ?? null,
              availableSeats: ride.availableSeats ?? 3,
              driverName: driverUser?.name ?? undefined,
            };
          })
        );

        // Score with route matcher
        const joinable = findJoinableRidesAlongRoute(
          { lat: input.pickupLat, lng: input.pickupLng },
          { lat: input.dropoffLat, lng: input.dropoffLng },
          rideCandidates,
        );

        // Calculate fare estimates for each
        const joinerDistKm = haversineKm(
          input.pickupLat, input.pickupLng,
          input.dropoffLat, input.dropoffLng,
        );
        const results = joinable.map((match) => {
          const ride = filtered.find(r => r.rideId === match.rideId)!;
          const fareEstimate = calculateJoinFare({
            originalRideTotalFare: Number(ride.totalFare),
            originalRideDistanceKm: Number(ride.distanceKm),
            joinerDistanceKm: joinerDistKm,
            joinerDurationMinutes: Math.round(joinerDistKm * 2 + 5),
            existingPassengerCount: Math.max(0, ((ride as any).totalSeats ?? 3) - ((ride as any).availableSeats ?? (ride as any).totalSeats ?? 3)),
            detourKm: match.detourKm,
          });

          return {
            ...match,
            status: ride.status,
            rideStep: ride.rideStep,
            estimatedFare: fareEstimate.joinerFare,
            originalPassengerDiscount: fareEstimate.originalPassengerDiscount,
          };
        });

        // Also include simple bounding-box matches (rides without polyline) not caught by route matcher
        const routeMatchedIds = new Set(results.map(r => r.rideId));
        const fallbackMatches = filtered
          .filter(r => !routeMatchedIds.has(r.rideId) && (r.availableSeats ?? 3) > 0)
          .slice(0, 5)
          .map(ride => ({
            rideId: ride.rideId,
            rideDbId: ride.id,
            driverId: ride.driverId,
            pickupDistanceKm: haversineKm(input.pickupLat, input.pickupLng, Number(ride.pickupLat), Number(ride.pickupLng)),
            dropoffDistanceKm: haversineKm(input.dropoffLat, input.dropoffLng, Number(ride.dropoffLat), Number(ride.dropoffLng)),
            detourKm: 0,
            detourMinutes: 0,
            detourPercent: 0,
            compatibilityScore: 50,
            ridePickupAddress: ride.pickupAddress,
            rideDropoffAddress: ride.dropoffAddress,
            availableSeats: ride.availableSeats ?? 3,
            status: ride.status,
            rideStep: ride.rideStep,
            estimatedFare: estimateFare(joinerDistKm, "share"),
            originalPassengerDiscount: 0,
          }));

        return [...results, ...fallbackMatches];
      }),

    /** Request to join an in-progress ride */
    requestMidRideJoin: protectedProcedure
      .input(z.object({
        rideId: z.string().min(1),
        pickupLat: z.number().min(-90).max(90), pickupLng: z.number().min(-180).max(180),
        pickupAddress: z.string().min(1).max(500),
        dropoffLat: z.number().min(-90).max(90), dropoffLng: z.number().min(-180).max(180),
        dropoffAddress: z.string().min(1).max(500),
        distanceKm: z.number().positive().max(500),
        detourKm: z.number().min(0).max(100).optional(),
        detourMinutes: z.number().min(0).max(120).optional(),
        compatibilityScore: z.number().min(0).max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.mode !== "share") throw new TRPCError({ code: "BAD_REQUEST", message: "Can only join shared rides" });

        const joinableStatuses = ["pending", "finding_driver", "searching", "matched", "driver_arrived", "in_progress"];
        if (!joinableStatuses.includes(ride.status))
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is no longer accepting passengers" });
        if ((ride.availableSeats ?? 0) <= 0)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is full" });

        // Check duplicate
        const existing = await getExistingJoinRequest(input.rideId, ctx.user.id);
        if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "You already have a pending request for this ride" });

        const isMidRide = ["driver_arrived", "in_progress"].includes(ride.status);

        // Calculate fare
        const totalSeats = (ride as any).totalSeats ?? 3;
        const availSeats = (ride as any).availableSeats ?? totalSeats;
        const fareResult = calculateJoinFare({
          originalRideTotalFare: Number(ride.totalFare),
          originalRideDistanceKm: Number(ride.distanceKm),
          joinerDistanceKm: input.distanceKm,
          joinerDurationMinutes: Math.round(input.distanceKm * 2 + 5),
          existingPassengerCount: Math.max(0, totalSeats - availSeats),
          detourKm: input.detourKm ?? 0,
        });

        // Fetch original passenger before creating the request to determine approval requirements
        const ridePassengerList = await getRidePassengers(ride.id);
        const originalPassenger = ridePassengerList.find(p => p.isOriginalPassenger);

        const joinRequest = await createJoinRequest({
          joinRequestId: genId("join"),
          rideId: input.rideId,
          passengerId: ctx.user.id,
          status: "pending",
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          distanceKm: String(input.distanceKm),
          fareShare: String(fareResult.joinerFare),
          detourKm: input.detourKm ? String(input.detourKm) : null,
          detourMinutes: input.detourMinutes ?? null,
          compatibilityScore: input.compatibilityScore ?? null,
          isMidRideJoin: isMidRide,
          driverApproval: ride.driverId != null ? "pending" : null,
          creatorApproval: originalPassenger ? "pending" : null,
        } as any);

        // Notify BOTH the ride creator and the assigned driver
        const joinerUser = await getUserById(ctx.user.id);
        const joinerName = joinerUser?.name ?? "A passenger";
        const pickupShort = input.pickupAddress.split(",")[0] || "Nearby";
        const notifPayload = {
          type: "ride_request" as const,
          title: `${joinerName} wants to join your ride!`,
          body: `Pickup: ${pickupShort}. Detour: ~${input.detourMinutes ?? 0} min. Extra: +$${fareResult.joinerFare.toFixed(2)}`,
          data: { rideId: input.rideId, joinRequestId: joinRequest.joinRequestId },
        };

        const notifyIds = new Set<number>();
        if (originalPassenger && originalPassenger.passengerId !== ctx.user.id) {
          notifyIds.add(originalPassenger.passengerId);
        }
        if (ride.driverId != null && ride.driverId !== ctx.user.id) {
          notifyIds.add(ride.driverId);
        }

        for (const uid of notifyIds) {
          const recipientRole = ride.driverId === uid ? "driver" as const : "passenger" as const;
          await notifyUser({
            userId: uid,
            recipientRole,
            type: "ride_request",
            title: notifPayload.title,
            body: notifPayload.body,
            data: { ...notifPayload.data, notificationType: "join_request" },
            deepLink: recipientRole === "driver"
              ? `/driver/(tabs)/requests`
              : `/carpool-detail?rideId=${input.rideId}`,
          });
        }
        // SSE real-time push so web clients immediately see the join request
        if (notifyIds.size > 0) {
          pushRideStatusUpdate(input.rideId, "join_requested", [...notifyIds], {
            joinRequestId: joinRequest.joinRequestId,
            passengerName: joinerName,
          });
        }

        return {
          joinRequest: { ...joinRequest, status: "pending" },
          estimatedFare: fareResult.joinerFare,
          originalPassengerDiscount: fareResult.originalPassengerDiscount,
          autoApproved: false,
        };
      }),

    /** Driver approves a mid-ride join request */
    approveMidRideJoin: protectedProcedure
      .input(z.object({ joinRequestId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const joinReq = await getJoinRequest(input.joinRequestId);
        if (!joinReq) throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });
        if (joinReq.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request already processed" });

        const ride = await getRideByRideId(joinReq.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

        // Allow: assigned driver OR ride creator (original passenger) at any time
        const isDriver = ride.driverId === ctx.user.id;
        const ridePassengerListA = await getRidePassengers(ride.id);
        const origPassengerA = ridePassengerListA.find(p => p.isOriginalPassenger);
        const isCreator = origPassengerA?.passengerId === ctx.user.id;
        if (!(isDriver || isCreator))
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to approve this request" });

        // ── Dual-approval: both driver and creator must approve (new-style requests) ──
        const isDualApproval = (joinReq as any).creatorApproval !== null && (joinReq as any).creatorApproval !== undefined;
        if (isDualApproval) {
          const myApprovalField = isDriver ? "driverApproval" : "creatorApproval";
          const otherApprovalField = isDriver ? "creatorApproval" : "driverApproval";
          const myCurrentApproval = (joinReq as any)[myApprovalField];

          if (myCurrentApproval === "approved")
            throw new TRPCError({ code: "BAD_REQUEST", message: "You already approved this request" });

          // Record this party's approval (status stays "pending" until both approve)
          await updateJoinRequest(input.joinRequestId, { [myApprovalField]: "approved" } as any);

          const otherApproval = (joinReq as any)[otherApprovalField];
          if (otherApproval !== "approved") {
            // Other party hasn't approved yet — notify them and return
            const joinerUser = await getUserById(joinReq.passengerId);
            const joinerName = joinerUser?.name ?? "A passenger";
            const approverLabel = isDriver ? "The driver" : "The ride creator";
            const waitLabel = isDriver ? "ride creator" : "driver";
            const otherPartyId: number | null | undefined = isDriver
              ? origPassengerA?.passengerId
              : ride.driverId;

            if (otherPartyId && otherPartyId !== 0) {
              const notifData = { rideId: joinReq.rideId, joinRequestId: input.joinRequestId };
              await createNotification({
                notificationId: genId("notif"),
                userId: otherPartyId,
                type: "ride_request" as const,
                title: `${joinerName} wants to join — ${approverLabel} approved!`,
                body: `Your approval is also needed to add this passenger. Tap to review.`,
                data: notifData,
              });
              await sendNotification({
                userId: otherPartyId,
                type: "ride_request",
                title: `${joinerName} wants to join — ${approverLabel} approved!`,
                body: `Your approval is also needed to add this passenger. Tap to review.`,
                data: notifData as Record<string, string>,
              }).catch(() => {});
              pushRideStatusUpdate(joinReq.rideId, "join_requested", [otherPartyId], {
                joinRequestId: input.joinRequestId,
                approvedBy: isDriver ? "driver" : "creator",
              });
            }

            // Notify joiner that one party approved, still waiting
            await createNotification({
              notificationId: genId("notif"),
              userId: joinReq.passengerId,
              type: "system" as const,
              title: `${approverLabel} approved your request!`,
              body: `Still waiting for the ${waitLabel} to also approve.`,
              data: { rideId: joinReq.rideId },
            });

            return { success: true, waitingFor: waitLabel, fullyApproved: false };
          }
          // Both parties have approved — fall through to full approval
        }

        // Fast pre-check (non-atomic, for early exit before safety checks)
        if ((ride.availableSeats ?? 0) <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No seats available" });

        // Re-enforce safety mode at approval time (belt-and-suspenders)
        if (ride.safetyMode && ride.safetyMode !== "none") {
          const passengerProfile = await getUserProfileByUserId(joinReq.passengerId);
          const driverProfile = ride.driverId ? await getUserProfileByUserId(ride.driverId) : null;
          const compatible = isSafetyCompatible(
            ride.safetyMode as string,
            passengerProfile?.gender ?? null,
            driverProfile?.gender ?? null,
          );
          if (!compatible) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This passenger does not meet the ride's safety requirements",
            });
          }
        }

        // Atomic seat claim — UPDATE WHERE availableSeats > 0; prevents overbooking race
        const seatClaimed = await decrementRideSeat(ride.id);
        if (!seatClaimed) throw new TRPCError({ code: "BAD_REQUEST", message: "No seats available — ride just filled up" });

        // All critical DB writes that follow the seat decrement are wrapped in a
        // try/catch with a compensating incrementRideSeat on failure. This ensures
        // that a crash between the atomic decrement and the passenger insert can never
        // permanently orphan a decremented seat count.
        try {
          await updateJoinRequest(input.joinRequestId, {
            status: "approved",
            driverApproval: "approved",
            ...((joinReq as any).creatorApproval !== null && (joinReq as any).creatorApproval !== undefined
              ? { creatorApproval: "approved" }
              : {}),
            respondedAt: new Date(),
          } as any);

          await addRidePassenger({
            rideId: ride.id,
            passengerId: joinReq.passengerId,
            pickupLat: joinReq.pickupLat,
            pickupLng: joinReq.pickupLng,
            pickupAddress: joinReq.pickupAddress,
            dropoffLat: joinReq.dropoffLat,
            dropoffLng: joinReq.dropoffLng,
            dropoffAddress: joinReq.dropoffAddress,
            distanceKm: joinReq.distanceKm,
            fareShare: joinReq.fareShare,
            isOriginalPassenger: false,
          } as any);
        } catch (err) {
          // Compensate: restore the seat we decremented
          await incrementRideSeat(ride.id).catch((e) =>
            logger.error({ rideId: ride.id, err: e }, "[approveJoin] Failed to restore seat after failed passenger insert"),
          );
          throw err;
        }

        // Insert stops into the route
        await insertNewPassengerStops(
          ride.id,
          {
            passengerId: joinReq.passengerId,
            pickupLat: Number(joinReq.pickupLat),
            pickupLng: Number(joinReq.pickupLng),
            pickupAddress: joinReq.pickupAddress,
            dropoffLat: Number(joinReq.dropoffLat),
            dropoffLng: Number(joinReq.dropoffLng),
            dropoffAddress: joinReq.dropoffAddress,
          },
          (ride as any).routePolyline ?? null,
          null,
        );

        // Recalculate ETAs for all stops
        try {
          await recalculateETAs(ride.id, Number(ride.pickupLat), Number(ride.pickupLng));
        } catch (_) { /* non-critical */ }

        // Award points
        const existingPassengers = await getRidePassengers(ride.id);
        const originalPassengerIds = existingPassengers
          .filter(p => p.passengerId !== joinReq.passengerId)
          .map(p => p.passengerId);
        await awardMidRideJoinPoints(joinReq.passengerId, originalPassengerIds, ride.driverId, ride.id);

        // Recalculate fare for original passengers
        const fareResult = calculateJoinFare({
          originalRideTotalFare: Number(ride.totalFare),
          originalRideDistanceKm: Number(ride.distanceKm),
          joinerDistanceKm: Number(joinReq.distanceKm),
          joinerDurationMinutes: Math.round(Number(joinReq.distanceKm) * 2 + 5),
          existingPassengerCount: originalPassengerIds.length,
          detourKm: joinReq.detourKm ? Number(joinReq.detourKm) : 0,
        });

        // Persist recalculated fares so payment and refund amounts are correct
        // Guard against division by zero: if somehow no original passengers, fall back to total fare
        const newFarePerOriginalPassenger =
          originalPassengerIds.length > 0
            ? (Number(ride.totalFare) - fareResult.originalPassengerDiscount) / originalPassengerIds.length
            : Number(ride.totalFare);
        await Promise.all([
          // Update each original passenger's fare share in the DB
          ...originalPassengerIds.map((pId) =>
            updateRidePassengerFare(ride.id, pId, Math.max(0, newFarePerOriginalPassenger)).catch((e) => {
              logger.warn({ rideId: ride.id, passengerId: pId, err: e }, "[fare] Failed to update original passenger fare share");
            })
          ),
          // Update joiner's fare share (in case joinReq.fareShare differs from recalculated)
          updateRidePassengerFare(ride.id, joinReq.passengerId, fareResult.joinerFare).catch((e) => {
            logger.warn({ rideId: ride.id, passengerId: joinReq.passengerId, err: e }, "[fare] Failed to update joiner fare share");
          }),
          // Update ride's total fare to reflect new sum
          updateRide(ride.id, {
            totalFare: String(fareResult.joinerFare + (newFarePerOriginalPassenger * originalPassengerIds.length)),
          } as any).catch((e) => {
            logger.warn({ rideId: ride.id, err: e }, "[fare] Failed to update ride total fare");
          }),
        ]);

        // Notify joiner
        const joinerUser = await getUserById(joinReq.passengerId);
        await createNotification({
          notificationId: genId("notif"),
          userId: joinReq.passengerId,
          type: "driver_assigned",
          title: "Join request approved!",
          body: `Your ride request has been approved. Fare: $${Number(joinReq.fareShare).toFixed(2)}. The driver is on their way.`,
          data: { rideId: joinReq.rideId, deepLink: `/carpool-detail?rideId=${joinReq.rideId}` },
          deepLink: `/carpool-detail?rideId=${joinReq.rideId}`,
        });

        // Notify original passengers about discount
        for (const pId of originalPassengerIds) {
          await createNotification({
            notificationId: genId("notif"),
            userId: pId,
            type: "system",
            title: `${joinerUser?.name ?? "A passenger"} joined your ride!`,
            body: `You saved $${fareResult.originalPassengerDiscount.toFixed(2)} off your fare. +${POINTS.MID_RIDE_JOIN_ORIGINAL_PASSENGER} reward points!`,
            data: { rideId: joinReq.rideId },
          });
        }

        return {
          success: true,
          joinerFare: fareResult.joinerFare,
          originalPassengerDiscount: fareResult.originalPassengerDiscount,
          driverEarnings: fareResult.driverEarnings,
        };
      }),

    /** Driver rejects a mid-ride join request */
    rejectMidRideJoin: protectedProcedure
      .input(z.object({
        joinRequestId: z.string(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const joinReq = await getJoinRequest(input.joinRequestId);
        if (!joinReq) throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });

        const ride = await getRideByRideId(joinReq.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

        // Allow: assigned driver OR ride creator (original passenger) at any time
        const isDriverR = ride.driverId === ctx.user.id;
        const ridePassengerListR = await getRidePassengers(ride.id);
        const origPassengerR = ridePassengerListR.find(p => p.isOriginalPassenger);
        const isCreatorR = origPassengerR?.passengerId === ctx.user.id;
        if (!(isDriverR || isCreatorR))
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to reject this request" });

        await updateJoinRequest(input.joinRequestId, {
          status: "rejected",
          driverApproval: "rejected",
          respondedAt: new Date(),
        } as any);

        // Notify joiner
        await createNotification({
          notificationId: genId("notif"),
          userId: joinReq.passengerId,
          type: "system",
          title: "Join request declined",
          body: input.reason || "Your join request was declined. Try searching for other rides.",
          data: { rideId: joinReq.rideId },
        });

        return { success: true };
      }),

    /** Get ordered stops for a ride */
    getRideStops: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) return [];
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);
        const stops = await getOrderedStops(ride.id);
        // Enrich with passenger names
        const enriched = await Promise.all(
          stops.map(async (stop) => {
            const user = await getUserById(stop.passengerId);
            return { ...stop, passengerName: user?.name ?? "Passenger" };
          })
        );
        return enriched;
      }),

    /** Joiner polls for join request status */
    getJoinRequestStatus: protectedProcedure
      .input(z.object({ joinRequestId: z.string() }))
      .query(async ({ ctx, input }) => {
        const joinReq = await getJoinRequest(input.joinRequestId);
        if (!joinReq) throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });
        if (joinReq.passengerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your request" });
        return {
          status: joinReq.status,
          driverApproval: (joinReq as any).driverApproval ?? null,
          rideId: joinReq.rideId,
          fareShare: joinReq.fareShare,
        };
      }),

    /** Initiator (original passenger) polls for incoming join requests on their ride. */
    getIncomingJoinRequests: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) return [];
        const passengers = await getRidePassengers(ride.id);
        const isInitiator = passengers.some(
          (p) => p.passengerId === ctx.user.id && (p as any).isOriginalPassenger,
        );
        const isDriver = ride.driverId === ctx.user.id;
        if (!isInitiator && !isDriver) return [];

        const allRequests = await getJoinRequestsForRide(input.rideId);
        const pending = allRequests.filter((r) => r.status === "pending");

        return Promise.all(
          pending.map(async (req) => {
            const [user, profile] = await Promise.all([
              getUserById(req.passengerId),
              getUserProfileByUserId(req.passengerId),
            ]);
            const name = user?.name ?? "Passenger";
            const initiatorEntry = passengers.find((p) => (p as any).isOriginalPassenger);
            const initiatorFare = Number(initiatorEntry?.fareShare ?? 0);
            return {
              joinRequestId: req.joinRequestId,
              passengerName: name,
              passengerAvatar: name.charAt(0).toUpperCase(),
              passengerRating: Number(profile?.averageRating ?? 4.8),
              passengerTotalRides: Number(profile?.totalRides ?? 0),
              fareShare: Number(req.fareShare ?? 0),
              detourKm: Number((req as any).detourKm ?? 0),
              detourMinutes: Number((req as any).detourMinutes ?? 0),
              pickupAddress: req.pickupAddress,
              dropoffAddress: req.dropoffAddress,
              // How much the initiator saves: joiner's contribution reduces initiator's share
              initiatorSavings: initiatorFare > 0 ? Math.round(initiatorFare * 0.4 * 100) / 100 : Number(req.fareShare ?? 0) * 0.5,
            };
          }),
        );
      }),

    /**
     * Generate a signed share-trip link the passenger can send to anyone.
     *
     * The token encodes {rideId, userId, expiresAt} and is HMAC-SHA256 signed
     * with SHARE_TRIP_SECRET (falls back to SESSION_SECRET).  No DB table
     * required — the link itself is the authoritative token.
     *
     * Recipients can call rides.getSharedTripInfo with the token to see live
     * ride status without logging in.
     */
    generateShareLink: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);

        const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 h
        const payload = `${input.rideId}:${ctx.user.id}:${expiresAt}`;
        const secret =
          process.env.SHARE_TRIP_SECRET ?? process.env.SESSION_SECRET ?? "rideshare-share-secret";
        const sig = crypto
          .createHmac("sha256", secret)
          .update(payload)
          .digest("hex")
          .slice(0, 24); // short enough to embed in a URL
        const token = Buffer.from(`${payload}:${sig}`).toString("base64url");

        const appBase =
          process.env.APP_PUBLIC_URL ?? `https://yoo.app`;
        const shareUrl = `${appBase}/track/${token}`;

        return { shareUrl, token, expiresAt };
      }),

    /**
     * Public (no auth) endpoint that resolves a share token and returns
     * live ride status — safe subset only (no PII beyond first-name).
     */
    getSharedTripInfo: protectedProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        let rideId: string;
        let userId: number;
        let expiresAt: number;

        try {
          const raw = Buffer.from(input.token, "base64url").toString("utf-8");
          const parts = raw.split(":");
          if (parts.length < 4) throw new Error("malformed");
          const [rid, uid, exp, sig] = parts as [string, string, string, string];
          rideId = rid;
          userId = Number(uid);
          expiresAt = Number(exp);

          // Verify signature
          const payload = `${rid}:${uid}:${exp}`;
          const secret =
            process.env.SHARE_TRIP_SECRET ?? process.env.SESSION_SECRET ?? "rideshare-share-secret";
          const expected = crypto
            .createHmac("sha256", secret)
            .update(payload)
            .digest("hex")
            .slice(0, 24);
          if (sig !== expected) throw new Error("invalid signature");
          if (Date.now() > expiresAt) throw new Error("expired");
        } catch (e: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid or expired share link${e?.message ? `: ${e.message}` : ""}`,
          });
        }

        const ride = await getRideByRideId(rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

        const driverUser = ride.driverId ? await getUserById(ride.driverId) : null;
        const driverProfile = ride.driverId
          ? await getUserProfileByUserId(ride.driverId)
          : null;

        return {
          rideId: ride.rideId,
          status: ride.status,
          rideStep: ride.rideStep,
          pickupAddress: ride.pickupAddress,
          dropoffAddress: ride.dropoffAddress,
          pickupLat: Number(ride.pickupLat),
          pickupLng: Number(ride.pickupLng),
          dropoffLat: Number(ride.dropoffLat),
          dropoffLng: Number(ride.dropoffLng),
          estimatedMinutes: ride.estimatedMinutes,
          driver: driverUser
            ? {
                firstName: (driverUser.name ?? "Driver").split(" ")[0],
                rating: Number(driverProfile?.averageRating ?? 5),
                vehicleType: driverProfile?.vehicleType ?? null,
                vehicleColor: driverProfile?.vehicleColor ?? null,
                licensePlate: driverProfile?.licensePlate ?? null,
              }
            : null,
          expiresAt,
        };
      }),
  }),

  // ── WALLET (ride credits — passengers only; drivers use Stripe payouts) ───
  wallet: router({
    /** Ride credit balance (primary passenger wallet). */
    getBalance: protectedProcedure.query(async ({ ctx }) => {
      const balance = await getCreditWalletBalance(ctx.user.id);
      return {
        availableBalanceCents: balance.availableBalance,
        availableBalance: (balance.availableBalance / 100).toFixed(2),
        reservedBalanceCents: balance.reservedBalance,
        totalEarnedCents: balance.totalEarned,
        totalRedeemedCents: balance.totalRedeemed,
        totalExpiredCents: balance.totalExpired,
        activeGrantsCount: balance.activeGrantsCount,
        nextExpiry: balance.nextExpiry,
        isRideCredits: true as const,
      };
    }),

    /** Credit ledger transaction history. */
    getTransactions: protectedProcedure
      .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
      .query(async ({ ctx, input }) => {
        const rows = await getCreditLedger(ctx.user.id, input.limit, input.offset);
        return rows.map((r) => ({
          id: r.id,
          entryType: r.entryType,
          amountCents: r.amountCents,
          balanceAfterCents: r.balanceAfterCents,
          notes: r.notes,
          createdAt: r.createdAt?.toISOString() ?? null,
        }));
      }),

    getActiveGrants: protectedProcedure.query(async ({ ctx }) => {
      const grants = await getActiveGrants(ctx.user.id);
      return grants.map((g) => ({
        grantId: g.grantId,
        amountCents: g.amountCents,
        remainingCents: g.remainingCents,
        reason: g.reason,
        expiresAt: g.expiresAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
      }));
    }),

    previewRedemption: protectedProcedure
      .input(z.object({ fareAmountCents: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return previewCreditRedemption({ userId: ctx.user.id, fareAmountCents: input.fareAmountCents });
      }),

    applyRideCredit: protectedProcedure
      .input(z.object({
        rideId: z.number().int(),
        amountCents: z.number().int().min(0),
        finalize: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.amountCents <= 0) {
          return { success: true, totalReserved: 0, totalApplied: 0 };
        }
        const reserved = await reserveCredits({
          userId: ctx.user.id,
          rideId: input.rideId,
          amountCents: input.amountCents,
          idempotencyKey: `redeem_ride_${input.rideId}_user_${ctx.user.id}`,
        });
        if (input.finalize) {
          const applied = await applyReservedCredits({ userId: ctx.user.id, rideId: input.rideId });
          return { ...reserved, ...applied, success: true };
        }
        return { ...reserved, success: true };
      }),

    releaseRideCredit: protectedProcedure
      .input(z.object({ rideId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return releaseReservedCredits({ userId: ctx.user.id, rideId: input.rideId });
      }),

    addPromoCredit: protectedProcedure
      .input(z.object({ code: z.string().min(2).max(32) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await grantPromoCredit(ctx.user.id, input.code.trim());
        } catch (e) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "Invalid promo code",
          });
        }
      }),

    refundToWallet: protectedProcedure
      .input(z.object({
        rideId: z.number().int(),
        amountCents: z.number().int().positive(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return refundRideCredits({
          userId: ctx.user.id,
          rideDbId: input.rideId,
          amountCents: input.amountCents,
          reason: input.reason,
        });
      }),

    /** Legacy cash wallet — driver earnings only; passengers should use getBalance. */
    get: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getUserProfileByUserId(ctx.user.id);
      if (profile?.isDriver) return getOrCreateWallet(ctx.user.id);
      const credits = await getCreditWalletBalance(ctx.user.id);
      return {
        balance: String(credits.availableBalance / 100),
        isRideCredits: true,
      };
    }),
  }),

  // ── CHAT ──────────────────────────────────────────────────────────────────
  chat: router({
    getMessages: protectedProcedure
      .input(z.object({ rideId: z.number() }))
      .query(async ({ ctx, input }) => {
        const ride = await getRide(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);
        return getRideMessages(input.rideId);
      }),

    sendMessage: protectedProcedure
      .input(z.object({ rideId: z.number(), recipientId: z.number(), message: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRide(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);
        if (!(await isRideParticipant(ride, input.recipientId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Recipient is not a participant in this ride" });
        }
        const saved = await sendChatMessage({
          messageId: genId("msg"),
          rideId: input.rideId,
          senderId: ctx.user.id,
          recipientId: input.recipientId,
          message: input.message,
        });
        const sender = await getUserById(ctx.user.id);
        const senderName = sender?.name ?? "Someone";
        const recipientIsDriver = ride?.driverId === input.recipientId;
        notificationBus.pushToUser(input.recipientId, {
          type: "chat_message",
          rideId: input.rideId,
          messageId: saved.messageId,
          senderId: ctx.user.id,
          message: input.message,
          timestamp: Date.now(),
        });
        void notifyUser({
          userId: input.recipientId,
          recipientRole: recipientIsDriver ? "driver" : "passenger",
          type: "system",
          title: `${senderName} sent a message`,
          body: input.message.length > 120 ? `${input.message.slice(0, 117)}...` : input.message,
          data: {
            rideId: ride?.rideId,
            rideDbId: input.rideId,
            notificationType: "chat_message",
          },
          deepLink: recipientIsDriver
            ? `/driver/driver-chat?rideId=${ride?.rideId ?? input.rideId}`
            : `/active-ride`,
        }).catch(() => {});
        return saved;
      }),

    markRead: protectedProcedure
      .input(z.object({ rideId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRide(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        await assertCanAccessRide(ride, ctx.user.id, ctx.user.role);
        await markMessagesAsRead(input.rideId, ctx.user.id);
        return { success: true };
      }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      const count = await getUnreadMessageCount(ctx.user.id);
      return { count };
    }),

    getUnreadChats: protectedProcedure.query(async ({ ctx }) => {
      const msgs = await getUnreadMessageRides(ctx.user.id);
      // Group by rideId, return latest message per ride
      const byRide = new Map<number, { rideId: number; senderId: number; message: string; createdAt: Date; count: number }>();
      for (const m of msgs) {
        const existing = byRide.get(m.rideId);
        if (existing) {
          existing.count++;
        } else {
          byRide.set(m.rideId, { ...m, count: 1 });
        }
      }
      // Enrich with sender info + string rideId
      const result = await Promise.all(
        Array.from(byRide.values()).map(async (chat) => {
          const sender = await getUserById(chat.senderId);
          const ride = await getRide(chat.rideId);
          return {
            rideId: chat.rideId,
            rideStringId: ride?.rideId ?? "",
            senderName: sender?.name ?? "Unknown",
            senderAvatar: (sender?.name ?? "U").charAt(0).toUpperCase(),
            lastMessage: chat.message,
            unreadCount: chat.count,
            createdAt: chat.createdAt?.toISOString() ?? new Date().toISOString(),
          };
        }),
      );
      return result;
    }),
  }),

  // ── EMERGENCY ─────────────────────────────────────────────────────────────
  emergency: router({
    triggerSOS: protectedProcedure
      .input(z.object({
        rideId: z.number().optional(),
        latitude: z.number(),
        longitude: z.number(),
        alertType: z.enum(["sos", "unsafe_driver", "unsafe_passenger"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // 1. Persist the alert first so we have an audit trail even if any
        //    downstream channel fails.
        const alert = await createEmergencyAlert({
          alertId: genId("sos"),
          userId: ctx.user.id,
          rideId: input.rideId,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          alertType: input.alertType,
          status: "active",
        });

        // 2. Build a Google Maps link the recipient can tap from SMS.
        const mapsLink = `https://www.google.com/maps?q=${input.latitude},${input.longitude}`;
        const user = await getUserById(ctx.user.id);
        const userName = user?.name ?? "A YOO user";

        const summary =
          input.alertType === "sos"
            ? `🚨 ${userName} triggered an SOS during a ride.`
            : input.alertType === "unsafe_driver"
              ? `⚠️ ${userName} reported an unsafe driver.`
              : `⚠️ ${userName} reported an unsafe passenger.`;

        const smsBody = `${summary} Live location: ${mapsLink}`;

        // 3. Notify trusted contacts (phone numbers stored on the profile).
        let contactsNotified: Array<{ name?: string; phone: string; sentAt: string }> = [];
        try {
          const profile = await getUserProfileByUserId(ctx.user.id);
          const rawContacts = (profile?.emergencyContacts ?? []) as Array<{
            name?: string;
            phone?: string;
          }>;
          const E164_RE = /^\+[1-9]\d{7,14}$/;
          const contacts = (Array.isArray(rawContacts) ? rawContacts : []).filter(
            (c) => c && typeof c.phone === "string" && E164_RE.test(c.phone),
          );

          await Promise.all(
            contacts.map(async (c) => {
              try {
                await sendDirectSms(c.phone!, smsBody);
                contactsNotified.push({
                  name: c.name,
                  phone: c.phone!,
                  sentAt: new Date().toISOString(),
                });
              } catch (e) {
                logger.warn({ err: e, phone: c.phone }, "[SOS] failed to SMS contact");
              }
            }),
          );
        } catch (e) {
          logger.warn({ err: e }, "[SOS] could not load emergency contacts");
        }

        // 4. In-app safety alert + SSE push to the user themselves so the
        //    Safety screen reflects the active state instantly.
        try {
          await createNotification({
            notificationId: genId("notif"),
            userId: ctx.user.id,
            type: "safety_alert",
            title: "🚨 SOS sent",
            body: contactsNotified.length
              ? `Emergency contacts notified (${contactsNotified.length}). Stay safe — help is on the way.`
              : "Alert recorded. Add emergency contacts in your profile so we can notify them next time.",
            data: {
              alertId: alert.alertId,
              rideId: input.rideId,
              latitude: input.latitude,
              longitude: input.longitude,
            },
            deepLink: "/emergency-sos",
          });

          await sendNotification({
            userId: ctx.user.id,
            type: "safety_alert",
            title: "🚨 SOS sent",
            body: "Emergency contacts have been alerted with your live location.",
            data: { alertId: alert.alertId },
            deepLink: "/emergency-sos",
          });
        } catch (e) {
          logger.warn({ err: e }, "[SOS] failed to push self-notification");
        }

        // 5. If this SOS is tied to a ride, notify the driver in-app so they
        //    can pull over / respond.
        try {
          if (input.rideId) {
            const ride = await getRide(input.rideId);
            if (ride?.driverId && ride.driverId !== ctx.user.id) {
              await createNotification({
                notificationId: genId("notif"),
                userId: ride.driverId,
                type: "safety_alert",
                title: "🚨 Passenger triggered an SOS",
                body: "Please pull over safely and check on your passenger.",
                data: { rideId: ride.rideId, alertId: alert.alertId },
                deepLink: "/active-ride",
              });
            }
          }
        } catch (e) {
          logger.warn({ err: e }, "[SOS] failed to notify driver");
        }

        // 6. Persist the notified-contacts list on the alert row.
        try {
          await updateEmergencyAlert(alert.alertId, {
            emergencyContactsNotified: contactsNotified as any,
          });
        } catch (e) {
          logger.warn({ err: e }, "[SOS] failed to persist notified-contacts list");
        }

        return {
          ...alert,
          contactsNotified: contactsNotified.length,
        };
      }),

    resolveAlert: protectedProcedure
      .input(z.object({ alertId: z.string() }))
      .mutation(async ({ input }) => {
        return updateEmergencyAlert(input.alertId, { status: "resolved", resolvedAt: new Date() });
      }),
  }),

  // ── DRIVER MODE & ONBOARDING ──────────────────────────────────────────────
  driver: router({

    /** Single source of truth for driver mode access */
    getAccessStatus: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await getDriverAccessStatus(ctx.user.id);
      } catch (err) {
        logger.error({ err, userId: ctx.user.id }, "[driver.getAccessStatus] DB error — returning safe fallback");
        return {
          canAccessDriverMode: false,
          isDriver: false,
          driverStatus: "not_applied" as const,
          applicationId: null,
          isError: true,
        };
      }
    }),

    /**
     * Upload a base64-encoded document (license photo, insurance doc, vehicle photo).
     * Saves to /tmp/uploads/ on the server and returns a local URL for dev.
     * In production, replace with S3/Cloudinary upload.
     */
    uploadDocument: protectedProcedure
      .input(z.object({
        base64: z.string().min(10),
        fileName: z.string().min(1),
        mimeType: z.string().default("image/jpeg"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { createWriteStream, mkdirSync } = await import("fs");
        const { join } = await import("path");
        const uploadDir = join(process.cwd(), "tmp", "uploads");
        try { mkdirSync(uploadDir, { recursive: true }); } catch {}
        const ext = input.mimeType.split("/")[1] ?? "jpg";
        const safeFile = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const unique = `${ctx.user.id}_${Date.now()}_${safeFile}.${ext}`;
        const filePath = join(uploadDir, unique);
        const data = input.base64.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(data, "base64");
        await new Promise<void>((resolve, reject) => {
          const ws = createWriteStream(filePath);
          ws.write(buffer);
          ws.end(() => resolve());
          ws.on("error", reject);
        });
        const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";
        return { url: `${baseUrl}/uploads/${unique}` };
      }),

    saveDraft: protectedProcedure
      .input(z.object({
        fullName: z.string().optional(),
        phoneNumber: z.string().optional(),
        profilePhotoUrl: z.string().optional(),
        licenseNumber: z.string().optional(),
        licenseState: z.string().optional(),
        licenseExpiry: z.string().optional(),
        licenseFrontUrl: z.string().optional(),
        licenseBackUrl: z.string().optional(),
        vehicleMake: z.string().optional(),
        vehicleModel: z.string().optional(),
        vehicleYear: z.string().optional(),
        vehicleColor: z.string().optional(),
        plateNumber: z.string().optional(),
        vehicleType: z.string().optional(),
        vehicleRegistrationUrl: z.string().optional(),
        insurancePolicyNumber: z.string().optional(),
        insuranceProvider: z.string().optional(),
        insuranceExpiry: z.string().optional(),
        insuranceDocUrl: z.string().optional(),
        bankName: z.string().optional(),
        accountLast4: z.string().optional(),
        routingLast4: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await saveDriverApplicationDraft({
          userId: ctx.user.id,
          fields: {
            ...input,
            vehicleYear: input.vehicleYear ? parseInt(input.vehicleYear) : undefined,
            vehicleType: input.vehicleType as any,
          },
        });
        return result;
      }),

    submitOnboarding: protectedProcedure
      .input(z.object({
        fullName: z.string().min(1),
        phoneNumber: z.string().optional(),
        profilePhotoUrl: z.string().optional(),
        licenseNumber: z.string().min(1),
        licenseState: z.string().min(1),
        licenseExpiry: z.string().min(1),
        licenseFrontUrl: z.string().optional(),
        licenseBackUrl: z.string().optional(),
        vehicleMake: z.string().min(1),
        vehicleModel: z.string().min(1),
        vehicleYear: z.string().min(1),
        vehicleColor: z.string().min(1),
        plateNumber: z.string().min(1),
        vehicleType: z.string().min(1),
        vehicleRegistrationUrl: z.string().optional(),
        insurancePolicyNumber: z.string().min(1),
        insuranceProvider: z.string().min(1),
        insuranceExpiry: z.string().min(1),
        insuranceDocUrl: z.string().optional(),
        bankName: z.string().default("Stripe Connect"),
        accountLast4: z.string().default("0000"),
        routingLast4: z.string().default("0000"),
        tosAcceptedAt: z.string().optional(),
        tosVersion: z.string().optional(),
        tosAcceptedIp: z.string().optional(),
        privacyAcceptedAt: z.string().optional(),
        driverAgreementAcceptedAt: z.string().optional(),
        icAgreementAcceptedAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const now = new Date();
        const result = await submitDriverApplication({
          userId: ctx.user.id,
          fullName: input.fullName,
          phoneNumber: input.phoneNumber || "N/A",
          profilePhotoUrl: input.profilePhotoUrl,
          licenseNumber: input.licenseNumber,
          licenseState: input.licenseState,
          licenseExpiry: input.licenseExpiry,
          licenseFrontUrl: input.licenseFrontUrl,
          licenseBackUrl: input.licenseBackUrl,
          vehicleMake: input.vehicleMake,
          vehicleModel: input.vehicleModel,
          vehicleYear: parseInt(input.vehicleYear) || 2020,
          vehicleColor: input.vehicleColor,
          plateNumber: input.plateNumber,
          vehicleType: (input.vehicleType as "sedan" | "suv" | "van" | "truck" | "luxury") || "sedan",
          vehicleRegistrationUrl: input.vehicleRegistrationUrl,
          insurancePolicyNumber: input.insurancePolicyNumber,
          insuranceProvider: input.insuranceProvider,
          insuranceExpiry: input.insuranceExpiry,
          insuranceDocUrl: input.insuranceDocUrl,
          bankName: input.bankName,
          accountLast4: input.accountLast4,
          routingLast4: input.routingLast4,
          tosAcceptedAt: input.tosAcceptedAt ? new Date(input.tosAcceptedAt) : now,
          tosVersion: input.tosVersion || "1.0",
          tosAcceptedIp: input.tosAcceptedIp,
          privacyAcceptedAt: input.privacyAcceptedAt ? new Date(input.privacyAcceptedAt) : now,
          driverAgreementAcceptedAt: input.driverAgreementAcceptedAt ? new Date(input.driverAgreementAcceptedAt) : now,
          icAgreementAcceptedAt: input.icAgreementAcceptedAt ? new Date(input.icAgreementAcceptedAt) : now,
        });

        // Auto-create Stripe Connect account if not already set up
        try {
          const existingAcct = await getConnectedAccount(ctx.user.id);
          if (!existingAcct) {
            await createStripeConnectedAccount(ctx.user.id);
          }
        } catch (e) {
          logger.warn({ err: e }, "[driver-onboarding] Failed to create Stripe Connect account");
        }

        return { success: true, applicationId: result.applicationId, status: result.status };
      }),

    getOnboardingStatus: protectedProcedure
      .query(async ({ ctx }) => {
        return getDriverOnboardingStatus(ctx.user.id);
      }),

    getApplicationStatus: protectedProcedure
      .query(async ({ ctx }) => {
        try {
          const access = await getDriverAccessStatus(ctx.user.id);

          const [app] = await db
            .select()
            .from(driverApplications)
            .where(eq(driverApplications.userId, ctx.user.id))
            .orderBy(desc(driverApplications.createdAt))
            .limit(1);

          if (app) {
            return {
              id: app.id,
              applicationId: app.applicationId,
              status: access.driverStatus === "approved" ? "approved" as const : app.status,
              fullName: app.fullName,
              vehicleMake: app.vehicleMake,
              vehicleModel: app.vehicleModel,
              vehicleYear: app.vehicleYear,
              vehicleColor: app.vehicleColor,
              plateNumber: app.plateNumber,
              licenseExpiry: app.licenseExpiry,
              insuranceExpiry: app.insuranceExpiry,
              vehicleRegistrationUrl: (app as any).vehicleRegistrationUrl ?? null,
              rejectionReason: app.rejectionReason,
              actionRequiredReason: (app as any).actionRequiredReason ?? null,
              createdAt: app.createdAt,
              reviewedAt: app.reviewedAt,
              approvedAt: app.approvedAt,
              rejectedAt: app.rejectedAt,
              actionRequiredAt: (app as any).actionRequiredAt ?? null,
              driverAccess: access,
            };
          }

          if (access.driverStatus === "approved") {
            const profile = await getUserProfileByUserId(ctx.user.id);
            return {
              id: 0,
              applicationId: "legacy",
              status: "approved" as const,
              fullName: null,
              vehicleMake: profile?.vehicleType || null,
              vehicleModel: null,
              vehicleYear: null,
              vehicleColor: profile?.vehicleColor || null,
              plateNumber: profile?.licensePlate || null,
              rejectionReason: null,
              createdAt: new Date(),
              reviewedAt: null,
              approvedAt: new Date(),
              rejectedAt: null,
              driverAccess: access,
            };
          }

          if (access.driverStatus === "suspended") {
            return {
              id: 0,
              applicationId: null,
              status: "rejected" as const,
              fullName: null,
              vehicleMake: null,
              vehicleModel: null,
              vehicleYear: null,
              vehicleColor: null,
              plateNumber: null,
              rejectionReason: access.banReason ?? "Account suspended",
              createdAt: new Date(),
              reviewedAt: null,
              approvedAt: null,
              rejectedAt: new Date(),
              driverAccess: access,
            };
          }

          return null;
        } catch (err) {
          logger.error({ err, userId: ctx.user.id }, "[driver.getApplicationStatus] DB error — returning null");
          return null;
        }
      }),

    /** Go online — driver is available to receive rides */
    goOnline: protectedProcedure
      .input(z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }))
      .mutation(async ({ ctx, input }) => {
        const access = await getDriverAccessStatus(ctx.user.id);
        if (!access.canAccessDriverMode) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: driverAccessDeniedMessage(access),
          });
        }

        await upsertDriverSession(ctx.user.id, {
          status: "online",
          currentLat: String(input.lat),
          currentLng: String(input.lng),
          goOnlineAt: new Date(),
          lastSeenAt: new Date(),
        });
        dispatchQueue.updateDriverLocation(ctx.user.id, input.lat, input.lng);
        logger.debug({ userId: ctx.user.id, lat: input.lat, lng: input.lng }, "[driver] went online");
        return { success: true };
      }),

    /** Go offline */
    goOffline: protectedProcedure.mutation(async ({ ctx }) => {
      const session = await getDriverSession(ctx.user.id);
      let extraMinutes = 0;
      if (session?.goOnlineAt) {
        extraMinutes = Math.max(
          0,
          Math.floor((Date.now() - new Date(session.goOnlineAt).getTime()) / 60_000),
        );
      }
      await upsertDriverSession(ctx.user.id, {
        status: "offline",
        lastSeenAt: new Date(),
        goOnlineAt: null,
        totalOnlineMinutes: (session?.totalOnlineMinutes ?? 0) + extraMinutes,
      } as any);
      return { success: true };
    }),

    /** Send live location (called every ~5s by driver app) */
    updateLocation: protectedProcedure
      .input(z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        rideId: z.string().optional(),
        /** Decoded OSRM route coords [[lng, lat], …] sent by driver app (optional) */
        routeCoords: z.array(z.tuple([z.number(), z.number()])).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // ── Server-side location throttle ────────────────────────────────────
        // Always update dispatch queue (needed for live driver matching).
        dispatchQueue.updateDriverLocation(ctx.user.id, input.lat, input.lng);

        // Only write to DB + broadcast SSE if driver moved >10 m OR >2 s elapsed.
        const throttleKey = `loc_${ctx.user.id}`;
        const prev = LOCATION_THROTTLE.get(throttleKey);

        const distM = prev
          ? haversineKm(prev.lat, prev.lng, input.lat, input.lng) * 1000
          : Infinity;
        const elapsedMs = prev ? Date.now() - prev.ts : Infinity;
        const shouldBroadcast = distM > 10 || elapsedMs > 2000;

        if (!shouldBroadcast) return { throttled: true };

        LOCATION_THROTTLE.set(throttleKey, { lat: input.lat, lng: input.lng, ts: Date.now() });
        await updateDriverLocation(ctx.user.id, input.lat, input.lng);

        if (input.rideId) {
          const ride = await getRideByRideId(input.rideId);
          if (!ride || ride.driverId == null || ride.driverId !== ctx.user.id) {
            return { throttled: true, forbidden: true };
          }
          const passengers = await getRidePassengers(ride.id);
          const passengerIds = passengers.map((p) => p.passengerId);

          // Push live location to all passengers via SSE
          pushRideStatusUpdate(input.rideId, "location_update", passengerIds, {
            driverLat: input.lat,
            driverLng: input.lng,
            driverId: ctx.user.id,
          });

          // ── Route deviation detection ─────────────────────────────────────
          // Only check during in_progress steps; ignore en_route (driver hasn't
          // picked up yet so their approach path may differ from route).
          if (
            ride &&
            (ride.rideStep === "ride_in_progress" || ride.rideStep === "ride_started") &&
            input.routeCoords &&
            input.routeCoords.length > 0
          ) {
            const deviationKey = `dev_${input.rideId}`;
            const lastAlert = DEVIATION_THROTTLE.get(deviationKey) ?? 0;
            // Only fire once per 2 minutes to avoid alert spam
            if (Date.now() - lastAlert > 120_000) {
              const { deviated, minDistanceMeters } = checkRouteDeviation({
                driverLat: input.lat,
                driverLng: input.lng,
                routeCoords: input.routeCoords,
                thresholdMeters: 300,
              });

              if (deviated) {
                DEVIATION_THROTTLE.set(deviationKey, Date.now());

                // Push real-time SSE alert to all passengers
                for (const pid of passengerIds) {
                  pushRideStatusUpdate(input.rideId, "route_deviation", [pid], {
                    driverLat: input.lat,
                    driverLng: input.lng,
                    distanceMeters: Math.round(minDistanceMeters),
                  });
                }

                // Persist in-app notifications in parallel (batch to avoid N+1)
                await Promise.all(passengerIds.map(pid =>
                  createNotification({
                    notificationId: genId("notif"),
                    userId: pid,
                    type: "safety_alert",
                    title: "Driver off route",
                    body: `Your driver has deviated ${Math.round(minDistanceMeters)}m from the planned route. If you feel unsafe, tap the SOS button.`,
                    data: { rideId: input.rideId, driverLat: input.lat, driverLng: input.lng },
                    deepLink: "/active-ride",
                  }).catch(() => { /* non-critical */ })
                ));
              }
            }
          }

          // ── Throttled ETA recalculation (once per 30s per ride) ──────────
          const lastRecalcKey = `eta_${input.rideId}`;
          const lastRecalc = ETA_THROTTLE.get(lastRecalcKey) ?? 0;
          if (Date.now() - lastRecalc > 30_000) {
            ETA_THROTTLE.set(lastRecalcKey, Date.now());
            if (ride) {
              recalculateETAs(ride.id, input.lat, input.lng).catch(() => {});
            }
          }
        }
        return { success: true };
      }),

    /** Driver polls for a pending ride request (every 3s) */
    getPendingRequest: protectedProcedure.query(async ({ ctx }) => {
      // First check in-memory queue (fast path — set by dispatch engine)
      const inMemory = dispatchQueue.getPendingRequestForDriver(ctx.user.id);
      if (inMemory) {
        // Fetch ride for addresses
        const ride = await getRideByRideId(inMemory.rideId);
        return {
          hasRequest: true,
          request: {
            rideId: inMemory.rideId,
            pickupLat: inMemory.pickupLat,
            pickupLng: inMemory.pickupLng,
            dropoffLat: inMemory.dropoffLat,
            dropoffLng: inMemory.dropoffLng,
            pickupAddress: ride?.pickupAddress ?? "",
            dropoffAddress: ride?.dropoffAddress ?? "",
            totalFare: inMemory.totalFare,
            mode: inMemory.mode,
            etaMinutes: inMemory.driver.etaMinutes,
            expiresIn: 30,
          },
        };
      }

      // Fallback: check DB for pending request (e.g. server restart)
      const dbRequest = await getPendingRideRequestForDriver(ctx.user.id);
      if (dbRequest && dbRequest.expiresAt > new Date()) {
        const ride = await getRideByRideId(dbRequest.rideId);
        return {
          hasRequest: true,
          request: {
            rideId: dbRequest.rideId,
            pickupLat: ride ? Number(ride.pickupLat) : 0,
            pickupLng: ride ? Number(ride.pickupLng) : 0,
            dropoffLat: ride ? Number(ride.dropoffLat) : 0,
            dropoffLng: ride ? Number(ride.dropoffLng) : 0,
            pickupAddress: ride?.pickupAddress ?? "",
            dropoffAddress: ride?.dropoffAddress ?? "",
            totalFare: Number(dbRequest.offeredFare),
            mode: (ride?.mode ?? "solo") as "solo" | "share",
            etaMinutes: dbRequest.etaMinutes ?? 5,
            expiresIn: Math.max(0, Math.round((dbRequest.expiresAt.getTime() - Date.now()) / 1000)),
          },
        };
      }

      return { hasRequest: false, request: null };
    }),

    /** Get online drivers near a location (for passenger map view) */
    getOnlineDriversNear: protectedProcedure
      .input(z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: z.number().min(0.1).max(100).default(5),
      }))
      .query(async ({ input }) => {
        const sessions = await getOnlineDriversNear(input.lat, input.lng, input.radiusKm);
        return sessions.map((s: any) => ({
          id: String(s.id),
          sessionId: s.sessionId ?? s.id,
          driverId: s.driverId,
          lat: Number(s.currentLat ?? 0),
          lng: Number(s.currentLng ?? 0),
        }));
      }),

    /** Driver polls nearby ride requests (every 6s while online).
     *  Merges two sources:
     *  1. passengerRequests table — marketplace broadcast requests
     *  2. rides table — bookRide dispatched rides still in finding_driver state (no driver assigned)
     *  Radius: 50 km (matches dispatch engine). */
    getNearbyPassengerRequests: protectedProcedure.query(async ({ ctx }) => {
      const session = await getDriverSession(ctx.user.id);
      if (!session || session.status !== "online" || !session.currentLat || !session.currentLng) {
        return [];
      }

      const driverLat = Number(session.currentLat);
      const driverLng = Number(session.currentLng);
      const radiusKm = 50;
      const latDelta = radiusKm / 111.32;
      const lngDelta = radiusKm / (111.32 * Math.cos((driverLat * Math.PI) / 180));

      // ── Source 1: broadcast marketplace requests ──────────────────────────
      const broadcastRows = await db
        .select()
        .from(passengerRequests)
        .where(
          and(
            eq(passengerRequests.status, "broadcasting"),
            sql`${passengerRequests.expiresAt} > NOW()`,
            sql`${passengerRequests.pickupLat} BETWEEN ${driverLat - latDelta} AND ${driverLat + latDelta}`,
            sql`${passengerRequests.pickupLng} BETWEEN ${driverLng - lngDelta} AND ${driverLng + lngDelta}`,
          ),
        )
        .orderBy(desc(passengerRequests.createdAt))
        .limit(20);

      const filteredBroadcastRows = broadcastRows.filter(
        (r) =>
          r.passengerId !== ctx.user.id &&
          haversineKm(driverLat, driverLng, Number(r.pickupLat), Number(r.pickupLng)) <= radiusKm,
      );

      // ── Source 2: open ride requests waiting for a driver ───────────────
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const dispatchRideRows = await db
        .select()
        .from(rides)
        .where(
          and(
            eq(rides.rideStep, "finding_driver"),
            eq(rides.status, "searching"),
            isNull(rides.driverId),
            sql`${rides.pickupLat} BETWEEN ${driverLat - latDelta} AND ${driverLat + latDelta}`,
            sql`${rides.pickupLng} BETWEEN ${driverLng - lngDelta} AND ${driverLng + lngDelta}`,
            or(
              sql`${rides.departureTime} > NOW()`,
              and(
                sql`${rides.departureTime} IS NULL`,
                sql`${rides.createdAt} >= ${fifteenMinAgo}`,
              ),
            ),
          ),
        )
        .orderBy(desc(rides.createdAt))
        .limit(20);

      const dispatchRideNumericIds = dispatchRideRows.map((r) => r.id);
      const dispatchPaxRows = dispatchRideNumericIds.length > 0
        ? await db
            .select({ rideId: ridePassengers.rideId, passengerId: ridePassengers.passengerId })
            .from(ridePassengers)
            .where(inArray(ridePassengers.rideId, dispatchRideNumericIds))
        : [];

      const dispatchPaxByRide = new Map<number, number>();
      for (const p of dispatchPaxRows) {
        if (!dispatchPaxByRide.has(p.rideId)) {
          dispatchPaxByRide.set(p.rideId, p.passengerId);
        }
      }

      const filteredDispatchRows = dispatchRideRows.filter((r) => {
        if (haversineKm(driverLat, driverLng, Number(r.pickupLat), Number(r.pickupLng)) > radiusKm) {
          return false;
        }
        const paxId = dispatchPaxByRide.get(r.id);
        if (!paxId || paxId === ctx.user.id) return false;
        if (Number(r.totalFare ?? 0) <= 0) return false;
        return true;
      });

      const allPassengerIds = [
        ...new Set([
          ...filteredBroadcastRows.map((r) => r.passengerId),
          ...filteredDispatchRows
            .map((r) => dispatchPaxByRide.get(r.id))
            .filter((id): id is number => id != null),
        ]),
      ];
      const passengerMetaMap = await getPassengerMetaMap(allPassengerIds);

      const broadcastResults = filteredBroadcastRows
        .filter((r) => Number(r.offerPrice) > 0 && r.pickupAddress?.trim() && r.dropoffAddress?.trim())
        .map((r) => {
        const distToPickup =
          Math.round(haversineKm(driverLat, driverLng, Number(r.pickupLat), Number(r.pickupLng)) * 10) / 10;
        const meta = passengerMetaMap.get(r.passengerId);
        return buildDriverFeedRequest({
          requestId: r.requestId,
          passengerId: r.passengerId,
          meta,
          pickupLabel: r.pickupAddress,
          dropoffLabel: r.dropoffAddress,
          pickupLat: Number(r.pickupLat),
          pickupLng: Number(r.pickupLng),
          dropoffLat: Number(r.dropoffLat),
          dropoffLng: Number(r.dropoffLng),
          passengerCount: r.passengerCount,
          tripDistanceKm: r.distanceKm != null ? Number(r.distanceKm) : 0,
          estimatedTripMinutes: r.estimatedMinutes ?? 0,
          offeredFare: Number(r.offerPrice),
          distanceToPickupKm: distToPickup,
          scheduledAt: null,
          isImmediate: true,
          rideType: inferRideType(null, r.passengerCount),
          status: r.status,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          source: "broadcast",
        });
      });

      const dispatchResults = filteredDispatchRows.map((r) => {
        const passengerId = dispatchPaxByRide.get(r.id) ?? 0;
        const distToPickup =
          Math.round(haversineKm(driverLat, driverLng, Number(r.pickupLat), Number(r.pickupLng)) * 10) / 10;
        const expiresAt = r.departureTime
          ? new Date(r.departureTime)
          : new Date(new Date(r.createdAt).getTime() + 15 * 60 * 1000);
        const scheduled = isScheduledPickup(r.departureTime, r.createdAt);
        const meta = passengerId ? passengerMetaMap.get(passengerId) : undefined;
        return buildDriverFeedRequest({
          requestId: r.rideId,
          rideId: r.rideId,
          passengerId,
          meta,
          pickupLabel: r.pickupAddress,
          dropoffLabel: r.dropoffAddress,
          pickupLat: Number(r.pickupLat),
          pickupLng: Number(r.pickupLng),
          dropoffLat: Number(r.dropoffLat),
          dropoffLng: Number(r.dropoffLng),
          passengerCount: r.totalSeats ?? 1,
          tripDistanceKm: Number(r.distanceKm),
          estimatedTripMinutes: r.estimatedMinutes,
          offeredFare: Number(r.totalFare),
          distanceToPickupKm: distToPickup,
          scheduledAt: r.departureTime,
          isImmediate: !scheduled,
          rideType: inferRideType(r.mode, r.totalSeats ?? 1),
          rideSafetyMode: r.safetyMode,
          paymentType: r.stripePaymentIntentId ? "card" : undefined,
          status: r.status,
          createdAt: r.createdAt,
          expiresAt,
          source: "dispatch",
        });
      });

      const seen = new Set<string>();
      const merged = [...dispatchResults, ...broadcastResults].filter((r) => {
        if (seen.has(r.requestId)) return false;
        seen.add(r.requestId);
        return true;
      });

      return merged
        .filter(isValidFeedRequest)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }),

    /** Driver accepts incoming ride request */
    acceptRide: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Verify driver has a payment-ready Stripe Connect account.
        // Only enforced in production — dev/test environments skip this so
        // engineers can test the full ride flow without completing Stripe onboarding.
        if (ENV.isProduction && ENV.stripeSecretKey) {
          const driverConnectAcct = await getConnectedAccount(ctx.user.id);
          if (!driverConnectAcct?.chargesEnabled) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Your payout account is not set up. Please complete Stripe onboarding in your driver settings before accepting rides.",
            });
          }
        }

        // Accept from in-memory dispatch queue first
        const result = dispatchQueue.acceptRide(ctx.user.id);
        if (result && result.rideId !== input.rideId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride request mismatch" });
        }

        const existing = await getRideByRideId(input.rideId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

        const existingPassengers = await getRidePassengers(existing.id);
        if (existingPassengers.some((p) => p.passengerId === ctx.user.id)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot accept your own ride request.",
          });
        }

        // Atomic claim: only succeeds if the ride is still in finding_driver.
        // If two drivers race, exactly one wins; the other gets a clean error.
        const timestamps = getTimestampsForStep("driver_en_route");
        const claim = await atomicTransitionRideStep({
          rideId: input.rideId,
          fromSteps: ["finding_driver"],
          toStep: "driver_en_route",
          toDbStatus: STEP_TO_DB_STATUS["driver_en_route"],
          extraSet: {
            driverId: ctx.user.id,
            driverAssignedAt: new Date(),
            ...timestamps,
          },
        });
        if (!claim.updated || !claim.ride) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              claim.reason ?? "Ride is no longer available to accept.",
          });
        }
        const ride = claim.ride;

        await upsertDriverSession(ctx.user.id, {
          status: "on_ride",
          currentRideId: input.rideId,
          lastSeenAt: new Date(),
        });

        // Update DB ride request
        await updateRideRequest(input.rideId, ctx.user.id, "accepted");

        // Notify passengers with real driver info
        const passengers = await getRidePassengers(ride.id);
        const driverUser = await getUserById(ctx.user.id);
        const driverProfile = await getUserProfileByUserId(ctx.user.id);
        const driverName = driverUser?.name ?? "Your driver";
        const vehicleInfo = driverProfile?.vehicleType
          ? `${driverProfile.vehicleColor ?? ""} ${driverProfile.vehicleType}`.trim()
          : "vehicle";
        const licensePlate = driverProfile?.licensePlate ?? "";
        const pickupShort = (ride.pickupAddress || "").split(",")[0] || "Pickup";
        const dropoffShort = (ride.dropoffAddress || "").split(",")[0] || "Destination";

        for (const p of passengers) {
          await notifyUser({
            userId: p.passengerId,
            recipientRole: "passenger",
            type: "driver_assigned",
            title: `${driverName} is on the way!`,
            body: `Your driver is heading to ${pickupShort} in a ${vehicleInfo}${licensePlate ? ` (${licensePlate})` : ""}. ETA ~5 min.`,
            data: { rideId: input.rideId, driverId: ctx.user.id },
            deepLink: "/active-ride",
          });
        }

        pushRideStatusUpdate(input.rideId, "driver_en_route",
          passengers.map((p) => p.passengerId),
          { driverId: ctx.user.id },
        );

        return { success: true, rideId: input.rideId };
      }),

    /** Driver declines incoming ride request */
    declineRide: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        dispatchQueue.declineRide(ctx.user.id);
        await updateRideRequest(input.rideId, ctx.user.id, "declined");
        return { success: true };
      }),

    /**
     * Driver cancels after accepting (before trip starts).
     * Resets the ride to finding_driver and re-dispatches to remaining nearby drivers.
     * Passengers stay on active-ride and see "Searching for a driver..." automatically.
     */
    driverCancelRide: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.driverId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not the driver of this ride" });
        }

        // Only allowed before the trip has started — not during or after
        const cancelableSteps = ["driver_en_route", "driver_arrived"] as const;
        if (!cancelableSteps.includes(ride.rideStep as typeof cancelableSteps[number])) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot cancel: ride has already started or is not yet assigned to you",
          });
        }

        // Atomic reset: finding_driver + driverId = NULL (unassigned)
        const reset = await atomicTransitionRideStep({
          rideId: input.rideId,
          fromSteps: cancelableSteps,
          toStep: "finding_driver",
          toDbStatus: "searching",
          expectedDriverId: ctx.user.id,
          extraSet: {
            driverId: null,
            driverAssignedAt: null,
          },
        });

        if (!reset.updated) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: reset.reason ?? "Ride state changed — cannot cancel now",
          });
        }

        // Free the driver back to available
        try {
          await upsertDriverSession(ctx.user.id, {
            status: "online",
            currentRideId: null,
            lastSeenAt: new Date(),
          });
        } catch (_) { /* session may not exist */ }

        // Notify passengers and push real-time update so active-ride shows finding_driver
        const passengers = await getRidePassengers(reset.ride!.id);
        for (const p of passengers) {
          await createNotification({
            notificationId: genId("notif"),
            userId: p.passengerId,
            type: "ride_request",
            title: "Driver cancelled — finding a new one",
            body: "Your previous driver cancelled. We're searching for a new driver now.",
            data: { rideId: input.rideId },
            deepLink: "/active-ride",
          });
        }

        pushRideStatusUpdate(
          input.rideId,
          "finding_driver",
          passengers.map((p) => p.passengerId),
          {},
        );

        // Re-dispatch to fresh candidate list, excluding the driver who just cancelled
        const pickupLat = Number(ride.pickupLat);
        const pickupLng = Number(ride.pickupLng);
        const dropoffLat = Number(ride.dropoffLat);
        const dropoffLng = Number(ride.dropoffLng);
        const cancelledDriverId = ctx.user.id;

        setImmediate(async () => {
          try {
            const nearbySessions = await getOnlineDriversNear(pickupLat, pickupLng, 50);
            const memDrivers = dispatchQueue.getDriversNear(pickupLat, pickupLng, 50);
            const sessionDriverIds = new Set(nearbySessions.map((s) => s.driverId));
            const extraMemDrivers = memDrivers.filter((d) => !sessionDriverIds.has(d.driverId));

            const candidates: DriverCandidate[] = nearbySessions
              .filter((s) => s.driverId !== cancelledDriverId)
              .map((s) => {
                const memLoc = dispatchQueue.getDriverLocation(s.driverId);
                const dLat = memLoc?.lat ?? Number(s.currentLat);
                const dLng = memLoc?.lng ?? Number(s.currentLng);
                const distKm = haversineKm(pickupLat, pickupLng, dLat, dLng);
                return {
                  driverId: s.driverId,
                  lat: dLat,
                  lng: dLng,
                  rating: Number(s.averageRating ?? 5.0),
                  acceptanceRate: Number(s.acceptanceRate ?? 100),
                  distanceKm: distKm,
                  etaMinutes: Math.ceil((distKm / 30) * 60),
                  gender: undefined,
                };
              });

            for (const md of extraMemDrivers.filter((d) => d.driverId !== cancelledDriverId)) {
              const distKm = haversineKm(pickupLat, pickupLng, md.lat, md.lng);
              candidates.push({
                driverId: md.driverId,
                lat: md.lat,
                lng: md.lng,
                rating: 5.0,
                acceptanceRate: 100,
                distanceKm: distKm,
                etaMinutes: Math.ceil((distKm / 30) * 60),
                gender: undefined,
              });
            }

            if (candidates.length === 0) {
              logger.warn({ rideId: input.rideId }, "[driverCancelRide] no drivers available for re-dispatch");
              return;
            }

            const sorted = dispatchQueue.sortCandidates(candidates, 50);
            dispatchQueue.startDispatch({
              rideId: input.rideId,
              passengerId: passengers[0]?.passengerId ?? 0,
              pickupLat,
              pickupLng,
              dropoffLat,
              dropoffLng,
              totalFare: Number(ride.totalFare),
              mode: (ride.mode as "solo" | "share") ?? "solo",
              safetyMode: ride.safetyMode ?? undefined,
              candidates: sorted,
            });

            logger.info({ rideId: input.rideId, candidates: sorted.length }, "[driverCancelRide] re-dispatched to new candidates");
          } catch (err) {
            logger.error({ err, rideId: input.rideId }, "[driverCancelRide] re-dispatch error");
          }
        });

        return { success: true };
      }),

    /** Driver marks arrival at pickup location */
    arriveAtPickup: driverProcedure
      .input(z.object({
        rideId: z.string(),
        passengerId: z.number().optional(), // scoped notification target (sequential node system)
      }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getRideByRideId(input.rideId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (existing.driverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your ride" });

        // Always do the global state transition — the state machine requires
        // driver_arrived before ride_started can be called.
        const timestamps = getTimestampsForStep("driver_arrived");
        const transition = await atomicTransitionRideStep({
          rideId: input.rideId,
          fromSteps: allowedSourceSteps("driver_arrived"),
          toStep: "driver_arrived",
          toDbStatus: STEP_TO_DB_STATUS["driver_arrived"],
          expectedDriverId: ctx.user.id,
          extraSet: timestamps,
        });
        if (!transition.updated || !transition.ride) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: transition.reason ?? "Cannot mark arrival in current state.",
          });
        }
        const ride = transition.ride;

        // Sequential node: persist which passenger is the current arrival target.
        // DB is the reliable source of truth; Redis is a fast-write cache for the current poll cycle.
        if (input.passengerId) {
          await updateRide(ride.id, { arrivalTargetPassengerId: input.passengerId } as any);
          try {
            if (await isRedisAvailable()) {
              await redis.set(`arrival_target:${input.rideId}`, String(input.passengerId), "EX", 600);
            }
          } catch { /* non-fatal */ }
        }

        const arrDriverUser = await getUserById(ctx.user.id);
        const arrDriverProfile = await getUserProfileByUserId(ctx.user.id);
        const arrDriverName = arrDriverUser?.name ?? "Your driver";
        const arrVehicle = arrDriverProfile?.vehicleType
          ? `${arrDriverProfile.vehicleColor ?? ""} ${arrDriverProfile.vehicleType}`.trim()
          : "the vehicle";

        const passengers = await getRidePassengers(ride.id);

        // Sequential node: only notify the targeted passenger of arrival.
        // Other passengers get a softer "picking up someone else first" note.
        const notifyTargets = input.passengerId
          ? passengers.filter((p) => p.passengerId === input.passengerId)
          : passengers;
        const waitingOthers = input.passengerId
          ? passengers.filter((p) => p.passengerId !== input.passengerId)
          : [];

        for (const p of notifyTargets) {
          await createNotification({
            notificationId: genId("notif"),
            userId: p.passengerId,
            type: "driver_arrived",
            title: `${arrDriverName} has arrived!`,
            body: `Your driver is waiting at the pickup in a ${arrVehicle}. Head out now!`,
            data: { rideId: input.rideId },
            deepLink: "/active-ride",
          });
          await sendNotification({
            userId: p.passengerId,
            type: "driver_arrived",
            title: `${arrDriverName} has arrived!`,
            body: `Your driver is waiting at the pickup. Head out now!`,
            data: { rideId: input.rideId },
            sendSms: true,
          });
        }
        for (const p of waitingOthers) {
          await createNotification({
            notificationId: genId("notif"),
            userId: p.passengerId,
            type: "system",
            title: "Driver is picking up another passenger first",
            body: `${arrDriverName} is collecting another rider — you're up next!`,
            data: { rideId: input.rideId },
            deepLink: "/active-ride",
          });
        }

        pushRideStatusUpdate(input.rideId, "driver_arrived",
          notifyTargets.map((p) => p.passengerId),
        );

        return { success: true };
      }),

    /**
     * Driver has arrived at a SUBSEQUENT passenger's pickup stop (index > 0 in the
     * sequential node system).  Unlike arriveAtPickup this does NOT perform a global
     * state-machine transition — the ride is already ride_in_progress at this point.
     * It reliably sets arrivalTargetPassengerId so the client useEffect can reflect
     * the arrived state, and optionally marks the stop record as reached.
     */
    arrivedForPassenger: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        passengerId: z.number(),
        stopId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.driverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your ride" });

        if (ride.rideStep !== "ride_in_progress") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Ride must be in progress for subsequent pickups. Current step: ${ride.rideStep ?? "unknown"}`,
          });
        }

        // Primary goal: persist arrival target so passengers and driver UI sync correctly
        await updateRide(ride.id, { arrivalTargetPassengerId: input.passengerId } as any);
        try {
          if (await isRedisAvailable()) {
            await redis.set(`arrival_target:${input.rideId}`, String(input.passengerId), "EX", 600);
          }
        } catch { /* non-fatal */ }

        // Secondary: mark stop record reached if the stop exists (purely for route tracking)
        if (input.stopId) {
          try {
            await markStopReachedService(ride.id, input.stopId);
          } catch (e) {
            logger.warn({ err: e }, "[arrivedForPassenger] stop mark failed (non-fatal)");
          }
        }

        const driverUser = await getUserById(ctx.user.id);
        const driverProfile = await getUserProfileByUserId(ctx.user.id);
        const driverName = driverUser?.name ?? "Your driver";
        const vehicle = driverProfile?.vehicleType
          ? `${driverProfile.vehicleColor ?? ""} ${driverProfile.vehicleType}`.trim()
          : "the vehicle";

        await createNotification({
          notificationId: genId("notif"),
          userId: input.passengerId,
          type: "driver_arrived",
          title: `${driverName} has arrived!`,
          body: `Your driver is waiting at your pickup in a ${vehicle}. Head out now!`,
          data: { rideId: input.rideId },
          deepLink: "/active-ride",
        });

        await sendNotification({
          userId: input.passengerId,
          type: "driver_arrived",
          title: `${driverName} has arrived!`,
          body: `Your driver is waiting at your pickup. Head out now!`,
          data: { rideId: input.rideId },
          sendSms: true,
        });

        pushRideStatusUpdate(input.rideId, "driver_arrived", [input.passengerId]);

        return { success: true };
      }),

    /** Driver starts the ride (passengers confirmed onboard) */
    startRide: driverProcedure
      .input(z.object({
        rideId: z.string(),
        passengerId: z.number().optional(), // scoped to one passenger (sequential node system)
      }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getRideByRideId(input.rideId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (existing.driverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your ride" });

        // Step 1: driver_arrived → ride_started (passengers confirmed on board)
        const startTimestamps = getTimestampsForStep("ride_started");
        const transition = await atomicTransitionRideStep({
          rideId: input.rideId,
          fromSteps: allowedSourceSteps("ride_started"), // ["driver_arrived"]
          toStep: "ride_started",
          toDbStatus: STEP_TO_DB_STATUS["ride_started"],
          expectedDriverId: ctx.user.id,
          extraSet: startTimestamps,
        });
        if (!transition.updated || !transition.ride) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: transition.reason ?? "Cannot start ride in current state.",
          });
        }

        // Step 2: ride_started → ride_in_progress (immediately — no driver action needed)
        const inProgressTransition = await atomicTransitionRideStep({
          rideId: input.rideId,
          fromSteps: ["ride_started"],
          toStep: "ride_in_progress",
          toDbStatus: STEP_TO_DB_STATUS["ride_in_progress"],
          expectedDriverId: ctx.user.id,
          extraSet: {},
        });
        // Use in-progress ride if available, otherwise use ride_started ride
        const ride = (inProgressTransition.updated && inProgressTransition.ride)
          ? inProgressTransition.ride
          : transition.ride;

        const allPassengers = await getRidePassengers(ride.id);
        // Filter out cancelled passengers
        const passengers = allPassengers.filter(p => p.status !== "cancelled");
        // Sequential node system: scope status updates and notifications to one passenger
        const targetPassengers = input.passengerId
          ? passengers.filter(p => p.passengerId === input.passengerId)
          : passengers;

        // Initialize stops for multi-passenger tracking (always for all passengers)
        if (passengers.length > 0) {
          try {
            await initializeStopsForRide(
              ride.id,
              passengers.map(p => ({
                passengerId: p.passengerId,
                pickupLat: Number(p.pickupLat),
                pickupLng: Number(p.pickupLng),
                pickupAddress: p.pickupAddress,
                dropoffLat: Number(p.dropoffLat),
                dropoffLng: Number(p.dropoffLng),
                dropoffAddress: p.dropoffAddress,
              })),
              (ride as any).routePolyline ?? null,
            );
            // Set initial ETAs based on driver location
            await recalculateETAs(ride.id, Number(ride.pickupLat), Number(ride.pickupLng));
          } catch (e) {
            logger.warn({ err: e }, "[startRide] Failed to initialize stops");
          }
        }

        // Clear sequential-arrival target — first passenger has boarded
        await updateRide(ride.id, { arrivalTargetPassengerId: null } as any);
        try {
          if (await isRedisAvailable()) await redis.del(`arrival_target:${input.rideId}`);
        } catch { /* non-fatal */ }

        const driverUser = await getUserById(ctx.user.id);
        for (const p of targetPassengers) {
          await updateRidePassengerStatus(ride.id, p.passengerId, "picked_up");

          // Notify only the targeted passenger that their leg has started
          const dropoffShort = (p.dropoffAddress || ride.dropoffAddress || "").split(",")[0] || "Destination";
          await createNotification({
            notificationId: genId("notif"),
            userId: p.passengerId,
            type: "ride_started",
            title: "Your ride has started!",
            body: `${driverUser?.name ?? "Your driver"} is taking you to ${dropoffShort}. Enjoy the ride!`,
            data: { rideId: input.rideId },
            deepLink: "/active-ride",
          });
        }

        // Mark each boarded passenger's pickup stop as reached
        try {
          const allStops = await getOrderedStops(ride.id);
          for (const p of targetPassengers) {
            const pickupStop = allStops.find(
              (s: any) => s.passengerId === p.passengerId && s.stopType === "pickup" && s.status !== "reached",
            );
            if (pickupStop) await markStopReachedService(ride.id, pickupStop.id);
          }
        } catch (e) {
          logger.warn({ err: e }, "[startRide] Failed to mark pickup stops reached");
        }

        pushRideStatusUpdate(input.rideId, "ride_started",
          targetPassengers.map((p) => p.passengerId),
          { driverId: ctx.user.id },
        );

        return { success: true };
      }),

    /** Driver completes the ride */
    completeRide: driverProcedure
      .input(z.object({ rideId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getRideByRideId(input.rideId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (existing.driverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your ride" });

        if (existing.status === "completed") return { success: true };

        const timestamps = getTimestampsForStep("completed");
        const transition = await atomicTransitionRideStep({
          rideId: input.rideId,
          fromSteps: allowedSourceSteps("completed"),
          toStep: "completed",
          toDbStatus: "completed",
          expectedDriverId: ctx.user.id,
          extraSet: timestamps,
        });
        if (!transition.updated || !transition.ride) {
          // If passenger cancelled at the same instant, treat as already-done
          // when terminal so we don't double-charge or double-credit.
          const fresh = transition.ride;
          if (fresh && fresh.status === "completed") {
            return { success: true };
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: transition.reason ?? "Cannot complete ride in current state.",
          });
        }
        const ride = transition.ride;

        // Clean up ETA throttle entry + dispatch queue for this ride
        ETA_THROTTLE.delete(`eta_${input.rideId}`);
        dispatchQueue.cleanupRide(input.rideId);

        const allPassengers = await getRidePassengers(ride.id);
        // Filter out cancelled and already dropped-off passengers — only process active ones
        const passengers = allPassengers.filter(p => p.status !== "cancelled" && p.status !== "dropped_off");

        // Charge each active passenger (credits applied in chargeRide)
        if (ride.driverId != null) {
          for (const p of passengers) {
            const fareCents = Math.round(Number(p.fareShare) * 100) + PLATFORM_FEE_CENTS;
            try {
              await chargeRideStripe({
                rideId: ride.rideId,
                rideDbId: ride.id,
                riderId: p.passengerId,
                driverId: ride.driverId,
                fareCents,
                tipCents: 0,
              });
            } catch (e) {
              logger.warn(
                { err: e, passengerId: p.passengerId, rideId: input.rideId },
                "[completeRide] Passenger charge failed — driver still credited",
              );
            }
          }
        }

        // For shared rides, compute fare from active (non-cancelled) passengers' fare shares
        // so the driver isn't credited for passengers who cancelled mid-ride
        const activeForFare = allPassengers.filter(p => p.status !== "cancelled");
        const fare = ride.mode === "share" && activeForFare.length > 0
          ? activeForFare.reduce((sum, p) => sum + Number(p.fareShare), 0)
          : Number(ride.totalFare);

        // Credit driver 80% earnings
        const driverEarnings = Math.round(fare * 0.80 * 100) / 100;
        try {
          await updateWalletBalance(ctx.user.id, driverEarnings);
          await createTransaction({
            transactionId: genId("txn"),
            userId: ctx.user.id,
            type: "credit",
            amount: String(driverEarnings),
            description: `Earnings: ${ride.pickupAddress} → ${ride.dropoffAddress}`,
            relatedRideId: ride.id,
          });
        } catch (e) {
          logger.warn({ err: e }, "[completeRide] Failed to credit driver earnings");
        }

        // Update driver session counters
        const driverSession = await getDriverSession(ctx.user.id);
        const prevTodayRides = driverSession?.todayRides ?? 0;
        const prevTodayEarnings = driverSession?.todayEarnings
          ? Number(driverSession.todayEarnings)
          : 0;
        await upsertDriverSession(ctx.user.id, {
          status: "online",
          currentRideId: null,
          lastSeenAt: new Date(),
          todayRides: prevTodayRides + 1,
          todayEarnings: String(Math.round((prevTodayEarnings + driverEarnings) * 100) / 100),
        } as any);

        // Notify active passengers — prompt them to rate
        for (const p of passengers) {
          try {
            await updateRidePassengerStatus(ride.id, p.passengerId, "dropped_off");
            const notif = buildNotification("ride_completed", {
              fare: fare.toFixed(2),
            });
            await createNotification({
              notificationId: genId("notif"),
              userId: p.passengerId,
              type: "ride_completed",
              title: notif.title,
              body: notif.body,
              data: { rideId: input.rideId, driverId: ctx.user.id },
              deepLink: notif.deepLink,
            });
            // Also request rating — include driver info so the rate screen pre-fills
            const driverUserForRating = await getUserById(ctx.user.id);
            const driverNameForRating = encodeURIComponent(driverUserForRating?.name ?? "Driver");
            await createNotification({
              notificationId: genId("notif"),
              userId: p.passengerId,
              type: "rating_request",
              title: "Rate your ride",
              body: `How was your experience?`,
              data: { rideId: input.rideId, driverId: ctx.user.id },
              deepLink: `/rate-ride-v2?rideId=${input.rideId}&driverId=${ctx.user.id}&driverName=${driverNameForRating}&fare=${fare.toFixed(2)}`,
            });
          } catch (e) {
            logger.warn({ err: e, passengerId: p.passengerId }, "[completeRide] Failed to notify passenger");
          }
        }

        // Notify driver about earnings
        const pickupAddr = (ride.pickupAddress || "").split(",")[0] || "Pickup";
        const dropoffAddr = (ride.dropoffAddress || "").split(",")[0] || "Destination";
        await notifyUser({
          userId: ctx.user.id,
          recipientRole: "driver",
          type: "payment_received",
          title: `Ride completed — $${driverEarnings.toFixed(2)} earned!`,
          body: `${pickupAddr} → ${dropoffAddr}. Earnings credited to your wallet.`,
          data: { rideId: input.rideId, notificationType: "earnings_update" },
          deepLink: "/driver/(tabs)/earnings",
        });

        pushRideStatusUpdate(input.rideId, "completed",
          allPassengers.map((p) => p.passengerId),
          { driverEarnings },
        );

        // Award shared ride completion points
        if (ride.mode === "share" && passengers.length > 0) {
          try {
            await awardSharedRideCompletionPoints(
              passengers.map(p => p.passengerId),
              ctx.user.id,
              ride.id,
            );
          } catch (e) {
            logger.warn({ err: e }, "[completeRide] Failed to award completion points");
          }
        }

        return { success: true, earnings: driverEarnings };
      }),

    /** Get driver earnings for a period */
    getEarnings: protectedProcedure
      .input(z.object({ range: z.enum(["today", "week", "month", "all_time"]).default("week") }))
      .query(async ({ ctx, input }) => {
        if (input.range === "all_time") {
          return getDriverEarningsDetail(ctx.user.id, "all_time");
        }
        const period = input.range as "today" | "week" | "month";
        const detail = await getDriverEarningsDetail(ctx.user.id, period);
        const completedRides = await getDriverEarnings(ctx.user.id, period);
        return {
          ...detail,
          rides: completedRides.map((r) => ({
            id: r.id,
            rideId: r.rideId,
            pickupAddress: r.pickupAddress,
            dropoffAddress: r.dropoffAddress,
            totalFare: r.totalFare,
            completedAt: r.completedAt,
            distanceKm: r.distanceKm,
          })),
        };
      }),

    /** Get driver earnings summary across periods */
    getEarningsSummary: protectedProcedure.query(async ({ ctx }) => {
      return getDriverEarningsSummary(ctx.user.id);
    }),

    /**
     * Hourly earnings heatmap: returns avg earnings and ride count per hour-of-day
     * based on the driver's last 30 days of completed rides.
     * Each slot: { hour: 0–23, avgEarnings: number, rideCount: number }
     */
    getHourlyEarningsForecast: protectedProcedure.query(async ({ ctx }) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const completed = await db
        .select({ totalFare: rides.totalFare, completedAt: rides.completedAt })
        .from(rides)
        .where(
          sql`${rides.driverId} = ${ctx.user.id}
              AND ${rides.status} = 'completed'
              AND ${rides.completedAt} >= ${thirtyDaysAgo}`,
        );

      // Aggregate by hour of day
      const buckets: { total: number; count: number }[] = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
      for (const r of completed) {
        if (!r.completedAt) continue;
        const hour = Math.max(0, Math.min(23, new Date(r.completedAt).getHours()));
        const bucket = buckets[hour];
        if (bucket) {
          bucket.total += parseFloat(String(r.totalFare ?? "0"));
          bucket.count += 1;
        }
      }

      return buckets.map((b, hour) => ({
        hour,
        avgEarnings: b.count > 0 ? Math.round((b.total / b.count) * 100) / 100 : 0,
        rideCount: b.count,
      }));
    }),

    /** Get driver's active session */
    getSession: protectedProcedure.query(async ({ ctx }) => {
      const session = await getDriverSession(ctx.user.id);
      const profile = await getUserProfileByUserId(ctx.user.id);

      // Fetch the current ride step so driver UI shows the correct action button
      let currentRideStep: string | null = null;
      let effectiveRideId = session?.currentRideId ?? null;
      if (effectiveRideId) {
        const ride = await getRideByRideId(effectiveRideId);
        if (ride) {
          currentRideStep = ride.rideStep ?? ride.status ?? null;
          // If ride is completed/cancelled, clear currentRideId so driver UI stops showing it
          if (ride.status === "completed" || ride.status === "cancelled") {
            effectiveRideId = null;
            currentRideStep = null;
            // Also clean up DB session
            await upsertDriverSession(ctx.user.id, {
              status: "online",
              currentRideId: null,
              lastSeenAt: new Date(),
            });
          }
        } else {
          // Ride not found — stale reference, clear it
          effectiveRideId = null;
          await upsertDriverSession(ctx.user.id, {
            status: "online",
            currentRideId: null,
            lastSeenAt: new Date(),
          });
        }
      }

      return {
        status: effectiveRideId ? "on_ride" : (session?.status === "on_ride" ? "online" : session?.status ?? "offline"),
        currentRideId: effectiveRideId,
        currentRideStep,
        todayRides: session?.todayRides ?? 0,
        todayEarnings: session?.todayEarnings ? Number(session.todayEarnings) : 0,
        acceptanceRate: session?.acceptanceRate ? Number(session.acceptanceRate) : 100,
        lastSeenAt: session?.lastSeenAt?.toISOString() ?? null,
        vehicleType: profile?.vehicleType ?? null,
        vehicleColor: profile?.vehicleColor ?? null,
        licensePlate: profile?.licensePlate ?? null,
        isDriver: profile?.isDriver ?? false,
      };
    }),

    /** Get nearby available rides (for driver browsing) */
    getNearbyRides: protectedProcedure
      .input(z.object({ lat: z.number(), lng: z.number(), radiusKm: z.number().default(10) }))
      .query(async ({ input }) => {
        const rides = await findMatchingSharedRides(
          input.lat, input.lng,
          input.lat, input.lng,
          input.radiusKm,
        );
        return rides.slice(0, 20);
      }),

    // ── Mid-Ride Join: Driver Endpoints ────────────────────────────────────

    /** Driver marks arrival at a specific stop */
    markStopReached: protectedProcedure
      .input(z.object({ rideId: z.string(), stopId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.driverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your ride" });

        await markStopReachedService(ride.id, input.stopId);

        // Get the stop details to notify the right passenger
        const stops = await getOrderedStops(ride.id);
        const reachedStop = stops.find(s => s.id === input.stopId);

        if (reachedStop) {
          if (reachedStop.stopType === "pickup") {
            // Driver arrived at this passenger's pickup stop.
            // Set DB target so their active-ride screen shows "Driver has arrived!"
            // Do NOT mark as picked_up yet — confirmBoarded does that after they board.
            await updateRide(ride.id, { arrivalTargetPassengerId: reachedStop.passengerId } as any);
            try {
              if (await isRedisAvailable()) {
                await redis.set(`arrival_target:${input.rideId}`, String(reachedStop.passengerId), "EX", 600);
              }
            } catch { /* non-fatal */ }

            await createNotification({
              notificationId: genId("notif"),
              userId: reachedStop.passengerId,
              type: "driver_arrived",
              title: "Driver at your pickup!",
              body: `The driver has arrived at ${reachedStop.address.split(",")[0]}. Head out now!`,
              data: { rideId: input.rideId, stopId: input.stopId },
            });
            // SSE push so their screen updates immediately without waiting for next poll
            pushRideStatusUpdate(input.rideId, "driver_arrived", [reachedStop.passengerId]);
          } else if (reachedStop.stopType === "dropoff") {
            // Passenger dropped off — clear arrival target and mark status
            await updateRide(ride.id, { arrivalTargetPassengerId: null } as any);
            try {
              if (await isRedisAvailable()) await redis.del(`arrival_target:${input.rideId}`);
            } catch { /* non-fatal */ }

            await updateRidePassengerStatus(ride.id, reachedStop.passengerId, "dropped_off");
            await createNotification({
              notificationId: genId("notif"),
              userId: reachedStop.passengerId,
              type: "ride_completed",
              title: "You've arrived!",
              body: `The driver has reached your dropoff at ${reachedStop.address.split(",")[0]}.`,
              data: { rideId: input.rideId, stopId: input.stopId },
            });
            // Push immediately so the passenger's active-ride screen refetches and
            // sees myRideStep = "completed" without waiting for the next poll cycle.
            pushRideStatusUpdate(input.rideId, "passenger_dropped", [reachedStop.passengerId]);
          }
        }

        // Recalculate ETAs for remaining stops
        try {
          await recalculateETAs(ride.id, Number(ride.pickupLat), Number(ride.pickupLng));
        } catch (_) { /* non-critical */ }

        // Get next stop for the driver
        const nextStop = await getNextStop(ride.id);
        return { success: true, nextStop };
      }),

    /**
     * Finalises a single passenger's trip segment mid-ride.
     * Marks the passenger as dropped_off, pushes an immediate SSE event so their
     * active-ride screen transitions to RATING without waiting for the next poll,
     * and sends a ride_completed notification. The driver's ride session stays open
     * for the remaining passengers.
     */
    finalizePassengerDropoff: protectedProcedure
      .input(z.object({ rideId: z.string(), passengerId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.driverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your ride" });

        // Idempotent — if already finalized, return success without side effects
        const passengers = await getRidePassengers(ride.id);
        const target = passengers.find(p => p.passengerId === input.passengerId);
        if (!target || (target as any).status === "dropped_off") return { success: true };

        // 1. Mark passenger as dropped off — their trip segment is complete
        await updateRidePassengerStatus(ride.id, input.passengerId, "dropped_off");

        // 2. Mark their dropoff stop as reached (non-fatal if stop record is missing)
        try {
          const stops = await getOrderedStops(ride.id);
          const dropoffStop = stops.find(
            (s: any) => s.passengerId === input.passengerId && s.stopType === "dropoff" && s.status !== "reached",
          );
          if (dropoffStop) await markStopReachedService(ride.id, dropoffStop.id);
        } catch { /* non-critical */ }

        // 3. Immediate SSE push — passenger's getRide will return myRideStep="completed"
        //    on the very next poll, but the SSE triggers an instant forced refetch.
        pushRideStatusUpdate(input.rideId, "passenger_dropped", [input.passengerId]);

        // 4. Persist notification and send push
        const driverUser = await getUserById(ctx.user.id);
        const driverName = driverUser?.name ?? "Your driver";
        const dropoffAddr = (target.dropoffAddress ?? "your destination").split(",")[0];
        await createNotification({
          notificationId: genId("notif"),
          userId: input.passengerId,
          type: "ride_completed",
          title: "You've arrived!",
          body: `${driverName} has dropped you off at ${dropoffAddr}. Please rate your ride.`,
          data: { rideId: input.rideId, driverId: ctx.user.id },
          deepLink: `/rate-ride-v2?rideId=${input.rideId}&driverId=${ctx.user.id}&driverName=${encodeURIComponent(driverName)}`,
        });

        return { success: true };
      }),

    /**
     * Driver confirms a subsequent passenger has boarded (sequential node system).
     * Clears the arrivalTarget and marks the passenger as picked_up.
     * Only used for nodes after the first pickup (first uses startRide).
     */
    confirmBoarded: protectedProcedure
      .input(z.object({ rideId: z.string(), passengerId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.driverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your ride" });

        // Clear arrival target — this passenger has boarded
        await updateRide(ride.id, { arrivalTargetPassengerId: null } as any);
        try {
          if (await isRedisAvailable()) await redis.del(`arrival_target:${input.rideId}`);
        } catch { /* non-fatal */ }

        await updateRidePassengerStatus(ride.id, input.passengerId, "picked_up");

        // Mark the boarded passenger's pickup stop as reached
        try {
          const allStops = await getOrderedStops(ride.id);
          const pickupStop = allStops.find(
            (s: any) => s.passengerId === input.passengerId && s.stopType === "pickup" && s.status !== "reached",
          );
          if (pickupStop) await markStopReachedService(ride.id, pickupStop.id);
        } catch (e) {
          logger.warn({ err: e }, "[confirmBoarded] Failed to mark pickup stop reached");
        }

        // Notify the passenger that they are now in the ride
        await createNotification({
          notificationId: genId("notif"),
          userId: input.passengerId,
          type: "ride_started",
          title: "You're on board!",
          body: "The driver has confirmed you've boarded. Enjoy your ride!",
          data: { rideId: input.rideId },
          deepLink: "/active-ride",
        });
        pushRideStatusUpdate(input.rideId, "ride_in_progress", [input.passengerId]);

        return { success: true };
      }),

    /** Driver polls for pending join requests for current ride */
    getPendingJoinRequests: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) return [];
        // Allow: driver OR original passenger (ride creator)
        const isDriver = ride.driverId === ctx.user.id;
        if (!isDriver) {
          const paxList = await getRidePassengers(ride.id);
          const origPax = paxList.find(p => p.isOriginalPassenger);
          if (origPax?.passengerId !== ctx.user.id) return [];
        }

        const allRequests = await getJoinRequestsForRide(input.rideId);
        const pending = allRequests.filter(r => r.status === "pending");

        const enriched = await Promise.all(
          pending.map(async (req) => {
            const user = await getUserById(req.passengerId);
            const profile = await getUserProfileByUserId(req.passengerId);
            return {
              ...req,
              passengerName: user?.name ?? "Passenger",
              passengerRating: profile?.averageRating ?? "5.00",
              isMidRideJoin: (req as any).isMidRideJoin ?? false,
              detourKm: (req as any).detourKm ?? null,
              detourMinutes: (req as any).detourMinutes ?? null,
              compatibilityScore: (req as any).compatibilityScore ?? null,
            };
          })
        );

        return enriched;
      }),

    /** Get upcoming scheduled/posted rides that need a driver */
    getUpcomingRides: protectedProcedure
      .query(async ({ ctx }) => {
        const openRides = await getOpenCarpoolRides(30);
        // Show rides that don't have a real driver assigned yet (driverId=0 or status still searching)
        // Exclude rides where this driver is already the passenger/creator
        const filtered: typeof openRides = [];
        for (const r of openRides) {
          // Skip if already assigned to a different driver (status matched)
          if (r.status === "matched" && r.driverId != null) continue;
          // Skip rides created by this user (they are the passenger)
          const passengers = await getRidePassengers(r.id);
          const isMyRide = passengers.some(p => p.passengerId === ctx.user.id) || r.driverId === ctx.user.id;
          if (isMyRide) continue;
          filtered.push(r);
        }
        const enriched = await Promise.all(
          filtered.map(async (ride) => {
            // Find who posted the ride — check passengers first, then driverId
            const passengers = await getRidePassengers(ride.id);
            const firstPassenger = passengers[0];
            const posterUser = firstPassenger
              ? await getUserById(firstPassenger.passengerId)
              : (ride.driverId ? await getUserById(ride.driverId) : null);
            const posterProfile = posterUser ? await getUserProfileByUserId(posterUser.id) : null;

            // Get recurring ride info if applicable
            let recurringTitle: string | null = null;
            if (ride.recurringRideId) {
              // carpoolTitle is stored on the ride itself
              recurringTitle = (ride as any).carpoolTitle ?? null;
            }

            return {
              rideId: ride.rideId,
              id: ride.id,
              title: recurringTitle ?? (ride as any).carpoolTitle ?? null,
              pickupAddress: ride.pickupAddress,
              dropoffAddress: ride.dropoffAddress,
              departureTime: ride.departureTime?.toISOString() ?? null,
              pricePerSeat: Number(ride.pricePerSeat ?? 0),
              totalSeats: ride.totalSeats ?? 3,
              availableSeats: ride.availableSeats ?? 3,
              distanceKm: Number(ride.distanceKm ?? 0),
              estimatedMinutes: ride.estimatedMinutes ?? 0,
              totalFare: Number(ride.totalFare ?? 0),
              mode: ride.mode,
              status: ride.status,
              recurringRideId: ride.recurringRideId,
              posterName: posterUser?.name ?? "Passenger",
              posterRating: Number(posterProfile?.averageRating ?? 5),
              passengerCount: passengers.length,
              createdAt: ride.createdAt?.toISOString() ?? null,
            };
          })
        );
        return enriched;
      }),

    /** Driver accepts a scheduled/upcoming ride */
    acceptScheduledRide: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const access = await getDriverAccessStatus(ctx.user.id);
        if (!access.canAccessDriverMode) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: driverAccessDeniedMessage(access),
          });
        }
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.status !== "searching" && ride.status !== "matched")
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is no longer available" });
        if (ride.driverId === ctx.user.id)
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot accept your own ride" });

        // Assign this driver to the ride
        await updateRide(ride.id, {
          driverId: ctx.user.id,
          status: "matched",
          rideStep: "driver_assigned",
        });

        // Notify the passenger(s)
        const passengers = await getRidePassengers(ride.id);
        const driver = await getUserById(ctx.user.id);
        for (const p of passengers) {
          await createNotification({
            notificationId: genId("notif"),
            userId: p.passengerId,
            type: "driver_assigned",
            title: "Driver Assigned!",
            body: `${driver?.name ?? "A driver"} has accepted your scheduled ride for ${ride.departureTime ? new Date(ride.departureTime).toLocaleString() : "upcoming"}.`,
            data: { rideId: input.rideId, deepLink: `/active-ride?rideId=${input.rideId}` },
            deepLink: `/active-ride?rideId=${input.rideId}`,
          });
        }

        return { success: true, rideId: input.rideId };
      }),

    /** Get rides this driver has already accepted (scheduled for the future) */
    getMyScheduledRides: protectedProcedure
      .query(async ({ ctx }) => {
        const allRides = await getDriverScheduledRides(ctx.user.id);

        const enriched = await Promise.all(
          allRides.map(async (ride) => {
            const passengers = await getRidePassengers(ride.id);
            const passengerUsers = await Promise.all(
              passengers.map(async (p) => {
                const u = await getUserById(p.passengerId);
                return { name: u?.name ?? "Passenger", id: p.passengerId };
              }),
            );

            return {
              rideId: ride.rideId,
              id: ride.id,
              title: (ride as any).carpoolTitle ?? null,
              pickupAddress: ride.pickupAddress,
              dropoffAddress: ride.dropoffAddress,
              departureTime: ride.departureTime?.toISOString() ?? null,
              pricePerSeat: Number(ride.pricePerSeat ?? 0),
              totalSeats: ride.totalSeats ?? 3,
              distanceKm: Number(ride.distanceKm ?? 0),
              estimatedMinutes: ride.estimatedMinutes ?? 0,
              totalFare: Number(ride.totalFare ?? 0),
              mode: ride.mode,
              status: ride.status,
              recurringRideId: ride.recurringRideId,
              passengerCount: passengers.length,
              passengers: passengerUsers,
              createdAt: ride.createdAt?.toISOString() ?? null,
            };
          }),
        );

        return enriched;
      }),

    /** Get ordered stops for driver's current ride */
    getRideStops: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) return [];
        if (ride.driverId !== ctx.user.id) return [];

        const stops = await getOrderedStops(ride.id);
        const enriched = await Promise.all(
          stops.map(async (stop) => {
            const user = await getUserById(stop.passengerId);
            return { ...stop, passengerName: user?.name ?? "Passenger" };
          })
        );
        return enriched;
      }),

    /** Dashboard stats with time-range filter */
    getDashboardStats: protectedProcedure
      .input(z.object({ range: z.enum(["today", "week", "month", "all_time"]).default("today") }))
      .query(async ({ ctx, input }) => {
        const access = await getDriverAccessStatus(ctx.user.id);
        if (!access.canAccessDriverMode) {
          throw new TRPCError({ code: "FORBIDDEN", message: driverAccessDeniedMessage(access) });
        }
        return getDriverDashboardStats(ctx.user.id, input.range);
      }),

    /** Enriched driver rides by tab + range */
    getDriverRides: protectedProcedure
      .input(z.object({
        status: z.enum(["upcoming", "active", "completed", "missed", "cancelled"]).default("upcoming"),
        range: z.enum(["today", "week", "month", "all_time"]).default("all_time"),
      }))
      .query(async ({ ctx, input }) => {
        return getEnrichedDriverRides(ctx.user.id, input.status, input.range);
      }),

    /** Unified driver request feed — dispatch + broadcast + history */
    getRideRequests: protectedProcedure
      .input(z.object({
        status: z.enum(["pending", "accepted", "rejected", "expired", "all"]).default("pending"),
        range: z.enum(["today", "week", "month", "all_time"]).default("all_time"),
      }).optional())
      .query(async ({ ctx, input }) => {
        return fetchUnifiedDriverRequests(ctx.user.id, {
          status: input?.status ?? "pending",
          range: input?.range ?? "all_time",
        });
      }),

    acceptRideRequest: driverProcedure
      .input(z.object({ requestId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return acceptPassengerBroadcastRequest(ctx.user.id, input.requestId);
      }),

    rejectRideRequest: driverProcedure
      .input(z.object({ requestId: z.string(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        return rejectDriverRequestUnified(ctx.user.id, input.requestId, "broadcast", input.reason);
      }),

    acceptDriverRequest: driverProcedure
      .input(z.object({
        requestId: z.string(),
        requestType: z.enum(["dispatch", "broadcast", "scheduled", "carpool_join"]),
      }))
      .mutation(async ({ ctx, input }) => {
        return acceptDriverRequestUnified(ctx.user.id, input.requestId, input.requestType);
      }),

    rejectDriverRequest: driverProcedure
      .input(z.object({
        requestId: z.string(),
        requestType: z.enum(["dispatch", "broadcast", "scheduled", "carpool_join"]),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return rejectDriverRequestUnified(
          ctx.user.id,
          input.requestId,
          input.requestType,
          input.reason,
        );
      }),

    getProfile: protectedProcedure.query(async ({ ctx }) => {
      return getDriverProfileBundle(ctx.user.id);
    }),

    updateProfile: protectedProcedure
      .input(z.object({
        fullName: z.string().min(1).optional(),
        phoneNumber: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.fullName) await updateUserName(ctx.user.id, input.fullName);
        if (input.phoneNumber) {
          await updateUserProfile(ctx.user.id, { phoneNumber: input.phoneNumber });
        }
        return getDriverProfileBundle(ctx.user.id);
      }),

    getVehicle: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getDriverProfileBundle(ctx.user.id);
      return profile.vehicle;
    }),

    updateVehicle: protectedProcedure
      .input(z.object({
        vehicleMake: z.string().min(1),
        vehicleModel: z.string().min(1),
        vehicleYear: z.number().int().min(1990).max(2030),
        vehicleColor: z.string().min(1),
        plateNumber: z.string().min(1),
        vehicleType: z.enum(["sedan", "suv", "van", "truck", "luxury"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const [app] = await db
          .select()
          .from(driverApplications)
          .where(eq(driverApplications.userId, ctx.user.id))
          .orderBy(desc(driverApplications.createdAt))
          .limit(1);
        if (app) {
          const haystack = `${input.vehicleMake} ${input.vehicleModel}`.toLowerCase();
          const fuelType = ["tesla", "rivian", "lucid", "polestar"].some((m) => haystack.includes(m))
            ? "electric" as const
            : haystack.includes("hybrid") || haystack.includes("prius")
              ? "hybrid" as const
              : "gasoline" as const;
          const seatCount =
            input.vehicleType === "van" ? 7
            : input.vehicleType === "truck" ? 3
            : input.vehicleType === "luxury" ? 4
            : 5;
          await db
            .update(driverApplications)
            .set({
              vehicleMake: input.vehicleMake,
              vehicleModel: input.vehicleModel,
              vehicleYear: input.vehicleYear,
              vehicleColor: input.vehicleColor,
              plateNumber: input.plateNumber,
              vehicleType: input.vehicleType,
              fuelType,
              seatCount,
              updatedAt: new Date(),
            })
            .where(eq(driverApplications.id, app.id));
        }
        await updateUserProfile(ctx.user.id, {
          vehicleType: input.vehicleType,
          vehicleColor: input.vehicleColor,
          licensePlate: input.plateNumber,
        });
        return getDriverProfileBundle(ctx.user.id);
      }),

    getDocuments: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getDriverProfileBundle(ctx.user.id);
      return profile.documents;
    }),

    getPayoutInfo: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getDriverProfileBundle(ctx.user.id);
      const account = await getConnectedAccount(ctx.user.id);
      return {
        ...profile.payout,
        chargesEnabled: account?.chargesEnabled ?? false,
        payoutsEnabled: account?.payoutsEnabled ?? false,
      };
    }),

    updatePayoutInfo: protectedProcedure
      .input(z.object({
        bankName: z.string().optional(),
        accountLast4: z.string().length(4).optional(),
        routingLast4: z.string().length(4).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const [app] = await db
          .select()
          .from(driverApplications)
          .where(eq(driverApplications.userId, ctx.user.id))
          .orderBy(desc(driverApplications.createdAt))
          .limit(1);
        if (app) {
          await db
            .update(driverApplications)
            .set({
              ...(input.bankName ? { bankName: input.bankName } : {}),
              ...(input.accountLast4 ? { accountLast4: input.accountLast4 } : {}),
              ...(input.routingLast4 ? { routingLast4: input.routingLast4 } : {}),
              updatedAt: new Date(),
            })
            .where(eq(driverApplications.id, app.id));
        }
        return getDriverProfileBundle(ctx.user.id);
      }),

    getSchedule: protectedProcedure.query(async ({ ctx }) => {
      const health = await checkDriverSchemaHealth();
      if (!health.ok) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Driver schedule is not available yet. Please run database migration (pnpm db:push).",
        });
      }
      return getDriverSchedule(ctx.user.id);
    }),

    updateSchedule: protectedProcedure
      .input(z.object({
        preferredPickupLat: z.number().nullable().optional(),
        preferredPickupLng: z.number().nullable().optional(),
        preferredPickupRadiusKm: z.number().min(1).max(100).optional(),
        maxDistanceKm: z.number().min(1).max(200).optional(),
        rideTypesAccepted: z.array(z.enum(["instant", "scheduled", "shared"])).optional(),
        scheduledRidesEnabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return updateScheduleSettings(ctx.user.id, input);
      }),

    addAvailabilitySlot: protectedProcedure
      .input(z.object({
        slotType: z.enum(["recurring", "one_time"]),
        dayOfWeek: z.number().min(0).max(6).optional(),
        specificDate: z.string().optional(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      }))
      .mutation(async ({ ctx, input }) => {
        const slotId = genId("slot");
        return addAvailabilitySlot(ctx.user.id, {
          slotId,
          slotType: input.slotType,
          dayOfWeek: input.dayOfWeek ?? null,
          specificDate: input.specificDate ? new Date(input.specificDate) : null,
          startTime: input.startTime,
          endTime: input.endTime,
        });
      }),

    removeAvailabilitySlot: protectedProcedure
      .input(z.object({ slotId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return removeAvailabilitySlot(ctx.user.id, input.slotId);
      }),

    getPayoutStatus: protectedProcedure.query(async ({ ctx }) => {
      return getDriverPayoutStatus(ctx.user.id);
    }),

    createStripeConnectAccount: protectedProcedure.mutation(async ({ ctx }) => {
      return createDriverStripeConnectAccount(ctx.user.id);
    }),

    createStripeAccountLink: protectedProcedure.mutation(async ({ ctx }) => {
      return createDriverStripeAccountLink(ctx.user.id);
    }),

    getPayoutMethods: protectedProcedure.query(async ({ ctx }) => {
      return getDriverPayoutMethods(ctx.user.id);
    }),

    requestPayout: protectedProcedure
      .input(z.object({ amountCents: z.number().int().min(100) }))
      .mutation(async ({ ctx, input }) => {
        return requestDriverPayout(ctx.user.id, input.amountCents);
      }),

    getPayoutHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(20) }).optional())
      .query(async ({ ctx, input }) => {
        return getDriverPayoutHistory(ctx.user.id, input?.limit ?? 20);
      }),

    getTips: protectedProcedure
      .input(z.object({ range: z.enum(["today", "week", "month", "all_time"]).default("all_time") }))
      .query(async ({ ctx, input }) => {
        const { rangeToSince } = await import("./services/driverStatsService");
        const since = rangeToSince(input.range);
        const { totalCents, items } = await getDriverTipsTotal(ctx.user.id, since);
        const mapped = items.map((i) => ({
            rideDbId: i.rideId,
            tipCents: Number(i.tipCents ?? 0),
            paidAt: i.paidAt?.toISOString() ?? null,
          }));
        return {
          totalCents,
          totalDollars: Math.round(totalCents) / 100,
          items: mapped,
          totalCount: mapped.length,
        };
      }),
  }),

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  notifications: router({
    getAll: protectedProcedure
      .input(z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
        unreadOnly: z.boolean().default(false),
        role: z.enum(["passenger", "driver"]).optional(),
      }))
      .query(async ({ ctx, input }) => {
        // Auto-delete notifications older than 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await deleteOldNotifications(ctx.user.id, sevenDaysAgo);

        const notifs = await getUserNotifications(
          ctx.user.id,
          input.limit,
          input.offset,
          input.unreadOnly,
          input.role,
        );
        return { notifications: notifs };
      }),

    unreadCount: protectedProcedure
      .input(z.object({
        role: z.enum(["passenger", "driver"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const count = await getUnreadNotificationCount(ctx.user.id, input?.role);
        return { count };
      }),

    markRead: protectedProcedure
      .input(z.object({ notificationId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.notificationId, ctx.user.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure
      .input(z.object({
        role: z.enum(["passenger", "driver"]).optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        await markAllNotificationsRead(ctx.user.id, input?.role);
        return { success: true };
      }),

    /** Driver-scoped notification inbox */
    getDriverNotifications: protectedProcedure
      .input(z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
        unreadOnly: z.boolean().default(false),
      }))
      .query(async ({ ctx, input }) => {
        const notifs = await getUserNotifications(
          ctx.user.id,
          input.limit,
          input.offset,
          input.unreadOnly,
          "driver",
        );
        return { notifications: notifs };
      }),

    markAsRead: protectedProcedure
      .input(z.object({ notificationId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.notificationId, ctx.user.id);
        return { success: true };
      }),

    markAllAsRead: protectedProcedure
      .input(z.object({
        role: z.enum(["passenger", "driver"]).optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        await markAllNotificationsRead(ctx.user.id, input?.role ?? "driver");
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ notificationId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteNotification(input.notificationId, ctx.user.id);
        return { success: true };
      }),

    clearAll: protectedProcedure
      .input(z.object({
        role: z.enum(["passenger", "driver"]).optional(),
      }).optional())
      .mutation(async ({ ctx, input }) => {
        await deleteAllNotifications(ctx.user.id, input?.role);
        return { success: true };
      }),
  }),

  // ── REWARDS ─────────────────────────────────────────────────────────────────
  rewards: router({
    /** Get current reward points balance */
    getPoints: protectedProcedure.query(async ({ ctx }) => {
      const points = await getOrCreateRewardPoints(ctx.user.id);
      return points;
    }),

    /** Get points transaction history */
    getHistory: protectedProcedure
      .input(z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      }))
      .query(async ({ ctx, input }) => {
        const history = await getPointsHistory(ctx.user.id, input.limit, input.offset);
        return history;
      }),
  }),

  // ── USER PREFERENCES ───────────────────────────────────────────────────────
  user: router({
    getPreferences: protectedProcedure.query(async ({ ctx }) => {
      return getOrCreateUserPreferences(ctx.user.id);
    }),

    getProfile: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getUserProfileByUserId(ctx.user.id);
      return {
        gender: profile?.gender ?? null,
        phoneNumber: profile?.phoneNumber ?? null,
        isDriver: profile?.isDriver ?? false,
        averageRating: profile?.averageRating ? Number(profile.averageRating) : null,
        totalRides: profile?.totalRides ?? 0,
        profilePhotoKey: profile?.profilePhoto ?? null,
        emergencyContacts: (profile?.emergencyContacts ?? []) as Array<{ name: string; phone: string }>,
      };
    }),

    updatePreferences: protectedProcedure
      .input(z.object({
        safetyMode: z.enum(["none", "women_drivers_only", "women_companions_only", "women_only"]).optional(),
        preferredRideMode: z.enum(["solo", "share"]).optional(),
        maxWaitTimeMinutes: z.number().min(5).max(60).optional(),
        notifyOnDriverAssigned: z.boolean().optional(),
        notifyOnDriverArrived: z.boolean().optional(),
        notifyOnRideStart: z.boolean().optional(),
        notifyOnRideComplete: z.boolean().optional(),
        pushToken: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return updateUserPreferences(ctx.user.id, input);
      }),

    updateGender: protectedProcedure
      .input(z.object({
        gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateUserProfile(ctx.user.id, { gender: input.gender });
        return { success: true };
      }),

    updateProfile: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        profilePhoto: z.string().optional(),
        emergencyContacts: z.array(z.object({ name: z.string(), phone: z.string() })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.firstName) {
          const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
          await updateUserName(ctx.user.id, fullName);
        }
        return updateUserProfile(ctx.user.id, {
          phoneNumber: input.phone,
          profilePhoto: input.profilePhoto,
          emergencyContacts: input.emergencyContacts as any,
        });
      }),

    getStats: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getUserProfileByUserId(ctx.user.id);
      const wallet = await getOrCreateWallet(ctx.user.id);
      const userRides = await getUserRides(ctx.user.id);

      const completed = userRides.filter((r) => r.ride.status === "completed");
      const passengerRides = completed.filter((r) => !r.isDriver);
      const driverRides = completed.filter((r) => r.isDriver);
      const shareRides = passengerRides.filter((r) => r.ride.mode === "share").length;

      const totalSpent = passengerRides.reduce((sum, r) => sum + Number(r.myFareShare ?? 0), 0);
      const totalEarned = driverRides.reduce((sum, r) => sum + Number(r.myFareShare ?? 0), 0);

      return {
        totalRides: completed.length,
        shareRides,
        totalSpent: Math.round(totalSpent * 100) / 100,
        totalEarned: Math.round(totalEarned * 100) / 100,
        avgRating: profile?.averageRating ? Number(profile.averageRating) : 5.0,
        walletBalance: Number(wallet?.balance ?? 0),
      };
    }),

    getMyReferrals: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db
        .select()
        .from(referrals)
        .where(eq(referrals.referrerId, ctx.user.id))
        .orderBy(desc(referrals.createdAt))
        .limit(50);
      return rows.map(r => ({
        id: String(r.id),
        referralCode: r.referralCode,
        status: r.status ?? "pending",
        amount: Number(r.creditAmount),
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      }));
    }),

    requestAccountDeletion: protectedProcedure
      .input(z.object({ reason: z.string().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        return requestAccountDeletion(ctx.user.id, input.reason);
      }),

    cancelAccountDeletion: protectedProcedure.mutation(async ({ ctx }) => {
      return cancelAccountDeletion(ctx.user.id);
    }),

    getAccountDeletionStatus: protectedProcedure.query(async ({ ctx }) => {
      return getAccountDeletionStatus(ctx.user.id);
    }),

    requestDataExport: protectedProcedure.mutation(async ({ ctx }) => {
      return requestDataExport(ctx.user.id);
    }),

    getDataExportStatus: protectedProcedure.query(async ({ ctx }) => {
      return getDataExportStatus(ctx.user.id);
    }),

    updateProfilePhoto: protectedProcedure
      .input(z.object({ r2Key: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        const ownerUserId = await getFileOwner(input.r2Key);
        if (ownerUserId === null || ownerUserId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this file" });
        }
        await updateUserProfile(ctx.user.id, { profilePhoto: input.r2Key });
        return { success: true };
      }),
  }),

  // ── DIAGNOSTICS (admin / dev — never exposes secrets) ─────────────────────
  diagnostics: router({
    getStripeStatus: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        const profile = await getUserProfileByUserId(ctx.user.id);
        if (!profile?.isDriver) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin or driver access required" });
        }
      }
      return getStripeDiagnostics();
    }),

    getSchemaHealth: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      return checkDriverSchemaHealth();
    }),
  }),

  // ═══════════════════════════════════════════════════════════════════════
  // CARPOOL ROUTER — P2P Peer-to-Peer Smart Carpool Marketplace
  // ═══════════════════════════════════════════════════════════════════════
  carpool: router({

    /**
     * POST a new ride as a driver — the core P2P carpool creation flow.
     * Creates a ride with a set departure time, price per seat, and seat count.
     */
    createCarpool: protectedProcedure
      .input(z.object({
        title: z.string().min(3).max(200),
        pickupLat: z.number().min(-90).max(90),
        pickupLng: z.number().min(-180).max(180),
        pickupAddress: z.string().min(1).max(500),
        dropoffLat: z.number().min(-90).max(90),
        dropoffLng: z.number().min(-180).max(180),
        dropoffAddress: z.string().min(1).max(500),
        distanceKm: z.number().positive().max(500),
        estimatedMinutes: z.number().positive().max(600),
        departureTime: z.string().min(1),
        pricePerSeat: z.number().min(1).max(200),
        totalSeats: z.number().min(1).max(8).default(3),
        safetyMode: z.enum(["none", "women_drivers_only", "women_companions_only", "women_only"]).default("none"),
        approvalRequired: z.boolean().default(true),
        recurringRideId: z.number().optional(),
        posterRole: z.enum(["driver", "passenger_organizer"]).default("driver"),
        // extended fields
        rideNotes: z.string().max(500).optional(),
        luggageAllowed: z.enum(["none", "small", "medium", "large"]).optional(),
        genderPreference: z.enum(["any", "female_only", "male_only"]).optional(),
        flexibleDepartureMinutes: z.number().min(0).max(120).optional(),
        pickupRadiusMeters: z.number().min(100).max(2000).optional(),
        quietRide: z.boolean().optional(),
        stopoverAddresses: z.array(z.string()).max(3).optional(),
        communityId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only approved drivers may post with posterRole="driver"
        if (input.posterRole === "driver") {
          const [driverApp] = await db
            .select({ status: driverApplications.status })
            .from(driverApplications)
            .where(eq(driverApplications.userId, ctx.user.id))
            .orderBy(desc(driverApplications.createdAt))
            .limit(1);
          if (!driverApp || driverApp.status !== "approved") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only approved drivers can post a ride as driver",
            });
          }
        }

        const totalFare = input.pricePerSeat * input.totalSeats;
        const rideId = genId("ride");
        logger.info({ userId: ctx.user.id, rideId, posterRole: input.posterRole }, "[carpool] posting ride");

        // Map gender preference to safetyMode when applicable
        const resolvedSafetyMode = input.genderPreference === "female_only" ? "women_only" : input.safetyMode;

        // Pack extended metadata (no migration needed — fareBreakdown is null for carpool rides)
        const rideMetadata = {
          rideNotes: input.rideNotes ?? null,
          luggageAllowed: input.luggageAllowed ?? "small",
          genderPreference: input.genderPreference ?? "any",
          flexibleDepartureMinutes: input.flexibleDepartureMinutes ?? 0,
          pickupRadiusMeters: input.pickupRadiusMeters ?? 500,
          quietRide: input.quietRide ?? false,
          stopoverAddresses: input.stopoverAddresses ?? [],
        };

        const ride = await createRide({
          rideId,
          driverId: ctx.user.id,
          mode: "share",
          status: "searching",
          rideStep: "finding_driver",
          posterRole: input.posterRole,
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          distanceKm: String(input.distanceKm),
          estimatedMinutes: input.estimatedMinutes,
          totalFare: String(totalFare),
          pricePerSeat: String(input.pricePerSeat),
          totalSeats: input.totalSeats,
          availableSeats: input.totalSeats,
          departureTime: new Date(input.departureTime),
          safetyMode: resolvedSafetyMode,
          approvalRequired: input.approvalRequired,
          carpoolTitle: input.title,
          recurringRideId: input.recurringRideId,
          fareBreakdown: rideMetadata as any,
        } as any);

        if (input.communityId) {
          try {
            await attachRideToCommunity({
              communityId: input.communityId,
              rideDbId: ride!.id,
              postedBy: ctx.user.id,
            });
          } catch (err: any) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err?.message ?? "Failed to attach ride to community",
            });
          }
        }

        const pickupShort = input.pickupAddress.split(",")[0] || "Pickup";
        const dropoffShort = input.dropoffAddress.split(",")[0] || "Dropoff";
        const isOrganizer = input.posterRole === "passenger_organizer";
        await createNotification({
          notificationId: genId("notif"),
          userId: ctx.user.id,
          type: "ride_request",
          title: isOrganizer ? "Your group ride is live!" : "Ride posted — waiting for passengers",
          body: isOrganizer
            ? `${pickupShort} → ${dropoffShort} · $${input.pricePerSeat.toFixed(2)}/seat split. Others can now find and join your trip.`
            : `${pickupShort} → ${dropoffShort} · $${input.pricePerSeat.toFixed(2)}/seat. Others can now find and join your ride.`,
          data: { rideId },
          deepLink: `/carpool-detail?rideId=${rideId}`,
        });

        return { ride, metadata: rideMetadata };
      }),

    /**
     * Edit a posted carpool ride (organizer only).
     * Notifies all approved passengers about the change.
     */
    editCarpool: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        title: z.string().min(3).max(200).optional(),
        departureTime: z.string().optional(),
        pricePerSeat: z.number().min(1).max(200).optional(),
        totalSeats: z.number().min(1).max(8).optional(),
        approvalRequired: z.boolean().optional(),
        rideNotes: z.string().max(500).optional(),
        luggageAllowed: z.enum(["none", "small", "medium", "large"]).optional(),
        genderPreference: z.enum(["any", "female_only", "male_only"]).optional(),
        flexibleDepartureMinutes: z.number().min(0).max(120).optional(),
        quietRide: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        const organizerId = await getRideOrganizerId(ride);
        if (organizerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the organizer can edit this ride" });
        if (ride.status === "completed" || ride.status === "cancelled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a completed or cancelled ride" });
        }

        // Merge existing metadata with new values
        const existingMeta = (ride.fareBreakdown as any) ?? {};
        const updatedMeta = {
          ...existingMeta,
          ...(input.rideNotes !== undefined && { rideNotes: input.rideNotes }),
          ...(input.luggageAllowed !== undefined && { luggageAllowed: input.luggageAllowed }),
          ...(input.genderPreference !== undefined && { genderPreference: input.genderPreference }),
          ...(input.flexibleDepartureMinutes !== undefined && { flexibleDepartureMinutes: input.flexibleDepartureMinutes }),
          ...(input.quietRide !== undefined && { quietRide: input.quietRide }),
        };

        const updates: Record<string, any> = { fareBreakdown: updatedMeta };
        if (input.title) updates.carpoolTitle = input.title;
        if (input.departureTime) updates.departureTime = new Date(input.departureTime);
        if (input.pricePerSeat !== undefined) {
          updates.pricePerSeat = String(input.pricePerSeat);
          updates.totalFare = String(input.pricePerSeat * (input.totalSeats ?? ride.totalSeats ?? 3));
        }
        if (input.totalSeats !== undefined) {
          const currentPassengers = await getRidePassengers(ride.id);
          if (input.totalSeats < currentPassengers.length) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot reduce seats below current passenger count (${currentPassengers.length})` });
          }
          updates.totalSeats = input.totalSeats;
          updates.availableSeats = input.totalSeats - currentPassengers.length;
        }
        if (input.approvalRequired !== undefined) updates.approvalRequired = input.approvalRequired;

        await updateRide(ride.id, updates as any);

        // Notify all approved passengers of the edit
        const joinRequests = await getJoinRequestsForRide(input.rideId);
        const approvedPassengerIds = joinRequests.filter(r => r.status === "approved").map(r => r.passengerId);
        const changesSummary = [
          input.departureTime && "departure time",
          input.pricePerSeat && "price",
          input.totalSeats && "seat count",
          input.title && "title",
        ].filter(Boolean).join(", ");

        if (approvedPassengerIds.length > 0 && changesSummary) {
          await Promise.all(approvedPassengerIds.map(passengerId =>
            createNotification({
              notificationId: genId("notif"),
              userId: passengerId,
              type: "ride_request",
              title: "Ride Updated",
              body: `The organizer updated: ${changesSummary}. Check the ride details.`,
              data: { rideId: input.rideId },
              deepLink: `/carpool-detail?rideId=${input.rideId}`,
            })
          ));
          pushRideStatusUpdate(input.rideId, "ride_updated", approvedPassengerIds, { rideId: input.rideId, changesSummary });
        }

        logger.info({ rideId: input.rideId, userId: ctx.user.id, changes: Object.keys(updates) }, "[carpool] ride edited");
        return { success: true, rideId: input.rideId };
      }),

    /**
     * Cancel a posted carpool ride (organizer only).
     * Notifies all approved passengers and refunds pending requests.
     */
    cancelPostedRide: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        reason: z.string().max(300).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        const organizerId = await getRideOrganizerId(ride);
        if (organizerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the organizer can cancel this ride" });
        if (ride.status === "completed" || ride.status === "cancelled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is already completed or cancelled" });
        }

        await updateRide(ride.id, {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: input.reason ?? "Organizer cancelled the ride",
        } as any);

        // Reject all pending join requests and notify everyone
        const joinRequests = await getJoinRequestsForRide(input.rideId);
        const impactedIds = [...new Set(joinRequests.filter(r => r.status !== "cancelled").map(r => r.passengerId))];

        await Promise.all(joinRequests
          .filter(r => r.status === "pending" || r.status === "approved")
          .map(r => updateJoinRequest(r.joinRequestId, { status: "cancelled", respondedAt: new Date() }))
        );

        if (impactedIds.length > 0) {
          const pickupShort = ride.pickupAddress.split(",")[0] || "Pickup";
          const dropoffShort = ride.dropoffAddress.split(",")[0] || "Dropoff";
          await Promise.all(impactedIds.map(passengerId =>
            createNotification({
              notificationId: genId("notif"),
              userId: passengerId,
              type: "ride_cancelled",
              title: "Ride Cancelled",
              body: input.reason
                ? `Your ride ${pickupShort} → ${dropoffShort} was cancelled: ${input.reason}`
                : `Your ride ${pickupShort} → ${dropoffShort} was cancelled by the organizer.`,
              data: { rideId: input.rideId },
            })
          ));
          pushRideStatusUpdate(input.rideId, "ride_cancelled", impactedIds, {
            rideId: input.rideId,
            reason: input.reason ?? null,
          });
        }

        logger.info({ rideId: input.rideId, userId: ctx.user.id, impacted: impactedIds.length }, "[carpool] ride cancelled by organizer");
        return { success: true, impactedPassengers: impactedIds.length };
      }),

    /**
     * Search for carpools matching a given route.
     *
     * Pipeline:
     *   1. Spatial DB query — candidates within 1.2 km pickup + 2.4 km dropoff bounding box
     *   2. Safety gate      — incompatible safetyMode excluded (case-insensitive)
     *   3. Proximity gates  — exact Haversine: pickup > 1 km or dropoff > 2 km → excluded
     *   4. Direction gate   — bearing difference > 84° → excluded
     *   5. Time gate        — departed > 10 min ago → excluded
     *   6. Dedup            — same driver + route + ±5 min time bucket → keep best score
     *   7. Rank             — pickup dist ASC → dropoff dist ASC → departure proximity → score DESC
     *   8. Cluster          — rides within 500 m pickup + dropoff → grouped
     *   9. Tab filter       — women_drivers_only / women_only / etc. applied post-cluster
     *
     * Response: { clusters, totalMatched, totalCandidates }
     * Each cluster: { clusterId, best, alternatives[], totalCount }
     */
    searchCarpools: protectedProcedure
      .input(z.object({
        pickupLat: z.number(),
        pickupLng: z.number(),
        dropoffLat: z.number(),
        dropoffLng: z.number(),
        departureAfter: z.string().optional(),
        departureBefore: z.string().optional(),
        safetyMode: z.enum(["none", "women_drivers_only", "women_companions_only", "women_only"]).optional(),
        filterMode: z.enum([
          "everyone",
          "women_only",
          "women_drivers",
          "students",
          "verified",
          "lowest_price",
          "best_match",
        ]).optional(),
        maxResults: z.number().min(1).max(50).default(20),
      }))
      .query(async ({ ctx, input }) => {
        // ── 1. Spatial candidate fetch ─────────────────────────────────────
        const candidates = await searchCarpoolRides(
          input.pickupLat, input.pickupLng,
          input.dropoffLat, input.dropoffLng,
        );

        // Exclude community-only rides from public marketplace search
        const communityRideRows = await db
          .select({ rideId: communityRides.rideId })
          .from(communityRides);
        const communityRideIdSet = new Set(communityRideRows.map((r) => r.rideId));
        const publicCandidates = candidates.filter((r) => !communityRideIdSet.has(r.id));

        // ── 2. Requester gender (for safety gate) ──────────────────────────
        const requesterProfile = await getUserProfileByUserId(ctx.user.id);
        const requesterGender = (requesterProfile?.gender ?? "").toLowerCase() || null;

        // ── 3. Driver profiles — fetch in parallel ───────────────────────
        const driverIds = [...new Set(publicCandidates.map((r) => r.driverId).filter((id): id is number => id != null))];
        const driverGenders = new Map<number, string | null>();
        const driverRatings = new Map<number, number | null>();
        const driverProfiles = new Map<number, Awaited<ReturnType<typeof getUserProfileByUserId>>>();
        await Promise.all(
          driverIds.map(async (driverId) => {
            const dp = await getUserProfileByUserId(driverId);
            driverProfiles.set(driverId, dp);
            driverGenders.set(driverId, (dp?.gender ?? "").toLowerCase() || null);
            driverRatings.set(driverId, dp?.averageRating != null ? Number(dp.averageRating) : null);
          }),
        );

        const approvedDriverIds = new Set<number>();
        if (driverIds.length > 0) {
          const approvedApps = await db
            .select({ userId: driverApplications.userId })
            .from(driverApplications)
            .where(
              and(
                inArray(driverApplications.userId, driverIds),
                eq(driverApplications.status, "approved"),
              ),
            );
          for (const row of approvedApps) approvedDriverIds.add(row.userId);
        }

        // ── 4. Score → dedup → rank → cluster ─────────────────────────────
        const searchInput: CarpoolSearchInput = {
          pickupLat: input.pickupLat,
          pickupLng: input.pickupLng,
          dropoffLat: input.dropoffLat,
          dropoffLng: input.dropoffLng,
          departureAfter: input.departureAfter ? new Date(input.departureAfter) : undefined,
          departureBefore: input.departureBefore ? new Date(input.departureBefore) : undefined,
          passengerGender: requesterGender,
          maxResults: input.maxResults,
        };

        const { clusters, totalMatched, totalCandidates, searchRadiusKm, adaptiveExpanded } =
          rankAndGroupCarpools(publicCandidates as any, searchInput, driverGenders, new Date(), driverRatings);

        logger.debug({ userId: ctx.user.id, totalCandidates, totalMatched, clusters: clusters.length, safetyMode: input.safetyMode ?? "none" }, "[carpool] search results");

        // ── 5. Enrich each match with live DB data ─────────────────────────
        const mapGenderPreference = (safetyMode: string | null | undefined) => {
          const mode = (safetyMode ?? "none").toLowerCase();
          if (mode === "women_only" || mode === "women_drivers_only" || mode === "women_companions_only") {
            return "women_only" as const;
          }
          return "everyone" as const;
        };

        const resolveSchoolLabel = (profile: Awaited<ReturnType<typeof getUserProfileByUserId>>) => {
          if (!profile?.isStudentVerified) return undefined;
          const domain = (profile.studentUniversityDomain ?? profile.collegeEmail?.split("@")[1] ?? "").toLowerCase();
          const name = profile.studentUniversityName ?? "";
          if (domain.includes("njit") || name.toLowerCase().includes("njit")) return "NJIT Verified";
          if (domain.includes("rutgers") || name.toLowerCase().includes("rutgers")) return "Rutgers Verified";
          if (domain.includes("stevens") || name.toLowerCase().includes("stevens")) return "Stevens Verified";
          if (domain.includes("princeton") || name.toLowerCase().includes("princeton")) return "Princeton Verified";
          return "Student Verified";
        };

        const enrichOne = async (match: CarpoolMatchResult) => {
          const passengers = await getRidePassengers(match.ride.id);
          const organizerId = await getRideOrganizerId(match.ride);
          const hostUser = await getUserById(organizerId > 0 ? organizerId : match.ride.driverId);
          const driverProfile = driverProfiles.get(match.ride.driverId)
            ?? await getUserProfileByUserId(match.ride.driverId);
          const hostProfile = organizerId > 0
            ? await getUserProfileByUserId(organizerId)
            : driverProfile;
          const seatsAvailable = Math.max(0, (match.ride.totalSeats ?? 3) - passengers.length);
          const pendingRequests = await getJoinRequestsForRide(match.ride.rideId);
          const pendingCount = pendingRequests.filter((r) => r.status === "pending").length;
          const myRequest = pendingRequests.find((r) => r.passengerId === ctx.user.id);
          const driverName = hostUser?.name ?? "Organizer";
          const isOwnRide = organizerId === ctx.user.id;
          const isStudentVerified = !!hostProfile?.isStudentVerified;
          const school = resolveSchoolLabel(hostProfile);
          const isVerified = isStudentVerified || (match.ride.driverId != null && approvedDriverIds.has(match.ride.driverId));
          const driverGender = hostProfile?.gender?.toLowerCase() ?? null;
          const price = match.fareShare;
          const matchScore = match.score;
          const pickupDistanceMiles = Math.round(match.pickupDistKm * 0.621371 * 10) / 10;

          return {
            ...match,
            matchScore,
            pickupDistanceMiles,
            price,
            seatsLeft: seatsAvailable,
            totalSeats: match.ride.totalSeats ?? 3,
            riderName: driverName,
            rating: Number(hostProfile?.averageRating ?? 4.8),
            isVerified,
            isStudentVerified,
            school,
            genderPreference: mapGenderPreference(match.ride.safetyMode),
            driverGender,
            safetyMode: match.ride.safetyMode ?? "none",
            approvalRequired: match.ride.approvalRequired ?? false,
            pickup: match.ride.pickupAddress,
            dropoff: match.ride.dropoffAddress,
            departureTime: match.ride.departureTime?.toISOString() ?? null,
            isOwnRide,
            passengers: passengers.length,
            seatsAvailable,
            pendingRequestCount: pendingCount,
            myJoinStatus: myRequest?.status ?? null,
            driver: {
              id: match.ride.driverId,
              name: driverName,
              avatar: driverName.charAt(0).toUpperCase(),
              rating: Number(driverProfile?.averageRating ?? 4.8),
              totalRides: driverProfile?.totalRides ?? 0,
              gender: driverGender,
              isStudentVerified,
              school,
              isVerified,
            },
            ride: {
              ...match.ride,
              pickupLat: Number(match.ride.pickupLat),
              pickupLng: Number(match.ride.pickupLng),
              dropoffLat: Number(match.ride.dropoffLat),
              dropoffLng: Number(match.ride.dropoffLng),
              distanceKm: Number(match.ride.distanceKm),
              pricePerSeat: Number(match.ride.pricePerSeat),
              totalSeats: match.ride.totalSeats ?? 3,
              departureTime: match.ride.departureTime?.toISOString() ?? null,
              approvalRequired: match.ride.approvalRequired ?? false,
            },
          };
        };

        // ── 6. Enrich + seat-filter each cluster ───────────────────────────
        const hasSeat = (r: { seatsAvailable: number; isOwnRide: boolean }) =>
          r.seatsAvailable > 0 || r.isOwnRide;

        const enrichedClusters = (
          await Promise.all(
            clusters.map(async (cluster) => {
              const [enrichedBest, ...enrichedAlts] = await Promise.all(
                [cluster.best, ...cluster.alternatives].map(enrichOne),
              );
              const validMembers = [enrichedBest, ...enrichedAlts].filter(hasSeat);
              if (validMembers.length === 0) return null;
              return {
                clusterId: cluster.clusterId,
                totalCount: validMembers.length,
                best: validMembers[0],
                alternatives: validMembers.slice(1),
              };
            }),
          )
        ).filter((c): c is NonNullable<typeof c> => c !== null);

        // ── 7. Filter tabs (safety + student + verified) ───────────────────
        const filterMode = input.filterMode ?? "everyone";
        const tabFilter = input.safetyMode
          ?? (filterMode === "women_drivers" ? "women_drivers_only" as const
            : filterMode === "women_only" ? "women_only" as const
              : undefined);

        type EnrichedMatch = Awaited<ReturnType<typeof enrichOne>>;

        const passesTab = (r: EnrichedMatch) => {
          if (tabFilter && tabFilter !== "none") {
            if (tabFilter === "women_drivers_only") {
              if (r.driver.gender !== "female") return false;
            } else if (tabFilter === "women_companions_only") {
              if (r.ride.safetyMode !== "women_companions_only" && r.ride.safetyMode !== "women_only") return false;
            } else if (tabFilter === "women_only") {
              if (r.ride.safetyMode !== "women_only" || r.driver.gender !== "female") return false;
            }
          }
          if (filterMode === "students" && !r.isStudentVerified) return false;
          if (filterMode === "verified" && !r.isVerified) return false;
          return true;
        };

        const filteredClusters = enrichedClusters
          .map((cluster) => {
            if (!passesTab(cluster.best)) {
              const remaining = [cluster.best, ...cluster.alternatives].filter(passesTab);
              if (remaining.length === 0) return null;
              return {
                ...cluster,
                best: remaining[0],
                alternatives: remaining.slice(1),
                totalCount: remaining.length,
              };
            }
            const remaining = [cluster.best, ...cluster.alternatives].filter(passesTab);
            return {
              ...cluster,
              best: remaining[0],
              alternatives: remaining.slice(1),
              totalCount: remaining.length,
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        const flatMatches = filteredClusters.flatMap(c => [c.best, ...c.alternatives]);
        if (filterMode === "lowest_price") {
          flatMatches.sort((a, b) => a.price - b.price);
        } else {
          flatMatches.sort((a, b) => b.matchScore - a.matchScore);
        }

        const sortedClusters = flatMatches.length > 0
          ? [{
              clusterId: "sorted",
              best: flatMatches[0],
              alternatives: flatMatches.slice(1),
              totalCount: flatMatches.length,
            }]
          : [];

        return {
          clusters: sortedClusters,
          matches: flatMatches,
          totalMatched: flatMatches.length,
          totalCandidates,
          searchRadiusKm,
          adaptiveExpanded,
        };
      }),

    /**
     * Request to join a posted carpool ride.
     * If approvalRequired=false → auto-approved and passenger added immediately.
     * If approvalRequired=true  → creates a pending request for driver to approve.
     */
    requestJoin: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        pickupLat: z.number(),
        pickupLng: z.number(),
        pickupAddress: z.string(),
        dropoffLat: z.number(),
        dropoffLng: z.number(),
        dropoffAddress: z.string(),
        distanceKm: z.number(),
        message: z.string().max(300).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.mode !== "share") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Can only join shared rides" });
        }
        if (["completed", "cancelled", "missed"].includes(ride.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This ride is no longer accepting passengers" });
        }
        if (ride.status !== "searching" && ride.status !== "matched") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This ride is no longer accepting passengers" });
        }
        if (ride.departureTime && ride.departureTime.getTime() < Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This ride has already departed" });
        }

        const organizerId = await getRideOrganizerId(ride);
        if (organizerId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot join your own ride" });
        }
        // Belt-and-suspenders: block the ride's assigned driver (posterRole="driver") from joining as passenger
        if (ride.driverId && ride.driverId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot join your own ride" });
        }

        const passengers = await getRidePassengers(ride.id);
        if (passengers.some((p) => p.passengerId === ctx.user.id)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You are already on this ride" });
        }
        const seatsAvailable = (ride.totalSeats ?? 3) - passengers.length;
        if (seatsAvailable <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is full" });

        if (ride.safetyMode && ride.safetyMode !== "none") {
          const requesterProfile = await getUserProfileByUserId(ctx.user.id);
          const organizerProfile = await getUserProfileByUserId(organizerId);
          const compatible = isSafetyCompatible(
            ride.safetyMode,
            requesterProfile?.gender ?? null,
            organizerProfile?.gender ?? null,
          );
          if (!compatible) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This ride has safety restrictions that you do not meet",
            });
          }
        }

        const existing = await getExistingJoinRequest(input.rideId, ctx.user.id);
        if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "You already have a pending or approved request for this ride" });

        const rideDistKm = Number(ride.distanceKm);
        let fareShare: number;
        if (ride.pricePerSeat) {
          fareShare = Number(ride.pricePerSeat);
        } else {
          const shareRatio = Math.min(input.distanceKm / Math.max(rideDistKm, 1), 1);
          fareShare = Math.round(Number(ride.totalFare) * shareRatio * 0.7 * 100) / 100;
        }

        const joinRequestId = genId("jreq");
        const joinReq = await createJoinRequest({
          joinRequestId,
          rideId: input.rideId,
          passengerId: ctx.user.id,
          status: ride.approvalRequired ? "pending" : "approved",
          message: input.message,
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          distanceKm: String(input.distanceKm),
          fareShare: String(fareShare),
          respondedAt: ride.approvalRequired ? undefined : new Date(),
        });

        const requesterUser = await getUserById(ctx.user.id);
        const requesterName = requesterUser?.name ?? "Someone";

        if (!ride.approvalRequired) {
          const seatClaimed = await decrementRideSeat(ride.id);
          if (!seatClaimed) {
            await updateJoinRequest(joinRequestId, { status: "rejected", respondedAt: new Date() });
            throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is full" });
          }
          try {
            await addRidePassenger({
              rideId: ride.id,
              passengerId: ctx.user.id,
              pickupLat: String(input.pickupLat),
              pickupLng: String(input.pickupLng),
              pickupAddress: input.pickupAddress,
              dropoffLat: String(input.dropoffLat),
              dropoffLng: String(input.dropoffLng),
              dropoffAddress: input.dropoffAddress,
              distanceKm: String(input.distanceKm),
              fareShare: String(fareShare),
            });
          } catch (err) {
            await incrementRideSeat(ride.id);
            throw err;
          }

          await createNotification({
            notificationId: genId("notif"),
            userId: ctx.user.id,
            type: "driver_assigned",
            title: "Joined ride successfully",
            body: "You have joined the shared ride. See you there!",
            data: { rideId: input.rideId, deepLink: `/carpool-detail?rideId=${input.rideId}` },
            deepLink: `/carpool-detail?rideId=${input.rideId}`,
          });

          if (organizerId > 0) {
            await createNotification({
              notificationId: genId("notif"),
              userId: organizerId,
              type: "ride_request",
              title: "New rider joined your ride",
              body: `${requesterName} joined your shared ride.`,
              data: { rideId: input.rideId, joinRequestId },
              deepLink: "/(tabs)/requests",
            });
          }

          return { joinRequest: joinReq, fareShare, autoApproved: true };
        }

        if (organizerId > 0) {
          await createNotification({
            notificationId: genId("notif"),
            userId: organizerId,
            type: "ride_request",
            title: "New Join Request",
            body: `${requesterName} wants to join your ride. Tap to review.`,
            data: { rideId: input.rideId, joinRequestId },
            deepLink: "/(tabs)/requests",
          });
          pushRideStatusUpdate(input.rideId, "join_requested", [organizerId], {
            joinRequestId,
            passengerName: requesterName,
          });
        }

        return { joinRequest: joinReq, fareShare, autoApproved: false };
      }),

    /**
     * Driver approves a join request — adds passenger to the ride.
     */
    approveRequest: protectedProcedure
      .input(z.object({ joinRequestId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const req = await getJoinRequest(input.joinRequestId);
        if (!req) throw new TRPCError({ code: "BAD_REQUEST", message: "Join request not found" });

        const ride = await getRideByRideId(req.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        const organizerId = await getRideOrganizerId(ride);
        if (organizerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the ride organizer can approve requests" });
        }
        if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request is no longer pending" });
        if (["completed", "cancelled", "missed"].includes(ride.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This ride is no longer accepting passengers" });
        }

        const passengers = await getRidePassengers(ride.id);
        if (passengers.some((p) => p.passengerId === req.passengerId)) {
          await updateJoinRequest(input.joinRequestId, { status: "approved", respondedAt: new Date() });
          return { success: true, alreadyJoined: true };
        }
        if (passengers.length >= (ride.totalSeats ?? 3)) {
          await updateJoinRequest(input.joinRequestId, { status: "rejected", respondedAt: new Date() });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is now full" });
        }

        const seatClaimed = await decrementRideSeat(ride.id);
        if (!seatClaimed) {
          await updateJoinRequest(input.joinRequestId, { status: "rejected", respondedAt: new Date() });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is now full" });
        }

        await updateJoinRequest(input.joinRequestId, { status: "approved", respondedAt: new Date() });

        try {
          await addRidePassenger({
            rideId: ride.id,
            passengerId: req.passengerId,
            pickupLat: req.pickupLat,
            pickupLng: req.pickupLng,
            pickupAddress: req.pickupAddress,
            dropoffLat: req.dropoffLat,
            dropoffLng: req.dropoffLng,
            dropoffAddress: req.dropoffAddress,
            distanceKm: req.distanceKm,
            fareShare: req.fareShare,
          });
        } catch (err) {
          await incrementRideSeat(ride.id);
          await updateJoinRequest(input.joinRequestId, { status: "pending", respondedAt: undefined });
          throw err;
        }

        pushRideStatusUpdate(req.rideId, "join_approved", [req.passengerId], {
          joinRequestId: input.joinRequestId,
          rideId: req.rideId,
          fareShare: req.fareShare,
        });

        await createNotification({
          notificationId: genId("notif"),
          userId: req.passengerId,
          type: "driver_assigned",
          title: "Ride Request Approved! ✅",
          body: "Your request to join the ride has been approved. See you there!",
          data: { rideId: req.rideId, deepLink: `/carpool-detail?rideId=${req.rideId}` },
          deepLink: `/carpool-detail?rideId=${req.rideId}`,
        });

        if (ride.driverId != null && ride.driverId !== organizerId) {
          const requesterUser = await getUserById(req.passengerId);
          await createNotification({
            notificationId: genId("notif"),
            userId: ride.driverId,
            type: "ride_request",
            title: "New passenger added",
            body: `${requesterUser?.name ?? "A passenger"} was approved to join your ride.`,
            data: { rideId: req.rideId },
            deepLink: `/driver/ride-detail?rideId=${req.rideId}`,
          }).catch(() => {});
        }

        return { success: true };
      }),

    /**
     * Driver rejects a join request.
     */
    rejectRequest: protectedProcedure
      .input(z.object({
        joinRequestId: z.string(),
        reason: z.string().max(200).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const req = await getJoinRequest(input.joinRequestId);
        if (!req) throw new TRPCError({ code: "BAD_REQUEST", message: "Join request not found" });

        const ride = await getRideByRideId(req.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        const organizerId = await getRideOrganizerId(ride);
        if (organizerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the ride organizer can reject requests" });
        }
        if (req.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Request is no longer pending" });
        }

        await updateJoinRequest(input.joinRequestId, { status: "rejected", respondedAt: new Date() });

        // Push instant SSE to passenger
        pushRideStatusUpdate(req.rideId, "join_rejected", [req.passengerId], {
          joinRequestId: input.joinRequestId,
          reason: input.reason ?? null,
        });

        await createNotification({
          notificationId: genId("notif"),
          userId: req.passengerId,
          type: "system",
          title: "Ride Request Not Approved",
          body: input.reason ?? "The driver could not accommodate your request for this ride.",
          data: { rideId: req.rideId },
        });

        return { success: true };
      }),

    /**
     * Get join requests for rides posted by this user.
     * Only includes rides that are active/upcoming (not completed/cancelled).
     * Accepted requests from rides that departed more than 48 h ago are excluded
     * to avoid stale history cluttering the Requests tab.
     */
    getAllJoinRequests: protectedProcedure.query(async ({ ctx }) => {
      const allCreatedRides = await getOrganizerRides(ctx.user.id);
      const now = Date.now();
      const cutoff48h = now - 48 * 60 * 60 * 1000;

      const relevantRides = allCreatedRides.filter((ride) => {
        if (ride.status === "completed" || ride.status === "cancelled") {
          const endTime = (ride.completedAt ?? ride.cancelledAt ?? ride.createdAt).getTime();
          return endTime > cutoff48h;
        }
        return true;
      });

      const allRequests: any[] = [];

      await Promise.all(
        relevantRides.map(async (ride) => {
          const requests = await getJoinRequestsForRide(ride.rideId);
          const passengers = await getRidePassengers(ride.id);
          const seatsAvailable = Math.max(0, (ride.totalSeats ?? 3) - passengers.length);
          await Promise.all(
            requests.map(async (req) => {
              if (req.status === "cancelled") return;

              const user = await getUserById(req.passengerId);
              const profile = await getUserProfileByUserId(req.passengerId);
              allRequests.push({
                joinRequestId: req.joinRequestId,
                rideId: ride.rideId,
                rideTitle: (ride as any).carpoolTitle ?? `${ride.pickupAddress.split(",")[0]} → ${ride.dropoffAddress.split(",")[0]}`,
                pickupAddress: req.pickupAddress ?? ride.pickupAddress ?? "",
                dropoffAddress: req.dropoffAddress ?? ride.dropoffAddress ?? "",
                departureTime: ride.departureTime?.toISOString() ?? null,
                pricePerSeat: Number(ride.pricePerSeat ?? req.fareShare ?? 0),
                status: req.status,
                seatsRequested: (req as any).seatsRequested ?? 1,
                message: req.message ?? null,
                createdAt: req.createdAt?.toISOString() ?? new Date().toISOString(),
                passengerName: user?.name ?? "Passenger",
                passengerId: req.passengerId,
                passengerRating: profile?.averageRating ?? "5.00",
                passengerRides: profile?.totalRides ?? 0,
                passengerGender: profile?.gender ?? null,
                passengerAge: null,
                isStudentVerified: (profile as any)?.isStudentVerified ?? false,
                isMidRideJoin: req.isMidRideJoin ?? false,
                detourKm: req.detourKm ?? null,
                bags: (req as any).bags ?? 0,
                genderPreference: (req as any).genderPreference ?? null,
                rideStatus: ride.status,
                rideType: ride.mode,
                approvalRequired: ride.approvalRequired ?? true,
                seatsAvailable,
                fareShare: Number(req.fareShare ?? 0),
              });
            }),
          );
        }),
      );

      allRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return allRequests;
    }),

    /** Alias for organizer join-request inbox used by passenger-posted rides. */
    getRequestsForMyPostedRides: protectedProcedure.query(async ({ ctx }) => {
      const allCreatedRides = await getOrganizerRides(ctx.user.id);
      const now = Date.now();
      const cutoff48h = now - 48 * 60 * 60 * 1000;
      const relevantRides = allCreatedRides.filter((ride) => {
        if (ride.status === "completed" || ride.status === "cancelled") {
          const endTime = (ride.completedAt ?? ride.cancelledAt ?? ride.createdAt).getTime();
          return endTime > cutoff48h;
        }
        return true;
      });

      const allRequests: any[] = [];
      await Promise.all(
        relevantRides.map(async (ride) => {
          const requests = await getJoinRequestsForRide(ride.rideId);
          await Promise.all(
            requests.map(async (req) => {
              if (req.status === "cancelled") return;
              const user = await getUserById(req.passengerId);
              const profile = await getUserProfileByUserId(req.passengerId);
              allRequests.push({
                id: req.joinRequestId,
                joinRequestId: req.joinRequestId,
                rideId: ride.rideId,
                requesterId: String(req.passengerId),
                requesterName: user?.name ?? "Passenger",
                requesterRating: profile?.averageRating != null ? Number(profile.averageRating) : undefined,
                requesterGender: profile?.gender ?? undefined,
                isStudentVerified: !!(profile as any)?.isStudentVerified,
                status: req.status,
                requestedSeats: 1,
                fareShare: Number(req.fareShare ?? 0),
                pickupLabel: req.pickupAddress,
                dropoffLabel: req.dropoffAddress,
                rideTitle: (ride as any).carpoolTitle ?? `${ride.pickupAddress.split(",")[0]} → ${ride.dropoffAddress.split(",")[0]}`,
                departureTime: ride.departureTime?.toISOString() ?? "",
                rideType: ride.mode,
                approvalRequired: ride.approvalRequired ?? true,
                requestedAt: req.createdAt?.toISOString() ?? new Date().toISOString(),
              });
            }),
          );
        }),
      );
      allRequests.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      return allRequests;
    }),

    /** Alias — join requests grouped by posted ride (passenger Requests tab). */
    getRideRequestGroups: protectedProcedure.query(async ({ ctx }) => {
      const allCreatedRides = await getOrganizerRides(ctx.user.id);
      const groups = await Promise.all(
        allCreatedRides.map(async (ride) => {
          const requests = await getJoinRequestsForRide(ride.rideId);
          const passengers = await getRidePassengers(ride.id);
          const items = await Promise.all(
            requests
              .filter((r) => r.status !== "cancelled")
              .map(async (req) => {
                const user = await getUserById(req.passengerId);
                const profile = await getUserProfileByUserId(req.passengerId);
                return {
                  joinRequestId: req.joinRequestId,
                  rideId: ride.rideId,
                  status: req.status,
                  passengerId: req.passengerId,
                  passengerName: user?.name ?? "Passenger",
                  passengerRating: profile?.averageRating ?? "5.00",
                  pickupAddress: req.pickupAddress ?? ride.pickupAddress,
                  dropoffAddress: req.dropoffAddress ?? ride.dropoffAddress,
                  fareShare: Number(req.fareShare ?? 0),
                  createdAt: req.createdAt?.toISOString() ?? new Date().toISOString(),
                  rideType: ride.mode,
                  departureTime: ride.departureTime?.toISOString() ?? null,
                  isScheduled: !!ride.departureTime && ride.departureTime.getTime() > Date.now(),
                };
              }),
          );
          return {
            rideId: ride.rideId,
            rideTitle: (ride as any).carpoolTitle ?? `${ride.pickupAddress.split(",")[0]} → ${ride.dropoffAddress.split(",")[0]}`,
            departureTime: ride.departureTime?.toISOString() ?? null,
            rideType: ride.mode,
            seatsAvailable: Math.max(0, (ride.totalSeats ?? 3) - passengers.length),
            requests: items,
          };
        }),
      );
      return groups.filter((g) => g.requests.length > 0 || g.seatsAvailable > 0);
    }),

    /**
     * Get rides the current user has CREATED (as a driver/poster).
     * Includes pending join requests for each ride.
     */
    getMyPostedRides: protectedProcedure.query(async ({ ctx }) => {
      const createdRides = await getOrganizerRides(ctx.user.id);
      const enriched = await Promise.all(
        createdRides.map(async (ride) => {
          const passengers = await getRidePassengers(ride.id);
          const joinRequests = await getJoinRequestsForRide(ride.rideId);
          return {
            ride: {
              ...ride,
              pricePerSeat: Number(ride.pricePerSeat ?? 0),
              totalSeats: ride.totalSeats ?? 3,
              departureTime: ride.departureTime?.toISOString() ?? null,
            },
            passengers: passengers.length,
            seatsAvailable: Math.max(0, (ride.totalSeats ?? 3) - passengers.length),
            pendingRequests: joinRequests.filter((r) => r.status === "pending"),
            approvedPassengers: joinRequests.filter((r) => r.status === "approved"),
          };
        }),
      );
      return enriched;
    }),

    /**
     * Get all join requests the current user has made.
     */
    getMyJoinRequests: protectedProcedure.query(async ({ ctx }) => {
      const requests = await getJoinRequestsByPassenger(ctx.user.id);
      const enriched = await Promise.all(
        requests.map(async (req) => {
          const ride = await getRideByRideId(req.rideId);
          if (!ride) return null;
          const driverProfile = ride.driverId != null ? await getUserProfileByUserId(ride.driverId) : null;
          const driverUser = ride.driverId != null ? await getUserById(ride.driverId) : null;
          const driverName = driverUser?.name ?? "Driver";
          return {
            joinRequest: req,
            ride: {
              ...ride,
              departureTime: ride.departureTime?.toISOString() ?? null,
              pricePerSeat: Number(ride.pricePerSeat ?? 0),
            },
            driver: {
              name: driverName,
              avatar: driverName.charAt(0).toUpperCase(),
              rating: Number(driverProfile?.averageRating ?? 4.8),
            },
          };
        }),
      );
      return enriched.filter(Boolean);
    }),

    /**
     * Create a recurring commute schedule.
     * System will auto-create ride instances in advance.
     */
    createRecurringRide: protectedProcedure
      .input(z.object({
        title: z.string().min(3).max(200),
        pickupLat: z.number(),
        pickupLng: z.number(),
        pickupAddress: z.string(),
        dropoffLat: z.number(),
        dropoffLng: z.number(),
        dropoffAddress: z.string(),
        distanceKm: z.number().optional(),
        estimatedMinutes: z.number().optional(),
        departureTimeOfDay: z.string().regex(/^\d{2}:\d{2}$/), // HH:MM
        daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
        pricePerSeat: z.number().min(1).max(200),
        totalSeats: z.number().min(1).max(6).default(3),
        safetyMode: z.enum(["none", "women_drivers_only", "women_companions_only", "women_only"]).default("none"),
        approvalRequired: z.boolean().default(true),
        maxOccurrences: z.number().int().min(1).max(500).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
      }))
      .mutation(async ({ ctx, input }) => {
        // Validate endDate is in the future
        if (input.endDate && new Date(input.endDate) <= new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be in the future" });
        }

        const recurringId = genId("rec");
        const recurring = await createRecurringRide({
          recurringId,
          creatorId: ctx.user.id,
          title: input.title,
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          distanceKm: input.distanceKm ? String(input.distanceKm) : undefined,
          estimatedMinutes: input.estimatedMinutes,
          departureTimeOfDay: input.departureTimeOfDay,
          daysOfWeek: input.daysOfWeek,
          pricePerSeat: String(input.pricePerSeat),
          totalSeats: input.totalSeats,
          safetyMode: input.safetyMode,
          approvalRequired: input.approvalRequired,
          isActive: true,
          maxOccurrences: input.maxOccurrences,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        } as any);

        // Auto-create ride instances for the next 7 days
        const createdRides = await _createRecurringInstances(recurring, ctx.user.id, 7);

        return { recurring, createdRides: createdRides.length };
      }),

    /**
     * List the current user's recurring ride schedules.
     */
    getMyRecurringRides: protectedProcedure.query(async ({ ctx }) => {
      const recurring = await getUserRecurringRides(ctx.user.id);
      return recurring;
    }),

    /**
     * Toggle a recurring ride on/off.
     */
    toggleRecurringRide: protectedProcedure
      .input(z.object({
        recurringId: z.string(),
        isActive: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const rec = await getRecurringRideById(input.recurringId);
        if (!rec) throw new TRPCError({ code: "BAD_REQUEST", message: "Recurring ride not found" });
        if (rec.creatorId !== ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Not your recurring ride" });
        await updateRecurringRide(input.recurringId, { isActive: input.isActive });
        // When toggling ON, auto-create ride instances for next 7 days
        if (input.isActive) {
          const updated = await getRecurringRideById(input.recurringId);
          if (updated) {
            await _createRecurringInstances(updated, rec.creatorId, 7);
          }
        }
        return { success: true };
      }),

    /** Delete a recurring ride schedule */
    deleteRecurringRide: protectedProcedure
      .input(z.object({ recurringId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const rec = await getRecurringRideById(input.recurringId);
        if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
        if (rec.creatorId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your schedule" });
        await deleteRecurringRide(input.recurringId);
        return { success: true };
      }),

    /** Edit a recurring ride schedule */
    editRecurringRide: protectedProcedure
      .input(z.object({
        recurringId: z.string(),
        title: z.string().min(3).max(200).optional(),
        pickupLat: z.number().optional(),
        pickupLng: z.number().optional(),
        pickupAddress: z.string().optional(),
        dropoffLat: z.number().optional(),
        dropoffLng: z.number().optional(),
        dropoffAddress: z.string().optional(),
        departureTimeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).optional(),
        pricePerSeat: z.number().min(1).max(200).optional(),
        totalSeats: z.number().min(1).max(6).optional(),
        safetyMode: z.enum(["none", "women_drivers_only", "women_companions_only", "women_only"]).optional(),
        approvalRequired: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const rec = await getRecurringRideById(input.recurringId);
        if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
        if (rec.creatorId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your schedule" });

        const { recurringId, ...patch } = input;
        const updateData: any = {};
        if (patch.title !== undefined) updateData.title = patch.title;
        if (patch.pickupLat !== undefined) updateData.pickupLat = String(patch.pickupLat);
        if (patch.pickupLng !== undefined) updateData.pickupLng = String(patch.pickupLng);
        if (patch.pickupAddress !== undefined) updateData.pickupAddress = patch.pickupAddress;
        if (patch.dropoffLat !== undefined) updateData.dropoffLat = String(patch.dropoffLat);
        if (patch.dropoffLng !== undefined) updateData.dropoffLng = String(patch.dropoffLng);
        if (patch.dropoffAddress !== undefined) updateData.dropoffAddress = patch.dropoffAddress;
        if (patch.departureTimeOfDay !== undefined) updateData.departureTimeOfDay = patch.departureTimeOfDay;
        if (patch.daysOfWeek !== undefined) updateData.daysOfWeek = patch.daysOfWeek;
        if (patch.pricePerSeat !== undefined) updateData.pricePerSeat = String(patch.pricePerSeat);
        if (patch.totalSeats !== undefined) updateData.totalSeats = patch.totalSeats;
        if (patch.safetyMode !== undefined) updateData.safetyMode = patch.safetyMode;
        if (patch.approvalRequired !== undefined) updateData.approvalRequired = patch.approvalRequired;

        await updateRecurringRide(recurringId, updateData);
        return { success: true };
      }),

    /**
     * Advance the P2P carpool ride lifecycle (organizer only).
     *
     * P2P lifecycle mapped to existing rideStep enum:
     *   driver_assigned  → "Accepting Requests" (initial state after posting)
     *   driver_en_route  → "Confirmed"          (organizer locked in the group)
     *   driver_arrived   → "Boarding"            (everyone meet at pickup)
     *   ride_started     → "In Progress"
     *   ride_in_progress → "In Progress (moving)"
     *   completed        → "Completed"
     */
    advanceCarpoolStep: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        toStep: z.enum(["driver_en_route", "driver_arrived", "ride_started", "ride_in_progress", "completed"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });
        if (ride.driverId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the organizer can advance this ride" });
        if (ride.status === "completed" || ride.status === "cancelled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride is already in a terminal state" });
        }

        const P2P_STEP_LABELS: Record<string, string> = {
          driver_en_route:   "Confirmed",
          driver_arrived:    "Boarding",
          ride_started:      "In Progress",
          ride_in_progress:  "Ride in Progress",
          completed:         "Completed",
        };

        const statusMap: Record<string, string> = {
          driver_en_route:  "matched",
          driver_arrived:   "driver_arrived",
          ride_started:     "in_progress",
          ride_in_progress: "in_progress",
          completed:        "completed",
        };

        const timestampMap: Record<string, Partial<Record<string, Date>>> = {
          driver_arrived:  { driverArrivedAt: new Date() },
          ride_started:    { startedAt: new Date() },
          completed:       { completedAt: new Date() },
        };

        const newDbStatus = statusMap[input.toStep];
        const extraTs = timestampMap[input.toStep] ?? {};

        await updateRide(ride.id, {
          rideStep: input.toStep as any,
          status: newDbStatus as any,
          ...extraTs,
        } as any);

        // Notify all passengers
        const joinRequests = await getJoinRequestsForRide(input.rideId);
        const passengerIds = joinRequests.filter(r => r.status === "approved").map(r => r.passengerId);
        const stepLabel = P2P_STEP_LABELS[input.toStep] ?? input.toStep;

        if (passengerIds.length > 0) {
          const body = input.toStep === "completed"
            ? "Your shared ride has been completed. Hope it was a great trip!"
            : input.toStep === "ride_started"
              ? "Your ride has started. Enjoy the trip!"
              : input.toStep === "driver_arrived"
                ? "Organizer is at the pickup — time to board!"
                : `Ride status updated: ${stepLabel}`;

          await Promise.all(passengerIds.map(pid =>
            createNotification({
              notificationId: genId("notif"),
              userId: pid,
              type: "ride_request",
              title: `Ride ${stepLabel}`,
              body,
              data: { rideId: input.rideId },
              deepLink: `/carpool-detail?rideId=${input.rideId}`,
            })
          ));
          pushRideStatusUpdate(input.rideId, "ride_step_changed", passengerIds, { rideId: input.rideId, step: input.toStep, label: stepLabel });
        }

        logger.info({ rideId: input.rideId, step: input.toStep, userId: ctx.user.id }, "[carpool] lifecycle advanced");
        return { success: true, step: input.toStep, label: stepLabel };
      }),

    /**
     * Get the public detail for a single carpool ride (for sharing links).
     */
    getCarpoolDetail: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        await reconcileExpiredRideByRideId(input.rideId);
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND", message: "Ride not found" });

        const passengers = await getRidePassengers(ride.id);
        const driverProfile = ride.driverId != null ? await getUserProfileByUserId(ride.driverId) : null;
        const driverUser = ride.driverId != null ? await getUserById(ride.driverId) : null;
        const joinRequests = await getJoinRequestsForRide(input.rideId);
        const myRequest = joinRequests.find((r) => r.passengerId === ctx.user.id);
        const seatsAvailable = Math.max(0, (ride.totalSeats ?? 3) - passengers.length);

        // Solo fare (what user would pay without sharing)
        const distKm = Number(ride.distanceKm);
        const soloFare = calculateFare({
          distanceKm: distKm,
          durationMinutes: ride.estimatedMinutes,
          mode: "solo",
        }).totalFare;

        const fareShare = ride.pricePerSeat
          ? Number(ride.pricePerSeat)
          : Math.round(Number(ride.totalFare) * 0.6 * 100) / 100;

        const driverName = driverUser?.name ?? "Driver";
        return {
          ride: {
            ...ride,
            departureTime: ride.departureTime?.toISOString() ?? null,
            pricePerSeat: Number(ride.pricePerSeat ?? fareShare),
            totalSeats: ride.totalSeats ?? 3,
            distanceKm: distKm,
          },
          driver: {
            id: ride.driverId,
            name: driverName,
            avatar: driverName.charAt(0).toUpperCase(),
            rating: Number(driverProfile?.averageRating ?? 4.8),
            totalRides: driverProfile?.totalRides ?? 0,
            gender: driverProfile?.gender ?? null,
          },
          passengers,
          seatsAvailable,
          fareShare,
          soloFare,
          savings: Math.max(0, soloFare - fareShare),
          myJoinStatus: myRequest?.status ?? null,
          isMyRide: ride.driverId === ctx.user.id,
          posterRole: (ride as any).posterRole ?? null,
          pendingRequests: ride.driverId === ctx.user.id
            ? joinRequests.filter((r) => r.status === "pending")
            : [],
        };
      }),
  }),

  // ─── Passenger Request Marketplace ─────────────────────────────────────────
  // Passenger posts a request → geofenced broadcast to nearby online drivers.
  // Driver accepts → ride is created and both parties are notified.
  passengerRequest: router({

    /**
     * Returns the user's currently active (broadcasting / just-matched) passenger requests.
     * Used by the My Rides tab to show pending broadcast cards.
     */
    getMyActiveRequests: protectedProcedure
      .query(async ({ ctx }) => {
        const rows = await db
          .select()
          .from(passengerRequests)
          .where(
            and(
              eq(passengerRequests.passengerId, ctx.user.id),
              inArray(passengerRequests.status, ["broadcasting", "matched"])
            )
          )
          .orderBy(desc(passengerRequests.createdAt))
          .limit(5);
        return rows.map(r => {
          const ageMin = (Date.now() - r.createdAt.getTime()) / 60_000;
          const base = Math.min(80, (r.driversNotified / 5) * 25);
          const timeFactor = Math.min(20, ageMin * 3);
          const viewBonus = Math.min(15, r.driversViewed * 5);
          const matchProbability = r.status === "matched"
            ? 100
            : Math.round(Math.min(95, base + timeFactor + viewBonus));
          return {
            requestId:       r.requestId,
            status:          r.status,
            pickupAddress:   r.pickupAddress,
            dropoffAddress:  r.dropoffAddress,
            offerPrice:      Number(r.offerPrice),
            driversNotified: r.driversNotified,
            driversViewed:   r.driversViewed,
            matchedRideId:   r.matchedRideId ?? null,
            matchProbability,
            expiresAt:       r.expiresAt.toISOString(),
            createdAt:       r.createdAt.toISOString(),
          };
        });
      }),

    /**
     * POST a ride request as a passenger.
     * Creates the DB record, triggers geofenced broadcast, returns live stats.
     */
    create: protectedProcedure
      .input(z.object({
        pickupLat: z.number(),
        pickupLng: z.number(),
        pickupAddress: z.string().min(3).max(255),
        dropoffLat: z.number(),
        dropoffLng: z.number(),
        dropoffAddress: z.string().min(3).max(255),
        passengerCount: z.number().int().min(1).max(6).default(1),
        offerPrice: z.number().min(1).max(500),
        distanceKm: z.number().positive().max(500).optional(),
        estimatedMinutes: z.number().int().positive().optional(),
        radiusKm: z.number().min(1).max(20).default(3),
      }))
      .mutation(async ({ ctx, input }) => {
        const requestId = `preq_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute TTL

        // Persist the request
        await db.insert(passengerRequests).values({
          requestId,
          passengerId: ctx.user.id,
          pickupLat: String(input.pickupLat),
          pickupLng: String(input.pickupLng),
          pickupAddress: input.pickupAddress,
          dropoffLat: String(input.dropoffLat),
          dropoffLng: String(input.dropoffLng),
          dropoffAddress: input.dropoffAddress,
          passengerCount: input.passengerCount,
          offerPrice: String(input.offerPrice),
          distanceKm: input.distanceKm != null ? String(input.distanceKm) : null,
          estimatedMinutes: input.estimatedMinutes ?? null,
          status: "broadcasting",
          broadcastRadiusKm: String(input.radiusKm),
          driversNotified: 0,
          driversViewed: 0,
          expiresAt,
        });

        // Geofenced broadcast — fire in background, update count after
        const driversNotified = await broadcastPassengerRequest({
          requestId,
          passengerId: ctx.user.id,
          pickupLat: input.pickupLat,
          pickupLng: input.pickupLng,
          pickupAddress: input.pickupAddress,
          dropoffLat: input.dropoffLat,
          dropoffLng: input.dropoffLng,
          dropoffAddress: input.dropoffAddress,
          passengerCount: input.passengerCount,
          offerPrice: input.offerPrice,
          distanceKm: input.distanceKm ?? 10,
          radiusKm: input.radiusKm,
        });

        // Persist notified count
        await db
          .update(passengerRequests)
          .set({ driversNotified })
          .where(eq(passengerRequests.requestId, requestId));

        return {
          requestId,
          driversNotified,
          expiresAt: expiresAt.toISOString(),
          status: "broadcasting" as const,
        };
      }),

    /**
     * Poll live stats for a passenger request (drivers notified, views, match status).
     * Passenger app polls this every few seconds to update the live-match UI.
     */
    getLiveStats: protectedProcedure
      .input(z.object({ requestId: z.string() }))
      .query(async ({ ctx, input }) => {
        const rows = await db
          .select()
          .from(passengerRequests)
          .where(eq(passengerRequests.requestId, input.requestId))
          .limit(1);
        const req = rows[0];
        if (!req || req.passengerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        }

        // Auto-expire if TTL passed
        if (req.status === "broadcasting" && new Date() > req.expiresAt) {
          await db
            .update(passengerRequests)
            .set({ status: "expired" })
            .where(eq(passengerRequests.requestId, input.requestId));
          return { ...req, status: "expired" as const, matchProbability: 0 };
        }

        // Simple match probability heuristic based on drivers notified + time elapsed
        const ageMs = Date.now() - new Date(req.createdAt).getTime();
        const ageMin = ageMs / 60_000;
        const base = Math.min(80, (req.driversNotified / 5) * 25); // 5 drivers → 25% base
        const timeFactor = Math.min(20, ageMin * 3); // grows over first ~7 min
        const viewBonus = Math.min(15, req.driversViewed * 5);
        const matchProbability = Math.round(Math.min(95, base + timeFactor + viewBonus));

        return {
          requestId: req.requestId,
          status: req.status,
          driversNotified: req.driversNotified,
          driversViewed: req.driversViewed,
          matchProbability,
          matchedDriverId: req.matchedDriverId ?? null,
          matchedRideId: req.matchedRideId ?? null,
          expiresAt: req.expiresAt.toISOString(),
          createdAt: req.createdAt.toISOString(),
        };
      }),

    /**
     * Passenger cancels their broadcast request.
     */
    cancel: protectedProcedure
      .input(z.object({ requestId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const rows = await db
          .select({ id: passengerRequests.id, passengerId: passengerRequests.passengerId, status: passengerRequests.status })
          .from(passengerRequests)
          .where(eq(passengerRequests.requestId, input.requestId))
          .limit(1);
        const req = rows[0];
        if (!req || req.passengerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        }
        if (req.status === "matched") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cannot cancel a matched request" });
        }
        await db
          .update(passengerRequests)
          .set({ status: "cancelled" })
          .where(eq(passengerRequests.requestId, input.requestId));
        return { success: true };
      }),

    /**
     * Passenger raises their broadcast offer price while still searching.
     */
    updateOffer: protectedProcedure
      .input(z.object({ requestId: z.string(), offerPrice: z.number().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        const rows = await db.select()
          .from(passengerRequests)
          .where(eq(passengerRequests.requestId, input.requestId))
          .limit(1);
        const req = rows[0];
        if (!req || req.passengerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        }
        if (req.status !== "broadcasting") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Can only update offer while broadcasting" });
        }
        await db.update(passengerRequests)
          .set({ offerPrice: String(input.offerPrice) })
          .where(eq(passengerRequests.requestId, input.requestId));
        return { success: true, offerPrice: input.offerPrice };
      }),

    /**
     * Returns passenger requests accepted by the current driver (status = matched).
     * Uses protectedProcedure so non-drivers get an empty array gracefully.
     */
    getMyAcceptedAsDriver: protectedProcedure
      .query(async ({ ctx }) => {
        const rows = await db.select()
          .from(passengerRequests)
          .where(
            and(
              eq(passengerRequests.matchedDriverId, ctx.user.id),
              eq(passengerRequests.status, "matched"),
            )
          )
          .orderBy(desc(passengerRequests.createdAt))
          .limit(10);
        return rows.map(r => ({
          requestId:        r.requestId,
          passengerId:      r.passengerId,
          pickupAddress:    r.pickupAddress,
          dropoffAddress:   r.dropoffAddress,
          offerPrice:       Number(r.offerPrice),
          passengerCount:   r.passengerCount,
          distanceKm:       r.distanceKm ? Number(r.distanceKm) : null,
          estimatedMinutes: r.estimatedMinutes ?? null,
          createdAt:        r.createdAt.toISOString(),
        }));
      }),

    /**
     * Driver accepts a passenger request — creates a ride, marks request matched, notifies passenger.
     */
    driverAccept: driverProcedure
      .input(z.object({ requestId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const rows = await db
          .select()
          .from(passengerRequests)
          .where(eq(passengerRequests.requestId, input.requestId))
          .limit(1);
        const req = rows[0];
        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        if (req.status !== "broadcasting") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Request is no longer active" });
        }

        // Create an actual ride so all subsequent driver endpoints (arriveAtPickup, startRide, etc.)
        // can look it up by rideId and verify driverId ownership.
        const newRideId = genId("ride");
        await createRide({
          rideId: newRideId,
          driverId: ctx.user.id,
          mode: "solo",
          status: STEP_TO_DB_STATUS["driver_en_route"],
          rideStep: "driver_en_route",
          pickupLat: req.pickupLat,
          pickupLng: req.pickupLng,
          pickupAddress: req.pickupAddress,
          dropoffLat: req.dropoffLat,
          dropoffLng: req.dropoffLng,
          dropoffAddress: req.dropoffAddress,
          distanceKm: req.distanceKm ?? "0",
          estimatedMinutes: req.estimatedMinutes ?? 0,
          totalFare: req.offerPrice,
          driverAssignedAt: new Date(),
        } as any);

        await addRidePassenger({
          rideId: newRideId,
          passengerId: req.passengerId,
          pickupLat: req.pickupLat,
          pickupLng: req.pickupLng,
          pickupAddress: req.pickupAddress,
          dropoffLat: req.dropoffLat,
          dropoffLng: req.dropoffLng,
          dropoffAddress: req.dropoffAddress,
          distanceKm: req.distanceKm ?? "0",
          fareShare: req.offerPrice,
          status: "joined",
        } as any);

        await db
          .update(passengerRequests)
          .set({ status: "matched", matchedDriverId: ctx.user.id, matchedRideId: newRideId })
          .where(eq(passengerRequests.requestId, input.requestId));

        await upsertDriverSession(ctx.user.id, {
          status: "on_ride",
          currentRideId: newRideId,
          lastSeenAt: new Date(),
        });

        pushRideStatusUpdate(newRideId, "driver_en_route", [req.passengerId], { driverId: ctx.user.id });

        const driverUser = await getUserById(ctx.user.id);
        const driverName = driverUser?.name ?? "Your driver";
        const pickupShort = (req.pickupAddress || "").split(",")[0] || "pickup";
        await notifyUser({
          userId: req.passengerId,
          recipientRole: "passenger",
          type: "driver_assigned",
          title: `${driverName} accepted your request!`,
          body: `Your driver is heading to ${pickupShort}.`,
          data: { rideId: newRideId, requestId: input.requestId, driverId: ctx.user.id },
          deepLink: "/active-ride",
        });

        const { notificationBus } = await import("./services/notificationService");
        notificationBus.pushToUser(req.passengerId, {
          type: "passenger_request_matched",
          requestId: input.requestId,
          rideId: newRideId,
          driverId: ctx.user.id,
        });

        return { success: true, rideId: newRideId, passengerId: req.passengerId };
      }),

    driverDecline: driverProcedure
      .input(z.object({ requestId: z.string() }))
      .mutation(async ({ input }) => {
        await db
          .update(passengerRequests)
          .set({ driversViewed: sql`${passengerRequests.driversViewed} + 1` })
          .where(
            and(
              eq(passengerRequests.requestId, input.requestId),
              eq(passengerRequests.status, "broadcasting"),
            ),
          );
        return { success: true };
      }),

    /**
     * Driver views a request — increment the views counter (drives match probability up).
     */
    driverView: driverProcedure
      .input(z.object({ requestId: z.string() }))
      .mutation(async ({ input }) => {
        await db
          .update(passengerRequests)
          .set({ driversViewed: sql`${passengerRequests.driversViewed} + 1` })
          .where(
            and(
              eq(passengerRequests.requestId, input.requestId),
              eq(passengerRequests.status, "broadcasting"),
            ),
          );
        return { success: true };
      }),

    /**
     * Get all active requests the passenger has posted.
     */
    myRequests: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db
        .select()
        .from(passengerRequests)
        .where(eq(passengerRequests.passengerId, ctx.user.id))
        .orderBy(desc(passengerRequests.createdAt))
        .limit(20);
      return rows.map((r) => ({
        ...r,
        offerPrice: Number(r.offerPrice),
        distanceKm: r.distanceKm != null ? Number(r.distanceKm) : null,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }));
    }),

    /** Alias — posted broadcast ride requests (same as myRequests). */
    getPostedRideRequests: protectedProcedure.query(async ({ ctx }) => {
      const rows = await db
        .select()
        .from(passengerRequests)
        .where(eq(passengerRequests.passengerId, ctx.user.id))
        .orderBy(desc(passengerRequests.createdAt))
        .limit(50);
      return rows.map((r) => ({
        requestId: r.requestId,
        status: r.status,
        pickupAddress: r.pickupAddress,
        dropoffAddress: r.dropoffAddress,
        offerPrice: Number(r.offerPrice),
        passengerCount: r.passengerCount,
        matchedDriverId: r.matchedDriverId ?? null,
        matchedRideId: r.matchedRideId ?? null,
        isScheduled: false,
        isSharedRide: r.passengerCount > 1,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }));
    }),

    /** Alias — cancel a posted broadcast request (same as cancel). */
    cancelRideRequest: protectedProcedure
      .input(z.object({ requestId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const rows = await db
          .select({ id: passengerRequests.id, passengerId: passengerRequests.passengerId, status: passengerRequests.status })
          .from(passengerRequests)
          .where(eq(passengerRequests.requestId, input.requestId))
          .limit(1);
        const req = rows[0];
        if (!req || req.passengerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        }
        if (req.status === "matched") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cannot cancel a matched request" });
        }
        await db
          .update(passengerRequests)
          .set({ status: "cancelled" })
          .where(eq(passengerRequests.requestId, input.requestId));
        return { success: true, requestId: input.requestId, status: "cancelled" as const };
      }),
  }),

  /** @deprecated Use payment.* — legacy DB-backed card store; no client callers. */
  paymentMethods: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getPaymentMethodsByUserId(ctx.user.id);
    }),

    getDefault: protectedProcedure.query(async ({ ctx }) => {
      return (await getDefaultPaymentMethod(ctx.user.id)) ?? null;
    }),

    add: protectedProcedure
      .input(z.object({
        cardType: z.enum(["visa", "mastercard", "amex", "discover"]),
        last4: z.string().length(4),
        holderName: z.string().min(1).max(100),
        expiryMonth: z.number().int().min(1).max(12),
        expiryYear: z.number().int().min(2024).max(2050),
        isDefault: z.boolean().optional(),
        stripePaymentMethodId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return addPaymentMethod({
          userId: ctx.user.id,
          ...input,
          isDefault: input.isDefault ?? false,
        });
      }),

    setDefault: protectedProcedure
      .input(z.object({ paymentMethodId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await setDefaultPaymentMethod(ctx.user.id, input.paymentMethodId);
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ paymentMethodId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await deletePaymentMethod(ctx.user.id, input.paymentMethodId);
        return { success: true };
      }),
  }),

  // ── PAYMENT METHODS (Stripe — canonical) ──────────────────────────────────
  payment: router({
    isConfigured: protectedProcedure.query(() => ({
      configured: isStripeConfigured(),
    })),

    createSetupIntent: protectedProcedure.mutation(async ({ ctx }) => {
      if (!isStripeConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured on the server." });
      }
      return createStripeSetupIntent(ctx.user.id);
    }),

    confirmSetupIntent: protectedProcedure
      .input(z.object({ setupIntentId: z.string().startsWith("seti_") }))
      .mutation(async ({ ctx, input }) => {
        if (!isStripeConfigured()) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured on the server." });
        }
        return syncPaymentMethodFromSetupIntent(ctx.user.id, input.setupIntentId);
      }),

    listPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
      const methods = await listStripePaymentMethods(ctx.user.id);
      return methods.map((m) => ({
        id: m.stripePmId,
        brand: m.cardBrand,
        last4: m.cardLast4,
        expMonth: m.cardExpMonth,
        expYear: m.cardExpYear,
        isDefault: m.isDefault,
      }));
    }),

    getDefaultPaymentMethod: protectedProcedure.query(async ({ ctx }) => {
      const pm = await getDefaultStripePM(ctx.user.id);
      if (!pm) return null;
      return {
        id: pm.stripePmId,
        brand: pm.cardBrand,
        last4: pm.cardLast4,
        expMonth: pm.cardExpMonth,
        expYear: pm.cardExpYear,
        isDefault: pm.isDefault,
      };
    }),

    setDefaultPaymentMethod: protectedProcedure
      .input(z.object({ paymentMethodId: z.string().startsWith("pm_") }))
      .mutation(async ({ ctx, input }) => {
        await setDefaultStripePM(ctx.user.id, input.paymentMethodId);
        return { success: true };
      }),

    removePaymentMethod: protectedProcedure
      .input(z.object({ paymentMethodId: z.string().startsWith("pm_") }))
      .mutation(async ({ ctx, input }) => {
        await removeStripePM(ctx.user.id, input.paymentMethodId);
        return { success: true };
      }),
  }),

  // ── STRIPE PAYMENTS ───────────────────────────────────────────────────────
  stripe: router({

    // ── Rider: Customer & Card Management ──

    /** Create or get Stripe customer for rider */
    createCustomer: protectedProcedure.mutation(async ({ ctx }) => {
      const customer = await getOrCreateStripeCustomer(ctx.user.id);
      return { customerId: customer?.stripeCustomerId ?? null };
    }),

    /** Create SetupIntent to save a card */
    createSetupIntent: protectedProcedure.mutation(async ({ ctx }) => {
      return createStripeSetupIntent(ctx.user.id);
    }),

    /** Attach a Stripe PaymentMethod (tokenized client-side) to the customer */
    attachPaymentMethod: protectedProcedure
      .input(z.object({
        paymentMethodId: z.string().startsWith("pm_"),
        setDefault: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        return attachPaymentMethod({
          userId: ctx.user.id,
          paymentMethodId: input.paymentMethodId,
          setDefault: input.setDefault,
        });
      }),

    /** List saved payment methods */
    listPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
      const methods = await listStripePaymentMethods(ctx.user.id);
      return methods.map((m: any) => ({
        id: m.stripePmId,
        type: m.type,
        brand: m.cardBrand,
        last4: m.cardLast4,
        expMonth: m.cardExpMonth,
        expYear: m.cardExpYear,
        isDefault: m.isDefault,
      }));
    }),

    /** Set default payment method */
    setDefaultPaymentMethod: protectedProcedure
      .input(z.object({ paymentMethodId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await setDefaultStripePM(ctx.user.id, input.paymentMethodId);
        return { success: true };
      }),

    /** Remove a payment method */
    removePaymentMethod: protectedProcedure
      .input(z.object({ paymentMethodId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await removeStripePM(ctx.user.id, input.paymentMethodId);
        return { success: true };
      }),

    // ── Driver: Connected Account ──

    /** Create Stripe Connect account for driver */
    createConnectedAccount: protectedProcedure.mutation(async ({ ctx }) => {
      const account = await createStripeConnectedAccount(ctx.user.id);
      if (!account) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let onboardingUrl: string | null = null;
      if (!account.onboardingComplete) {
        onboardingUrl = await generateOnboardingLink(account.stripeAccountId);
      }
      return { accountId: account.stripeAccountId, onboardingUrl };
    }),

    /** Get onboarding link (fresh, since they expire) */
    getOnboardingLink: protectedProcedure.mutation(async ({ ctx }) => {
      const account = await getConnectedAccount(ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "No connected account" });
      const url = await generateOnboardingLink(account.stripeAccountId);
      return { onboardingUrl: url };
    }),

    /** Check connected account status */
    getConnectedAccountStatus: protectedProcedure.query(async ({ ctx }) => {
      const status = await syncConnectedAccountStatus(ctx.user.id);
      if (!status) return null;

      let dashboardUrl: string | null = null;
      if (status.chargesEnabled) {
        try { dashboardUrl = await generateDashboardLink(status.stripeAccountId); } catch {}
      }
      return { ...status, dashboardUrl };
    }),

    // ── Payments ──

    /** Passenger adds a tip after ride completion */
    addTip: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        amountCents: z.number().int().min(100).max(50000),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND" });
        if (ride.status !== "completed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ride must be completed before tipping" });
        }
        const passengers = await getRidePassengers(ride.id);
        if (!passengers.some((p) => p.passengerId === ctx.user.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your ride" });
        }
        if (!ride.driverId) throw new TRPCError({ code: "BAD_REQUEST", message: "No driver on this ride" });

        const tipDollars = input.amountCents / 100;
        await updateWalletBalance(ride.driverId, tipDollars);
        await createTransaction({
          transactionId: genId("txn"),
          userId: ride.driverId,
          type: "credit",
          amount: String(tipDollars),
          description: `Tip from passenger for ride ${input.rideId}`,
          relatedRideId: ride.id,
        });

        const payment = await db.query.stripePayments.findFirst({
          where: eq(stripePayments.rideId, ride.id),
        });
        if (payment) {
          await db
            .update(stripePayments)
            .set({
              tipCents: sql`${stripePayments.tipCents} + ${input.amountCents}`,
              driverAmountCents: sql`${stripePayments.driverAmountCents} + ${input.amountCents}`,
              amountCents: sql`${stripePayments.amountCents} + ${input.amountCents}`,
            })
            .where(eq(stripePayments.id, payment.id));
        }

        await notifyUser({
          userId: ride.driverId,
          recipientRole: "driver",
          type: "payment_received",
          title: `You received a $${tipDollars.toFixed(2)} tip!`,
          body: "A passenger appreciated your service.",
          data: { rideId: input.rideId, tipCents: input.amountCents },
          deepLink: "/driver/(tabs)/earnings",
        });

        return { success: true, tipCents: input.amountCents };
      }),

    /** Charge rider for a completed ride */
    chargeRide: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        tipCents: z.number().int().min(0).default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND" });
        if (ride.status !== "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Ride not completed" });

        const passengers = await getRidePassengers(ride.id);
        const myPassenger = passengers.find((p) => p.passengerId === ctx.user.id);
        if (!myPassenger) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not a passenger on this ride." });
        }
        const fareCents =
          Math.round(Number(myPassenger.fareShare) * 100) + PLATFORM_FEE_CENTS;
        return chargeRideStripe({
          rideId: input.rideId,
          rideDbId: ride.id,
          riderId: ctx.user.id,
          driverId: ride.driverId,
          fareCents,
          tipCents: input.tipCents,
        });
      }),

    /** Refund a ride payment */
    refundRide: protectedProcedure
      .input(z.object({
        rideId: z.string(),
        amountCents: z.number().int().min(0).optional(),
        reason: z.enum(["rider_cancelled", "driver_cancelled", "wrong_route", "overcharge", "safety_issue", "other"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) throw new TRPCError({ code: "NOT_FOUND" });

        return refundRidePayment({
          rideId: input.rideId,
          rideDbId: ride.id,
          amountCents: input.amountCents,
          reason: input.reason,
          initiatedBy: "rider",
        });
      }),

    /** Get payment details for a ride */
    getRidePayment: protectedProcedure
      .input(z.object({ rideId: z.string() }))
      .query(async ({ ctx, input }) => {
        const ride = await getRideByRideId(input.rideId);
        if (!ride) return null;

        const { getLedgerPaymentForRide } = await import("./services/paymentLedgerService");
        const ledger = await getLedgerPaymentForRide(ride.id, ctx.user.id);
        if (!ledger || ledger.source !== "stripe") return null;
        const payment = await db.query.stripePayments.findFirst({
          where: eq(stripePayments.paymentId, ledger.paymentId),
        });
        if (!payment) return null;

        let cardBrand: string | null = null;
        let cardLast4: string | null = null;
        if (payment.paymentMethodId) {
          const pm = await db.query.stripePaymentMethods.findFirst({
            where: eq(stripePaymentMethods.stripePmId, payment.paymentMethodId),
          });
          cardBrand = pm?.cardBrand ?? null;
          cardLast4 = pm?.cardLast4 ?? null;
        }

        return {
          paymentId: payment.paymentId,
          amountCents: payment.amountCents,
          platformFeeCents: payment.platformFeeCents,
          driverAmountCents: payment.driverAmountCents,
          tipCents: payment.tipCents,
          status: payment.status,
          paidAt: payment.paidAt?.toISOString() ?? null,
          paymentMethodId: payment.paymentMethodId ?? null,
          cardBrand,
          cardLast4,
        };
      }),
  }),

  // ── SUPPORT ────────────────────────────────────────────────────────────────
  support: router({
    createTicket: protectedProcedure
      .input(
        z.object({
          category: z.enum(["ride_issue", "payment", "account", "driver", "safety", "app_bug", "feedback", "other"]),
          subject: z.string().min(5).max(500),
          description: z.string().min(10).max(5000),
          rideId: z.number().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return createSupportTicket(ctx.user.id, input);
      }),

    getMyTickets: protectedProcedure
      .input(
        z
          .object({
            status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        return getUserTickets(ctx.user.id, input?.status);
      }),

    getTicketDetail: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .query(async ({ ctx, input }) => {
        return getTicketDetail(ctx.user.id, input.ticketId);
      }),

    addMessage: protectedProcedure
      .input(
        z.object({
          ticketId: z.string(),
          message: z.string().min(1).max(5000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return addTicketMessage(input.ticketId, ctx.user.id, "user", input.message);
      }),

    closeTicket: protectedProcedure
      .input(z.object({ ticketId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return closeTicket(input.ticketId, ctx.user.id);
      }),

    getFAQs: protectedProcedure
      .input(
        z
          .object({
            category: z.enum(["general", "rides", "payments", "safety", "account", "driver"]).optional(),
          })
          .optional(),
      )
      .query(async ({ input }) => {
        return getActiveFAQs(input?.category);
      }),
  }),

  // ── LIVE CHAT ─────────────────────────────────────────────────────────────
  liveChat: router({
    requestChat: protectedProcedure
      .input(z.object({
        category: z.enum(["general", "ride_issue", "payment", "account", "technical", "safety", "driver_support", "other"]),
        issueDescription: z.string().min(5).max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        return requestLiveChat(ctx.user.id, input);
      }),

    getMySessions: protectedProcedure.query(async ({ ctx }) => {
      return getUserChatSessions(ctx.user.id);
    }),

    getSessionDetail: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ ctx, input }) => {
        return getChatSessionDetail(ctx.user.id, input.sessionId);
      }),

    sendMessage: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        content: z.string().min(1).max(5000),
      }))
      .mutation(async ({ ctx, input }) => {
        return sendLiveChatMsg(input.sessionId, ctx.user.id, "user", input.content);
      }),

    endChat: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return endLiveChat(input.sessionId, ctx.user.id);
      }),

    rateChat: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        rating: z.number().min(1).max(5),
        feedback: z.string().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return rateLiveChat(input.sessionId, ctx.user.id, input.rating, input.feedback);
      }),
  }),

  // ── STUDENT VERIFICATION ────────────────────────────────────────────────────
  student: router({

    /**
     * Step 1 — Send OTP to a .edu email address.
     *
     * Validates:
     *  - email format is a real .edu address (not disposable)
     *  - email is not already verified by a *different* account
     *  - resend cooldown (60 s) has elapsed since the last send
     *
     * Creates a new `studentVerifications` row and emails the hashed OTP.
     */
    sendVerificationOtp: protectedProcedure
      .input(
        z.object({
          email: z.string().email().max(255),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const email = input.email.trim().toLowerCase();

        // ── Validate .edu domain ──────────────────────────────────────────────
        if (!isEduEmail(email)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please enter a valid .edu university email address.",
          });
        }

        // ── Duplicate-email guard ─────────────────────────────────────────────
        const existing = await getStudentVerificationByEmail(email);
        if (existing && existing.userId !== userId && existing.status === "verified") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This email is already verified by another account.",
          });
        }

        // ── Resend cooldown ───────────────────────────────────────────────────
        const latest = await getLatestStudentVerification(userId);
        if (latest && latest.status === "pending") {
          const elapsed = Date.now() - new Date(latest.lastSentAt).getTime();
          if (elapsed < RESEND_COOLDOWN_MS) {
            const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1_000);
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Please wait ${waitSec}s before requesting another code.`,
            });
          }
        }

        // Expire any existing pending records for this user
        if (latest && latest.status === "pending") {
          await updateStudentVerification(latest.id, { status: "expired" });
        }

        // ── Generate & store OTP ──────────────────────────────────────────────
        const otp = generateOtp();
        const otpHash = await hashOtp(otp);
        const { name: universityName, domain: universityDomain } = getUniversityInfo(email);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        const verificationId = `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        await createStudentVerification({
          verificationId,
          userId,
          email,
          otpHash,
          status: "pending",
          attempts: 0,
          expiresAt,
          lastSentAt: new Date(),
          universityName,
          universityDomain,
          ipAddress: (ctx as any).req?.ip ?? null,
        });

        // ── Send email (best-effort — console fallback in dev) ────────────────
        try {
          await sendStudentVerificationEmail(email, otp, universityName);
        } catch (err) {
          logger.warn({ err, email }, "[StudentVerification] Email send failed");
        }

        logger.info({ userId, email, otp }, "[StudentVerification] OTP issued");

        return {
          success: true,
          expiresIn: OTP_TTL_MS / 1_000,
          universityName,
          maskedEmail: email.replace(/(?<=.).(?=[^@]*@)/g, "*"),
        };
      }),

    /**
     * Step 2 — Verify the OTP entered by the user.
     *
     * On success:
     *  - flips the verification record to "verified"
     *  - sets isStudentVerified = true on userProfiles
     *
     * Security:
     *  - max 5 attempts before record is locked (must re-send)
     *  - expiry checked before bcrypt compare
     *  - constant-time bcrypt compare prevents timing attacks
     */
    verifyOtp: protectedProcedure
      .input(
        z.object({
          otp: z.string().length(6).regex(/^\d{6}$/),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;

        const record = await getLatestStudentVerification(userId);

        if (!record || record.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No pending verification found. Please request a new code.",
          });
        }

        // ── Attempt limit ─────────────────────────────────────────────────────
        if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
          await updateStudentVerification(record.id, { status: "expired" });
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many incorrect attempts. Please request a new code.",
          });
        }

        // ── Expiry check ──────────────────────────────────────────────────────
        if (new Date() > new Date(record.expiresAt)) {
          await updateStudentVerification(record.id, { status: "expired" });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Verification code has expired. Please request a new one.",
          });
        }

        // ── Constant-time OTP comparison ──────────────────────────────────────
        const valid = await verifyOtpHash(input.otp, record.otpHash);
        if (!valid) {
          await incrementStudentVerificationAttempts(record.id);
          const attemptsLeft = MAX_VERIFY_ATTEMPTS - (record.attempts + 1);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              attemptsLeft > 0
                ? `Invalid code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`
                : "Too many incorrect attempts. Please request a new code.",
          });
        }

        // ── Mark verified ─────────────────────────────────────────────────────
        await markUserStudentVerified(
          userId,
          record.id,
          record.email,
          record.universityName ?? getUniversityInfo(record.email).name,
          record.universityDomain ?? getUniversityInfo(record.email).domain,
        );

        logger.info({ userId, email: record.email }, "[StudentVerification] Verified");

        return {
          success: true,
          universityName: record.universityName,
          universityDomain: record.universityDomain,
          verifiedEmail: record.email,
        };
      }),

    /**
     * Resend OTP — creates a fresh 6-digit code for the same email.
     * Enforces the 60-second resend cooldown.
     */
    resendOtp: protectedProcedure
      .mutation(async ({ ctx }) => {
        const userId = ctx.user.id;

        const latest = await getLatestStudentVerification(userId);

        if (!latest || latest.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No pending verification found. Please start a new verification.",
          });
        }

        // ── Cooldown check ────────────────────────────────────────────────────
        const elapsed = Date.now() - new Date(latest.lastSentAt).getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
          const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1_000);
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Please wait ${waitSec}s before requesting another code.`,
          });
        }

        // ── Fresh OTP ─────────────────────────────────────────────────────────
        const otp = generateOtp();
        const otpHash = await hashOtp(otp);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);

        await updateStudentVerification(latest.id, {
          otpHash,
          expiresAt,
          lastSentAt: new Date(),
          attempts: 0,
        });

        const universityName = latest.universityName ?? getUniversityInfo(latest.email).name;

        try {
          await sendStudentVerificationEmail(latest.email, otp, universityName);
        } catch (err) {
          logger.warn({ err }, "[StudentVerification] Resend email failed");
        }

        logger.info({ userId, email: latest.email, otp }, "[StudentVerification] OTP resent");

        return {
          success: true,
          expiresIn: OTP_TTL_MS / 1_000,
          maskedEmail: latest.email.replace(/(?<=.).(?=[^@]*@)/g, "*"),
        };
      }),

    /**
     * Get current student verification status for the logged-in user.
     * Safe to poll from the profile screen.
     */
    getStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const userId = ctx.user.id;

        // Pull profile fields and latest verification record in parallel
        const [profile, latest] = await Promise.all([
          getUserProfileByUserId(userId),
          getLatestStudentVerification(userId),
        ]);

        const isVerified = profile?.isStudentVerified ?? false;

        if (isVerified) {
          return {
            status: "verified" as const,
            verifiedEmail: profile?.collegeEmail ?? null,
            universityName: profile?.studentUniversityName ?? null,
            universityDomain: profile?.studentUniversityDomain ?? null,
            verifiedAt: profile?.studentVerifiedAt ?? null,
          };
        }

        if (latest?.status === "pending") {
          const expired = new Date() > new Date(latest.expiresAt);
          return {
            status: expired ? ("expired" as const) : ("pending" as const),
            verifiedEmail: null,
            universityName: latest.universityName ?? null,
            universityDomain: latest.universityDomain ?? null,
            verifiedAt: null,
            maskedEmail: latest.email.replace(/(?<=.).(?=[^@]*@)/g, "*"),
            attemptsUsed: latest.attempts,
            expiresAt: latest.expiresAt,
          };
        }

        return {
          status: "none" as const,
          verifiedEmail: null,
          universityName: null,
          universityDomain: null,
          verifiedAt: null,
        };
      }),

    /**
     * Revoke current student verification — used when the user wants to
     * verify a different .edu address. Clears both the DB record and the
     * profile flags so they can start fresh.
     */
    revoke: protectedProcedure
      .mutation(async ({ ctx }) => {
        await revokeStudentVerification(ctx.user.id);
        logger.info({ userId: ctx.user.id }, "[StudentVerification] Revoked");
        return { success: true };
      }),
  }),

  // ── COMMUNITIES ───────────────────────────────────────────────────────────
  communities: router({
    listMyCommunities: protectedProcedure
      .input(z.object({
        search: z.string().max(100).optional(),
        limit: z.number().min(1).max(50).default(20),
      }).optional())
      .query(async ({ ctx, input }) => {
        return listMyCommunities(ctx.user.id, input?.search, input?.limit ?? 20);
      }),

    discover: protectedProcedure
      .input(z.object({
        search: z.string().max(100).optional(),
        category: z.enum(COMMUNITY_CATEGORIES).optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        const result = await browseCommunities(ctx.user.id, {
          search: input?.search,
          category: input?.category,
          limit: input?.limit ?? 20,
          offset: input?.offset ?? 0,
          sort: "largest",
        });
        return result.items.filter(
          (c) => c.membershipStatus !== "active" && c.membershipStatus !== "banned",
        );
      }),

    homeFeed: protectedProcedure
      .query(async ({ ctx }) => getCommunityHomeFeed(ctx.user.id)),

    browse: protectedProcedure
      .input(z.object({
        search: z.string().max(100).optional(),
        category: z.enum(COMMUNITY_CATEGORIES).optional(),
        visibility: z.enum(COMMUNITY_VISIBILITY).optional(),
        verifiedOnly: z.boolean().optional(),
        featuredOnly: z.boolean().optional(),
        sort: z.enum(["trending", "newest", "largest", "most_active", "recommended"]).default("trending"),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        return browseCommunities(ctx.user.id, {
          search: input?.search,
          category: input?.category,
          visibility: input?.visibility,
          verifiedOnly: input?.verifiedOnly,
          featuredOnly: input?.featuredOnly,
          sort: input?.sort ?? "trending",
          limit: input?.limit ?? 20,
          offset: input?.offset ?? 0,
        });
      }),

    nearby: protectedProcedure
      .input(z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        maxMiles: z.number().min(0.5).max(50).default(5),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        return getNearbyCommunities(ctx.user.id, input.lat, input.lng, {
          maxMiles: input.maxMiles,
          limit: input.limit,
          offset: input.offset,
        });
      }),

    top: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        return getTopCommunities(ctx.user.id, {
          limit: input?.limit ?? 20,
          offset: input?.offset ?? 0,
        });
      }),

    search: protectedProcedure
      .input(z.object({
        query: z.string().min(1).max(100),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const coords =
          input.lat != null && input.lng != null
            ? { lat: input.lat, lng: input.lng }
            : undefined;
        return searchCommunitiesGrouped(ctx.user.id, input.query, coords);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const community = await getCommunityById(input.id);
        if (!community) throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });

        const membership = await getMembership(community.id, ctx.user.id);
        const rules = await getCommunityRules(community.id);

        const canViewRides = await canViewCommunityRides(community, membership);
        const canViewMembers = await canViewCommunityMembers(community, membership);
        const canPostRide = await canPostCommunityRide(community, membership);

        const onlineMap = await getOnlineCountsByCommunity([community.id]);
        const enriched = enrichCommunityRow(community, {
          onlineCount: onlineMap.get(community.id) ?? 0,
          membershipStatus: membership?.status ?? null,
          membershipRole: membership?.role ?? null,
        });

        return {
          ...enriched,
          rules: canViewMembers || community.visibility === "public" ? rules : [],
          canViewRides,
          canViewMembers,
          canPostRide,
          canManage: membership?.status === "active" &&
            ["owner", "admin", "moderator"].includes(membership.role ?? ""),
        };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(3).max(50),
        description: z.string().min(10).max(300),
        category: z.enum(COMMUNITY_CATEGORIES),
        visibility: z.enum(COMMUNITY_VISIBILITY),
        logoUrl: z.string().max(500).optional(),
        bannerUrl: z.string().max(500).optional(),
        verificationType: z.enum(COMMUNITY_VERIFICATION_TYPES),
        verificationDomain: z.string().max(100).optional(),
        customInviteCode: z.string().min(4).max(32).optional(),
        rules: z.array(z.string().min(1).max(500)).max(10).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (
          (input.verificationType === "edu_email" || input.verificationType === "company_email") &&
          !input.verificationDomain?.trim()
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Email domain is required for verification" });
        }

        try {
          const community = await createCommunity({
            userId: ctx.user.id,
            userEmail: ctx.user.email ?? null,
            name: input.name,
            description: input.description,
            category: input.category,
            visibility: input.visibility,
            logoUrl: input.logoUrl,
            bannerUrl: input.bannerUrl,
            verificationType: input.verificationType,
            verificationDomain: input.verificationDomain,
            customInviteCode: input.customInviteCode,
            rules: input.rules,
          });
          return community;
        } catch (err: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err?.message ?? "Failed to create community",
          });
        }
      }),

    join: protectedProcedure
      .input(z.object({
        communityId: z.number().int().positive(),
        inviteCode: z.string().max(32).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await joinCommunity({
            communityId: input.communityId,
            userId: ctx.user.id,
            userEmail: ctx.user.email ?? null,
            inviteCode: input.inviteCode,
          });
        } catch (err: any) {
          const msg = err?.message ?? "Failed to join community";
          const code = msg.includes("already") ? "CONFLICT" : "BAD_REQUEST";
          throw new TRPCError({ code, message: msg });
        }
      }),

    leave: protectedProcedure
      .input(z.object({ communityId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await leaveCommunity(input.communityId, ctx.user.id);
        } catch (err: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err?.message ?? "Failed to leave" });
        }
      }),

    listMembers: protectedProcedure
      .input(z.object({
        communityId: z.number().int().positive(),
        search: z.string().max(100).optional(),
        role: z.enum(["owner", "admin", "moderator", "member"]).optional(),
        status: z.enum(["active", "pending", "rejected", "banned", "left"]).optional(),
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ ctx, input }) => {
        const community = await getCommunityById(input.communityId);
        if (!community) throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });

        const membership = await getMembership(input.communityId, ctx.user.id);
        if (!(await canViewCommunityMembers(community, membership))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Members list is not available" });
        }

        return listCommunityMembers(input.communityId, {
          search: input.search,
          role: input.role,
          status: input.status,
          limit: input.limit,
        });
      }),

    approveMember: protectedProcedure
      .input(z.object({
        communityId: z.number().int().positive(),
        userId: z.number().int().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await approveMember(input.communityId, input.userId, ctx.user.id);
        } catch (err: any) {
          throw new TRPCError({ code: "FORBIDDEN", message: err?.message ?? "Not authorized" });
        }
      }),

    rejectMember: protectedProcedure
      .input(z.object({
        communityId: z.number().int().positive(),
        userId: z.number().int().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await rejectMember(input.communityId, input.userId, ctx.user.id);
        } catch (err: any) {
          throw new TRPCError({ code: "FORBIDDEN", message: err?.message ?? "Not authorized" });
        }
      }),

    listRides: protectedProcedure
      .input(z.object({
        communityId: z.number().int().positive(),
        dateFilter: z.enum(["all", "today", "tomorrow", "week"]).default("all"),
        limit: z.number().min(1).max(50).default(30),
      }))
      .query(async ({ ctx, input }) => {
        try {
          return await listCommunityRides(input.communityId, ctx.user.id, {
            dateFilter: input.dateFilter,
            limit: input.limit,
          });
        } catch (err: any) {
          const code = err?.message?.includes("access") ? "FORBIDDEN" : "BAD_REQUEST";
          throw new TRPCError({ code, message: err?.message ?? "Failed to load rides" });
        }
      }),
  }),

  // ── LEGAL & COMPLIANCE ───────────────────────────────────────────────────
  legal: router({
    getVersion: publicProcedure.query(() => ({
      currentVersion: CURRENT_LEGAL_VERSION,
      history: LEGAL_VERSION_HISTORY,
    })),

    listDocuments: publicProcedure.query(() =>
      LEGAL_DOCUMENTS.map((d) => ({
        slug: d.slug,
        title: d.title,
        version: d.version,
        lastUpdated: d.lastUpdated,
        description: d.description,
        sectionCount: d.sections.length,
      })),
    ),

    getDocument: publicProcedure
      .input(z.object({ slug: z.string().min(1) }))
      .query(({ input }) => {
        const doc = getLegalDocument(input.slug);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Legal document not found" });
        return doc;
      }),

    getMyAcceptance: protectedProcedure.query(async ({ ctx }) => {
      const latest = await getLatestLegalAcceptance(ctx.user.id);
      const needsReacceptance = await userNeedsLegalReacceptance(ctx.user.id);
      return {
        latest,
        needsReacceptance,
        currentVersion: CURRENT_LEGAL_VERSION,
      };
    }),

    accept: protectedProcedure
      .input(z.object({
        legalVersion: z.string(),
        acceptTerms: z.literal(true),
        acceptPrivacy: z.literal(true),
        acceptCommunity: z.literal(true),
        termsAcceptedAt: z.string().min(10),
        privacyAcceptedAt: z.string().min(10),
        communityAcceptedAt: z.string().min(10),
        deviceInfo: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.legalVersion !== CURRENT_LEGAL_VERSION) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Legal version mismatch" });
        }
        await recordLegalAcceptance(ctx.user.id, {
          ...input,
          ipAddress: getClientIp(ctx.req),
        });
        return { success: true };
      }),
  }),
});

// ─── Internal helper: auto-create ride instances from a recurring schedule ──
async function _createRecurringInstances(
  rec: import("../drizzle/schema").RecurringRide,
  userId: number,
  daysAhead: number,
): Promise<import("../drizzle/schema").Ride[]> {
  // daysOfWeek is stored as number[] (0=Sun..6=Sat) in DB
  const daysOfWeek = (rec.daysOfWeek as (number | string)[]).map(d =>
    typeof d === "number" ? d : ({ sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }[d] ?? -1)
  );
  const [hh, mm] = rec.departureTimeOfDay.split(":").map(Number);
  const created: import("../drizzle/schema").Ride[] = [];

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    const dayOfWeek = targetDate.getDay(); // 0=Sun..6=Sat

    if (!daysOfWeek.includes(dayOfWeek)) continue;

    targetDate.setHours(hh, mm, 0, 0);
    if (targetDate <= new Date()) continue; // skip past times

    try {
      // Add creator as a passenger, not driver — driver will accept later
      const rideId = genId("ride");
      const ride = await createRide({
        rideId,
        driverId: null,
        mode: "share",
        status: "searching",
        rideStep: "finding_driver",
        pickupLat: rec.pickupLat,
        pickupLng: rec.pickupLng,
        pickupAddress: rec.pickupAddress,
        dropoffLat: rec.dropoffLat,
        dropoffLng: rec.dropoffLng,
        dropoffAddress: rec.dropoffAddress,
        distanceKm: rec.distanceKm ?? "10",
        estimatedMinutes: rec.estimatedMinutes ?? 30,
        totalFare: String(Number(rec.pricePerSeat) * rec.totalSeats),
        pricePerSeat: rec.pricePerSeat,
        totalSeats: rec.totalSeats,
        departureTime: targetDate,
        safetyMode: rec.safetyMode,
        approvalRequired: rec.approvalRequired,
        carpoolTitle: rec.title,
        recurringRideId: rec.id,
      });
      // Add creator as passenger
      try {
        await addRidePassenger({
          rideId: ride.id,
          passengerId: userId,
          status: "joined",
          pickupLat: rec.pickupLat,
          pickupLng: rec.pickupLng,
          pickupAddress: rec.pickupAddress,
          dropoffLat: rec.dropoffLat,
          dropoffLng: rec.dropoffLng,
          dropoffAddress: rec.dropoffAddress,
          fareShare: rec.pricePerSeat,
        } as any);
      } catch (_) { /* non-critical */ }
      created.push(ride);
    } catch (e) {
      logger.warn({ err: e }, "[recurringRides] Failed to create instance");
    }
  }
  return created;
}

export type AppRouter = typeof appRouter;