import React, { createContext, useContext, useReducer } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchLevel = 'High Match' | 'Medium Match' | 'Low Match';
export type DemandLevel = 'High' | 'Medium' | 'Low';
export type RideStatus = 'upcoming' | 'scheduled' | 'active' | 'completed' | 'cancelled' | 'missed';

export interface DriverRequest {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerAvatar?: string;
  passengerRating: number;
  passengerRideCount: number;
  passengerCompletionRate: number;
  isVerified: boolean;
  pickup: { address: string; city?: string; lat: number; lng: number };
  dropoff: { address: string; city?: string; lat: number; lng: number };
  distanceKm: number;
  durationMin: number;
  fare: number;
  seats: number;
  bags: number;
  matchScore: number;
  matchLevel: MatchLevel;
  routeMatchPct: number;
  extraTimeMin: number;
  extraDistanceKm: number;
  demandLevel: DemandLevel;
  note?: string;
  createdAt: string;
  expiresAt: string;
  category?: 'nearby' | 'high_match' | 'multi_seat' | 'surge' | 'airport' | 'scheduled';
  distanceToPickupKm?: number;
}

export interface AcceptedRide {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerAvatar?: string;
  passengerRating: number;
  distanceAwayKm: number;
  isVerified: boolean;
  pickup: string;
  dropoff: string;
  scheduledAt: string;
  distanceKm: number;
  durationMin: number;
  seats: number;
  fare: number;
  paymentMethod: string;
  status: RideStatus;
}

export interface DriverStats {
  todayEarnings: number;
  todayRides: number;
  onlineHours: number;
  rating: number;
  acceptanceRate: number;
  cancellationRate: number;
  completionRate: number;
}

// ─── State / Actions ──────────────────────────────────────────────────────────

interface DriverState {
  isOnline: boolean;
  stats: DriverStats;
  requests: DriverRequest[];
  acceptedRides: AcceptedRide[];
  completedRides: AcceptedRide[];
  selectedRequest: DriverRequest | null;
  weeklyEarnings: { day: string; amount: number }[];
}

type DriverAction =
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_STATS'; payload: Partial<DriverStats> }
  | { type: 'SET_REQUESTS'; payload: DriverRequest[] }
  | { type: 'ADD_REQUEST'; payload: DriverRequest }
  | { type: 'REMOVE_REQUEST'; payload: string }
  | { type: 'SET_ACCEPTED_RIDES'; payload: AcceptedRide[] }
  | { type: 'SELECT_REQUEST'; payload: DriverRequest | null }
  | { type: 'SET_WEEKLY_EARNINGS'; payload: { day: string; amount: number }[] };

function driverReducer(state: DriverState, action: DriverAction): DriverState {
  switch (action.type) {
    case 'SET_ONLINE':       return { ...state, isOnline: action.payload };
    case 'SET_STATS':        return { ...state, stats: { ...state.stats, ...action.payload } };
    case 'SET_REQUESTS':     return { ...state, requests: action.payload };
    case 'ADD_REQUEST':
      return { ...state, requests: [action.payload, ...state.requests.filter((r) => r.id !== action.payload.id)] };
    case 'REMOVE_REQUEST':   return { ...state, requests: state.requests.filter((r) => r.id !== action.payload) };
    case 'SET_ACCEPTED_RIDES': return { ...state, acceptedRides: action.payload };
    case 'SELECT_REQUEST':   return { ...state, selectedRequest: action.payload };
    case 'SET_WEEKLY_EARNINGS': return { ...state, weeklyEarnings: action.payload };
    default:                 return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface DriverContextValue {
  state: DriverState;
  dispatch: React.Dispatch<DriverAction>;
}

const DriverContext = createContext<DriverContextValue | null>(null);

const initialState: DriverState = {
  isOnline: false,
  stats: {
    todayEarnings: 0,
    todayRides: 0,
    onlineHours: 0,
    rating: 0,
    acceptanceRate: 0,
    cancellationRate: 0,
    completionRate: 0,
  },
  requests: [],
  acceptedRides: [],
  completedRides: [],
  selectedRequest: null,
  weeklyEarnings: [],
};

export function DriverProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(driverReducer, initialState);
  return React.createElement(DriverContext.Provider, { value: { state, dispatch } }, children);
}

export function useDriver() {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error('useDriver must be used within DriverProvider');
  return ctx;
}
