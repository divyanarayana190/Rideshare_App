CREATE TABLE `connected_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripeAccountId` varchar(255) NOT NULL,
	`chargesEnabled` boolean NOT NULL DEFAULT false,
	`payoutsEnabled` boolean NOT NULL DEFAULT false,
	`onboardingComplete` boolean NOT NULL DEFAULT false,
	`detailsSubmitted` boolean NOT NULL DEFAULT false,
	`country` varchar(2) DEFAULT 'US',
	`defaultCurrency` varchar(3) DEFAULT 'usd',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `connected_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `connected_accounts_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `connected_accounts_stripeAccountId_unique` UNIQUE(`stripeAccountId`)
);
--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`cardType` enum('visa','mastercard','amex','discover') NOT NULL,
	`last4` varchar(4) NOT NULL,
	`holderName` varchar(100) NOT NULL,
	`expiryMonth` int NOT NULL,
	`expiryYear` int NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`stripePaymentMethodId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_methods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `points_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`reason` enum('mid_ride_join','shared_ride_bonus','original_passenger_bonus','driver_bonus','first_shared_ride','referral_bonus','redeemed') NOT NULL,
	`relatedRideId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `points_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reward_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`points` int NOT NULL DEFAULT 0,
	`totalEarned` int NOT NULL DEFAULT 0,
	`totalRedeemed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reward_points_id` PRIMARY KEY(`id`),
	CONSTRAINT `reward_points_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `ride_stops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int NOT NULL,
	`stopType` enum('pickup','dropoff') NOT NULL,
	`passengerId` int NOT NULL,
	`lat` decimal(10,8) NOT NULL,
	`lng` decimal(11,8) NOT NULL,
	`address` text NOT NULL,
	`sequence` int NOT NULL,
	`status` enum('pending','approaching','reached','skipped') NOT NULL DEFAULT 'pending',
	`estimatedArrivalAt` timestamp,
	`actualArrivalAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ride_stops_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stripe_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripeCustomerId` varchar(255) NOT NULL,
	`defaultPaymentMethodId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stripe_customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_customers_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `stripe_customers_stripeCustomerId_unique` UNIQUE(`stripeCustomerId`)
);
--> statement-breakpoint
CREATE TABLE `stripe_payment_methods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripePmId` varchar(255) NOT NULL,
	`type` enum('card','apple_pay','google_pay') NOT NULL,
	`cardBrand` varchar(20),
	`cardLast4` varchar(4),
	`cardExpMonth` int,
	`cardExpYear` int,
	`isDefault` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_payment_methods_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_payment_methods_stripePmId_unique` UNIQUE(`stripePmId`)
);
--> statement-breakpoint
CREATE TABLE `stripe_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` varchar(36) NOT NULL,
	`rideId` int NOT NULL,
	`riderId` int NOT NULL,
	`driverId` int NOT NULL,
	`stripePaymentIntentId` varchar(255),
	`stripeChargeId` varchar(255),
	`amountCents` int NOT NULL,
	`platformFeeCents` int NOT NULL,
	`driverAmountCents` int NOT NULL,
	`tipCents` int NOT NULL DEFAULT 0,
	`currency` varchar(3) DEFAULT 'usd',
	`status` enum('pending','processing','succeeded','failed','refunded','partially_refunded') NOT NULL DEFAULT 'pending',
	`failureReason` text,
	`paymentMethodId` varchar(255),
	`idempotencyKey` varchar(255),
	`metadata` json,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stripe_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_payments_paymentId_unique` UNIQUE(`paymentId`),
	CONSTRAINT `stripe_payments_stripePaymentIntentId_unique` UNIQUE(`stripePaymentIntentId`),
	CONSTRAINT `stripe_payments_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `stripe_refunds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`refundId` varchar(36) NOT NULL,
	`paymentId` int NOT NULL,
	`rideId` int NOT NULL,
	`stripeRefundId` varchar(255),
	`amountCents` int NOT NULL,
	`reason` enum('rider_cancelled','driver_cancelled','wrong_route','overcharge','safety_issue','other') NOT NULL,
	`status` enum('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
	`initiatedBy` enum('rider','driver','support','system') NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_refunds_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_refunds_refundId_unique` UNIQUE(`refundId`),
	CONSTRAINT `stripe_refunds_stripeRefundId_unique` UNIQUE(`stripeRefundId`)
);
--> statement-breakpoint
CREATE TABLE `stripe_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` int NOT NULL,
	`stripeTransferId` varchar(255),
	`driverId` int NOT NULL,
	`amountCents` int NOT NULL,
	`status` enum('pending','paid','failed','reversed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_transfers_stripeTransferId_unique` UNIQUE(`stripeTransferId`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stripeEventId` varchar(255) NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`stripeObjectId` varchar(255),
	`status` enum('received','processing','processed','failed') NOT NULL DEFAULT 'received',
	`payload` json NOT NULL,
	`errorMessage` text,
	`attempts` int NOT NULL DEFAULT 0,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_events_stripeEventId_unique` UNIQUE(`stripeEventId`)
);
--> statement-breakpoint
ALTER TABLE `carpool_join_requests` ADD `detourKm` decimal(8,2);--> statement-breakpoint
ALTER TABLE `carpool_join_requests` ADD `detourMinutes` int;--> statement-breakpoint
ALTER TABLE `carpool_join_requests` ADD `compatibilityScore` int;--> statement-breakpoint
ALTER TABLE `carpool_join_requests` ADD `isMidRideJoin` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `carpool_join_requests` ADD `driverApproval` enum('pending','approved','rejected');--> statement-breakpoint
ALTER TABLE `ride_passengers` ADD `seatsOccupied` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `ride_passengers` ADD `isOriginalPassenger` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rides` ADD `availableSeats` int DEFAULT 3;--> statement-breakpoint
ALTER TABLE `rides` ADD `originalFare` decimal(10,2);--> statement-breakpoint
ALTER TABLE `rides` ADD `routePolyline` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `isStudent` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `collegeEmail` varchar(255);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `studentFreeRidesUsed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `studentFreeRidesEarned` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `conn_acct_user_idx` ON `connected_accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `points_ledger_user_idx` ON `points_ledger` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ride_stops_ride_seq_idx` ON `ride_stops` (`rideId`,`sequence`);--> statement-breakpoint
CREATE INDEX `ride_stops_ride_status_idx` ON `ride_stops` (`rideId`,`status`);--> statement-breakpoint
CREATE INDEX `stripe_cust_user_idx` ON `stripe_customers` (`userId`);--> statement-breakpoint
CREATE INDEX `stripe_pm_user_idx` ON `stripe_payment_methods` (`userId`);--> statement-breakpoint
CREATE INDEX `stripe_pay_ride_idx` ON `stripe_payments` (`rideId`);--> statement-breakpoint
CREATE INDEX `stripe_pay_rider_idx` ON `stripe_payments` (`riderId`);--> statement-breakpoint
CREATE INDEX `stripe_pay_driver_idx` ON `stripe_payments` (`driverId`);--> statement-breakpoint
CREATE INDEX `stripe_pay_status_idx` ON `stripe_payments` (`status`);--> statement-breakpoint
CREATE INDEX `stripe_pay_pi_idx` ON `stripe_payments` (`stripePaymentIntentId`);--> statement-breakpoint
CREATE INDEX `stripe_refund_payment_idx` ON `stripe_refunds` (`paymentId`);--> statement-breakpoint
CREATE INDEX `stripe_refund_ride_idx` ON `stripe_refunds` (`rideId`);--> statement-breakpoint
CREATE INDEX `stripe_xfer_payment_idx` ON `stripe_transfers` (`paymentId`);--> statement-breakpoint
CREATE INDEX `stripe_xfer_driver_idx` ON `stripe_transfers` (`driverId`);--> statement-breakpoint
CREATE INDEX `wh_event_id_idx` ON `webhook_events` (`stripeEventId`);--> statement-breakpoint
CREATE INDEX `wh_event_type_idx` ON `webhook_events` (`eventType`);--> statement-breakpoint
CREATE INDEX `wh_status_idx` ON `webhook_events` (`status`);