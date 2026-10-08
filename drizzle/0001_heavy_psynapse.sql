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
CREATE TABLE `ride_passengers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int NOT NULL,
	`passengerId` int NOT NULL,
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
CREATE TABLE `rides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` varchar(50) NOT NULL,
	`driverId` int NOT NULL,
	`mode` enum('solo','share') NOT NULL,
	`status` enum('searching','matched','driver_arrived','in_progress','completed','cancelled') NOT NULL DEFAULT 'searching',
	`pickupLat` decimal(10,8) NOT NULL,
	`pickupLng` decimal(11,8) NOT NULL,
	`pickupAddress` text NOT NULL,
	`dropoffLat` decimal(10,8) NOT NULL,
	`dropoffLng` decimal(11,8) NOT NULL,
	`dropoffAddress` text NOT NULL,
	`distanceKm` decimal(8,2) NOT NULL,
	`estimatedMinutes` int NOT NULL,
	`totalFare` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`cancelledAt` timestamp,
	CONSTRAINT `rides_id` PRIMARY KEY(`id`),
	CONSTRAINT `rides_rideId_unique` UNIQUE(`rideId`)
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
	`averageRating` decimal(3,2) DEFAULT '5.00',
	`totalRides` int DEFAULT 0,
	`totalEarnings` decimal(10,2) DEFAULT '0.00',
	`stripeConnectId` varchar(255),
	`emergencyContacts` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_userId_unique` UNIQUE(`userId`)
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
