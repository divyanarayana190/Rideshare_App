/**
 * Database Seeder — Populates the rideshare DB with realistic data.
 * Run: node seed-database.mjs
 */
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const pool = mysql.createPool('mysql://root:root123@127.0.0.1:3307/rideshare');

function uid() { return crypto.randomBytes(8).toString('hex'); }
function rideUid() { return `ride_${Date.now()}_${uid().slice(0,5)}`; }
function payUid() { return `PAY-${Math.floor(10000 + Math.random() * 90000)}`; }
function txnUid() { return `TXN-${Math.floor(10000 + Math.random() * 90000)}`; }
function notifUid() { return `NOTIF-${uid()}`; }
function alertUid() { return `ALT-${Math.floor(100 + Math.random() * 900)}`; }
function ratingUid() { return `RAT-${uid()}`; }
function refCode(name) { return `${name.split(' ')[0].toUpperCase().slice(0,3)}-REF-${Math.floor(1000 + Math.random() * 9000)}`; }

// Realistic NJ/NYC locations
const LOCATIONS = [
  { lat: 40.7357, lng: -74.1724, addr: '150 Bleecker St, Newark, NJ 07103' },
  { lat: 40.7484, lng: -74.1857, addr: 'NJIT Campus, 323 Dr MLK Jr Blvd, Newark, NJ 07102' },
  { lat: 40.7128, lng: -74.0060, addr: 'Wall Street, New York, NY 10005' },
  { lat: 40.7580, lng: -73.9855, addr: 'Times Square, Manhattan, NY 10036' },
  { lat: 40.6413, lng: -73.7781, addr: 'JFK Airport, Queens, NY 11430' },
  { lat: 40.7527, lng: -73.9772, addr: 'Grand Central Terminal, New York, NY 10017' },
  { lat: 40.7489, lng: -74.0346, addr: 'Hoboken Terminal, Hoboken, NJ 07030' },
  { lat: 40.6892, lng: -74.0445, addr: 'Statue of Liberty, New York, NY 10004' },
  { lat: 40.7614, lng: -73.9776, addr: 'Rockefeller Center, New York, NY 10111' },
  { lat: 40.7282, lng: -73.7949, addr: 'Jamaica Station, Queens, NY 11435' },
  { lat: 40.7351, lng: -74.0247, addr: 'Exchange Place, Jersey City, NJ 07302' },
  { lat: 40.7831, lng: -73.9712, addr: 'Central Park West, New York, NY 10024' },
  { lat: 40.8296, lng: -73.9262, addr: 'Yankee Stadium, Bronx, NY 10451' },
  { lat: 40.6501, lng: -73.9496, addr: 'Flatbush Ave, Brooklyn, NY 11225' },
  { lat: 40.7484, lng: -73.9857, addr: 'Empire State Building, New York, NY 10118' },
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickTwo() { const a = Math.floor(Math.random() * LOCATIONS.length); let b; do { b = Math.floor(Math.random() * LOCATIONS.length); } while (b === a); return [LOCATIONS[a], LOCATIONS[b]]; }

async function seed() {
  const conn = await pool.getConnection();
  try {
    console.log('🌱 Seeding database...\n');

    // ─── 1. USERS (15 users with diverse genders) ─────────────────────────
    const USERS = [
      // Existing admin (id=12)
      { name: 'Raj Tharun',       email: 'rajtharun@rideshare.com',    phone: '9735838613',   gender: 'male',             role: 'admin',  isDriver: false },
      // Drivers (male/female/non-binary)
      { name: 'Marcus Williams',  email: 'marcus.w@email.com',         phone: '2015551001',   gender: 'male',             role: 'user',   isDriver: true,  vehicleType: 'Toyota Camry',    vehicleColor: 'Silver',  plate: 'NJ-MRK-2024', license: 'NJ-DL-98234' },
      { name: 'Sarah Chen',      email: 'sarah.chen@email.com',       phone: '2015551002',   gender: 'female',           role: 'user',   isDriver: true,  vehicleType: 'Honda Civic',     vehicleColor: 'White',   plate: 'NJ-SCH-2024', license: 'NJ-DL-45672' },
      { name: 'David Kim',       email: 'david.kim@email.com',        phone: '2015551003',   gender: 'male',             role: 'user',   isDriver: true,  vehicleType: 'Tesla Model 3',   vehicleColor: 'Black',   plate: 'NJ-DVK-2024', license: 'NJ-DL-78901' },
      { name: 'Priya Patel',     email: 'priya.patel@email.com',      phone: '2015551004',   gender: 'female',           role: 'user',   isDriver: true,  vehicleType: 'Hyundai Elantra', vehicleColor: 'Blue',    plate: 'NJ-PPT-2024', license: 'NJ-DL-34567' },
      { name: 'Jordan Rivera',   email: 'jordan.r@email.com',         phone: '2015551005',   gender: 'non_binary',       role: 'user',   isDriver: true,  vehicleType: 'Ford Escape',     vehicleColor: 'Red',     plate: 'NJ-JRV-2024', license: 'NJ-DL-12345' },
      // Passengers
      { name: 'Emily Park',      email: 'emily.park@email.com',       phone: '2015551006',   gender: 'female',           role: 'user',   isDriver: false },
      { name: 'James Wilson',    email: 'james.wilson@email.com',     phone: '2015551007',   gender: 'male',             role: 'user',   isDriver: false },
      { name: 'Ana Lopez',       email: 'ana.lopez@email.com',        phone: '2015551008',   gender: 'female',           role: 'user',   isDriver: false },
      { name: 'Tom Baker',       email: 'tom.baker@email.com',        phone: '2015551009',   gender: 'male',             role: 'user',   isDriver: false },
      { name: 'Nina Patel',      email: 'nina.patel@email.com',       phone: '2015551010',   gender: 'female',           role: 'user',   isDriver: false },
      { name: 'Alex Turner',     email: 'alex.turner@email.com',      phone: '2015551011',   gender: 'non_binary',       role: 'user',   isDriver: false },
      { name: 'Rachel Green',    email: 'rachel.green@email.com',     phone: '2015551012',   gender: 'female',           role: 'user',   isDriver: false },
      { name: 'Carlos Ruiz',     email: 'carlos.ruiz@email.com',      phone: '2015551013',   gender: 'male',             role: 'user',   isDriver: false },
      { name: 'Mei Lin',         email: 'mei.lin@email.com',          phone: '2015551014',   gender: 'prefer_not_to_say', role: 'user',  isDriver: false },
    ];

    const userIds = [];
    const driverIds = [];

    for (const u of USERS) {
      // Check if user exists by email
      const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [u.email]);
      let userId;
      if (existing.length > 0) {
        userId = existing[0].id;
        await conn.execute('UPDATE users SET name = ?, role = ? WHERE id = ?', [u.name, u.role, userId]);
      } else {
        const openId = `seed_${uid()}`;
        const [result] = await conn.execute(
          'INSERT INTO users (openId, name, email, loginMethod, role) VALUES (?, ?, ?, ?, ?)',
          [openId, u.name, u.email, 'phone', u.role]
        );
        userId = result.insertId;
      }
      userIds.push(userId);
      if (u.isDriver) driverIds.push(userId);

      // Upsert profile
      const [profExist] = await conn.execute('SELECT id FROM user_profiles WHERE userId = ?', [userId]);
      if (profExist.length > 0) {
        await conn.execute(
          'UPDATE user_profiles SET phoneNumber = ?, gender = ?, isDriver = ?, vehicleType = ?, vehicleColor = ?, licensePlate = ?, driverLicense = ? WHERE userId = ?',
          [u.phone, u.gender, u.isDriver ? 1 : 0, u.vehicleType || null, u.vehicleColor || null, u.plate || null, u.license || null, userId]
        );
      } else {
        await conn.execute(
          'INSERT INTO user_profiles (userId, phoneNumber, gender, isDriver, vehicleType, vehicleColor, licensePlate, driverLicense) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, u.phone, u.gender, u.isDriver ? 1 : 0, u.vehicleType || null, u.vehicleColor || null, u.plate || null, u.license || null]
        );
      }

      // Wallet
      const [walExist] = await conn.execute('SELECT id FROM wallets WHERE userId = ?', [userId]);
      if (walExist.length === 0) {
        const bal = (Math.random() * 200 + 10).toFixed(2);
        await conn.execute('INSERT INTO wallets (userId, balance, totalSpent, totalEarned) VALUES (?, ?, ?, ?)',
          [userId, bal, (Math.random() * 500).toFixed(2), (Math.random() * 300).toFixed(2)]);
      }

      // Reward points
      const [rpExist] = await conn.execute('SELECT id FROM reward_points WHERE userId = ?', [userId]);
      if (rpExist.length === 0) {
        const pts = Math.floor(Math.random() * 500);
        await conn.execute('INSERT INTO reward_points (userId, points, totalEarned, totalRedeemed) VALUES (?, ?, ?, ?)',
          [userId, pts, pts + Math.floor(Math.random() * 200), Math.floor(Math.random() * 100)]);
      }
    }
    console.log(`✅ ${USERS.length} users seeded (IDs: ${userIds.join(', ')})`);

    // ─── 2. DRIVER SESSIONS ──────────────────────────────────────────────
    const statuses = ['online', 'online', 'online', 'offline', 'on_ride'];
    for (const dId of driverIds) {
      const [dsExist] = await conn.execute('SELECT id FROM driver_sessions WHERE driverId = ?', [dId]);
      const loc = pick(LOCATIONS);
      const st = pick(statuses);
      if (dsExist.length > 0) {
        await conn.execute('UPDATE driver_sessions SET status = ?, currentLat = ?, currentLng = ? WHERE driverId = ?',
          [st, loc.lat, loc.lng, dId]);
      } else {
        await conn.execute(
          'INSERT INTO driver_sessions (driverId, status, currentLat, currentLng, todayRides, todayEarnings) VALUES (?, ?, ?, ?, ?, ?)',
          [dId, st, loc.lat, loc.lng, Math.floor(Math.random() * 15), (Math.random() * 200).toFixed(2)]
        );
      }
    }
    console.log(`✅ ${driverIds.length} driver sessions seeded`);

    // ─── 3. RIDES (20 rides) ─────────────────────────────────────────────
    const rideStatuses = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'cancelled', 'cancelled', 'in_progress', 'searching', 'matched'];
    const rideModes = ['solo', 'solo', 'share', 'share', 'solo'];
    const rideRows = [];

    for (let i = 0; i < 20; i++) {
      const [pickup, dropoff] = pickTwo();
      const rideId = rideUid();
      const driver = pick(driverIds);
      const status = pick(rideStatuses);
      const mode = pick(rideModes);
      const dist = (3 + Math.random() * 25).toFixed(2);
      const estMin = Math.floor(10 + Math.random() * 40);
      const fare = (5 + Math.random() * 45).toFixed(2);
      const surge = (1 + Math.random() * 0.8).toFixed(2);
      const daysAgo = Math.floor(Math.random() * 10);
      const createdAt = new Date(Date.now() - daysAgo * 86400000 - Math.random() * 86400000);

      const [result] = await conn.execute(
        `INSERT INTO rides (rideId, driverId, mode, status, pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, distanceKm, estimatedMinutes, totalFare, surgeMultiplier, createdAt, completedAt, cancelledAt, cancelReason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [rideId, driver, mode, status, pickup.lat, pickup.lng, pickup.addr, dropoff.lat, dropoff.lng, dropoff.addr, dist, estMin, fare, surge, createdAt,
          status === 'completed' ? new Date(createdAt.getTime() + estMin * 60000) : null,
          status === 'cancelled' ? new Date(createdAt.getTime() + 300000) : null,
          status === 'cancelled' ? pick(['Driver unavailable', 'Passenger cancelled', 'Changed plans', 'Found alternative']) : null
        ]
      );
      rideRows.push({ id: result.insertId, rideId, driver, status, mode, fare, createdAt, pickup, dropoff });
    }
    console.log(`✅ 20 rides seeded`);

    // ─── 4. RIDE PASSENGERS ──────────────────────────────────────────────
    let rpCount = 0;
    for (const ride of rideRows) {
      const passengerPool = userIds.filter(id => !driverIds.includes(id) || id !== ride.driver);
      const numPassengers = ride.mode === 'share' ? Math.min(2 + Math.floor(Math.random() * 2), passengerPool.length) : 1;
      const selected = [];
      for (let p = 0; p < numPassengers; p++) {
        let pId;
        do { pId = pick(passengerPool); } while (selected.includes(pId));
        selected.push(pId);
        const fareShare = (Number(ride.fare) / numPassengers).toFixed(2);
        const pStatus = ride.status === 'completed' ? 'dropped_off' : ride.status === 'cancelled' ? 'cancelled' : 'joined';
        await conn.execute(
          'INSERT INTO ride_passengers (rideId, passengerId, pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress, distanceKm, fareShare, status, isOriginalPassenger) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [ride.id, pId, ride.pickup.lat, ride.pickup.lng, ride.pickup.addr, ride.dropoff.lat, ride.dropoff.lng, ride.dropoff.addr, (3 + Math.random() * 20).toFixed(2), fareShare, pStatus, p === 0 ? 1 : 0]
        );
        rpCount++;
      }
    }
    console.log(`✅ ${rpCount} ride passengers seeded`);

    // ─── 5. PAYMENTS (for completed rides) ───────────────────────────────
    let payCount = 0;
    for (const ride of rideRows) {
      if (ride.status === 'completed' || ride.status === 'in_progress') {
        const passenger = userIds.filter(id => id !== ride.driver)[0];
        const method = pick(['card', 'wallet', 'apple_pay', 'google_pay']);
        const payStatus = ride.status === 'completed' ? 'completed' : 'pending';
        await conn.execute(
          'INSERT INTO payments (paymentId, rideId, passengerId, amount, currency, status, paymentMethod, createdAt, completedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [payUid(), ride.id, passenger, ride.fare, 'USD', payStatus, method, ride.createdAt,
            payStatus === 'completed' ? new Date(ride.createdAt.getTime() + 3600000) : null]
        );
        payCount++;
      }
    }
    console.log(`✅ ${payCount} payments seeded`);

    // ─── 6. TRANSACTIONS ─────────────────────────────────────────────────
    let txnCount = 0;
    for (const ride of rideRows.filter(r => r.status === 'completed')) {
      const passenger = userIds.filter(id => id !== ride.driver)[0];
      // Debit for passenger
      await conn.execute(
        'INSERT INTO transactions (transactionId, userId, type, amount, description, relatedRideId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [txnUid(), passenger, 'debit', ride.fare, `Ride payment ${ride.rideId}`, ride.id, ride.createdAt]
      );
      // Credit for driver
      const earnings = (Number(ride.fare) * 0.85).toFixed(2);
      await conn.execute(
        'INSERT INTO transactions (transactionId, userId, type, amount, description, relatedRideId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [txnUid(), ride.driver, 'credit', earnings, `Earnings from ${ride.rideId}`, ride.id, new Date(ride.createdAt.getTime() + 60000)]
      );
      txnCount += 2;
    }
    console.log(`✅ ${txnCount} transactions seeded`);

    // ─── 7. RATINGS (for completed rides) ────────────────────────────────
    let ratCount = 0;
    for (const ride of rideRows.filter(r => r.status === 'completed')) {
      const passenger = userIds.filter(id => id !== ride.driver)[0];
      const comments = ['Great ride, smooth driving!', 'Very polite driver', 'Clean car, arrived on time', 'Excellent service', 'Good experience overall', 'A bit slow but friendly', 'Perfect ride!', null];
      // Passenger rates driver
      await conn.execute(
        'INSERT INTO ratings (ratingId, rideId, raterId, ratedUserId, ratingType, score, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [ratingUid(), ride.id, passenger, ride.driver, 'driver', Math.floor(3 + Math.random() * 3), pick(comments), ride.createdAt]
      );
      // Driver rates passenger
      await conn.execute(
        'INSERT INTO ratings (ratingId, rideId, raterId, ratedUserId, ratingType, score, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [ratingUid(), ride.id, ride.driver, passenger, 'passenger', Math.floor(3 + Math.random() * 3), pick(['Polite passenger', 'On time pickup', 'Friendly', 'Good communication', null]), ride.createdAt]
      );
      ratCount += 2;
    }
    console.log(`✅ ${ratCount} ratings seeded`);

    // ─── 8. PROMO CODES (10) ────────────────────────────────────────────
    const PROMOS = [
      { code: 'WELCOME50',  desc: '50% off your first ride',           type: 'percentage', val: 50,   max: 1000, uses: 487, min: '10.00', maxD: '25.00', from: '2026-01-01', until: '2026-06-30' },
      { code: 'SPRING10',   desc: '$10 off any ride this spring',      type: 'fixed',      val: 10,   max: 500,  uses: 321, min: '20.00', maxD: null,    from: '2026-03-01', until: '2026-04-30' },
      { code: 'SHARE25',    desc: '25% off shared rides',              type: 'percentage', val: 25,   max: null, uses: 1247,min: '5.00',  maxD: '15.00', from: '2026-01-15', until: '2026-12-31' },
      { code: 'NJIT20',     desc: '20% off rides from NJIT campus',    type: 'percentage', val: 20,   max: 300,  uses: 89,  min: '8.00',  maxD: '12.00', from: '2026-02-01', until: '2026-08-31' },
      { code: 'NEWUSER',    desc: 'Free first ride up to $15',         type: 'fixed',      val: 15,   max: 2000, uses: 1105,min: '0.00',  maxD: null,    from: '2025-12-01', until: '2026-12-31' },
      { code: 'WEEKEND15',  desc: '15% off weekend rides',             type: 'percentage', val: 15,   max: 800,  uses: 234, min: '10.00', maxD: '20.00', from: '2026-03-01', until: '2026-06-30' },
      { code: 'AIRPORT5',   desc: '$5 off airport rides',              type: 'fixed',      val: 5,    max: 1500, uses: 678, min: '25.00', maxD: null,    from: '2026-01-01', until: '2026-09-30' },
      { code: 'LOYALTY30',  desc: '30% off for 10+ rides',             type: 'percentage', val: 30,   max: 200,  uses: 42,  min: '15.00', maxD: '30.00', from: '2026-03-15', until: '2026-05-31' },
      { code: 'EARTH25',    desc: '25% off on Earth Day',              type: 'percentage', val: 25,   max: 500,  uses: 0,   min: '5.00',  maxD: '15.00', from: '2026-04-22', until: '2026-04-22' },
      { code: 'SUMMER20',   desc: '20% off summer rides',              type: 'percentage', val: 20,   max: 1000, uses: 0,   min: '10.00', maxD: '20.00', from: '2026-06-01', until: '2026-08-31' },
    ];
    for (const p of PROMOS) {
      const [ex] = await conn.execute('SELECT id FROM promo_codes WHERE code = ?', [p.code]);
      if (ex.length === 0) {
        await conn.execute(
          'INSERT INTO promo_codes (code, description, discountType, discountValue, maxUses, currentUses, minRideAmount, maxDiscount, validFrom, validUntil, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.code, p.desc, p.type, p.val, p.max, p.uses, p.min, p.maxD, p.from, p.until, 1]
        );
      }
    }
    console.log(`✅ ${PROMOS.length} promo codes seeded`);

    // ─── 9. REFERRALS (10) ──────────────────────────────────────────────
    for (let i = 0; i < 10; i++) {
      const referrer = userIds[i % userIds.length];
      const referred = userIds[(i + 3) % userIds.length];
      const status = i < 7 ? 'completed' : 'pending';
      const [ex] = await conn.execute('SELECT id FROM referrals WHERE referrerId = ? AND referredUserId = ?', [referrer, referred]);
      if (ex.length === 0) {
        await conn.execute(
          'INSERT INTO referrals (referralCode, referrerId, referredUserId, creditAmount, status, createdAt, completedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [refCode(USERS[i % USERS.length].name), referrer, referred, '15.00', status,
            new Date(Date.now() - (10 - i) * 86400000),
            status === 'completed' ? new Date(Date.now() - (10 - i) * 86400000 + 3600000) : null]
        );
      }
    }
    console.log(`✅ 10 referrals seeded`);

    // ─── 10. SURGE ZONES (5) ────────────────────────────────────────────
    const ZONES = [
      { name: 'Downtown Newark',   lat: 40.7357, lng: -74.1724, r: 3.0, m: 1.8, reason: 'Peak hours - morning rush' },
      { name: 'JFK Airport',       lat: 40.6413, lng: -73.7781, r: 5.0, m: 1.5, reason: 'High demand - flight arrivals' },
      { name: 'Times Square',      lat: 40.7580, lng: -73.9855, r: 2.0, m: 2.2, reason: 'Event surge - theater district' },
      { name: 'Hoboken Terminal',   lat: 40.7489, lng: -74.0346, r: 1.5, m: 1.3, reason: 'Commuter rush hour' },
      { name: 'Yankee Stadium',    lat: 40.8296, lng: -73.9262, r: 2.0, m: 2.0, reason: 'Game day surge' },
    ];
    for (const z of ZONES) {
      const [ex] = await conn.execute('SELECT id FROM surge_zones WHERE name = ?', [z.name]);
      if (ex.length === 0) {
        await conn.execute(
          'INSERT INTO surge_zones (name, centerLat, centerLng, radiusKm, multiplier, reason, activeFrom, activeUntil, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [z.name, z.lat, z.lng, z.r, z.m, z.reason, new Date(), new Date(Date.now() + 86400000 * 30), 1]
        );
      }
    }
    console.log(`✅ ${ZONES.length} surge zones seeded`);

    // ─── 11. EMERGENCY ALERTS (10) ─────────────────────────────────────
    const alertTypes = ['sos', 'unsafe_driver', 'unsafe_passenger'];
    const alertStatuses = ['active', 'active', 'responded', 'resolved', 'resolved'];
    for (let i = 0; i < 10; i++) {
      const loc = pick(LOCATIONS);
      const user = pick(userIds);
      const ride = rideRows[i % rideRows.length];
      const aType = pick(alertTypes);
      const aStatus = pick(alertStatuses);
      const daysAgo = Math.floor(Math.random() * 7);
      await conn.execute(
        'INSERT INTO emergency_alerts (alertId, userId, rideId, latitude, longitude, alertType, status, createdAt, resolvedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [alertUid(), user, ride.id, loc.lat, loc.lng, aType, aStatus,
          new Date(Date.now() - daysAgo * 86400000),
          aStatus === 'resolved' ? new Date(Date.now() - daysAgo * 86400000 + 900000) : null]
      );
    }
    console.log(`✅ 10 emergency alerts seeded`);

    // ─── 12. NOTIFICATIONS (15) ─────────────────────────────────────────
    const notifTypes = ['ride_completed', 'payment_received', 'promo_code', 'system', 'safety_alert', 'driver_assigned', 'ride_cancelled'];
    const notifTitles = {
      ride_completed: 'Ride Completed',
      payment_received: 'Payment Received',
      promo_code: 'New Promo Available',
      system: 'System Update',
      safety_alert: 'Safety Alert',
      driver_assigned: 'Driver Assigned',
      ride_cancelled: 'Ride Cancelled',
    };
    const notifBodies = {
      ride_completed: 'Your ride has been completed. Rate your experience!',
      payment_received: 'Payment has been processed successfully.',
      promo_code: 'Use code SPRING10 for $10 off your next ride!',
      system: 'Scheduled maintenance tonight at 2:00 AM EST.',
      safety_alert: 'New safety features are now available.',
      driver_assigned: 'Your driver is on the way!',
      ride_cancelled: 'Your ride has been cancelled.',
    };
    for (let i = 0; i < 15; i++) {
      const user = pick(userIds);
      const nType = pick(notifTypes);
      await conn.execute(
        'INSERT INTO notifications (notificationId, userId, type, title, body, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [notifUid(), user, nType, notifTitles[nType], notifBodies[nType], Math.random() > 0.5 ? 1 : 0, new Date(Date.now() - Math.random() * 604800000)]
      );
    }
    console.log(`✅ 15 notifications seeded`);

    // ─── 13. CHAT MESSAGES (15) ──────────────────────────────────────────
    const chatMsgs = ['On my way!', 'I\'m at the pickup point', 'Running 2 minutes late', 'Which entrance?', 'I see you, coming now', 'Thanks for the ride!', 'I\'m wearing a red jacket', 'Please wait, coming down now', 'Can you meet me at the main gate?', 'Almost there!'];
    let chatCount = 0;
    for (const ride of rideRows.slice(0, 15)) {
      const passenger = userIds.filter(id => id !== ride.driver)[0];
      const isSenderDriver = Math.random() > 0.5;
      await conn.execute(
        'INSERT INTO chat_messages (messageId, rideId, senderId, recipientId, message, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`MSG-${uid()}`, ride.id, isSenderDriver ? ride.driver : passenger, isSenderDriver ? passenger : ride.driver, pick(chatMsgs), Math.random() > 0.3 ? 1 : 0, ride.createdAt]
      );
      chatCount++;
    }
    console.log(`✅ ${chatCount} chat messages seeded`);

    // ─── 14. UPDATE USER PROFILE STATS ───────────────────────────────────
    for (const dId of driverIds) {
      const [rideCount] = await conn.execute('SELECT COUNT(*) as cnt, COALESCE(SUM(totalFare), 0) as earn FROM rides WHERE driverId = ? AND status = "completed"', [dId]);
      const [avgRat] = await conn.execute('SELECT COALESCE(AVG(score), 5.00) as avg FROM ratings WHERE ratedUserId = ? AND ratingType = "driver"', [dId]);
      await conn.execute('UPDATE user_profiles SET totalRides = ?, totalEarnings = ?, averageRating = ? WHERE userId = ?',
        [rideCount[0].cnt, rideCount[0].earn, Number(avgRat[0].avg).toFixed(2), dId]);
    }
    console.log(`✅ Driver profile stats updated`);

    console.log('\n🎉 Database seeding complete!');
  } catch (err) {
    console.error('❌ Seeding error:', err.message);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();
