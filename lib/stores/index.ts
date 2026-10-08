/**
 * YOO Driver Mode — Centralized Zustand Stores
 *
 * Five slices:
 *   useDriverStore       — session, online status, location
 *   useRequestStore      — incoming passenger requests
 *   useRideStore         — accepted rides + active ride state
 *   useToastStore        — in-app toast notifications
 *   useChatStore         — per-ride chat messages
 */
import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DriverStatus = 'online' | 'offline' | 'on_ride';
export type RideStep =
  | 'finding_driver' | 'driver_assigned' | 'driver_en_route'
  | 'driver_arrived' | 'ride_started' | 'ride_in_progress'
  | 'completed' | 'cancelled';

export interface DriverSession {
  status: DriverStatus;
  currentRideId: string | null;
  currentRideStep: RideStep | null;
  todayRides: number;
  todayEarnings: number;
  acceptanceRate: number;
  rating: number;
  onlineHours: number;
}

export interface PassengerRequest {
  requestId: string;
  passengerId?: number;
  passengerName?: string;
  passengerRating?: number;
  passengerRideCount?: number;
  passengerCompletionRate?: number;
  isVerified?: boolean;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  offerPrice: number;
  passengerCount: number;
  distanceKm: number | null;
  estimatedMinutes: number | null;
  distanceToPickupKm?: number;
  expiresAt?: string;
  createdAt: string;
  matchScore?: number;
  matchLevel?: 'High Match' | 'Medium Match' | 'Low Match';
  routeMatchPct?: number;
  extraTimeMin?: number;
  extraDistanceKm?: number;
  demandLevel?: 'High' | 'Medium' | 'Low';
  note?: string;
  bags?: number;
}

export interface AcceptedRide {
  rideId: string;
  passengerId?: number;
  passengerName: string;
  passengerRating?: number;
  isVerified?: boolean;
  pickupAddress: string;
  dropoffAddress: string;
  offerPrice: number;
  passengerCount: number;
  distanceKm: number | null;
  estimatedMinutes: number | null;
  createdAt: string;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  rideStep?: RideStep;
  scheduledAt?: string;
  paymentMethod?: string;
  distanceAwayKm?: number;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  icon?: string;
}

const TOAST_DURATION: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 0,      // no auto-dismiss — user must tap ×
  loading: 0,   // no auto-dismiss — dismissed programmatically
};

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  ts: number;
  isMe: boolean;
}

// ─── Driver Store ──────────────────────────────────────────────────────────────

interface DriverStore {
  session: DriverSession | null;
  isTogglingStatus: boolean;
  location: { lat: number; lng: number } | null;

  setSession: (s: DriverSession | null) => void;
  setIsTogglingStatus: (v: boolean) => void;
  setLocation: (loc: { lat: number; lng: number }) => void;
  patchSession: (patch: Partial<DriverSession>) => void;
}

export const useDriverStore = create<DriverStore>((set) => ({
  session: null,
  isTogglingStatus: false,
  location: null,

  setSession: (session) => set({ session }),
  setIsTogglingStatus: (isTogglingStatus) => set({ isTogglingStatus }),
  setLocation: (location) => set({ location }),
  patchSession: (patch) =>
    set((s) => ({ session: s.session ? { ...s.session, ...patch } : null })),
}));

// ─── Request Store ─────────────────────────────────────────────────────────────

interface RequestStore {
  requests: PassengerRequest[];
  isLoading: boolean;
  activeFilter: string;
  pendingDispatchRequest: {
    rideId: string;
    pickupAddress: string;
    dropoffAddress: string;
    totalFare: number;
    expiresIn: number;
    etaMinutes: number;
  } | null;
  acceptingId: string | null;
  decliningId: string | null;

  setRequests: (reqs: PassengerRequest[]) => void;
  setIsLoading: (v: boolean) => void;
  setFilter: (f: string) => void;
  setPendingDispatch: (r: RequestStore['pendingDispatchRequest']) => void;
  removeRequest: (requestId: string) => void;
  setAcceptingId: (id: string | null) => void;
  setDecliningId: (id: string | null) => void;
}

export const useRequestStore = create<RequestStore>((set) => ({
  requests: [],
  isLoading: false,
  activeFilter: 'all',
  pendingDispatchRequest: null,
  acceptingId: null,
  decliningId: null,

  setRequests: (requests) => set({ requests }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setFilter: (activeFilter) => set({ activeFilter }),
  setPendingDispatch: (pendingDispatchRequest) => set({ pendingDispatchRequest }),
  removeRequest: (requestId) =>
    set((s) => ({ requests: s.requests.filter((r) => r.requestId !== requestId) })),
  setAcceptingId: (acceptingId) => set({ acceptingId }),
  setDecliningId: (decliningId) => set({ decliningId }),
}));

// ─── Ride Store ────────────────────────────────────────────────────────────────

interface RideStore {
  acceptedRides: AcceptedRide[];
  activeRide: AcceptedRide | null;
  completedRides: AcceptedRide[];
  actionInProgress: string | null; // rideId being acted on

  setAcceptedRides: (rides: AcceptedRide[]) => void;
  setActiveRide: (ride: AcceptedRide | null) => void;
  setCompletedRides: (rides: AcceptedRide[]) => void;
  addAcceptedRide: (ride: AcceptedRide) => void;
  patchRide: (rideId: string, patch: Partial<AcceptedRide>) => void;
  removeAcceptedRide: (rideId: string) => void;
  setActionInProgress: (rideId: string | null) => void;
}

export const useRideStore = create<RideStore>((set) => ({
  acceptedRides: [],
  activeRide: null,
  completedRides: [],
  actionInProgress: null,

  setAcceptedRides: (acceptedRides) => set({ acceptedRides }),
  setActiveRide: (activeRide) => set({ activeRide }),
  setCompletedRides: (completedRides) => set({ completedRides }),
  addAcceptedRide: (ride) =>
    set((s) => ({
      acceptedRides: [ride, ...s.acceptedRides.filter((r) => r.rideId !== ride.rideId)],
    })),
  patchRide: (rideId, patch) =>
    set((s) => ({
      acceptedRides: s.acceptedRides.map((r) => (r.rideId === rideId ? { ...r, ...patch } : r)),
      activeRide: s.activeRide?.rideId === rideId ? { ...s.activeRide, ...patch } : s.activeRide,
    })),
  removeAcceptedRide: (rideId) =>
    set((s) => ({
      acceptedRides: s.acceptedRides.filter((r) => r.rideId !== rideId),
    })),
  setActionInProgress: (actionInProgress) => set({ actionInProgress }),
}));

// ─── Toast Store ───────────────────────────────────────────────────────────────

interface ToastStore {
  toasts: ToastItem[];
  show: (message: string, type?: ToastType, icon?: string) => void;
  showLoading: (message: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, type = 'success', icon) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, type: type ?? 'success', icon }] }));
    const delay = TOAST_DURATION[type ?? 'success'];
    if (delay > 0) setTimeout(() => get().dismiss(id), delay);
  },
  showLoading: (message) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, type: 'loading' }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// ─── Reset helper — call on sign-out to prevent cross-user data leakage ────────

export function resetAllStores(): void {
  useDriverStore.setState({ session: null, location: null, isTogglingStatus: false });
  useRequestStore.setState({ requests: [], pendingDispatchRequest: null, acceptingId: null, decliningId: null });
  useRideStore.setState({ acceptedRides: [], activeRide: null, completedRides: [], actionInProgress: null });
}

// ─── Chat Store ────────────────────────────────────────────────────────────────

interface ChatStore {
  messages: Record<string, ChatMessage[]>; // keyed by rideId
  addMessage: (rideId: string, msg: ChatMessage) => void;
  clearChat: (rideId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: {},
  addMessage: (rideId, msg) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [rideId]: [...(s.messages[rideId] ?? []), msg],
      },
    })),
  clearChat: (rideId) =>
    set((s) => ({ messages: { ...s.messages, [rideId]: [] } })),
}));
