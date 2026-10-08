-- Mid-Ride Join & Reward Points Migration
-- Phase 1: New tables + altered columns

-- ─── New Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `ride_stops` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `rideId` int NOT NULL,
  `stopType` enum('pickup','dropoff') NOT NULL,
  `passengerId` int NOT NULL,
  `lat` decimal(10,8) NOT NULL,
  `lng` decimal(11,8) NOT NULL,
  `address` text NOT NULL,
  `sequence` int NOT NULL,
  `status` enum('pending','approaching','reached','skipped') NOT NULL DEFAULT 'pending',
  `estimatedArrivalAt` timestamp NULL,
  `actualArrivalAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `ride_stops_ride_seq_idx` (`rideId`, `sequence`),
  INDEX `ride_stops_ride_status_idx` (`rideId`, `status`)
);

CREATE TABLE IF NOT EXISTS `reward_points` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `points` int NOT NULL DEFAULT 0,
  `totalEarned` int NOT NULL DEFAULT 0,
  `totalRedeemed` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `reward_points_userId_unique` (`userId`)
);

CREATE TABLE IF NOT EXISTS `points_ledger` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `amount` int NOT NULL,
  `reason` enum('mid_ride_join','shared_ride_bonus','original_passenger_bonus','driver_bonus','first_shared_ride','referral_bonus','redeemed') NOT NULL,
  `relatedRideId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `points_ledger_user_idx` (`userId`, `createdAt`)
);

-- ─── Altered Tables ──────────────────────────────────────────────────────────

-- Add routePolyline to rides (encoded OSRM polyline for route matching)
ALTER TABLE `rides` ADD COLUMN `routePolyline` text NULL;

-- Add mid-ride join columns to carpool_join_requests
ALTER TABLE `carpool_join_requests` ADD COLUMN `detourKm` decimal(8,2) NULL;
ALTER TABLE `carpool_join_requests` ADD COLUMN `detourMinutes` int NULL;
ALTER TABLE `carpool_join_requests` ADD COLUMN `compatibilityScore` int NULL;
ALTER TABLE `carpool_join_requests` ADD COLUMN `isMidRideJoin` boolean NOT NULL DEFAULT false;
ALTER TABLE `carpool_join_requests` ADD COLUMN `driverApproval` enum('pending','approved','rejected') NULL;
