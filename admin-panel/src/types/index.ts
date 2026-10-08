// ─── User & Auth ────────────────────────────────────────────────────────────

export type AdminRole = 'super_admin' | 'admin' | 'ops' | 'support';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  avatar?: string;
  lastLogin?: string;
}

export interface AuthState {
  user: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;
}

// ─── Platform Users ─────────────────────────────────────────────────────────

export interface PlatformUser {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: 'user' | 'admin';
  createdAt: string;
  lastSignedIn: string;
  profile?: UserProfile;
}

export interface UserProfile {
  id: number;
  userId: number;
  phoneNumber: string | null;
  profilePhoto: string | null;
  isDriver: boolean;
  driverLicense: string | null;
  vehicleType: string | null;
  vehicleColor: string | null;
  licensePlate: string | null;
  gender: string | null;
  averageRating: string;
  totalRides: number;
  totalEarnings: string;
}

// ─── Rides ──────────────────────────────────────────────────────────────────

export type RideStatus = 'searching' | 'matched' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled';
export type RideStep = 'finding_driver' | 'driver_assigned' | 'driver_en_route' | 'driver_arrived' | 'ride_started' | 'ride_in_progress' | 'completed' | 'cancelled';

export interface Ride {
  id: number;
  rideId: string;
  driverId: number;
  mode: 'solo' | 'share';
  status: RideStatus;
  rideStep: RideStep;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: string;
  pickupLng: string;
  dropoffLat: string;
  dropoffLng: string;
  distanceKm: string;
  estimatedMinutes: number;
  totalFare: string;
  surgeMultiplier: string;
  fareBreakdown: Record<string, number> | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  driverName?: string;
  passengerNames?: string[];
}

// ─── Payments ───────────────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Payment {
  id: number;
  paymentId: string;
  rideId: number;
  passengerId: number;
  amount: string;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string;
  createdAt: string;
  completedAt: string | null;
  passengerName?: string;
}

export interface Transaction {
  id: number;
  transactionId: string;
  userId: number;
  type: 'credit' | 'debit' | 'refund' | 'payout';
  amount: string;
  description: string | null;
  createdAt: string;
  userName?: string;
}

// ─── Safety ─────────────────────────────────────────────────────────────────

export type AlertStatus = 'active' | 'responded' | 'resolved';

export interface EmergencyAlert {
  id: number;
  alertId: string;
  userId: number;
  rideId: number | null;
  latitude: string;
  longitude: string;
  alertType: 'sos' | 'unsafe_driver' | 'unsafe_passenger';
  status: AlertStatus;
  createdAt: string;
  resolvedAt: string | null;
  userName?: string;
  rideInfo?: string;
}

// ─── Promos ─────────────────────────────────────────────────────────────────

export interface PromoCode {
  id: number;
  code: string;
  description: string | null;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  maxUses: number | null;
  currentUses: number;
  minRideAmount: string;
  maxDiscount: string | null;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  createdAt: string;
}

// ─── Surge Zones ────────────────────────────────────────────────────────────

export interface SurgeZone {
  id: number;
  name: string;
  centerLat: string;
  centerLng: string;
  radiusKm: string;
  multiplier: string;
  reason: string | null;
  activeFrom: string;
  activeUntil: string;
  isActive: boolean;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export interface Notification {
  id: number;
  notificationId: string;
  userId: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

// ─── Analytics / Dashboard ──────────────────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  totalDrivers: number;
  totalRides: number;
  activeRides: number;
  onlineDrivers: number;
  totalRevenue: number;
  todayRides: number;
  todayRevenue: number;
  pendingAlerts: number;
  avgRating: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  rides: number;
}

export interface RidesByStatus {
  status: string;
  count: number;
}

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export interface AuditLog {
  id: number;
  adminId: number;
  adminName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

// ─── Ratings ────────────────────────────────────────────────────────────────

export interface Rating {
  id: number;
  ratingId: string;
  rideId: number;
  raterId: number;
  ratedUserId: number;
  ratingType: 'passenger' | 'driver';
  score: number;
  comment: string | null;
  reportedUnsafeBehavior: boolean;
  createdAt: string;
  raterName?: string;
  ratedName?: string;
}
