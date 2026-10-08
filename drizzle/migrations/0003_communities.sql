CREATE TABLE `communities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(50) NOT NULL,
  `slug` varchar(64) NOT NULL,
  `description` varchar(300) NOT NULL,
  `category` enum('university','company','city','apartment','event','travel','private_group','custom') NOT NULL,
  `visibility` enum('public','private','invite_only') NOT NULL DEFAULT 'public',
  `logoUrl` varchar(500),
  `bannerUrl` varchar(500),
  `verificationType` enum('none','edu_email','company_email','invite_code','manual_approval') NOT NULL DEFAULT 'none',
  `verificationDomain` varchar(100),
  `inviteCode` varchar(32),
  `createdBy` int NOT NULL,
  `memberCount` int NOT NULL DEFAULT 1,
  `rideCount` int NOT NULL DEFAULT 0,
  `status` enum('active','archived','suspended') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `communities_id` PRIMARY KEY(`id`),
  CONSTRAINT `communities_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `communities_category_idx` ON `communities` (`category`);
--> statement-breakpoint
CREATE INDEX `communities_visibility_idx` ON `communities` (`visibility`);
--> statement-breakpoint
CREATE INDEX `communities_created_by_idx` ON `communities` (`createdBy`);
--> statement-breakpoint
CREATE INDEX `communities_status_idx` ON `communities` (`status`);
--> statement-breakpoint
CREATE TABLE `community_members` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communityId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('owner','admin','moderator','member') NOT NULL DEFAULT 'member',
  `status` enum('active','pending','rejected','banned','left') NOT NULL DEFAULT 'active',
  `joinedAt` timestamp,
  `requestedAt` timestamp NOT NULL DEFAULT (now()),
  `approvedAt` timestamp,
  `approvedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `community_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cm_community_user_unique` ON `community_members` (`communityId`,`userId`);
--> statement-breakpoint
CREATE INDEX `cm_user_status_idx` ON `community_members` (`userId`,`status`);
--> statement-breakpoint
CREATE INDEX `cm_community_status_idx` ON `community_members` (`communityId`,`status`);
--> statement-breakpoint
CREATE INDEX `cm_community_role_idx` ON `community_members` (`communityId`,`role`);
--> statement-breakpoint
CREATE TABLE `community_rules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communityId` int NOT NULL,
  `text` varchar(500) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `community_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cr_community_idx` ON `community_rules` (`communityId`,`sortOrder`);
--> statement-breakpoint
CREATE TABLE `community_rides` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communityId` int NOT NULL,
  `rideId` int NOT NULL,
  `postedBy` int NOT NULL,
  `visibility` enum('community_only') NOT NULL DEFAULT 'community_only',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `community_rides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `crides_community_ride_unique` ON `community_rides` (`communityId`,`rideId`);
--> statement-breakpoint
CREATE INDEX `crides_ride_idx` ON `community_rides` (`rideId`);
--> statement-breakpoint
CREATE INDEX `crides_community_idx` ON `community_rides` (`communityId`);
--> statement-breakpoint
CREATE TABLE `community_invites` (
  `id` int AUTO_INCREMENT NOT NULL,
  `communityId` int NOT NULL,
  `inviteCode` varchar(32) NOT NULL,
  `createdBy` int NOT NULL,
  `expiresAt` timestamp,
  `maxUses` int,
  `usedCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `community_invites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `cinv_community_idx` ON `community_invites` (`communityId`);
--> statement-breakpoint
CREATE INDEX `cinv_code_idx` ON `community_invites` (`inviteCode`);
--> statement-breakpoint
ALTER TABLE `file_uploads` MODIFY `purpose` enum('profile_photo','license_front','license_back','insurance_doc','vehicle_photo','vehicle_registration','community_logo','community_banner','misc') NOT NULL;
