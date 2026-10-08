import { relations } from "drizzle-orm";

import {
  analytics,
  chatMessages,
  connectedAccounts,
  creditGrants,
  creditLedger,
  creditRedemptions,
  creditWallets,
  abuseFlags,
  driverApplications,
  fileUploads,
  emergencyAlerts,
  payments,
  promoCodes,
  promoUsage,
  referrals,
  ridePassengers,
  rides,
  ratings,
  stripeCustomers,
  stripePaymentMethods,
  stripePayments,
  stripeRefunds,
  stripeTransfers,
  transactions,
  userProfiles,
  users,
  wallets,
} from "./schema";

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  driverRides: many(rides),
  passengerRides: many(ridePassengers),
  payments: many(payments),
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  transactions: many(transactions),
  sentMessages: many(chatMessages, { relationName: "sender" }),
  receivedMessages: many(chatMessages, { relationName: "recipient" }),
  ratingsGiven: many(ratings, { relationName: "rater" }),
  ratingsReceived: many(ratings, { relationName: "rated" }),
  referralsCreated: many(referrals, { relationName: "referrer" }),
  emergencyAlerts: many(emergencyAlerts),
  analytics: many(analytics),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export const ridesRelations = relations(rides, ({ one, many }) => ({
  driver: one(users, {
    fields: [rides.driverId],
    references: [users.id],
  }),
  passengers: many(ridePassengers),
  payments: many(payments),
  chatMessages: many(chatMessages),
  ratings: many(ratings),
  emergencyAlerts: many(emergencyAlerts),
  promoUsage: many(promoUsage),
}));

export const ridePassengersRelations = relations(ridePassengers, ({ one }) => ({
  ride: one(rides, {
    fields: [ridePassengers.rideId],
    references: [rides.id],
  }),
  passenger: one(users, {
    fields: [ridePassengers.passengerId],
    references: [users.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  ride: one(rides, {
    fields: [payments.rideId],
    references: [rides.id],
  }),
  passenger: one(users, {
    fields: [payments.passengerId],
    references: [users.id],
  }),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  relatedRide: one(rides, {
    fields: [transactions.relatedRideId],
    references: [rides.id],
  }),
  relatedPayment: one(payments, {
    fields: [transactions.relatedPaymentId],
    references: [payments.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  ride: one(rides, {
    fields: [chatMessages.rideId],
    references: [rides.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  recipient: one(users, {
    fields: [chatMessages.recipientId],
    references: [users.id],
    relationName: "recipient",
  }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  ride: one(rides, {
    fields: [ratings.rideId],
    references: [rides.id],
  }),
  rater: one(users, {
    fields: [ratings.raterId],
    references: [users.id],
    relationName: "rater",
  }),
  ratedUser: one(users, {
    fields: [ratings.ratedUserId],
    references: [users.id],
    relationName: "rated",
  }),
}));

export const promoCodesRelations = relations(promoCodes, ({ many }) => ({
  usage: many(promoUsage),
}));

export const promoUsageRelations = relations(promoUsage, ({ one }) => ({
  promoCode: one(promoCodes, {
    fields: [promoUsage.promoCodeId],
    references: [promoCodes.id],
  }),
  user: one(users, {
    fields: [promoUsage.userId],
    references: [users.id],
  }),
  ride: one(rides, {
    fields: [promoUsage.rideId],
    references: [rides.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
    relationName: "referrer",
  }),
  referredUser: one(users, {
    fields: [referrals.referredUserId],
    references: [users.id],
  }),
}));

export const emergencyAlertsRelations = relations(emergencyAlerts, ({ one }) => ({
  user: one(users, {
    fields: [emergencyAlerts.userId],
    references: [users.id],
  }),
  ride: one(rides, {
    fields: [emergencyAlerts.rideId],
    references: [rides.id],
  }),
}));

export const analyticsRelations = relations(analytics, ({ one }) => ({
  user: one(users, {
    fields: [analytics.userId],
    references: [users.id],
  }),
}));

// ── Stripe Payment Relations ──────────────────────────────────────────────

export const stripeCustomersRelations = relations(stripeCustomers, ({ one }) => ({
  user: one(users, { fields: [stripeCustomers.userId], references: [users.id] }),
}));

export const connectedAccountsRelations = relations(connectedAccounts, ({ one }) => ({
  user: one(users, { fields: [connectedAccounts.userId], references: [users.id] }),
}));

export const stripePaymentMethodsRelations = relations(stripePaymentMethods, ({ one }) => ({
  user: one(users, { fields: [stripePaymentMethods.userId], references: [users.id] }),
}));

export const stripePaymentsRelations = relations(stripePayments, ({ one, many }) => ({
  ride: one(rides, { fields: [stripePayments.rideId], references: [rides.id] }),
  rider: one(users, { fields: [stripePayments.riderId], references: [users.id], relationName: "paymentRider" }),
  driver: one(users, { fields: [stripePayments.driverId], references: [users.id], relationName: "paymentDriver" }),
  transfer: one(stripeTransfers),
  refunds: many(stripeRefunds),
}));

export const stripeTransfersRelations = relations(stripeTransfers, ({ one }) => ({
  payment: one(stripePayments, { fields: [stripeTransfers.paymentId], references: [stripePayments.id] }),
}));

export const stripeRefundsRelations = relations(stripeRefunds, ({ one }) => ({
  payment: one(stripePayments, { fields: [stripeRefunds.paymentId], references: [stripePayments.id] }),
}));

// ── Wallet Ride Credits Relations ────────────────────────────────────────

export const creditWalletsRelations = relations(creditWallets, ({ one }) => ({
  user: one(users, { fields: [creditWallets.userId], references: [users.id] }),
}));

export const creditGrantsRelations = relations(creditGrants, ({ one, many }) => ({
  user: one(users, { fields: [creditGrants.userId], references: [users.id] }),
  ride: one(rides, { fields: [creditGrants.rideId], references: [rides.id] }),
  redemptions: many(creditRedemptions),
}));

export const creditRedemptionsRelations = relations(creditRedemptions, ({ one }) => ({
  user: one(users, { fields: [creditRedemptions.userId], references: [users.id] }),
  ride: one(rides, { fields: [creditRedemptions.rideId], references: [rides.id] }),
  grant: one(creditGrants, { fields: [creditRedemptions.grantId], references: [creditGrants.id] }),
}));

export const creditLedgerRelations = relations(creditLedger, ({ one }) => ({
  user: one(users, { fields: [creditLedger.userId], references: [users.id] }),
}));

export const abuseFlagsRelations = relations(abuseFlags, ({ one }) => ({
  user: one(users, { fields: [abuseFlags.userId], references: [users.id] }),
}));

// ── Driver Applications Relations ────────────────────────────────────────

export const driverApplicationsRelations = relations(driverApplications, ({ one }) => ({
  user: one(users, { fields: [driverApplications.userId], references: [users.id] }),
}));

export const fileUploadsRelations = relations(fileUploads, ({ one }) => ({
  user: one(users, { fields: [fileUploads.userId], references: [users.id] }),
}));
