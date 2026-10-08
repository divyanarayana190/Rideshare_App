/**
 * Seed script: Populates the rideshare database with realistic data.
 * 15 users (mix of male/female/non_binary), 5 drivers, 20 rides, 15 payments,
 * 12 transactions, 10 promo codes, 8 referrals, 5 emergency alerts,
 * 10 surge zones, 20 notifications, 15 ratings, 10 chat messages.
 *
 * Usage: npx tsx scripts/seed-admin-data.ts
 */
import mysql from "mysql2/promise";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL || "mysql://root:root123@localhost:3307/rideshare";

async function seed() {
  const pool = await mysql.createPool(DATABASE_URL);
  const conn = await pool.getConnection();

  console.log("🌱 Seeding database with realistic data...\n");

  try {
    // ═══════════════════════════════════════════════════════════════════
    // 1. USERS (15 users with diverse genders)
    // ═══════════════════════════════════════════════════════════════════
    console.log("👤 Creating users...");

    const usersData = [
      { name: "Priya Sharma", email: "priya.sharma@gmail.com", gender: "female", isDriver: false },
      { name: "Marcus Johnson", email: "marcus.j@gmail.com", gender: "male", isDriver: true, vehicleType: "Sedan", vehicleColor: "Black", plate: "NJ-KL7234", license: "DL98234" },
      { name: "Aisha Patel", email: "aisha.patel@yahoo.com", gender: "female", isDriver: true, vehicleType: "SUV", vehicleColor: "White", plate: "NY-AB1234", license: "DL45612" },
      { name: "David Kim", email: "david.kim@outlook.com", gender: "male", isDriver: false },
      { name: "Taylor Morgan", email: "taylor.m@gmail.com", gender: "non_binary", isDriver: false },
      { name: "Sofia Rodriguez", email: "sofia.rod@gmail.com", gender: "female", isDriver: true, vehicleType: "Hatchback", vehicleColor: "Red", plate: "NJ-MN5678", license: "DL78901" },
      { name: "James Chen", email: "james.chen@hotmail.com", gender: "male", isDriver: true, vehicleType: "Electric", vehicleColor: "Silver", plate: "NY-EV4321", license: "DL34567" },
      { name: "Fatima Ali", email: "fatima.ali@gmail.com", gender: "female", isDriver: false },
      { name: "Ryan O'Brien", email: "ryan.obrien@gmail.com", gender: "male", isDriver: false },
      { name: "Alex Rivera", email: "alex.riv@proton.me", gender: "non_binary", isDriver: true, vehicleType: "Minivan", vehicleColor: "Blue", plate: "PA-QR9876", license: "DL23456" },
      { name: "Meera Gupta", email: "meera.gupta@gmail.com", gender: "female", isDriver: false },
      { name: "Chris Williams", email: "chris.will@gmail.com", gender: "male", isDriver: false },
      { name: "Nina Kowalski", email: "nina.k@yahoo.com", gender: "female", isDriver: false },
      { name: "Sam Jackson", email: "sam.jackson@gmail.com", gender: "prefer_not_to_say", isDriver: false },
      { name: "Lakshmi Nair", email: "lakshmi.n@gmail.com", gender: "female", isDriver: false },
    ];

    const userIds: number[] = [];

    for (const u of usersData) {
      const openId = `seed_${crypto.randomBytes(8).toString("hex")}`;
      // Check if user already exists
      const [existing] = await conn.query("SELECT id FROM users WHERE email = ?", [u.email]) as any[];
      if (existing.length > 0) {
        userIds.push(existing[0].id);
        console.log(`  ↳ User ${u.name} already exists (id=${existing[0].id})`);
        continue;
      }

      const [result] = await conn.query(
        "INSERT INTO users (openId, name, email, role, loginMethod, createdAt) VALUES (?, ?, ?, 'user', 'phone', ?)",
        [openId, u.name, u.email, randomDateInRange(60)]
      ) as any[];
      const userId = result.insertId;
      userIds.push(userId);

      // Create profile
      await conn.query(
        `INSERT INTO user_profiles (userId, phoneNumber, gender, isDriver, vehicleType, vehicleColor, licensePlate, driverLicense, averageRating, totalRides, totalEarnings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
          u.gender,
          u.isDriver || false,
          u.vehicleType || null,
          u.vehicleColor || null,
          u.plate || null,
          u.license || null,
          (3.5 + Math.random() * 1.5).toFixed(2),
          Math.floor(Math.random() * 50),
          u.isDriver ? (Math.random() * 5000).toFixed(2) : "0.00",
        ]
      );

      // Create wallet
      await conn.query(
        "INSERT INTO wallets (userId, balance, totalSpent, totalEarned) VALUES (?, ?, ?, ?)",
        [userId, (Math.random() * 200).toFixed(2), (Math.random() * 1000).toFixed(2), u.isDriver ? (Math.random() * 3000).toFixed(2) : "0.00"]
      );

      console.log(`  ✓ ${u.name} (${u.gender}, ${u.isDriver ? "driver" : "passenger"})`);
    }

    // Get driver user IDs
    const driverIds = usersData.filter((u) => u.isDriver).map((_, i) => {
      const driverIndices = usersData.reduce((acc: number[], u, idx) => { if (u.isDriver) acc.push(idx); return acc; }, []);
      return userIds[driverIndices[i]];
    }).filter(Boolean);

    const passengerIds = usersData.filter((u) => !u.isDriver).map((_, i) => {
      const passengerIndices = usersData.reduce((acc: number[], u, idx) => { if (!u.isDriver) acc.push(idx); return acc; }, []);
      return userIds[passengerIndices[i]];
    }).filter(Boolean);

    // ═══════════════════════════════════════════════════════════════════
    // 2. DRIVER SESSIONS (for each driver)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n🚗 Setting up driver sessions...");
    const nycLocations = [
      { lat: 40.7580, lng: -73.9855 },  // Times Square
      { lat: 40.7484, lng: -73.9857 },  // Empire State
      { lat: 40.7282, lng: -73.7949 },  // Jamaica, Queens
      { lat: 40.6892, lng: -74.0445 },  // Statue of Liberty area
      { lat: 40.7614, lng: -73.9776 },  // Rockefeller Center
    ];

    for (let i = 0; i < driverIds.length; i++) {
      const loc = nycLocations[i % nycLocations.length];
      const status = i < 3 ? "online" : "offline";
      try {
        await conn.query(
          "INSERT INTO driver_sessions (driverId, status, currentLat, currentLng, todayRides, todayEarnings) VALUES (?, ?, ?, ?, ?, ?)",
          [driverIds[i], status, loc.lat.toFixed(8), loc.lng.toFixed(8), Math.floor(Math.random() * 10), (Math.random() * 200).toFixed(2)]
        );
        console.log(`  ✓ Driver #${driverIds[i]} — ${status}`);
      } catch { console.log(`  ↳ Driver session for #${driverIds[i]} already exists`); }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. RIDES (20 rides with realistic routes)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n🛣️  Creating rides...");
    const routes = [
      { pickAddr: "Penn Station, Manhattan, NY", pickLat: "40.75050000", pickLng: "-73.99340000", dropAddr: "JFK Airport, Queens, NY", dropLat: "40.64130000", dropLng: "-73.77810000", dist: "28.5", mins: 45 },
      { pickAddr: "Grand Central Terminal, NY", pickLat: "40.75270000", pickLng: "-73.97720000", dropAddr: "Brooklyn Bridge, Brooklyn, NY", dropLat: "40.70610000", dropLng: "-73.99690000", dist: "8.2", mins: 20 },
      { pickAddr: "Times Square, Manhattan, NY", pickLat: "40.75800000", pickLng: "-73.98550000", dropAddr: "LaGuardia Airport, Queens, NY", dropLat: "40.77250000", dropLng: "-73.87260000", dist: "14.3", mins: 25 },
      { pickAddr: "Columbus Circle, Manhattan, NY", pickLat: "40.76810000", pickLng: "-73.98190000", dropAddr: "Wall Street, Manhattan, NY", dropLat: "40.70670000", dropLng: "-74.00860000", dist: "10.1", mins: 22 },
      { pickAddr: "Union Square, Manhattan, NY", pickLat: "40.73530000", pickLng: "-73.99070000", dropAddr: "Williamsburg, Brooklyn, NY", dropLat: "40.71420000", dropLng: "-73.96130000", dist: "6.8", mins: 18 },
      { pickAddr: "Central Park West, NY", pickLat: "40.78140000", pickLng: "-73.97200000", dropAddr: "SoHo, Manhattan, NY", dropLat: "40.72330000", dropLng: "-74.00000000", dist: "9.4", mins: 20 },
      { pickAddr: "Harlem, Manhattan, NY", pickLat: "40.81150000", pickLng: "-73.94600000", dropAddr: "Midtown East, Manhattan, NY", dropLat: "40.75340000", dropLng: "-73.97130000", dist: "7.6", mins: 16 },
      { pickAddr: "Astoria, Queens, NY", pickLat: "40.77270000", pickLng: "-73.93020000", dropAddr: "Downtown Brooklyn, NY", dropLat: "40.68930000", dropLng: "-73.98130000", dist: "12.0", mins: 28 },
      { pickAddr: "NJIT, Newark, NJ", pickLat: "40.74190000", pickLng: "-74.17860000", dropAddr: "Journal Square, Jersey City, NJ", dropLat: "40.73280000", dropLng: "-74.06300000", dist: "10.8", mins: 22 },
      { pickAddr: "Hoboken Terminal, NJ", pickLat: "40.73540000", pickLng: "-74.02920000", dropAddr: "World Trade Center, NY", dropLat: "40.71270000", dropLng: "-74.01340000", dist: "3.2", mins: 12 },
    ];

    const rideStatuses: Array<"completed" | "cancelled" | "searching" | "in_progress" | "matched"> = ["completed", "completed", "completed", "completed", "completed", "completed", "completed", "completed", "cancelled", "cancelled", "cancelled", "completed", "completed", "completed", "searching", "in_progress", "completed", "completed", "cancelled", "matched"];
    const rideIds: number[] = [];

    for (let i = 0; i < 20; i++) {
      const route = routes[i % routes.length];
      const status = rideStatuses[i];
      const driverId = driverIds[i % driverIds.length];
      const fare = (8 + Math.random() * 45).toFixed(2);
      const rideId = `ride_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const createdAt = randomDateInRange(30);
      const surge = (1 + Math.random() * 0.8).toFixed(2);

      const [result] = await conn.query(
        `INSERT INTO rides (rideId, driverId, mode, status, rideStep, pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, distanceKm, estimatedMinutes, totalFare, surgeMultiplier, createdAt, completedAt, cancelledAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rideId, driverId, i % 3 === 0 ? "share" : "solo", status,
          status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : status === "searching" ? "finding_driver" : "ride_in_progress",
          route.pickLat, route.pickLng, route.pickAddr, route.dropLat, route.dropLng, route.dropAddr,
          route.dist, route.mins, fare, surge, createdAt,
          status === "completed" ? new Date(new Date(createdAt).getTime() + route.mins * 60000) : null,
          status === "cancelled" ? new Date(new Date(createdAt).getTime() + 300000) : null,
        ]
      ) as any[];
      rideIds.push(result.insertId);
      console.log(`  ✓ Ride #${i + 1}: ${route.pickAddr.split(",")[0]} → ${route.dropAddr.split(",")[0]} ($${fare}, ${status})`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. RIDE PASSENGERS
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n🧑‍🤝‍🧑 Adding ride passengers...");
    for (let i = 0; i < 20; i++) {
      const route = routes[i % routes.length];
      const passengerId = passengerIds[i % passengerIds.length];
      try {
        await conn.query(
          `INSERT INTO ride_passengers (rideId, passengerId, seatsOccupied, isOriginalPassenger, pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, distanceKm, fareShare, status)
           VALUES (?, ?, 1, true, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rideIds[i], passengerId, route.pickLat, route.pickLng, route.pickAddr, route.dropLat, route.dropLng, route.dropAddr, route.dist, (8 + Math.random() * 30).toFixed(2), rideStatuses[i] === "completed" ? "dropped_off" : "joined"]
        );
      } catch {}
    }
    console.log(`  ✓ Added 20 passengers to rides`);

    // ═══════════════════════════════════════════════════════════════════
    // 5. PAYMENTS (15 payments for completed rides)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n💳 Creating payments...");
    const paymentMethods: Array<"card" | "wallet" | "apple_pay" | "google_pay"> = ["card", "wallet", "apple_pay", "google_pay"];
    const paymentStatuses: Array<"completed" | "pending" | "refunded"> = ["completed", "completed", "completed", "completed", "completed", "completed", "completed", "completed", "completed", "completed", "pending", "pending", "completed", "refunded", "completed"];

    for (let i = 0; i < 15; i++) {
      const payId = `pay_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const passengerId = passengerIds[i % passengerIds.length];
      const amount = (10 + Math.random() * 40).toFixed(2);
      const method = paymentMethods[i % paymentMethods.length];
      const status = paymentStatuses[i];
      const createdAt = randomDateInRange(25);

      await conn.query(
        `INSERT INTO payments (paymentId, rideId, passengerId, amount, currency, status, paymentMethod, createdAt, completedAt, refundedAt)
         VALUES (?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?)`,
        [payId, rideIds[i % rideIds.length], passengerId, amount, status, method, createdAt,
         status === "completed" || status === "refunded" ? new Date(new Date(createdAt).getTime() + 60000) : null,
         status === "refunded" ? new Date(new Date(createdAt).getTime() + 86400000) : null]
      );
      console.log(`  ✓ Payment $${amount} (${method}, ${status})`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6. TRANSACTIONS (12 wallet transactions)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n📒 Creating transactions...");
    const txTypes: Array<"credit" | "debit" | "refund" | "payout"> = ["credit", "debit", "refund", "payout"];
    const txDescs = ["Ride payment", "Wallet top-up", "Ride refund", "Driver payout", "Promo credit", "Referral bonus", "Cancellation fee", "Tip added", "Weekly payout", "Bonus credit", "Fare deduction", "Cash back"];

    for (let i = 0; i < 12; i++) {
      const txId = `tx_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const userId = userIds[i % userIds.length];
      const type = txTypes[i % txTypes.length];
      const amount = (5 + Math.random() * 50).toFixed(2);

      await conn.query(
        "INSERT INTO transactions (transactionId, userId, type, amount, description, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
        [txId, userId, type, amount, txDescs[i], randomDateInRange(20)]
      );
    }
    console.log(`  ✓ Created 12 transactions`);

    // ═══════════════════════════════════════════════════════════════════
    // 7. PROMO CODES (10 promos)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n🎟️  Creating promo codes...");
    const promos = [
      { code: "WELCOME50", desc: "50% off first ride", type: "percentage", value: "50", maxUses: 1000, used: 342 },
      { code: "SUMMER30", desc: "Summer 30% discount", type: "percentage", value: "30", maxUses: 500, used: 189 },
      { code: "FLAT5", desc: "$5 off any ride", type: "fixed", value: "5.00", maxUses: 2000, used: 876 },
      { code: "SHARE20", desc: "20% off shared rides", type: "percentage", value: "20", maxUses: 800, used: 234 },
      { code: "NEWUSER", desc: "New user $10 credit", type: "fixed", value: "10.00", maxUses: null, used: 1205 },
      { code: "WEEKEND15", desc: "15% off weekend rides", type: "percentage", value: "15", maxUses: 600, used: 98 },
      { code: "VIP25", desc: "VIP member 25% discount", type: "percentage", value: "25", maxUses: 100, used: 45 },
      { code: "HOLIDAY10", desc: "Holiday special $10 off", type: "fixed", value: "10.00", maxUses: 1500, used: 678 },
      { code: "DRIVER5", desc: "Driver referral $5 bonus", type: "fixed", value: "5.00", maxUses: 300, used: 112 },
      { code: "EARLYBIRD", desc: "Early morning 20% off", type: "percentage", value: "20", maxUses: 400, used: 67 },
    ];

    for (const p of promos) {
      try {
        const validFrom = new Date();
        validFrom.setDate(validFrom.getDate() - 30);
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 60);

        await conn.query(
          `INSERT INTO promo_codes (code, description, discountType, discountValue, maxUses, currentUses, minRideAmount, validFrom, validUntil, isActive)
           VALUES (?, ?, ?, ?, ?, ?, '5.00', ?, ?, true)`,
          [p.code, p.desc, p.type, p.value, p.maxUses, p.used, validFrom, validUntil]
        );
        console.log(`  ✓ ${p.code} — ${p.desc}`);
      } catch { console.log(`  ↳ ${p.code} already exists`); }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 8. REFERRALS (8 referrals)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n🤝 Creating referrals...");
    for (let i = 0; i < 8; i++) {
      const code = `REF${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const referrerId = userIds[i % userIds.length];
      const referredId = userIds[(i + 5) % userIds.length];
      const status = i < 5 ? "completed" : "pending";

      try {
        await conn.query(
          "INSERT INTO referrals (referralCode, referrerId, referredUserId, creditAmount, status, createdAt, completedAt) VALUES (?, ?, ?, '15.00', ?, ?, ?)",
          [code, referrerId, referredId, status, randomDateInRange(40), status === "completed" ? randomDateInRange(20) : null]
        );
      } catch {}
    }
    console.log(`  ✓ Created 8 referrals`);

    // ═══════════════════════════════════════════════════════════════════
    // 9. EMERGENCY ALERTS (5 alerts)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n🚨 Creating emergency alerts...");
    const alertTypes: Array<"sos" | "unsafe_driver" | "unsafe_passenger"> = ["sos", "unsafe_driver", "unsafe_passenger"];
    const alertStatuses: Array<"active" | "responded" | "resolved"> = ["active", "active", "responded", "resolved", "resolved"];

    for (let i = 0; i < 5; i++) {
      const alertId = `alert_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const userId = passengerIds[i % passengerIds.length];
      const loc = nycLocations[i % nycLocations.length];

      await conn.query(
        `INSERT INTO emergency_alerts (alertId, userId, rideId, latitude, longitude, alertType, status, createdAt, resolvedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [alertId, userId, rideIds[i], loc.lat.toFixed(8), loc.lng.toFixed(8), alertTypes[i % alertTypes.length], alertStatuses[i], randomDateInRange(10), alertStatuses[i] === "resolved" ? randomDateInRange(5) : null]
      );
      console.log(`  ✓ Alert: ${alertTypes[i % alertTypes.length]} (${alertStatuses[i]})`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 10. SURGE ZONES (10 zones)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n⚡ Creating surge zones...");
    const surgeAreas = [
      { name: "Times Square", lat: 40.7580, lng: -73.9855, radius: 1.5, mult: 1.8, reason: "Tourist hotspot" },
      { name: "JFK Airport", lat: 40.6413, lng: -73.7781, radius: 3.0, mult: 2.0, reason: "Airport demand" },
      { name: "LaGuardia Airport", lat: 40.7725, lng: -73.8726, radius: 2.5, mult: 1.7, reason: "Airport demand" },
      { name: "Wall Street", lat: 40.7067, lng: -74.0086, radius: 1.0, mult: 1.5, reason: "Business district rush" },
      { name: "Brooklyn Downtown", lat: 40.6893, lng: -73.9813, radius: 1.2, mult: 1.4, reason: "Evening surge" },
      { name: "Midtown East", lat: 40.7534, lng: -73.9713, radius: 1.8, mult: 1.6, reason: "Office hours" },
      { name: "Harlem", lat: 40.8115, lng: -73.9460, radius: 2.0, mult: 1.3, reason: "Event crowd" },
      { name: "SoHo", lat: 40.7233, lng: -74.0000, radius: 0.8, mult: 1.5, reason: "Nightlife surge" },
      { name: "Newark Penn Station", lat: 40.7340, lng: -74.1642, radius: 2.0, mult: 1.4, reason: "Commuter rush" },
      { name: "Hoboken Terminal", lat: 40.7354, lng: -74.0292, radius: 1.0, mult: 1.3, reason: "Ferry commuters" },
    ];

    for (const z of surgeAreas) {
      const from = new Date();
      const until = new Date();
      until.setDate(until.getDate() + 7);
      try {
        await conn.query(
          `INSERT INTO surge_zones (name, centerLat, centerLng, radiusKm, multiplier, reason, activeFrom, activeUntil, isActive)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [z.name, z.lat.toFixed(8), z.lng.toFixed(8), z.radius.toFixed(2), z.mult.toFixed(2), z.reason, from, until, Math.random() > 0.3]
        );
        console.log(`  ✓ ${z.name} — ${z.mult}x surge`);
      } catch { console.log(`  ↳ ${z.name} already exists`); }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 11. NOTIFICATIONS (20 notifications)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n🔔 Creating notifications...");
    const notifTypes: Array<"ride_request" | "driver_assigned" | "ride_completed" | "payment_received" | "promo_code" | "system" | "safety_alert"> =
      ["ride_request", "driver_assigned", "ride_completed", "payment_received", "promo_code", "system", "safety_alert"];
    const notifTitles = [
      "New ride request nearby", "Driver assigned to your ride", "Ride completed successfully",
      "Payment received", "New promo: SUMMER30!", "System maintenance tonight",
      "Safety tip: Share your trip", "Your ride is arriving", "Weekly summary ready",
      "Earn rewards with shared rides", "Rate your recent ride", "Your driver is 2 min away",
      "Payment of $25.00 processed", "Referral bonus credited!", "New surge pricing in your area",
      "Profile verification needed", "5-star rating received!", "Weekend special: 20% off",
      "Driver feedback requested", "Your ride history updated",
    ];

    for (let i = 0; i < 20; i++) {
      const notifId = `notif_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const userId = userIds[i % userIds.length];
      const type = notifTypes[i % notifTypes.length];

      await conn.query(
        "INSERT INTO notifications (notificationId, userId, type, title, body, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [notifId, userId, type, notifTitles[i], `Details for: ${notifTitles[i]}`, Math.random() > 0.4, randomDateInRange(15)]
      );
    }
    console.log(`  ✓ Created 20 notifications`);

    // ═══════════════════════════════════════════════════════════════════
    // 12. RATINGS (15 ratings)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n⭐ Creating ratings...");
    const comments = [
      "Great driver, very smooth ride!", "Clean car, arrived on time", "Took a longer route than expected",
      "Very friendly and professional", "Excellent experience!", "Good ride, fair price",
      "Driver was a bit late", "Perfect ride, would recommend", "Nice conversation, safe driving",
      "Car was clean and comfortable", "Arrived quickly, thanks!", "Professional and courteous",
      "Best ride experience ever", "On time and efficient", "Very pleasant journey",
    ];

    for (let i = 0; i < 15; i++) {
      const ratingId = `rating_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const raterId = passengerIds[i % passengerIds.length];
      const ratedUserId = driverIds[i % driverIds.length];
      const score = 3 + Math.floor(Math.random() * 3); // 3-5

      try {
        await conn.query(
          "INSERT INTO ratings (ratingId, rideId, raterId, ratedUserId, ratingType, score, comment, reportedUnsafeBehavior, createdAt) VALUES (?, ?, ?, ?, 'driver', ?, ?, ?, ?)",
          [ratingId, rideIds[i % rideIds.length], raterId, ratedUserId, score, comments[i], i === 2, randomDateInRange(20)]
        );
      } catch {}
    }
    console.log(`  ✓ Created 15 ratings`);

    // ═══════════════════════════════════════════════════════════════════
    // 13. CHAT MESSAGES (10 messages)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n💬 Creating chat messages...");
    const chatMsgs = [
      "I'm at the blue building entrance", "On my way, 2 minutes!", "Can you pick me up at the corner?",
      "I'll be wearing a red jacket", "Stuck in traffic, be there in 5", "Thanks for the ride!",
      "Running a bit late, sorry", "I see you, coming now!", "Can we make a quick stop?",
      "Perfect, see you there!",
    ];

    for (let i = 0; i < 10; i++) {
      const msgId = `msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const isDriverMsg = i % 2 === 0;
      const senderId = isDriverMsg ? driverIds[i % driverIds.length] : passengerIds[i % passengerIds.length];
      const recipientId = isDriverMsg ? passengerIds[i % passengerIds.length] : driverIds[i % driverIds.length];

      await conn.query(
        "INSERT INTO chat_messages (messageId, rideId, senderId, recipientId, message, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [msgId, rideIds[i % rideIds.length], senderId, recipientId, chatMsgs[i], true, randomDateInRange(10)]
      );
    }
    console.log(`  ✓ Created 10 chat messages`);

    // ═══════════════════════════════════════════════════════════════════
    // 14. REWARD POINTS (for each user)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n🏆 Creating reward points...");
    for (const userId of userIds) {
      const points = Math.floor(Math.random() * 500);
      try {
        await conn.query(
          "INSERT INTO reward_points (userId, points, totalEarned, totalRedeemed) VALUES (?, ?, ?, ?)",
          [userId, points, points + Math.floor(Math.random() * 200), Math.floor(Math.random() * 100)]
        );
      } catch {}
    }
    console.log(`  ✓ Created reward points for ${userIds.length} users`);

    // ═══════════════════════════════════════════════════════════════════
    // 15. PAYMENT METHODS (10 saved cards)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n💳 Creating payment methods...");
    const cardTypes: Array<"visa" | "mastercard" | "amex" | "discover"> = ["visa", "mastercard", "amex", "discover"];

    for (let i = 0; i < 10; i++) {
      const userId = userIds[i % userIds.length];
      const last4 = String(1000 + Math.floor(Math.random() * 9000));
      const cardType = cardTypes[i % cardTypes.length];

      try {
        await conn.query(
          "INSERT INTO payment_methods (userId, cardType, last4, holderName, expiryMonth, expiryYear, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [userId, cardType, last4, usersData[i % usersData.length].name, 1 + Math.floor(Math.random() * 12), 2026 + Math.floor(Math.random() * 4), i < 5]
        );
      } catch {}
    }
    console.log(`  ✓ Created 10 payment methods`);

    // ═══════════════════════════════════════════════════════════════════
    // 16. USER PREFERENCES
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n⚙️  Creating user preferences...");
    const safetyModes: Array<"none" | "women_drivers_only" | "women_companions_only" | "women_only"> = ["none", "women_drivers_only", "women_companions_only", "women_only"];

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const gender = usersData[i]?.gender;
      // Women get women-only safety modes more often
      const safetyMode = gender === "female" && Math.random() > 0.5 ? safetyModes[1 + Math.floor(Math.random() * 3)] : "none";

      try {
        await conn.query(
          "INSERT INTO user_preferences (userId, safetyMode, preferredRideMode) VALUES (?, ?, ?)",
          [userId, safetyMode, Math.random() > 0.5 ? "share" : "solo"]
        );
      } catch {}
    }
    console.log(`  ✓ Created preferences for ${userIds.length} users`);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ Database seeded successfully!");
    console.log(`   • ${usersData.length} users (${usersData.filter(u => u.gender === 'male').length}M / ${usersData.filter(u => u.gender === 'female').length}F / ${usersData.filter(u => u.gender === 'non_binary').length}NB / ${usersData.filter(u => u.gender === 'prefer_not_to_say').length}O)`);
    console.log(`   • ${driverIds.length} drivers`);
    console.log(`   • 20 rides, 15 payments, 12 transactions`);
    console.log(`   • 10 promo codes, 8 referrals`);
    console.log(`   • 5 emergency alerts, 10 surge zones`);
    console.log(`   • 20 notifications, 15 ratings, 10 chat messages`);
    console.log("═══════════════════════════════════════════════════════════\n");

  } catch (err) {
    console.error("❌ Seed error:", err);
  } finally {
    conn.release();
    await pool.end();
    process.exit(0);
  }
}

function randomDateInRange(daysAgo: number): Date {
  const now = Date.now();
  const past = now - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
}

seed();
