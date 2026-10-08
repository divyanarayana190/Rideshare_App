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
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`goOnlineAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driver_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `driver_sessions_driverId_unique` UNIQUE(`driverId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` varchar(100) NOT NULL,
	`userId` int NOT NULL,
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
ALTER TABLE `rides` ADD `rideStep` enum('finding_driver','driver_assigned','driver_en_route','driver_arrived','ride_started','ride_in_progress','completed','cancelled') DEFAULT 'finding_driver';--> statement-breakpoint
ALTER TABLE `rides` ADD `surgeMultiplier` decimal(4,2) DEFAULT '1.00';--> statement-breakpoint
ALTER TABLE `rides` ADD `fareBreakdown` json;--> statement-breakpoint
ALTER TABLE `rides` ADD `safetyMode` enum('none','women_drivers_only','women_companions_only','women_only') DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `rides` ADD `stripePaymentIntentId` varchar(255);--> statement-breakpoint
ALTER TABLE `rides` ADD `driverAssignedAt` timestamp;--> statement-breakpoint
ALTER TABLE `rides` ADD `driverArrivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `rides` ADD `cancelReason` varchar(255);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `gender` enum('male','female','non_binary','prefer_not_to_say');--> statement-breakpoint
CREATE INDEX `driver_sessions_status_idx` ON `driver_sessions` (`status`,`currentLat`,`currentLng`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`userId`,`isRead`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ride_requests_driver_idx` ON `ride_requests` (`driverId`,`status`);--> statement-breakpoint
CREATE INDEX `ride_requests_ride_idx` ON `ride_requests` (`rideId`,`status`);