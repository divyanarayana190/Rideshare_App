ALTER TABLE `user_profiles` ADD COLUMN `isStudent` boolean NOT NULL DEFAULT false;
ALTER TABLE `user_profiles` ADD COLUMN `collegeEmail` varchar(255);
ALTER TABLE `user_profiles` ADD COLUMN `studentFreeRidesUsed` int NOT NULL DEFAULT 0;
ALTER TABLE `user_profiles` ADD COLUMN `studentFreeRidesEarned` int NOT NULL DEFAULT 0;
