import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  index,
} from "drizzle-orm/mysql-core";

// ============================================================================
// Core Auth Table
// ============================================================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  socialAuthProvider: varchar("socialAuthProvider", { length: 20 }),  // "google" | "apple" | null
  socialAuthId: varchar("socialAuthId", { length: 255 }),  // Google/Apple user ID
  profilePhotoUrl: varchar("profilePhotoUrl", { length: 500 }),  // Social profile photo
  /** Incremented on password change — invalidates all existing sessions */
  sessionVersion: int("sessionVersion").default(1).notNull(),
}, (t) => [
  index("users_email_idx").on(t.email),
  index("users_role_idx").on(t.role),
  index("users_created_at_idx").on(t.createdAt),
  index("users_last_signed_in_idx").on(t.lastSignedIn),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================================
// RideShare Tables
// ============================================================================

/**
 * User Profiles - Extended user information for passengers and drivers
 */
export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  phoneNumber: varchar("phoneNumber", { length: 20 }),
  profilePhoto: text("profilePhoto"),
  isDriver: boolean("isDriver").default(false).notNull(),
  driverLicense: varchar("driverLicense", { length: 50 }),
  vehicleType: varchar("vehicleType", { length: 50 }),
  vehicleColor: varchar("vehicleColor", { length: 50 }),
  licensePlate: varchar("licensePlate", { length: 20 }),
  /** Gender for safety matching feature */
  gender: mysqlEnum("gender", ["male", "female", "non_binary", "prefer_not_to_say"]),
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("5.00"),
  totalRides: int("totalRides").default(0),
  totalEarnings: decimal("totalEarnings", { precision: 10, scale: 2 }).default("0.00"),
  stripeConnectId: varchar("stripeConnectId", { length: 255 }),
  /** Student discount program */
  isStudent: boolean("isStudent").default(false).notNull(),
  collegeEmail: varchar("collegeEmail", { length: 255 }),
  studentFreeRidesUsed: int("studentFreeRidesUsed").default(0).notNull(),
  studentFreeRidesEarned: int("studentFreeRidesEarned").default(0).notNull(),
  /** OTP-verified student identity */
  isStudentVerified: boolean("isStudentVerified").default(false).notNull(),
  studentVerifiedAt: timestamp("studentVerifiedAt"),
  studentUniversityName: varchar("studentUniversityName", { length: 255 }),
  studentUniversityDomain: varchar("studentUniversityDomain", { length: 100 }),
  emergencyContacts: json("emergencyContacts"), // [{name, phone}, ...]
  /** Admin ban system */
  isBanned: boolean("isBanned").default(false).notNull(),
  bannedAt: timestamp("bannedAt"),
  banReason: text("banReason"),
  bannedBy: int("bannedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("up_is_driver_idx").on(t.isDriver),
  index("up_is_banned_idx").on(t.isBanned),
  index("up_student_verified_idx").on(t.isStudentVerified, t.studentUniversityDomain),
]);

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

/**
 * User Preferences - Safety settings, notification prefs, ride preferences
 */
export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** Women-only safety mode for shared rides */
  safetyMode: mysqlEnum("safetyMode", [
    "none",
    "women_drivers_only",
    "women_companions_only",
    "women_only",
  ])
    .default("none")
    .notNull(),
  preferredRideMode: mysqlEnum("preferredRideMode", ["solo", "share"]).default("share"),
  maxWaitTimeMinutes: int("maxWaitTimeMinutes").default(15),
  notifyOnDriverAssigned: boolean("notifyOnDriverAssigned").default(true).notNull(),
  notifyOnDriverArrived: boolean("notifyOnDriverArrived").default(true).notNull(),
  notifyOnRideStart: boolean("notifyOnRideStart").default(true).notNull(),
  notifyOnRideComplete: boolean("notifyOnRideComplete").default(true).notNull(),
  /** Expo push notification token */
  pushToken: varchar("pushToken", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;

/**
 * Driver Sessions - Online/offline tracking and current assignment
 */
export const driverSessions = mysqlTable(
  "driver_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    driverId: int("driverId").notNull().unique(),
    status: mysqlEnum("status", ["online", "offline", "on_ride"])
      .default("offline")
      .notNull(),
    currentLat: decimal("currentLat", { precision: 10, scale: 8 }),
    currentLng: decimal("currentLng", { precision: 11, scale: 8 }),
    currentRideId: varchar("currentRideId", { length: 50 }),
    /** 0-100 acceptance rate for scoring */
    acceptanceRate: decimal("acceptanceRate", { precision: 5, scale: 2 }).default("100.00"),
    todayRides: int("todayRides").default(0),
    todayEarnings: decimal("todayEarnings", { precision: 10, scale: 2 }).default("0.00"),
    /** Cumulative online minutes (incremented on goOffline) */
    totalOnlineMinutes: int("totalOnlineMinutes").default(0).notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    goOnlineAt: timestamp("goOnlineAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("driver_sessions_status_idx").on(t.status, t.currentLat, t.currentLng)]
);

export type DriverSession = typeof driverSessions.$inferSelect;
export type InsertDriverSession = typeof driverSessions.$inferInsert;

/**
 * Driver Schedule Settings — availability preferences per driver
 */
export const driverScheduleSettings = mysqlTable("driver_schedule_settings", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driverId").notNull().unique(),
  preferredPickupLat: decimal("preferredPickupLat", { precision: 10, scale: 8 }),
  preferredPickupLng: decimal("preferredPickupLng", { precision: 11, scale: 8 }),
  preferredPickupRadiusKm: decimal("preferredPickupRadiusKm", { precision: 6, scale: 2 }).default("10.00"),
  maxDistanceKm: decimal("maxDistanceKm", { precision: 6, scale: 2 }).default("25.00"),
  rideTypesAccepted: json("rideTypesAccepted"),
  scheduledRidesEnabled: boolean("scheduledRidesEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DriverScheduleSettings = typeof driverScheduleSettings.$inferSelect;

/**
 * Driver Availability Slots — recurring or one-time available hours
 */
export const driverAvailabilitySlots = mysqlTable(
  "driver_availability_slots",
  {
    id: int("id").autoincrement().primaryKey(),
    driverId: int("driverId").notNull(),
    slotId: varchar("slotId", { length: 36 }).notNull().unique(),
    slotType: mysqlEnum("slotType", ["recurring", "one_time"]).notNull(),
    dayOfWeek: int("dayOfWeek"),
    specificDate: timestamp("specificDate"),
    startTime: varchar("startTime", { length: 5 }).notNull(),
    endTime: varchar("endTime", { length: 5 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("driver_avail_driver_idx").on(t.driverId, t.slotType)],
);

export type DriverAvailabilitySlot = typeof driverAvailabilitySlots.$inferSelect;

/**
 * Rides - Main ride records
 */
export const rides = mysqlTable("rides", {
  id: int("id").autoincrement().primaryKey(),
  rideId: varchar("rideId", { length: 50 }).notNull().unique(),
  driverId: int("driverId"),
  mode: mysqlEnum("mode", ["solo", "share"]).notNull(),
  status: mysqlEnum("status", [
    "searching",
    "matched",
    "driver_arrived",
    "in_progress",
    "completed",
    "cancelled",
    "missed",
  ])
    .default("searching")
    .notNull(),
  /** Extended lifecycle step within status */
  rideStep: mysqlEnum("rideStep", [
    "finding_driver",
    "driver_assigned",
    "driver_en_route",
    "driver_arrived",
    "ride_started",
    "ride_in_progress",
    "completed",
    "cancelled",
  ]).default("finding_driver"),
  pickupLat: decimal("pickupLat", { precision: 10, scale: 8 }).notNull(),
  pickupLng: decimal("pickupLng", { precision: 11, scale: 8 }).notNull(),
  pickupAddress: text("pickupAddress").notNull(),
  dropoffLat: decimal("dropoffLat", { precision: 10, scale: 8 }).notNull(),
  dropoffLng: decimal("dropoffLng", { precision: 11, scale: 8 }).notNull(),
  dropoffAddress: text("dropoffAddress").notNull(),
  distanceKm: decimal("distanceKm", { precision: 8, scale: 2 }).notNull(),
  estimatedMinutes: int("estimatedMinutes").notNull(),
  totalFare: decimal("totalFare", { precision: 10, scale: 2 }).notNull(),
  /** Dynamic pricing multiplier (1.0 = no surge) */
  surgeMultiplier: decimal("surgeMultiplier", { precision: 4, scale: 2 }).default("1.00"),
  /** Fare breakdown JSON: {baseFare, distanceFare, timeFare, surgeAmount, discount} */
  fareBreakdown: json("fareBreakdown"),
  /** Safety mode applied to this ride */
  safetyMode: mysqlEnum("safetyMode", [
    "none",
    "women_drivers_only",
    "women_companions_only",
    "women_only",
  ]).default("none"),
  /** Stripe payment intent ID */
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  // ─── P2P Carpool fields ───────────────────────────────────────────────────
  /** Planned departure time (for posted carpool rides) */
  departureTime: timestamp("departureTime"),
  /** Price per seat (set by driver for P2P carpool) */
  pricePerSeat: decimal("pricePerSeat", { precision: 8, scale: 2 }),
  /** Total seats offered by driver */
  totalSeats: int("totalSeats").default(3),
  /** Currently available seats for joining (decremented as passengers join) */
  availableSeats: int("availableSeats").default(3),
  /** Original fare before any join discounts */
  originalFare: decimal("originalFare", { precision: 10, scale: 2 }),
  /** Whether driver must approve each join request */
  approvalRequired: boolean("approvalRequired").default(true).notNull(),
  /** Who posted this ride: approved driver offering seats vs passenger organizing a shared trip */
  posterRole: mysqlEnum("posterRole", ["driver", "passenger_organizer"]).default("passenger_organizer"),
  /** Sequential pickup: which passenger the driver is currently heading to / waiting at */
  arrivalTargetPassengerId: int("arrivalTargetPassengerId"),
  /** Short title/note for the ride (e.g. "Daily NJIT commute") */
  carpoolTitle: varchar("carpoolTitle", { length: 200 }),
  /** Link to recurring_rides if this ride was auto-generated */
  recurringRideId: int("recurringRideId"),
  /** Encoded OSRM/Google polyline for route-based matching */
  routePolyline: text("routePolyline"),
  // ─── timestamps ──────────────────────────────────────────────────────────
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  driverAssignedAt: timestamp("driverAssignedAt"),
  driverArrivedAt: timestamp("driverArrivedAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  cancelledAt: timestamp("cancelledAt"),
  cancelReason: varchar("cancelReason", { length: 255 }),
}, (table) => ({
  pickupLocationIdx: index("pickup_location_idx").on(table.pickupLat, table.pickupLng),
  dropoffLocationIdx: index("dropoff_location_idx").on(table.dropoffLat, table.dropoffLng),
  statusModeIdx: index("status_mode_idx").on(table.status, table.mode),
  driverStatusIdx: index("driver_status_idx").on(table.driverId, table.status),
  createdAtIdx: index("rides_created_at_idx").on(table.createdAt),
  // Composite index for upcoming rides query (cron + passenger search)
  statusDepartureIdx: index("rides_status_departure_idx").on(table.status, table.departureTime),
  // Composite index for finding joinable shared rides (availableSeats > 0 filter done in app)
  statusModeSeatsIdx: index("rides_status_mode_seats_idx").on(table.status, table.mode, table.availableSeats),
  // Composite index for driver history queries
  driverStatusModeIdx: index("rides_driver_status_mode_idx").on(table.driverId, table.status, table.mode),
  statusCreatedAtIdx: index("rides_status_created_at_idx").on(table.status, table.createdAt),
}));

export type Ride = typeof rides.$inferSelect;
export type InsertRide = typeof rides.$inferInsert;

/**
 * Ride Requests - Dispatch queue: requests sent to individual drivers
 */
export const rideRequests = mysqlTable(
  "ride_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: varchar("requestId", { length: 100 }).notNull().unique(),
    rideId: varchar("rideId", { length: 50 }).notNull(),
    driverId: int("driverId").notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "declined", "expired"])
      .default("pending")
      .notNull(),
    offeredFare: decimal("offeredFare", { precision: 10, scale: 2 }).notNull(),
    etaMinutes: int("etaMinutes"),
    expiresAt: timestamp("expiresAt").notNull(),
    respondedAt: timestamp("respondedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("ride_requests_driver_idx").on(t.driverId, t.status),
    index("ride_requests_ride_idx").on(t.rideId, t.status),
  ]
);

export type RideRequest = typeof rideRequests.$inferSelect;
export type InsertRideRequest = typeof rideRequests.$inferInsert;

/**
 * Ride Passengers - Join table for passengers in a shared ride
 */
export const ridePassengers = mysqlTable(
  "ride_passengers",
  {
    id: int("id").autoincrement().primaryKey(),
    rideId: int("rideId").notNull(),
    passengerId: int("passengerId").notNull(),
    seatsOccupied: int("seatsOccupied").default(1),
    isOriginalPassenger: boolean("isOriginalPassenger").default(false).notNull(),
    pickupLat: decimal("pickupLat", { precision: 10, scale: 8 }).notNull(),
    pickupLng: decimal("pickupLng", { precision: 11, scale: 8 }).notNull(),
    pickupAddress: text("pickupAddress").notNull(),
    dropoffLat: decimal("dropoffLat", { precision: 10, scale: 8 }).notNull(),
    dropoffLng: decimal("dropoffLng", { precision: 11, scale: 8 }).notNull(),
    dropoffAddress: text("dropoffAddress").notNull(),
    distanceKm: decimal("distanceKm", { precision: 8, scale: 2 }).notNull(),
    fareShare: decimal("fareShare", { precision: 10, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["joined", "picked_up", "dropped_off", "cancelled"]).default("joined"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    pickedUpAt: timestamp("pickedUpAt"),
    droppedOffAt: timestamp("droppedOffAt"),
  },
  (t) => [
    index("ride_passengers_ride_idx").on(t.rideId, t.status),
    index("ride_passengers_passenger_idx").on(t.passengerId),
  ]
);

export type RidePassenger = typeof ridePassengers.$inferSelect;
export type InsertRidePassenger = typeof ridePassengers.$inferInsert;

/**
 * Notifications - Persistent notification log per user
 */
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    notificationId: varchar("notificationId", { length: 100 }).notNull().unique(),
    userId: int("userId").notNull(),
    /** Who should see this notification in their inbox */
    recipientRole: mysqlEnum("recipientRole", ["passenger", "driver"])
      .default("passenger")
      .notNull(),
    type: mysqlEnum("type", [
      "ride_request",
      "driver_assigned",
      "driver_arrived",
      "ride_started",
      "ride_completed",
      "ride_cancelled",
      "payment_received",
      "rating_request",
      "promo_code",
      "system",
      "safety_alert",
    ]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    data: json("data"),
    isRead: boolean("isRead").default(false).notNull(),
    deepLink: varchar("deepLink", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    readAt: timestamp("readAt"),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.isRead, t.createdAt),
    index("notifications_user_role_idx").on(t.userId, t.recipientRole, t.isRead),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Surge Zones - Dynamic pricing geographic zones
 */
export const surgeZones = mysqlTable("surge_zones", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  centerLat: decimal("centerLat", { precision: 10, scale: 8 }).notNull(),
  centerLng: decimal("centerLng", { precision: 11, scale: 8 }).notNull(),
  radiusKm: decimal("radiusKm", { precision: 5, scale: 2 }).notNull(),
  /** e.g. 1.5 = 50% surge */
  multiplier: decimal("multiplier", { precision: 4, scale: 2 }).notNull(),
  reason: varchar("reason", { length: 255 }),
  activeFrom: timestamp("activeFrom").notNull(),
  activeUntil: timestamp("activeUntil").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("surge_zones_active_idx").on(t.isActive, t.activeFrom, t.activeUntil),
]);

export type SurgeZone = typeof surgeZones.$inferSelect;
export type InsertSurgeZone = typeof surgeZones.$inferInsert;

/**
 * @deprecated Legacy payment ledger — canonical store is `stripe_payments`.
 * Read via paymentLedgerService; do not write new rows.
 */
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  paymentId: varchar("paymentId", { length: 100 }).notNull().unique(),
  rideId: int("rideId").notNull(),
  passengerId: int("passengerId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: mysqlEnum("status", ["pending", "completed", "failed", "refunded"]).default("pending"),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  paymentMethod: mysqlEnum("paymentMethod", ["card", "wallet", "apple_pay", "google_pay"]).default("card"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  refundedAt: timestamp("refundedAt"),
}, (t) => [
  index("payments_ride_idx").on(t.rideId),
  index("payments_passenger_idx").on(t.passengerId),
  index("payments_status_idx").on(t.status),
]);

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Wallet - User wallet/prepaid balance
 */
export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  balance: decimal("balance", { precision: 10, scale: 2 }).default("0.00"),
  totalSpent: decimal("totalSpent", { precision: 10, scale: 2 }).default("0.00"),
  totalEarned: decimal("totalEarned", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

/**
 * Transactions - Wallet transaction history
 */
export const transactions = mysqlTable(
  "transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    transactionId: varchar("transactionId", { length: 100 }).notNull().unique(),
    userId: int("userId").notNull(),
    type: mysqlEnum("type", ["credit", "debit", "refund", "payout"]).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    description: text("description"),
    relatedRideId: int("relatedRideId"),
    relatedPaymentId: int("relatedPaymentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("transactions_user_idx").on(t.userId, t.createdAt)]
);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Chat Messages
 */
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    messageId: varchar("messageId", { length: 100 }).notNull().unique(),
    rideId: int("rideId").notNull(),
    senderId: int("senderId").notNull(),
    recipientId: int("recipientId").notNull(),
    message: text("message").notNull(),
    isRead: boolean("isRead").default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("chat_messages_ride_idx").on(t.rideId, t.createdAt)]
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * Ratings - Post-ride ratings and reviews
 */
export const ratings = mysqlTable(
  "ratings",
  {
    id: int("id").autoincrement().primaryKey(),
    ratingId: varchar("ratingId", { length: 100 }).notNull().unique(),
    rideId: int("rideId").notNull(),
    raterId: int("raterId").notNull(),
    ratedUserId: int("ratedUserId").notNull(),
    ratingType: mysqlEnum("ratingType", ["passenger", "driver"]).notNull(),
    score: int("score").notNull(),
    comment: text("comment"),
    photos: json("photos"),
    reportedUnsafeBehavior: boolean("reportedUnsafeBehavior").default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("ratings_rated_user_idx").on(t.ratedUserId, t.ratingType),
    index("ratings_ride_idx").on(t.rideId),
  ]
);

export type Rating = typeof ratings.$inferSelect;
export type InsertRating = typeof ratings.$inferInsert;

/**
 * Promo Codes
 */
export const promoCodes = mysqlTable("promo_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  discountType: mysqlEnum("discountType", ["percentage", "fixed"]).notNull(),
  discountValue: decimal("discountValue", { precision: 10, scale: 2 }).notNull(),
  maxUses: int("maxUses"),
  currentUses: int("currentUses").default(0),
  minRideAmount: decimal("minRideAmount", { precision: 10, scale: 2 }).default("0.00"),
  maxDiscount: decimal("maxDiscount", { precision: 10, scale: 2 }),
  validFrom: timestamp("validFrom").notNull(),
  validUntil: timestamp("validUntil").notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = typeof promoCodes.$inferInsert;

/**
 * Promo Usage
 */
export const promoUsage = mysqlTable("promo_usage", {
  id: int("id").autoincrement().primaryKey(),
  promoCodeId: int("promoCodeId").notNull(),
  userId: int("userId").notNull(),
  rideId: int("rideId").notNull(),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }).notNull(),
  usedAt: timestamp("usedAt").defaultNow().notNull(),
});

export type PromoUsage = typeof promoUsage.$inferSelect;
export type InsertPromoUsage = typeof promoUsage.$inferInsert;

/**
 * Referrals
 */
export const referrals = mysqlTable("referrals", {
  id: int("id").autoincrement().primaryKey(),
  referralCode: varchar("referralCode", { length: 50 }).notNull().unique(),
  referrerId: int("referrerId").notNull(),
  referredUserId: int("referredUserId"),
  creditAmount: decimal("creditAmount", { precision: 10, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["pending", "completed"]).default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

/**
 * Emergency Alerts
 */
export const emergencyAlerts = mysqlTable(
  "emergency_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    alertId: varchar("alertId", { length: 100 }).notNull().unique(),
    userId: int("userId").notNull(),
    rideId: int("rideId"),
    latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
    longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
    alertType: mysqlEnum("alertType", ["sos", "unsafe_driver", "unsafe_passenger"]).notNull(),
    status: mysqlEnum("status", ["active", "responded", "resolved"]).default("active"),
    emergencyContactsNotified: json("emergencyContactsNotified"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
  },
  (t) => [index("emergency_alerts_user_idx").on(t.userId, t.status)]
);

export type EmergencyAlert = typeof emergencyAlerts.$inferSelect;
export type InsertEmergencyAlert = typeof emergencyAlerts.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// P2P Carpool Tables
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recurring Rides - Commuter schedules (e.g. "Newark → NYC every Mon-Fri 8:30am")
 */
export const recurringRides = mysqlTable(
  "recurring_rides",
  {
    id: int("id").autoincrement().primaryKey(),
    recurringId: varchar("recurringId", { length: 50 }).notNull().unique(),
    creatorId: int("creatorId").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    pickupLat: decimal("pickupLat", { precision: 10, scale: 8 }).notNull(),
    pickupLng: decimal("pickupLng", { precision: 11, scale: 8 }).notNull(),
    pickupAddress: text("pickupAddress").notNull(),
    dropoffLat: decimal("dropoffLat", { precision: 10, scale: 8 }).notNull(),
    dropoffLng: decimal("dropoffLng", { precision: 11, scale: 8 }).notNull(),
    dropoffAddress: text("dropoffAddress").notNull(),
    /** HH:MM — departure time of day */
    departureTimeOfDay: varchar("departureTimeOfDay", { length: 5 }).notNull(),
    /** JSON array of days: ["mon","tue","wed","thu","fri"] */
    daysOfWeek: json("daysOfWeek").notNull(),
    pricePerSeat: decimal("pricePerSeat", { precision: 8, scale: 2 }).notNull(),
    totalSeats: int("totalSeats").default(3).notNull(),
    safetyMode: mysqlEnum("safetyMode", [
      "none",
      "women_drivers_only",
      "women_companions_only",
      "women_only",
    ]).default("none").notNull(),
    approvalRequired: boolean("approvalRequired").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    /** How many days ahead to auto-create ride instances */
    advanceCreateDays: int("advanceCreateDays").default(1),
    distanceKm: decimal("distanceKm", { precision: 8, scale: 2 }),
    estimatedMinutes: int("estimatedMinutes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("recurring_rides_creator_idx").on(t.creatorId, t.isActive)]
);

export type RecurringRide = typeof recurringRides.$inferSelect;
export type InsertRecurringRide = typeof recurringRides.$inferInsert;

/**
 * Carpool Join Requests - Passengers requesting to join a posted P2P ride
 */
export const carpoolJoinRequests = mysqlTable(
  "carpool_join_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    joinRequestId: varchar("joinRequestId", { length: 100 }).notNull().unique(),
    rideId: varchar("rideId", { length: 50 }).notNull(),
    passengerId: int("passengerId").notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"])
      .default("pending")
      .notNull(),
    /** Optional message to driver when requesting to join */
    message: text("message"),
    pickupLat: decimal("pickupLat", { precision: 10, scale: 8 }).notNull(),
    pickupLng: decimal("pickupLng", { precision: 11, scale: 8 }).notNull(),
    pickupAddress: text("pickupAddress").notNull(),
    dropoffLat: decimal("dropoffLat", { precision: 10, scale: 8 }).notNull(),
    dropoffLng: decimal("dropoffLng", { precision: 11, scale: 8 }).notNull(),
    dropoffAddress: text("dropoffAddress").notNull(),
    distanceKm: decimal("distanceKm", { precision: 8, scale: 2 }).notNull(),
    /** Calculated fare share for this passenger */
    fareShare: decimal("fareShare", { precision: 8, scale: 2 }).notNull(),
    /** Detour distance in km for mid-ride join */
    detourKm: decimal("detourKm", { precision: 8, scale: 2 }),
    /** Estimated detour time in minutes */
    detourMinutes: int("detourMinutes"),
    /** Route compatibility score 0-100 */
    compatibilityScore: int("compatibilityScore"),
    /** Whether this is a mid-ride join (ride already in progress) */
    isMidRideJoin: boolean("isMidRideJoin").default(false).notNull(),
    /** Driver approval status for mid-ride join */
    driverApproval: mysqlEnum("driverApproval", ["pending", "approved", "rejected"]),
    /** Ride creator (original passenger) approval status — both parties must approve */
    creatorApproval: mysqlEnum("creatorApproval", ["pending", "approved", "rejected"]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    respondedAt: timestamp("respondedAt"),
  },
  (t) => [
    index("join_requests_ride_idx").on(t.rideId, t.status),
    index("join_requests_passenger_idx").on(t.passengerId, t.status),
  ],
);

export type CarpoolJoinRequest = typeof carpoolJoinRequests.$inferSelect;
export type InsertCarpoolJoinRequest = typeof carpoolJoinRequests.$inferInsert;

/**
 * Analytics
 */
export const analytics = mysqlTable("analytics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: timestamp("date").notNull(),
  totalRides: int("totalRides").default(0),
  totalDistance: decimal("totalDistance", { precision: 10, scale: 2 }).default("0.00"),
  totalSpent: decimal("totalSpent", { precision: 10, scale: 2 }).default("0.00"),
  totalEarned: decimal("totalEarned", { precision: 10, scale: 2 }).default("0.00"),
  averageRating: decimal("averageRating", { precision: 3, scale: 2 }).default("5.00"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Analytics = typeof analytics.$inferSelect;
export type InsertAnalytics = typeof analytics.$inferInsert;

/**
 * Payment Methods - Saved cards for users
 */
export const paymentMethods = mysqlTable("payment_methods", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  cardType: mysqlEnum("cardType", ["visa", "mastercard", "amex", "discover"]).notNull(),
  last4: varchar("last4", { length: 4 }).notNull(),
  holderName: varchar("holderName", { length: 100 }).notNull(),
  expiryMonth: int("expiryMonth").notNull(),
  expiryYear: int("expiryYear").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  stripePaymentMethodId: varchar("stripePaymentMethodId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = typeof paymentMethods.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// Mid-Ride Join & Reward Points Tables
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ride Stops - Ordered intermediate stops per ride (pickup/dropoff for each passenger)
 */
export const rideStops = mysqlTable(
  "ride_stops",
  {
    id: int("id").autoincrement().primaryKey(),
    rideId: int("rideId").notNull(),
    stopType: mysqlEnum("stopType", ["pickup", "dropoff"]).notNull(),
    passengerId: int("passengerId").notNull(),
    lat: decimal("lat", { precision: 10, scale: 8 }).notNull(),
    lng: decimal("lng", { precision: 11, scale: 8 }).notNull(),
    address: text("address").notNull(),
    sequence: int("sequence").notNull(),
    status: mysqlEnum("status", ["pending", "approaching", "reached", "skipped"])
      .default("pending")
      .notNull(),
    estimatedArrivalAt: timestamp("estimatedArrivalAt"),
    actualArrivalAt: timestamp("actualArrivalAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("ride_stops_ride_seq_idx").on(t.rideId, t.sequence),
    index("ride_stops_ride_status_idx").on(t.rideId, t.status),
  ],
);

export type RideStop = typeof rideStops.$inferSelect;
export type InsertRideStop = typeof rideStops.$inferInsert;

/**
 * Reward Points - User point balances
 */
export const rewardPoints = mysqlTable("reward_points", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  points: int("points").default(0).notNull(),
  totalEarned: int("totalEarned").default(0).notNull(),
  totalRedeemed: int("totalRedeemed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RewardPoint = typeof rewardPoints.$inferSelect;
export type InsertRewardPoint = typeof rewardPoints.$inferInsert;

/**
 * Points Ledger - Point transaction history
 */
export const pointsLedger = mysqlTable(
  "points_ledger",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    amount: int("amount").notNull(),
    reason: mysqlEnum("reason", [
      "mid_ride_join",
      "shared_ride_bonus",
      "original_passenger_bonus",
      "driver_bonus",
      "first_shared_ride",
      "referral_bonus",
      "redeemed",
    ]).notNull(),
    relatedRideId: int("relatedRideId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("points_ledger_user_idx").on(t.userId, t.createdAt)],
);

export type PointsLedgerEntry = typeof pointsLedger.$inferSelect;
export type InsertPointsLedgerEntry = typeof pointsLedger.$inferInsert;

// ============================================================================
// Stripe Payment Tables
// ============================================================================

/**
 * Stripe Customers — maps app users to Stripe customer objects
 */
export const stripeCustomers = mysqlTable("stripe_customers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }).notNull().unique(),
  defaultPaymentMethodId: varchar("defaultPaymentMethodId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("stripe_cust_user_idx").on(t.userId),
]);

export type StripeCustomer = typeof stripeCustomers.$inferSelect;

/**
 * Connected Accounts — Stripe Express accounts for drivers
 */
export const connectedAccounts = mysqlTable("connected_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  stripeAccountId: varchar("stripeAccountId", { length: 255 }).notNull().unique(),
  chargesEnabled: boolean("chargesEnabled").default(false).notNull(),
  payoutsEnabled: boolean("payoutsEnabled").default(false).notNull(),
  onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
  detailsSubmitted: boolean("detailsSubmitted").default(false).notNull(),
  country: varchar("country", { length: 2 }).default("US"),
  defaultCurrency: varchar("defaultCurrency", { length: 3 }).default("usd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("conn_acct_user_idx").on(t.userId),
]);

export type ConnectedAccount = typeof connectedAccounts.$inferSelect;

/**
 * Stripe Payment Methods — saved cards for riders
 */
export const stripePaymentMethods = mysqlTable("stripe_payment_methods", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  stripePmId: varchar("stripePmId", { length: 255 }).notNull().unique(),
  type: mysqlEnum("type", ["card", "apple_pay", "google_pay"]).notNull(),
  cardBrand: varchar("cardBrand", { length: 20 }),
  cardLast4: varchar("cardLast4", { length: 4 }),
  cardExpMonth: int("cardExpMonth"),
  cardExpYear: int("cardExpYear"),
  isDefault: boolean("isDefault").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("stripe_pm_user_idx").on(t.userId),
]);

export type StripePaymentMethod = typeof stripePaymentMethods.$inferSelect;

/**
 * Payments — records of charges for rides
 */
export const stripePayments = mysqlTable("stripe_payments", {
  id: int("id").autoincrement().primaryKey(),
  paymentId: varchar("paymentId", { length: 36 }).notNull().unique(),
  rideId: int("rideId").notNull(),
  riderId: int("riderId").notNull(),
  driverId: int("driverId").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }).unique(),
  stripeChargeId: varchar("stripeChargeId", { length: 255 }),
  amountCents: int("amountCents").notNull(),
  platformFeeCents: int("platformFeeCents").notNull(),
  driverAmountCents: int("driverAmountCents").notNull(),
  tipCents: int("tipCents").default(0).notNull(),
  currency: varchar("currency", { length: 3 }).default("usd"),
  status: mysqlEnum("status", [
    "pending", "processing", "succeeded", "failed", "refunded", "partially_refunded",
  ]).default("pending").notNull(),
  failureReason: text("failureReason"),
  paymentMethodId: varchar("paymentMethodId", { length: 255 }),
  idempotencyKey: varchar("idempotencyKey", { length: 255 }).unique(),
  metadata: json("metadata"),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("stripe_pay_ride_idx").on(t.rideId),
  index("stripe_pay_rider_idx").on(t.riderId),
  index("stripe_pay_driver_idx").on(t.driverId),
  index("stripe_pay_status_idx").on(t.status),
  index("stripe_pay_pi_idx").on(t.stripePaymentIntentId),
]);

export type StripePayment = typeof stripePayments.$inferSelect;
export type InsertStripePayment = typeof stripePayments.$inferInsert;

/**
 * Transfers — records of money moved to driver connected accounts
 */
export const stripeTransfers = mysqlTable("stripe_transfers", {
  id: int("id").autoincrement().primaryKey(),
  paymentId: int("paymentId").notNull(),
  stripeTransferId: varchar("stripeTransferId", { length: 255 }).unique(),
  driverId: int("driverId").notNull(),
  amountCents: int("amountCents").notNull(),
  status: mysqlEnum("status", ["pending", "paid", "failed", "reversed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("stripe_xfer_payment_idx").on(t.paymentId),
  index("stripe_xfer_driver_idx").on(t.driverId),
]);

export type StripeTransfer = typeof stripeTransfers.$inferSelect;

/**
 * Refunds — refund records linked to payments
 */
export const stripeRefunds = mysqlTable("stripe_refunds", {
  id: int("id").autoincrement().primaryKey(),
  refundId: varchar("refundId", { length: 36 }).notNull().unique(),
  paymentId: int("paymentId").notNull(),
  rideId: int("rideId").notNull(),
  stripeRefundId: varchar("stripeRefundId", { length: 255 }).unique(),
  amountCents: int("amountCents").notNull(),
  reason: mysqlEnum("reason", [
    "rider_cancelled", "driver_cancelled", "wrong_route", "overcharge", "safety_issue", "other",
  ]).notNull(),
  status: mysqlEnum("status", ["pending", "succeeded", "failed"]).default("pending").notNull(),
  initiatedBy: mysqlEnum("initiatedBy", ["rider", "driver", "support", "system"]).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("stripe_refund_payment_idx").on(t.paymentId),
  index("stripe_refund_ride_idx").on(t.rideId),
]);

export type StripeRefund = typeof stripeRefunds.$inferSelect;

/**
 * Webhook Events — idempotent processing log for Stripe webhooks
 */
export const webhookEvents = mysqlTable("webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  stripeEventId: varchar("stripeEventId", { length: 255 }).notNull().unique(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  stripeObjectId: varchar("stripeObjectId", { length: 255 }),
  status: mysqlEnum("status", ["received", "processing", "processed", "failed"]).default("received").notNull(),
  payload: json("payload").notNull(),
  errorMessage: text("errorMessage"),
  attempts: int("attempts").default(0).notNull(),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("wh_event_id_idx").on(t.stripeEventId),
  index("wh_event_type_idx").on(t.eventType),
  index("wh_status_idx").on(t.status),
]);

// ============================================================================
// Wallet Ride Credits Tables
// ============================================================================

/**
 * Credit Wallets — per-user balance of ride credits
 */
export const creditWallets = mysqlTable("credit_wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  availableBalance: int("availableBalance").default(0).notNull(),
  reservedBalance: int("reservedBalance").default(0).notNull(),
  totalEarned: int("totalEarned").default(0).notNull(),
  totalRedeemed: int("totalRedeemed").default(0).notNull(),
  totalExpired: int("totalExpired").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("cw_user_idx").on(t.userId),
]);

export type CreditWallet = typeof creditWallets.$inferSelect;

/**
 * Credit Grants — individual credit awards (referral bonus, promo, refund, etc.)
 */
export const creditGrants = mysqlTable("credit_grants", {
  id: int("id").autoincrement().primaryKey(),
  grantId: varchar("grantId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  rideId: int("rideId"),
  amountCents: int("amountCents").notNull(),
  remainingCents: int("remainingCents").notNull(),
  reason: mysqlEnum("reason", [
    "referral_bonus", "promo_code", "ride_refund", "goodwill", "sign_up_bonus", "admin_adjustment",
  ]).notNull(),
  status: mysqlEnum("status", ["active", "fully_redeemed", "expired", "revoked"]).default("active").notNull(),
  expiresAt: timestamp("expiresAt"),
  idempotencyKey: varchar("idempotencyKey", { length: 100 }).unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("cg_user_idx").on(t.userId),
  index("cg_status_idx").on(t.status),
  index("cg_expires_idx").on(t.expiresAt),
]);

export type CreditGrant = typeof creditGrants.$inferSelect;

/**
 * Credit Redemptions — two-phase: reserve → apply/release
 */
export const creditRedemptions = mysqlTable("credit_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  redemptionId: varchar("redemptionId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  rideId: int("rideId").notNull(),
  grantId: int("grantId").notNull(),
  amountCents: int("amountCents").notNull(),
  status: mysqlEnum("status", ["reserved", "applied", "released", "reversed"]).default("reserved").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("cr_user_idx").on(t.userId),
  index("cr_ride_idx").on(t.rideId),
  index("cr_grant_idx").on(t.grantId),
  index("cr_status_idx").on(t.status),
]);

export type CreditRedemption = typeof creditRedemptions.$inferSelect;

/**
 * Credit Ledger — immutable audit trail for all credit movements
 */
export const creditLedger = mysqlTable("credit_ledger", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: varchar("ledgerId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  entryType: mysqlEnum("entryType", [
    "grant", "reserve", "apply", "release", "expire", "revoke", "admin_adjust",
  ]).notNull(),
  amountCents: int("amountCents").notNull(),
  balanceAfterCents: int("balanceAfterCents").notNull(),
  relatedGrantId: int("relatedGrantId"),
  relatedRedemptionId: int("relatedRedemptionId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("cl_user_idx").on(t.userId),
  index("cl_type_idx").on(t.entryType),
]);

export type CreditLedgerEntry = typeof creditLedger.$inferSelect;

/**
 * Abuse Flags — fraud/abuse detection records
 */
export const abuseFlags = mysqlTable("abuse_flags", {
  id: int("id").autoincrement().primaryKey(),
  flagId: varchar("flagId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  rideId: int("rideId"),
  flagType: mysqlEnum("flagType", [
    "velocity_limit", "duplicate_grant", "suspicious_pattern", "manual_review",
  ]).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "dismissed"]).default("open").notNull(),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
}, (t) => [
  index("af_user_idx").on(t.userId),
  index("af_status_idx").on(t.status),
]);

export type AbuseFlag = typeof abuseFlags.$inferSelect;

// ============================================================================
// Driver Applications & File Uploads
// ============================================================================

/**
 * Driver Applications — multi-step onboarding with admin review
 */
export const driverApplications = mysqlTable("driver_applications", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: varchar("applicationId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  fullName: varchar("fullName", { length: 200 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(),
  profilePhotoUrl: text("profilePhotoUrl"),
  licenseNumber: varchar("licenseNumber", { length: 50 }).notNull(),
  licenseState: varchar("licenseState", { length: 50 }).notNull(),
  licenseExpiry: varchar("licenseExpiry", { length: 20 }).notNull(),
  licenseFrontUrl: text("licenseFrontUrl"),
  licenseBackUrl: text("licenseBackUrl"),
  vehicleMake: varchar("vehicleMake", { length: 100 }).notNull(),
  vehicleModel: varchar("vehicleModel", { length: 100 }).notNull(),
  vehicleYear: int("vehicleYear").notNull(),
  vehicleColor: varchar("vehicleColor", { length: 50 }).notNull(),
  plateNumber: varchar("plateNumber", { length: 20 }).notNull(),
  vehicleType: mysqlEnum("vehicleType", ["sedan", "suv", "van", "truck", "luxury"]).default("sedan").notNull(),
  /** Public URL for vehicle thumbnail shown on driver profile */
  vehiclePhotoUrl: text("vehiclePhotoUrl"),
  /** Powertrain label shown in vehicle specs (e.g. Electric, Hybrid, Gasoline) */
  fuelType: mysqlEnum("fuelType", ["electric", "hybrid", "gasoline"]),
  /** Passenger seat capacity */
  seatCount: int("seatCount"),
  insurancePolicyNumber: varchar("insurancePolicyNumber", { length: 100 }).notNull(),
  insuranceProvider: varchar("insuranceProvider", { length: 200 }).notNull(),
  insuranceExpiry: varchar("insuranceExpiry", { length: 20 }).notNull(),
  insuranceDocUrl: text("insuranceDocUrl"),
  bankName: varchar("bankName", { length: 200 }),
  accountLast4: varchar("accountLast4", { length: 4 }),
  routingLast4: varchar("routingLast4", { length: 4 }),
  /** Vehicle registration document upload */
  vehicleRegistrationUrl: text("vehicleRegistrationUrl"),
  status: mysqlEnum("status", ["draft", "pending", "under_review", "action_required", "approved", "rejected"]).default("draft").notNull(),
  rejectionReason: text("rejectionReason"),
  /** Admin reason when requesting changes from applicant */
  actionRequiredReason: text("actionRequiredReason"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  approvedAt: timestamp("approvedAt"),
  rejectedAt: timestamp("rejectedAt"),
  actionRequiredAt: timestamp("actionRequiredAt"),
  /** Agreement acceptance tracking */
  tosAcceptedAt: timestamp("tosAcceptedAt"),
  tosVersion: varchar("tosVersion", { length: 20 }),
  tosAcceptedIp: varchar("tosAcceptedIp", { length: 45 }),
  privacyAcceptedAt: timestamp("privacyAcceptedAt"),
  driverAgreementAcceptedAt: timestamp("driverAgreementAcceptedAt"),
  icAgreementAcceptedAt: timestamp("icAgreementAcceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("da_user_idx").on(t.userId),
  index("da_status_idx").on(t.status),
]);

export type DriverApplication = typeof driverApplications.$inferSelect;

/**
 * File Uploads — metadata for uploaded files (profile photos, documents, etc.)
 */
export const fileUploads = mysqlTable("file_uploads", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: varchar("uploadId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  purpose: mysqlEnum("purpose", [
    "profile_photo", "license_front", "license_back", "insurance_doc", "vehicle_photo", "vehicle_registration", "community_logo", "community_banner", "misc",
  ]).notNull(),
  originalName: varchar("originalName", { length: 500 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  storagePath: text("storagePath").notNull(),
  publicUrl: text("publicUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("fu_user_idx").on(t.userId),
  index("fu_purpose_idx").on(t.purpose),
]);

// ============================================================================
// Support & Help Tables
// ============================================================================

/**
 * Support Tickets — user-submitted support requests
 */
export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: varchar("ticketId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  category: mysqlEnum("category", [
    "ride_issue", "payment", "account", "driver", "safety", "app_bug", "feedback", "other",
  ]).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  assignedTo: int("assignedTo"),
  rideId: int("rideId"),
  attachmentUrl: text("attachmentUrl"),
  adminNotes: text("adminNotes"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("st_user_idx").on(t.userId),
  index("st_status_idx").on(t.status),
  index("st_category_idx").on(t.category),
  index("st_priority_idx").on(t.priority),
]);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

/**
 * Support Messages — conversation thread within a ticket
 */
export const supportMessages = mysqlTable("support_messages", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: varchar("ticketId", { length: 36 }).notNull(),
  senderId: int("senderId").notNull(),
  senderType: mysqlEnum("senderType", ["user", "admin"]).notNull(),
  message: text("message").notNull(),
  attachmentUrl: text("attachmentUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("sm_ticket_idx").on(t.ticketId),
]);

export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = typeof supportMessages.$inferInsert;

/**
 * FAQ Items — frequently asked questions displayed in help center
 */
export const faqItems = mysqlTable("faq_items", {
  id: int("id").autoincrement().primaryKey(),
  category: mysqlEnum("category", [
    "general", "rides", "payments", "safety", "account", "driver",
  ]).notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("faq_category_idx").on(t.category),
  index("faq_active_idx").on(t.isActive),
]);

export type FaqItem = typeof faqItems.$inferSelect;
export type InsertFaqItem = typeof faqItems.$inferInsert;

// ============================================================================
// Live Chat System
// ============================================================================

/**
 * Live chat sessions between users and admin/support agents
 */
export const liveChatSessions = mysqlTable("live_chat_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  adminId: int("adminId"),
  category: mysqlEnum("chat_category", [
    "general", "ride_issue", "payment", "account", "technical", "safety", "driver_support", "other",
  ]).default("general").notNull(),
  issueDescription: text("issueDescription").notNull(),
  status: mysqlEnum("chat_status", [
    "waiting", "active", "ended", "missed", "rejected",
  ]).default("waiting").notNull(),
  priority: mysqlEnum("chat_priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  rejectionReason: text("rejectionReason"),
  rating: int("rating"),
  ratingFeedback: text("ratingFeedback"),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("lcs_user_idx").on(t.userId),
  index("lcs_admin_idx").on(t.adminId),
  index("lcs_status_idx").on(t.status),
  index("lcs_created_idx").on(t.createdAt),
]);

export type LiveChatSession = typeof liveChatSessions.$inferSelect;
export type InsertLiveChatSession = typeof liveChatSessions.$inferInsert;

/**
 * Live chat messages within a session
 */
export const liveChatMessages = mysqlTable("live_chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 36 }).notNull(),
  senderId: int("senderId").notNull(),
  senderType: mysqlEnum("lc_sender_type", ["user", "admin", "system"]).notNull(),
  messageType: mysqlEnum("lc_message_type", ["text", "image", "file", "system"]).default("text").notNull(),
  content: text("content").notNull(),
  attachmentUrl: text("attachmentUrl"),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("lcm_session_idx").on(t.sessionId),
  index("lcm_created_idx").on(t.createdAt),
]);

export type LiveChatMessage = typeof liveChatMessages.$inferSelect;
export type InsertLiveChatMessage = typeof liveChatMessages.$inferInsert;

// ============================================================================
// Push Notification Tokens
// ============================================================================

/**
 * Push Tokens - Stores Expo push notification tokens per user/device
 */
export const pushTokens = mysqlTable("push_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 500 }).notNull(),
  platform: mysqlEnum("platform", ["ios", "android", "web"]).notNull(),
  deviceId: varchar("deviceId", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("push_tokens_user_idx").on(t.userId),
  index("push_tokens_token_idx").on(t.token),
]);

export type PushToken = typeof pushTokens.$inferSelect;
export type InsertPushToken = typeof pushTokens.$inferInsert;

/**
 * Passenger Requests — Passenger-initiated ride requests broadcast to nearby online drivers.
 * Powers the reverse-marketplace: passenger posts a request, drivers respond.
 */
export const passengerRequests = mysqlTable(
  "passenger_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: varchar("requestId", { length: 100 }).notNull().unique(),
    passengerId: int("passengerId").notNull(),
    pickupLat: decimal("pickupLat", { precision: 10, scale: 8 }).notNull(),
    pickupLng: decimal("pickupLng", { precision: 11, scale: 8 }).notNull(),
    pickupAddress: varchar("pickupAddress", { length: 255 }).notNull(),
    dropoffLat: decimal("dropoffLat", { precision: 10, scale: 8 }).notNull(),
    dropoffLng: decimal("dropoffLng", { precision: 11, scale: 8 }).notNull(),
    dropoffAddress: varchar("dropoffAddress", { length: 255 }).notNull(),
    passengerCount: int("passengerCount").default(1).notNull(),
    offerPrice: decimal("offerPrice", { precision: 10, scale: 2 }).notNull(),
    distanceKm: decimal("distanceKm", { precision: 8, scale: 2 }),
    estimatedMinutes: int("estimatedMinutes"),
    status: mysqlEnum("status", ["pending", "broadcasting", "matched", "cancelled", "expired"])
      .default("pending")
      .notNull(),
    broadcastRadiusKm: decimal("broadcastRadiusKm", { precision: 5, scale: 2 }).default("3"),
    matchedDriverId: int("matchedDriverId"),
    matchedRideId: varchar("matchedRideId", { length: 50 }),
    driversNotified: int("driversNotified").default(0).notNull(),
    driversViewed: int("driversViewed").default(0).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("passenger_req_passenger_idx").on(t.passengerId, t.status),
    index("passenger_req_status_idx").on(t.status, t.createdAt),
  ],
);

export type PassengerRequest = typeof passengerRequests.$inferSelect;
export type InsertPassengerRequest = typeof passengerRequests.$inferInsert;

// ============================================================================
// Admin Platform Tables
// ============================================================================

/**
 * Admin Audit Logs — persistent record of every admin action
 */
export const adminAuditLogs = mysqlTable(
  "admin_audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    adminId: int("adminId").notNull(),
    adminEmail: varchar("adminEmail", { length: 320 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    entity: varchar("entity", { length: 50 }).notNull(),
    entityId: varchar("entityId", { length: 100 }),
    details: text("details"),
    beforeState: json("beforeState"),
    afterState: json("afterState"),
    ipAddress: varchar("ipAddress", { length: 45 }),
    userAgent: varchar("userAgent", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("audit_admin_idx").on(t.adminId, t.createdAt),
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_action_idx").on(t.action),
  ],
);

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = typeof adminAuditLogs.$inferInsert;

/**
 * Platform Config — admin-configurable operational parameters
 */
export const platformConfig = mysqlTable("platform_config", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["number", "string", "boolean", "json"]).default("string").notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlatformConfig = typeof platformConfig.$inferSelect;
export type InsertPlatformConfig = typeof platformConfig.$inferInsert;

/**
 * System Alerts — anomaly detection alerts
 */
export const systemAlerts = mysqlTable(
  "system_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    alertKey: varchar("alertKey", { length: 100 }).notNull(),
    metric: varchar("metric", { length: 100 }).notNull(),
    currentValue: decimal("currentValue", { precision: 15, scale: 4 }),
    threshold: decimal("threshold", { precision: 15, scale: 4 }),
    severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
    message: text("message").notNull(),
    status: mysqlEnum("status", ["active", "dismissed"]).default("active").notNull(),
    dismissedBy: int("dismissedBy"),
    dismissedAt: timestamp("dismissedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("sys_alerts_status_idx").on(t.status, t.createdAt),
    index("sys_alerts_severity_idx").on(t.severity, t.status),
  ],
);

export type SystemAlert = typeof systemAlerts.$inferSelect;
export type InsertSystemAlert = typeof systemAlerts.$inferInsert;

/**
 * Alert Rules — admin-configured threshold alert rules
 */
export const alertRules = mysqlTable("alert_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  metric: varchar("metric", { length: 100 }).notNull(),
  operator: mysqlEnum("operator", ["gt", "lt", "eq", "gte", "lte"]).notNull(),
  threshold: decimal("threshold", { precision: 15, scale: 4 }).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = typeof alertRules.$inferInsert;

// ============================================================================
// ADVANCED ADMIN PLATFORM — NEW TABLES
// ============================================================================

/**
 * Incidents — live incident command & control
 */
export const incidents = mysqlTable(
  "incidents",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    severity: mysqlEnum("severity", ["sev1", "sev2", "sev3", "sev4"]).default("sev3").notNull(),
    status: mysqlEnum("status", ["open", "investigating", "mitigating", "resolved"]).default("open").notNull(),
    city: varchar("city", { length: 100 }),
    description: text("description"),
    impact: text("impact"),
    resolvedAt: timestamp("resolvedAt"),
    resolvedBy: int("resolvedBy"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("incident_status_idx").on(t.status, t.createdAt)],
);

export type Incident = typeof incidents.$inferSelect;

export const incidentActions = mysqlTable("incident_actions", {
  id: int("id").autoincrement().primaryKey(),
  incidentId: int("incidentId").notNull(),
  adminId: int("adminId").notNull(),
  adminEmail: varchar("adminEmail", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type IncidentAction = typeof incidentActions.$inferSelect;

/**
 * Pricing Rules — dynamic surge pricing rule engine
 */
export const pricingRules = mysqlTable(
  "pricing_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    conditions: json("conditions").notNull(),
    multiplier: decimal("multiplier", { precision: 4, scale: 2 }).notNull(),
    cap: decimal("cap", { precision: 4, scale: 2 }).default("3.00"),
    priority: int("priority").default(0).notNull(),
    city: varchar("city", { length: 100 }),
    isActive: boolean("isActive").default(true).notNull(),
    triggerCount: int("triggerCount").default(0).notNull(),
    lastTriggeredAt: timestamp("lastTriggeredAt"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("pricing_rules_active_idx").on(t.isActive, t.priority)],
);

export type PricingRule = typeof pricingRules.$inferSelect;

/**
 * Feature Flags — runtime feature toggles with targeting
 */
export const featureFlags = mysqlTable("feature_flags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  description: text("description"),
  enabled: boolean("enabled").default(false).notNull(),
  rolloutPercent: int("rolloutPercent").default(100).notNull(),
  targetCities: json("targetCities"),
  targetSegments: json("targetSegments"),
  targeting: json("targeting"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;

/**
 * A/B Tests — experiment framework
 */
export const abTests = mysqlTable(
  "ab_tests",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    hypothesis: text("hypothesis"),
    metric: varchar("metric", { length: 100 }).notNull(),
    controlLabel: varchar("controlLabel", { length: 100 }).default("Control"),
    variantLabel: varchar("variantLabel", { length: 100 }).default("Variant"),
    sampleSize: int("sampleSize"),
    controlValue: decimal("controlValue", { precision: 15, scale: 4 }),
    variantValue: decimal("variantValue", { precision: 15, scale: 4 }),
    pValue: decimal("pValue", { precision: 6, scale: 4 }),
    status: mysqlEnum("status", ["draft", "running", "paused", "completed"]).default("draft").notNull(),
    winner: mysqlEnum("winner", ["control", "variant", "inconclusive"]),
    startedAt: timestamp("startedAt"),
    endedAt: timestamp("endedAt"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("ab_tests_status_idx").on(t.status, t.createdAt)],
);

export type AbTest = typeof abTests.$inferSelect;

/**
 * Fraud Flags — flagged users, rides, payments
 */
export const fraudFlags = mysqlTable(
  "fraud_flags",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    rideId: int("rideId"),
    paymentId: int("paymentId"),
    flagType: varchar("flagType", { length: 100 }).notNull(),
    score: decimal("score", { precision: 5, scale: 2 }).notNull(),
    signals: json("signals").notNull(),
    status: mysqlEnum("status", ["open", "blocked", "allowed", "escalated"]).default("open").notNull(),
    reviewedBy: int("reviewedBy"),
    reviewedAt: timestamp("reviewedAt"),
    reviewNote: text("reviewNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("fraud_status_idx").on(t.status, t.createdAt),
    index("fraud_user_idx").on(t.userId),
    index("fraud_type_idx").on(t.flagType, t.score),
  ],
);

export type FraudFlag = typeof fraudFlags.$inferSelect;

/**
 * Webhooks — outbound webhook delivery
 */
export const webhooks = mysqlTable("webhooks", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  events: json("events").notNull(),
  secret: varchar("secret", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Webhook = typeof webhooks.$inferSelect;

export const webhookDeliveries = mysqlTable(
  "webhook_deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    webhookId: int("webhookId").notNull(),
    event: varchar("event", { length: 100 }).notNull(),
    payload: json("payload").notNull(),
    status: mysqlEnum("status", ["pending", "delivered", "failed"]).default("pending").notNull(),
    responseCode: int("responseCode"),
    responseBody: text("responseBody"),
    attempts: int("attempts").default(0).notNull(),
    nextRetryAt: timestamp("nextRetryAt"),
    deliveredAt: timestamp("deliveredAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("wh_delivery_webhook_idx").on(t.webhookId, t.createdAt),
    index("wh_delivery_status_idx").on(t.status, t.nextRetryAt),
  ],
);

// ============================================================================
// Student Verification Table
// ============================================================================

/**
 * Student Verifications — OTP-based .edu email ownership proofs
 *
 * One active record per user at a time. Old records are logically expired/revoked
 * when a new OTP is issued. The `status` field is the source of truth.
 */
export const studentVerifications = mysqlTable(
  "student_verifications",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Stable public ID surfaced to the client */
    verificationId: varchar("verificationId", { length: 36 }).notNull().unique(),
    userId: int("userId").notNull(),
    /** The .edu email address being verified */
    email: varchar("email", { length: 255 }).notNull(),
    /** bcrypt hash of the 6-digit OTP — never stored in plain text */
    otpHash: varchar("otpHash", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["pending", "verified", "expired", "revoked"])
      .default("pending")
      .notNull(),
    /** Number of failed verification attempts for this record */
    attempts: int("attempts").default(0).notNull(),
    /** When this OTP token expires (5 minutes from creation) */
    expiresAt: timestamp("expiresAt").notNull(),
    /** Timestamp of the last OTP send/resend — used to enforce resend cooldown */
    lastSentAt: timestamp("lastSentAt").defaultNow().notNull(),
    verifiedAt: timestamp("verifiedAt"),
    /** Human-readable university name derived from email domain */
    universityName: varchar("universityName", { length: 255 }),
    /** Bare domain, e.g. "njit.edu" */
    universityDomain: varchar("universityDomain", { length: 100 }),
    /** Requester IP for audit / fraud detection */
    ipAddress: varchar("ipAddress", { length: 45 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("sv_user_status_idx").on(t.userId, t.status),
    index("sv_email_status_idx").on(t.email, t.status),
    index("sv_expires_idx").on(t.expiresAt),
  ],
);

export type StudentVerification = typeof studentVerifications.$inferSelect;
export type InsertStudentVerification = typeof studentVerifications.$inferInsert;

// ============================================================================
// Legal Compliance
// ============================================================================

export const legalAcceptances = mysqlTable(
  "legal_acceptances",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    legalVersion: varchar("legalVersion", { length: 20 }).notNull(),
    termsAcceptedAt: timestamp("termsAcceptedAt").notNull(),
    privacyAcceptedAt: timestamp("privacyAcceptedAt").notNull(),
    communityAcceptedAt: timestamp("communityAcceptedAt").notNull(),
    ipAddress: varchar("ipAddress", { length: 45 }),
    deviceInfo: varchar("deviceInfo", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("legal_acceptances_user_idx").on(t.userId),
    index("legal_acceptances_version_idx").on(t.legalVersion),
    index("legal_acceptances_user_version_idx").on(t.userId, t.legalVersion),
  ],
);

export type LegalAcceptance = typeof legalAcceptances.$inferSelect;
export type InsertLegalAcceptance = typeof legalAcceptances.$inferInsert;

export const legalPolicyVersions = mysqlTable(
  "legal_policy_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    version: varchar("version", { length: 20 }).notNull().unique(),
    effectiveDate: timestamp("effectiveDate").notNull(),
    summary: text("summary").notNull(),
    requiresReacceptance: boolean("requiresReacceptance").default(true).notNull(),
    publishedBy: int("publishedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
);

export type LegalPolicyVersion = typeof legalPolicyVersions.$inferSelect;

// ============================================================================
// Account lifecycle — deletion & data export (App Store / Play compliance)
// ============================================================================

export const accountDeletionRequests = mysqlTable(
  "account_deletion_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    status: mysqlEnum("status", ["pending", "cancelled", "processing", "completed"])
      .default("pending")
      .notNull(),
    reason: text("reason"),
    requestedAt: timestamp("requestedAt").defaultNow().notNull(),
    scheduledFor: timestamp("scheduledFor").notNull(),
    cancelledAt: timestamp("cancelledAt"),
    completedAt: timestamp("completedAt"),
  },
  (t) => [index("account_deletion_user_idx").on(t.userId, t.status)],
);

export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;

export const dataExportRequests = mysqlTable(
  "data_export_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    exportId: varchar("exportId", { length: 64 }).notNull().unique(),
    userId: int("userId").notNull(),
    status: mysqlEnum("status", ["requested", "processing", "ready", "expired", "failed"])
      .default("requested")
      .notNull(),
    payloadJson: json("payloadJson"),
    errorMessage: text("errorMessage"),
    requestedAt: timestamp("requestedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    expiresAt: timestamp("expiresAt"),
  },
  (t) => [index("data_export_user_idx").on(t.userId, t.status)],
);

export type DataExportRequest = typeof dataExportRequests.$inferSelect;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

// ============================================================================
// Communities — trusted ride marketplaces for groups
// ============================================================================

export const communities = mysqlTable(
  "communities",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 50 }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    description: varchar("description", { length: 300 }).notNull(),
    category: mysqlEnum("category", [
      "university",
      "company",
      "city",
      "apartment",
      "event",
      "travel",
      "private_group",
      "custom",
    ]).notNull(),
    visibility: mysqlEnum("visibility", ["public", "private", "invite_only"])
      .default("public")
      .notNull(),
    logoUrl: varchar("logoUrl", { length: 500 }),
    bannerUrl: varchar("bannerUrl", { length: 500 }),
    verificationType: mysqlEnum("verificationType", [
      "none",
      "edu_email",
      "company_email",
      "invite_code",
      "manual_approval",
    ])
      .default("none")
      .notNull(),
    verificationDomain: varchar("verificationDomain", { length: 100 }),
    inviteCode: varchar("inviteCode", { length: 32 }),
    createdBy: int("createdBy").notNull(),
    memberCount: int("memberCount").default(1).notNull(),
    rideCount: int("rideCount").default(0).notNull(),
    status: mysqlEnum("status", ["active", "archived", "suspended"])
      .default("active")
      .notNull(),
    /** themeColor, tags, location, featured, isVerified, searchKeywords, etc. */
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("communities_category_idx").on(t.category),
    index("communities_visibility_idx").on(t.visibility),
    index("communities_created_by_idx").on(t.createdBy),
    index("communities_status_idx").on(t.status),
  ],
);

export type Community = typeof communities.$inferSelect;
export type InsertCommunity = typeof communities.$inferInsert;

export const communityMembers = mysqlTable(
  "community_members",
  {
    id: int("id").autoincrement().primaryKey(),
    communityId: int("communityId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["owner", "admin", "moderator", "member"])
      .default("member")
      .notNull(),
    status: mysqlEnum("status", ["active", "pending", "rejected", "banned", "left"])
      .default("active")
      .notNull(),
    joinedAt: timestamp("joinedAt"),
    requestedAt: timestamp("requestedAt").defaultNow().notNull(),
    approvedAt: timestamp("approvedAt"),
    approvedBy: int("approvedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("cm_community_user_unique").on(t.communityId, t.userId),
    index("cm_user_status_idx").on(t.userId, t.status),
    index("cm_community_status_idx").on(t.communityId, t.status),
    index("cm_community_role_idx").on(t.communityId, t.role),
  ],
);

export type CommunityMember = typeof communityMembers.$inferSelect;
export type InsertCommunityMember = typeof communityMembers.$inferInsert;

export const communityRules = mysqlTable(
  "community_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    communityId: int("communityId").notNull(),
    text: varchar("text", { length: 500 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("cr_community_idx").on(t.communityId, t.sortOrder)],
);

export type CommunityRule = typeof communityRules.$inferSelect;
export type InsertCommunityRule = typeof communityRules.$inferInsert;

export const communityRides = mysqlTable(
  "community_rides",
  {
    id: int("id").autoincrement().primaryKey(),
    communityId: int("communityId").notNull(),
    rideId: int("rideId").notNull(),
    postedBy: int("postedBy").notNull(),
    visibility: mysqlEnum("visibility", ["community_only"])
      .default("community_only")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("crides_community_ride_unique").on(t.communityId, t.rideId),
    index("crides_ride_idx").on(t.rideId),
    index("crides_community_idx").on(t.communityId),
  ],
);

export type CommunityRide = typeof communityRides.$inferSelect;
export type InsertCommunityRide = typeof communityRides.$inferInsert;

export const communityInvites = mysqlTable(
  "community_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    communityId: int("communityId").notNull(),
    inviteCode: varchar("inviteCode", { length: 32 }).notNull(),
    createdBy: int("createdBy").notNull(),
    expiresAt: timestamp("expiresAt"),
    maxUses: int("maxUses"),
    usedCount: int("usedCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("cinv_community_idx").on(t.communityId),
    index("cinv_code_idx").on(t.inviteCode),
  ],
);

export type CommunityInvite = typeof communityInvites.$inferSelect;
export type InsertCommunityInvite = typeof communityInvites.$inferInsert;
