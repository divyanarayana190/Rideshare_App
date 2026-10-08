-- Foreign Key Constraints Migration
-- Apply manually after verifying no orphaned rows exist.
-- Run each block individually and check for errors before proceeding.
-- Order matters: parent tables must be constrained before child tables.

-- 1. userProfiles.userId → users.id (CASCADE: deleting a user removes their profile)
ALTER TABLE user_profiles
  ADD CONSTRAINT fk_user_profiles_user
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. user_preferences.userId → users.id (CASCADE)
ALTER TABLE user_preferences
  ADD CONSTRAINT fk_user_preferences_user
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. driver_sessions.driverId → users.id (CASCADE)
ALTER TABLE driver_sessions
  ADD CONSTRAINT fk_driver_sessions_user
  FOREIGN KEY (driverId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. wallets.userId → users.id (RESTRICT: wallet with balance must not be orphaned)
ALTER TABLE wallets
  ADD CONSTRAINT fk_wallets_user
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. ride_passengers.rideId → rides.id (CASCADE: removing a ride removes all passenger rows)
ALTER TABLE ride_passengers
  ADD CONSTRAINT fk_ride_passengers_ride
  FOREIGN KEY (rideId) REFERENCES rides(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. ride_passengers.passengerId → users.id (RESTRICT: cannot delete user with active ride)
ALTER TABLE ride_passengers
  ADD CONSTRAINT fk_ride_passengers_user
  FOREIGN KEY (passengerId) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. ratings.rideId → rides.id (CASCADE)
ALTER TABLE ratings
  ADD CONSTRAINT fk_ratings_ride
  FOREIGN KEY (rideId) REFERENCES rides(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. transactions.userId → users.id (RESTRICT: financial records must not be orphaned)
ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_user
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- NOTE: rides.driverId intentionally omitted — it defaults to 0 (unassigned) which
-- has no corresponding users row. Migrate driverId to nullable (NULL = unassigned)
-- before adding this FK.
