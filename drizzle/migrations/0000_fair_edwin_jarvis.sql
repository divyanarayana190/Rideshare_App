CREATE TABLE `ab_tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`hypothesis` text,
	`metric` varchar(100) NOT NULL,
	`controlLabel` varchar(100) DEFAULT 'Control',
	`variantLabel` varchar(100) DEFAULT 'Variant',
	`sampleSize` int,
	`controlValue` decimal(15,4),
	`variantValue` decimal(15,4),
	`pValue` decimal(6,4),
	`status` enum('draft','running','paused','completed') NOT NULL DEFAULT 'draft',
	`winner` enum('control','variant','inconclusive'),
	`startedAt` timestamp,
	`endedAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ab_tests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `abuse_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flagId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`rideId` int,
	`flagType` enum('velocity_limit','duplicate_grant','suspicious_pattern','manual_review') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','investigating','resolved','dismissed') NOT NULL DEFAULT 'open',
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `abuse_flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `abuse_flags_flagId_unique` UNIQUE(`flagId`)
);
--> statement-breakpoint
CREATE TABLE `account_deletion_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','cancelled','processing','completed') NOT NULL DEFAULT 'pending',
	`reason` text,
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`scheduledFor` timestamp NOT NULL,
	`cancelledAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `account_deletion_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_deletion_requests_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `admin_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`adminEmail` varchar(320) NOT NULL,
	`action` varchar(100) NOT NULL,
	`entity` varchar(50) NOT NULL,
	`entityId` varchar(100),
	`details` text,
	`beforeState` json,
	`afterState` json,
	`ipAddress` varchar(45),
	`userAgent` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`metric` varchar(100) NOT NULL,
	`operator` enum('gt','lt','eq','gte','lte') NOT NULL,
	`threshold` decimal(15,4) NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alert_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` timestamp NOT NULL,
	`totalRides` int DEFAULT 0,
	`totalDistance` decimal(10,2) DEFAULT '0.00',
	`totalSpent` decimal(10,2) DEFAULT '0.00',
	`totalEarned` decimal(10,2) DEFAULT '0.00',
	`averageRating` decimal(3,2) DEFAULT '5.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `carpool_join_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`joinRequestId` varchar(100) NOT NULL,
	`rideId` varchar(50) NOT NULL,
	`passengerId` int NOT NULL,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`message` text,
	`pickupLat` decimal(10,8) NOT NULL,
	`pickupLng` decimal(11,8) NOT NULL,
	`pickupAddress` text NOT NULL,
	`dropoffLat` decimal(10,8) NOT NULL,
	`dropoffLng` decimal(11,8) NOT NULL,
	`dropoffAddress` text NOT NULL,
	`distanceKm` decimal(8,2) NOT NULL,
	`fareShare` decimal(8,2) NOT NULL,
	`detourKm` decimal(8,2),
	`detourMinutes` int,
	`compatibilityScore` int,
	`isMidRideJoin` boolean NOT NULL DEFAULT false,
	`driverApproval` enum('pending','approved','rejected'),
	`creatorApproval` enum('pending','approved','rejected'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	CONSTRAINT `carpool_join_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `carpool_join_requests_joinRequestId_unique` UNIQUE(`joinRequestId`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` varchar(100) NOT NULL,
	`rideId` int NOT NULL,
	`senderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`message` text NOT NULL,
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_messages_messageId_unique` UNIQUE(`messageId`)
);
--> statement-breakpoint
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
CREATE TABLE `credit_grants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`grantId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`rideId` int,
	`amountCents` int NOT NULL,
	`remainingCents` int NOT NULL,
	`reason` enum('referral_bonus','promo_code','ride_refund','goodwill','sign_up_bonus','admin_adjustment') NOT NULL,
	`status` enum('active','fully_redeemed','expired','revoked') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp,
	`idempotencyKey` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_grants_id` PRIMARY KEY(`id`),
	CONSTRAINT `credit_grants_grantId_unique` UNIQUE(`grantId`),
	CONSTRAINT `credit_grants_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`entryType` enum('grant','reserve','apply','release','expire','revoke','admin_adjust') NOT NULL,
	`amountCents` int NOT NULL,
	`balanceAfterCents` int NOT NULL,
	`relatedGrantId` int,
	`relatedRedemptionId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `credit_ledger_ledgerId_unique` UNIQUE(`ledgerId`)
);
--> statement-breakpoint
CREATE TABLE `credit_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`redemptionId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`rideId` int NOT NULL,
	`grantId` int NOT NULL,
	`amountCents` int NOT NULL,
	`status` enum('reserved','applied','released','reversed') NOT NULL DEFAULT 'reserved',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_redemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `credit_redemptions_redemptionId_unique` UNIQUE(`redemptionId`)
);
--> statement-breakpoint
CREATE TABLE `credit_wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`availableBalance` int NOT NULL DEFAULT 0,
	`reservedBalance` int NOT NULL DEFAULT 0,
	`totalEarned` int NOT NULL DEFAULT 0,
	`totalRedeemed` int NOT NULL DEFAULT 0,
	`totalExpired` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_wallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `credit_wallets_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `data_export_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exportId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`status` enum('requested','processing','ready','expired','failed') NOT NULL DEFAULT 'requested',
	`payloadJson` json,
	`errorMessage` text,
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`expiresAt` timestamp,
	CONSTRAINT `data_export_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_export_requests_exportId_unique` UNIQUE(`exportId`)
);
--> statement-breakpoint
CREATE TABLE `driver_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`fullName` varchar(200) NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`profilePhotoUrl` text,
	`licenseNumber` varchar(50) NOT NULL,
	`licenseState` varchar(50) NOT NULL,
	`licenseExpiry` varchar(20) NOT NULL,
	`licenseFrontUrl` text,
	`licenseBackUrl` text,
	`vehicleMake` varchar(100) NOT NULL,
	`vehicleModel` varchar(100) NOT NULL,
	`vehicleYear` int NOT NULL,
	`vehicleColor` varchar(50) NOT NULL,
	`plateNumber` varchar(20) NOT NULL,
	`vehicleType` enum('sedan','suv','van','truck','luxury') NOT NULL DEFAULT 'sedan',
	`vehiclePhotoUrl` text,
	`fuelType` enum('electric','hybrid','gasoline'),
	`seatCount` int,
	`insurancePolicyNumber` varchar(100) NOT NULL,
	`insuranceProvider` varchar(200) NOT NULL,
	`insuranceExpiry` varchar(20) NOT NULL,
	`insuranceDocUrl` text,
	`bankName` varchar(200),
	`accountLast4` varchar(4),
	`routingLast4` varchar(4),
	`status` enum('pending','under_review','approved','rejected') NOT NULL DEFAULT 'pending',
	`rejectionReason` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`approvedAt` timestamp,
	`rejectedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driver_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `driver_applications_applicationId_unique` UNIQUE(`applicationId`)
);
--> statement-breakpoint
CREATE TABLE `driver_availability_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`slotId` varchar(36) NOT NULL,
	`slotType` enum('recurring','one_time') NOT NULL,
	`dayOfWeek` int,
	`specificDate` timestamp,
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driver_availability_slots_id` PRIMARY KEY(`id`),
	CONSTRAINT `driver_availability_slots_slotId_unique` UNIQUE(`slotId`)
);
--> statement-breakpoint
CREATE TABLE `driver_schedule_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`preferredPickupLat` decimal(10,8),
	`preferredPickupLng` decimal(11,8),
	`preferredPickupRadiusKm` decimal(6,2) DEFAULT '10.00',
	`maxDistanceKm` decimal(6,2) DEFAULT '25.00',
	`rideTypesAccepted` json,
	`scheduledRidesEnabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driver_schedule_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `driver_schedule_settings_driverId_unique` UNIQUE(`driverId`)
);
--> statement-breakpoint
CREATE TABLE `driver_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`status` enum('online','offline','on_ride') NOT NULL DEFAULT 'offline',
	`currentLat` decimal(10,8),
	`currentLng` decimal(11,8),
	`currentRideId` varchar(50),
	`acceptanceRate` decimal(5,2) DEFAULT '100.00',
	`todayRides` int DEFAULT 0,
	`todayEarnings` decimal(10,2) DEFAULT '0.00',
	`totalOnlineMinutes` int NOT NULL DEFAULT 0,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`goOnlineAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driver_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `driver_sessions_driverId_unique` UNIQUE(`driverId`)
);
--> statement-breakpoint
CREATE TABLE `emergency_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertId` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`rideId` int,
	`latitude` decimal(10,8) NOT NULL,
	`longitude` decimal(11,8) NOT NULL,
	`alertType` enum('sos','unsafe_driver','unsafe_passenger') NOT NULL,
	`status` enum('active','responded','resolved') DEFAULT 'active',
	`emergencyContactsNotified` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `emergency_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `emergency_alerts_alertId_unique` UNIQUE(`alertId`)
);
--> statement-breakpoint
CREATE TABLE `faq_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` enum('general','rides','payments','safety','account','driver') NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `faq_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`key` varchar(100) NOT NULL,
	`description` text,
	`enabled` boolean NOT NULL DEFAULT false,
	`rolloutPercent` int NOT NULL DEFAULT 100,
	`targetCities` json,
	`targetSegments` json,
	`targeting` json,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feature_flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `feature_flags_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `file_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`purpose` enum('profile_photo','license_front','license_back','insurance_doc','vehicle_photo','misc') NOT NULL,
	`originalName` varchar(500) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`sizeBytes` int NOT NULL,
	`storagePath` text NOT NULL,
	`publicUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_uploads_id` PRIMARY KEY(`id`),
	CONSTRAINT `file_uploads_uploadId_unique` UNIQUE(`uploadId`)
);
--> statement-breakpoint
CREATE TABLE `fraud_flags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`rideId` int,
	`paymentId` int,
	`flagType` varchar(100) NOT NULL,
	`score` decimal(5,2) NOT NULL,
	`signals` json NOT NULL,
	`status` enum('open','blocked','allowed','escalated') NOT NULL DEFAULT 'open',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fraud_flags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incident_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incidentId` int NOT NULL,
	`adminId` int NOT NULL,
	`adminEmail` varchar(255),
	`action` varchar(100) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incident_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`severity` enum('sev1','sev2','sev3','sev4') NOT NULL DEFAULT 'sev3',
	`status` enum('open','investigating','mitigating','resolved') NOT NULL DEFAULT 'open',
	`city` varchar(100),
	`description` text,
	`impact` text,
	`resolvedAt` timestamp,
	`resolvedBy` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incidents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `legal_acceptances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`legalVersion` varchar(20) NOT NULL,
	`termsAcceptedAt` timestamp NOT NULL,
	`privacyAcceptedAt` timestamp NOT NULL,
	`communityAcceptedAt` timestamp NOT NULL,
	`ipAddress` varchar(45),
	`deviceInfo` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `legal_acceptances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `legal_policy_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` varchar(20) NOT NULL,
	`effectiveDate` timestamp NOT NULL,
	`summary` text NOT NULL,
	`requiresReacceptance` boolean NOT NULL DEFAULT true,
	`publishedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `legal_policy_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `legal_policy_versions_version_unique` UNIQUE(`version`)
);
--> statement-breakpoint
CREATE TABLE `live_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(36) NOT NULL,
	`senderId` int NOT NULL,
	`lc_sender_type` enum('user','admin','system') NOT NULL,
	`lc_message_type` enum('text','image','file','system') NOT NULL DEFAULT 'text',
	`content` text NOT NULL,
	`attachmentUrl` text,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `live_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `live_chat_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`adminId` int,
	`chat_category` enum('general','ride_issue','payment','account','technical','safety','driver_support','other') NOT NULL DEFAULT 'general',
	`issueDescription` text NOT NULL,
	`chat_status` enum('waiting','active','ended','missed','rejected') NOT NULL DEFAULT 'waiting',
	`chat_priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`rejectionReason` text,
	`rating` int,
	`ratingFeedback` text,
	`startedAt` timestamp,
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `live_chat_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `live_chat_sessions_sessionId_unique` UNIQUE(`sessionId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`recipientRole` enum('passenger','driver') NOT NULL DEFAULT 'passenger',
	`type` enum('ride_request','driver_assigned','driver_arrived','ride_started','ride_completed','ride_cancelled','payment_received','rating_request','promo_code','system','safety_alert') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`data` json,
	`isRead` boolean NOT NULL DEFAULT false,
	`deepLink` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_notificationId_unique` UNIQUE(`notificationId`)
);
--> statement-breakpoint
CREATE TABLE `passenger_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` varchar(100) NOT NULL,
	`passengerId` int NOT NULL,
	`pickupLat` decimal(10,8) NOT NULL,
	`pickupLng` decimal(11,8) NOT NULL,
	`pickupAddress` varchar(255) NOT NULL,
	`dropoffLat` decimal(10,8) NOT NULL,
	`dropoffLng` decimal(11,8) NOT NULL,
	`dropoffAddress` varchar(255) NOT NULL,
	`passengerCount` int NOT NULL DEFAULT 1,
	`offerPrice` decimal(10,2) NOT NULL,
	`distanceKm` decimal(8,2),
	`estimatedMinutes` int,
	`status` enum('pending','broadcasting','matched','cancelled','expired') NOT NULL DEFAULT 'pending',
	`broadcastRadiusKm` decimal(5,2) DEFAULT '3',
	`matchedDriverId` int,
	`matchedRideId` varchar(50),
	`driversNotified` int NOT NULL DEFAULT 0,
	`driversViewed` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passenger_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `passenger_requests_requestId_unique` UNIQUE(`requestId`)
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
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` varchar(100) NOT NULL,
	`rideId` int NOT NULL,
	`passengerId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) DEFAULT 'USD',
	`status` enum('pending','completed','failed','refunded') DEFAULT 'pending',
	`stripePaymentIntentId` varchar(255),
	`paymentMethod` enum('card','wallet','apple_pay','google_pay') DEFAULT 'card',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`refundedAt` timestamp,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_paymentId_unique` UNIQUE(`paymentId`)
);
--> statement-breakpoint
CREATE TABLE `platform_config` (
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`type` enum('number','string','boolean','json') NOT NULL DEFAULT 'string',
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_config_key` PRIMARY KEY(`key`)
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
CREATE TABLE `pricing_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`conditions` json NOT NULL,
	`multiplier` decimal(4,2) NOT NULL,
	`cap` decimal(4,2) DEFAULT '3.00',
	`priority` int NOT NULL DEFAULT 0,
	`city` varchar(100),
	`isActive` boolean NOT NULL DEFAULT true,
	`triggerCount` int NOT NULL DEFAULT 0,
	`lastTriggeredAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pricing_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`description` text,
	`discountType` enum('percentage','fixed') NOT NULL,
	`discountValue` decimal(10,2) NOT NULL,
	`maxUses` int,
	`currentUses` int DEFAULT 0,
	`minRideAmount` decimal(10,2) DEFAULT '0.00',
	`maxDiscount` decimal(10,2),
	`validFrom` timestamp NOT NULL,
	`validUntil` timestamp NOT NULL,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promo_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `promo_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `promo_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`promoCodeId` int NOT NULL,
	`userId` int NOT NULL,
	`rideId` int NOT NULL,
	`discountAmount` decimal(10,2) NOT NULL,
	`usedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promo_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(500) NOT NULL,
	`platform` enum('ios','android','web') NOT NULL,
	`deviceId` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ratingId` varchar(100) NOT NULL,
	`rideId` int NOT NULL,
	`raterId` int NOT NULL,
	`ratedUserId` int NOT NULL,
	`ratingType` enum('passenger','driver') NOT NULL,
	`score` int NOT NULL,
	`comment` text,
	`photos` json,
	`reportedUnsafeBehavior` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ratings_id` PRIMARY KEY(`id`),
	CONSTRAINT `ratings_ratingId_unique` UNIQUE(`ratingId`)
);
--> statement-breakpoint
CREATE TABLE `recurring_rides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recurringId` varchar(50) NOT NULL,
	`creatorId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`pickupLat` decimal(10,8) NOT NULL,
	`pickupLng` decimal(11,8) NOT NULL,
	`pickupAddress` text NOT NULL,
	`dropoffLat` decimal(10,8) NOT NULL,
	`dropoffLng` decimal(11,8) NOT NULL,
	`dropoffAddress` text NOT NULL,
	`departureTimeOfDay` varchar(5) NOT NULL,
	`daysOfWeek` json NOT NULL,
	`pricePerSeat` decimal(8,2) NOT NULL,
	`totalSeats` int NOT NULL DEFAULT 3,
	`safetyMode` enum('none','women_drivers_only','women_companions_only','women_only') NOT NULL DEFAULT 'none',
	`approvalRequired` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`advanceCreateDays` int DEFAULT 1,
	`distanceKm` decimal(8,2),
	`estimatedMinutes` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recurring_rides_id` PRIMARY KEY(`id`),
	CONSTRAINT `recurring_rides_recurringId_unique` UNIQUE(`recurringId`)
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referralCode` varchar(50) NOT NULL,
	`referrerId` int NOT NULL,
	`referredUserId` int,
	`creditAmount` decimal(10,2) NOT NULL,
	`status` enum('pending','completed') DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `referrals_id` PRIMARY KEY(`id`),
	CONSTRAINT `referrals_referralCode_unique` UNIQUE(`referralCode`)
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
CREATE TABLE `ride_passengers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int NOT NULL,
	`passengerId` int NOT NULL,
	`seatsOccupied` int DEFAULT 1,
	`isOriginalPassenger` boolean NOT NULL DEFAULT false,
	`pickupLat` decimal(10,8) NOT NULL,
	`pickupLng` decimal(11,8) NOT NULL,
	`pickupAddress` text NOT NULL,
	`dropoffLat` decimal(10,8) NOT NULL,
	`dropoffLng` decimal(11,8) NOT NULL,
	`dropoffAddress` text NOT NULL,
	`distanceKm` decimal(8,2) NOT NULL,
	`fareShare` decimal(10,2) NOT NULL,
	`status` enum('joined','picked_up','dropped_off','cancelled') DEFAULT 'joined',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`pickedUpAt` timestamp,
	`droppedOffAt` timestamp,
	CONSTRAINT `ride_passengers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ride_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` varchar(100) NOT NULL,
	`rideId` varchar(50) NOT NULL,
	`driverId` int NOT NULL,
	`status` enum('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
	`offeredFare` decimal(10,2) NOT NULL,
	`etaMinutes` int,
	`expiresAt` timestamp NOT NULL,
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ride_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `ride_requests_requestId_unique` UNIQUE(`requestId`)
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
CREATE TABLE `rides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` varchar(50) NOT NULL,
	`driverId` int NOT NULL,
	`mode` enum('solo','share') NOT NULL,
	`status` enum('searching','matched','driver_arrived','in_progress','completed','cancelled','missed') NOT NULL DEFAULT 'searching',
	`rideStep` enum('finding_driver','driver_assigned','driver_en_route','driver_arrived','ride_started','ride_in_progress','completed','cancelled') DEFAULT 'finding_driver',
	`pickupLat` decimal(10,8) NOT NULL,
	`pickupLng` decimal(11,8) NOT NULL,
	`pickupAddress` text NOT NULL,
	`dropoffLat` decimal(10,8) NOT NULL,
	`dropoffLng` decimal(11,8) NOT NULL,
	`dropoffAddress` text NOT NULL,
	`distanceKm` decimal(8,2) NOT NULL,
	`estimatedMinutes` int NOT NULL,
	`totalFare` decimal(10,2) NOT NULL,
	`surgeMultiplier` decimal(4,2) DEFAULT '1.00',
	`fareBreakdown` json,
	`safetyMode` enum('none','women_drivers_only','women_companions_only','women_only') DEFAULT 'none',
	`stripePaymentIntentId` varchar(255),
	`departureTime` timestamp,
	`pricePerSeat` decimal(8,2),
	`totalSeats` int DEFAULT 3,
	`availableSeats` int DEFAULT 3,
	`originalFare` decimal(10,2),
	`approvalRequired` boolean NOT NULL DEFAULT true,
	`arrivalTargetPassengerId` int,
	`carpoolTitle` varchar(200),
	`recurringRideId` int,
	`routePolyline` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`driverAssignedAt` timestamp,
	`driverArrivedAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`cancelledAt` timestamp,
	`cancelReason` varchar(255),
	CONSTRAINT `rides_id` PRIMARY KEY(`id`),
	CONSTRAINT `rides_rideId_unique` UNIQUE(`rideId`)
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
CREATE TABLE `student_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`verificationId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(255) NOT NULL,
	`otpHash` varchar(255) NOT NULL,
	`status` enum('pending','verified','expired','revoked') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`lastSentAt` timestamp NOT NULL DEFAULT (now()),
	`verifiedAt` timestamp,
	`universityName` varchar(255),
	`universityDomain` varchar(100),
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_verifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_verifications_verificationId_unique` UNIQUE(`verificationId`)
);
--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` varchar(36) NOT NULL,
	`senderId` int NOT NULL,
	`senderType` enum('user','admin') NOT NULL,
	`message` text NOT NULL,
	`attachmentUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`category` enum('ride_issue','payment','account','driver','safety','app_bug','feedback','other') NOT NULL,
	`subject` varchar(500) NOT NULL,
	`description` text NOT NULL,
	`status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`assignedTo` int,
	`rideId` int,
	`attachmentUrl` text,
	`adminNotes` text,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_tickets_ticketId_unique` UNIQUE(`ticketId`)
);
--> statement-breakpoint
CREATE TABLE `surge_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`centerLat` decimal(10,8) NOT NULL,
	`centerLng` decimal(11,8) NOT NULL,
	`radiusKm` decimal(5,2) NOT NULL,
	`multiplier` decimal(4,2) NOT NULL,
	`reason` varchar(255),
	`activeFrom` timestamp NOT NULL,
	`activeUntil` timestamp NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `surge_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertKey` varchar(100) NOT NULL,
	`metric` varchar(100) NOT NULL,
	`currentValue` decimal(15,4),
	`threshold` decimal(15,4),
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
	`message` text NOT NULL,
	`status` enum('active','dismissed') NOT NULL DEFAULT 'active',
	`dismissedBy` int,
	`dismissedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` varchar(100) NOT NULL,
	`userId` int NOT NULL,
	`type` enum('credit','debit','refund','payout') NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`description` text,
	`relatedRideId` int,
	`relatedPaymentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_transactionId_unique` UNIQUE(`transactionId`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`safetyMode` enum('none','women_drivers_only','women_companions_only','women_only') NOT NULL DEFAULT 'none',
	`preferredRideMode` enum('solo','share') DEFAULT 'share',
	`maxWaitTimeMinutes` int DEFAULT 15,
	`notifyOnDriverAssigned` boolean NOT NULL DEFAULT true,
	`notifyOnDriverArrived` boolean NOT NULL DEFAULT true,
	`notifyOnRideStart` boolean NOT NULL DEFAULT true,
	`notifyOnRideComplete` boolean NOT NULL DEFAULT true,
	`pushToken` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phoneNumber` varchar(20),
	`profilePhoto` text,
	`isDriver` boolean NOT NULL DEFAULT false,
	`driverLicense` varchar(50),
	`vehicleType` varchar(50),
	`vehicleColor` varchar(50),
	`licensePlate` varchar(20),
	`gender` enum('male','female','non_binary','prefer_not_to_say'),
	`averageRating` decimal(3,2) DEFAULT '5.00',
	`totalRides` int DEFAULT 0,
	`totalEarnings` decimal(10,2) DEFAULT '0.00',
	`stripeConnectId` varchar(255),
	`isStudent` boolean NOT NULL DEFAULT false,
	`collegeEmail` varchar(255),
	`studentFreeRidesUsed` int NOT NULL DEFAULT 0,
	`studentFreeRidesEarned` int NOT NULL DEFAULT 0,
	`isStudentVerified` boolean NOT NULL DEFAULT false,
	`studentVerifiedAt` timestamp,
	`studentUniversityName` varchar(255),
	`studentUniversityDomain` varchar(100),
	`emergencyContacts` json,
	`isBanned` boolean NOT NULL DEFAULT false,
	`bannedAt` timestamp,
	`banReason` text,
	`bannedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	`passwordHash` varchar(255),
	`socialAuthProvider` varchar(20),
	`socialAuthId` varchar(255),
	`profilePhotoUrl` varchar(500),
	`sessionVersion` int NOT NULL DEFAULT 1,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`balance` decimal(10,2) DEFAULT '0.00',
	`totalSpent` decimal(10,2) DEFAULT '0.00',
	`totalEarned` decimal(10,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallets_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`webhookId` int NOT NULL,
	`event` varchar(100) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('pending','delivered','failed') NOT NULL DEFAULT 'pending',
	`responseCode` int,
	`responseBody` text,
	`attempts` int NOT NULL DEFAULT 0,
	`nextRetryAt` timestamp,
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
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
CREATE TABLE `webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` varchar(1000) NOT NULL,
	`events` json NOT NULL,
	`secret` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ab_tests_status_idx` ON `ab_tests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `af_user_idx` ON `abuse_flags` (`userId`);--> statement-breakpoint
CREATE INDEX `af_status_idx` ON `abuse_flags` (`status`);--> statement-breakpoint
CREATE INDEX `account_deletion_user_idx` ON `account_deletion_requests` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `audit_admin_idx` ON `admin_audit_logs` (`adminId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `admin_audit_logs` (`entity`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `admin_audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `join_requests_ride_idx` ON `carpool_join_requests` (`rideId`,`status`);--> statement-breakpoint
CREATE INDEX `join_requests_passenger_idx` ON `carpool_join_requests` (`passengerId`,`status`);--> statement-breakpoint
CREATE INDEX `chat_messages_ride_idx` ON `chat_messages` (`rideId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `conn_acct_user_idx` ON `connected_accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `cg_user_idx` ON `credit_grants` (`userId`);--> statement-breakpoint
CREATE INDEX `cg_status_idx` ON `credit_grants` (`status`);--> statement-breakpoint
CREATE INDEX `cg_expires_idx` ON `credit_grants` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `cl_user_idx` ON `credit_ledger` (`userId`);--> statement-breakpoint
CREATE INDEX `cl_type_idx` ON `credit_ledger` (`entryType`);--> statement-breakpoint
CREATE INDEX `cr_user_idx` ON `credit_redemptions` (`userId`);--> statement-breakpoint
CREATE INDEX `cr_ride_idx` ON `credit_redemptions` (`rideId`);--> statement-breakpoint
CREATE INDEX `cr_grant_idx` ON `credit_redemptions` (`grantId`);--> statement-breakpoint
CREATE INDEX `cr_status_idx` ON `credit_redemptions` (`status`);--> statement-breakpoint
CREATE INDEX `cw_user_idx` ON `credit_wallets` (`userId`);--> statement-breakpoint
CREATE INDEX `data_export_user_idx` ON `data_export_requests` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `da_user_idx` ON `driver_applications` (`userId`);--> statement-breakpoint
CREATE INDEX `da_status_idx` ON `driver_applications` (`status`);--> statement-breakpoint
CREATE INDEX `driver_avail_driver_idx` ON `driver_availability_slots` (`driverId`,`slotType`);--> statement-breakpoint
CREATE INDEX `driver_sessions_status_idx` ON `driver_sessions` (`status`,`currentLat`,`currentLng`);--> statement-breakpoint
CREATE INDEX `emergency_alerts_user_idx` ON `emergency_alerts` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `faq_category_idx` ON `faq_items` (`category`);--> statement-breakpoint
CREATE INDEX `faq_active_idx` ON `faq_items` (`isActive`);--> statement-breakpoint
CREATE INDEX `fu_user_idx` ON `file_uploads` (`userId`);--> statement-breakpoint
CREATE INDEX `fu_purpose_idx` ON `file_uploads` (`purpose`);--> statement-breakpoint
CREATE INDEX `fraud_status_idx` ON `fraud_flags` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `fraud_user_idx` ON `fraud_flags` (`userId`);--> statement-breakpoint
CREATE INDEX `fraud_type_idx` ON `fraud_flags` (`flagType`,`score`);--> statement-breakpoint
CREATE INDEX `incident_status_idx` ON `incidents` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `legal_acceptances_user_idx` ON `legal_acceptances` (`userId`);--> statement-breakpoint
CREATE INDEX `legal_acceptances_version_idx` ON `legal_acceptances` (`legalVersion`);--> statement-breakpoint
CREATE INDEX `legal_acceptances_user_version_idx` ON `legal_acceptances` (`userId`,`legalVersion`);--> statement-breakpoint
CREATE INDEX `lcm_session_idx` ON `live_chat_messages` (`sessionId`);--> statement-breakpoint
CREATE INDEX `lcm_created_idx` ON `live_chat_messages` (`createdAt`);--> statement-breakpoint
CREATE INDEX `lcs_user_idx` ON `live_chat_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `lcs_admin_idx` ON `live_chat_sessions` (`adminId`);--> statement-breakpoint
CREATE INDEX `lcs_status_idx` ON `live_chat_sessions` (`chat_status`);--> statement-breakpoint
CREATE INDEX `lcs_created_idx` ON `live_chat_sessions` (`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`userId`,`isRead`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_role_idx` ON `notifications` (`userId`,`recipientRole`,`isRead`);--> statement-breakpoint
CREATE INDEX `passenger_req_passenger_idx` ON `passenger_requests` (`passengerId`,`status`);--> statement-breakpoint
CREATE INDEX `passenger_req_status_idx` ON `passenger_requests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `payments_ride_idx` ON `payments` (`rideId`);--> statement-breakpoint
CREATE INDEX `payments_passenger_idx` ON `payments` (`passengerId`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE INDEX `points_ledger_user_idx` ON `points_ledger` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pricing_rules_active_idx` ON `pricing_rules` (`isActive`,`priority`);--> statement-breakpoint
CREATE INDEX `push_tokens_user_idx` ON `push_tokens` (`userId`);--> statement-breakpoint
CREATE INDEX `push_tokens_token_idx` ON `push_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `ratings_rated_user_idx` ON `ratings` (`ratedUserId`,`ratingType`);--> statement-breakpoint
CREATE INDEX `ratings_ride_idx` ON `ratings` (`rideId`);--> statement-breakpoint
CREATE INDEX `recurring_rides_creator_idx` ON `recurring_rides` (`creatorId`,`isActive`);--> statement-breakpoint
CREATE INDEX `ride_passengers_ride_idx` ON `ride_passengers` (`rideId`,`status`);--> statement-breakpoint
CREATE INDEX `ride_passengers_passenger_idx` ON `ride_passengers` (`passengerId`);--> statement-breakpoint
CREATE INDEX `ride_requests_driver_idx` ON `ride_requests` (`driverId`,`status`);--> statement-breakpoint
CREATE INDEX `ride_requests_ride_idx` ON `ride_requests` (`rideId`,`status`);--> statement-breakpoint
CREATE INDEX `ride_stops_ride_seq_idx` ON `ride_stops` (`rideId`,`sequence`);--> statement-breakpoint
CREATE INDEX `ride_stops_ride_status_idx` ON `ride_stops` (`rideId`,`status`);--> statement-breakpoint
CREATE INDEX `pickup_location_idx` ON `rides` (`pickupLat`,`pickupLng`);--> statement-breakpoint
CREATE INDEX `dropoff_location_idx` ON `rides` (`dropoffLat`,`dropoffLng`);--> statement-breakpoint
CREATE INDEX `status_mode_idx` ON `rides` (`status`,`mode`);--> statement-breakpoint
CREATE INDEX `driver_status_idx` ON `rides` (`driverId`,`status`);--> statement-breakpoint
CREATE INDEX `rides_created_at_idx` ON `rides` (`createdAt`);--> statement-breakpoint
CREATE INDEX `rides_status_departure_idx` ON `rides` (`status`,`departureTime`);--> statement-breakpoint
CREATE INDEX `rides_status_mode_seats_idx` ON `rides` (`status`,`mode`,`availableSeats`);--> statement-breakpoint
CREATE INDEX `rides_driver_status_mode_idx` ON `rides` (`driverId`,`status`,`mode`);--> statement-breakpoint
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
CREATE INDEX `sv_user_status_idx` ON `student_verifications` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `sv_email_status_idx` ON `student_verifications` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `sv_expires_idx` ON `student_verifications` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `sm_ticket_idx` ON `support_messages` (`ticketId`);--> statement-breakpoint
CREATE INDEX `st_user_idx` ON `support_tickets` (`userId`);--> statement-breakpoint
CREATE INDEX `st_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
CREATE INDEX `st_category_idx` ON `support_tickets` (`category`);--> statement-breakpoint
CREATE INDEX `st_priority_idx` ON `support_tickets` (`priority`);--> statement-breakpoint
CREATE INDEX `sys_alerts_status_idx` ON `system_alerts` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `sys_alerts_severity_idx` ON `system_alerts` (`severity`,`status`);--> statement-breakpoint
CREATE INDEX `transactions_user_idx` ON `transactions` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `wh_delivery_webhook_idx` ON `webhook_deliveries` (`webhookId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `wh_delivery_status_idx` ON `webhook_deliveries` (`status`,`nextRetryAt`);--> statement-breakpoint
CREATE INDEX `wh_event_id_idx` ON `webhook_events` (`stripeEventId`);--> statement-breakpoint
CREATE INDEX `wh_event_type_idx` ON `webhook_events` (`eventType`);--> statement-breakpoint
CREATE INDEX `wh_status_idx` ON `webhook_events` (`status`);