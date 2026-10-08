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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	CONSTRAINT `carpool_join_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `carpool_join_requests_joinRequestId_unique` UNIQUE(`joinRequestId`)
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
ALTER TABLE `rides` ADD `departureTime` timestamp;--> statement-breakpoint
ALTER TABLE `rides` ADD `pricePerSeat` decimal(8,2);--> statement-breakpoint
ALTER TABLE `rides` ADD `totalSeats` int DEFAULT 3;--> statement-breakpoint
ALTER TABLE `rides` ADD `approvalRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rides` ADD `carpoolTitle` varchar(200);--> statement-breakpoint
ALTER TABLE `rides` ADD `recurringRideId` int;--> statement-breakpoint
CREATE INDEX `join_requests_ride_idx` ON `carpool_join_requests` (`rideId`,`status`);--> statement-breakpoint
CREATE INDEX `join_requests_passenger_idx` ON `carpool_join_requests` (`passengerId`,`status`);