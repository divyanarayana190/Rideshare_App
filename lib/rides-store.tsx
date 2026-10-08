// RideShare App — Rides Store (React Context + AsyncStorage)

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useReducer } from "react";
import { useAuth } from "@/lib/auth-context-v2";

import type { AvailableSharedRide, Ride, RideLocation, RideMode, SafetyMode, SharedMatchStatus } from "./types";

const RIDES_KEY = "rideshare_my_rides";
const ACTIVE_RIDE_KEY = "rideshare_active_ride";

interface BookingDraft {
  pickup: RideLocation | null;
  dropoff: RideLocation | null;
  mode: RideMode;
  selectedAvailableRide: AvailableSharedRide | null;
  vehicleClass: "economy" | "standard" | "comfort" | "xl";
  sharedMatchStatus: SharedMatchStatus | null;
  safetyMode: SafetyMode;
  /** Pre-calculated total fare from ride-options (includes platform fee) */
  estimatedFare?: number;
  /** ISO timestamp when passenger scheduled the ride from ride-options */
  scheduledAt?: string | null;
  /** Selected ride option id: solo | share | priority | waitsave | premium */
  selectedOptionId?: string;
  /** Fare in cents locked at selection time — matches what user saw in ride-options */
  lockedFareCents?: number;
  /** Actual road distance from route calculation (km) */
  routeDistanceKm?: number;
  /** Estimated trip duration from route calculation (minutes) */
  routeDurationMinutes?: number;
  /** Google-encoded polyline string for map rendering (avoids re-fetching) */
  routePolyline?: string | null;
}

interface RidesState {
  myRides: Ride[];
  activeRide: Ride | null;
  bookingDraft: BookingDraft;
  isLoading: boolean;
  driverMode: boolean;
}

type RidesAction =
  | { type: "SET_RIDES"; payload: Ride[] }
  | { type: "SET_ACTIVE_RIDE"; payload: Ride | null }
  | { type: "ADD_RIDE"; payload: Ride }
  | { type: "UPDATE_RIDE"; payload: { id: string; updates: Partial<Ride> } }
  | { type: "SET_BOOKING_DRAFT"; payload: Partial<BookingDraft> }
  | { type: "CLEAR_BOOKING_DRAFT" }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "TOGGLE_DRIVER_MODE" };

const initialState: RidesState = {
  myRides: [],
  activeRide: null,
  bookingDraft: {
    pickup: null,
    dropoff: null,
    mode: "share",
    selectedAvailableRide: null,
    vehicleClass: "standard",
    sharedMatchStatus: null,
    safetyMode: "standard",
  },
  isLoading: true,
  driverMode: false,
};

function ridesReducer(state: RidesState, action: RidesAction): RidesState {
  switch (action.type) {
    case "SET_RIDES":
      return { ...state, myRides: action.payload, isLoading: false };
    case "SET_ACTIVE_RIDE":
      return { ...state, activeRide: action.payload };
    case "ADD_RIDE":
      return { ...state, myRides: [action.payload, ...state.myRides] };
    case "UPDATE_RIDE":
      return {
        ...state,
        myRides: state.myRides.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.updates } : r
        ),
        activeRide:
          state.activeRide?.id === action.payload.id
            ? { ...state.activeRide, ...action.payload.updates }
            : state.activeRide,
      };
    case "SET_BOOKING_DRAFT":
      return {
        ...state,
        bookingDraft: { ...state.bookingDraft, ...action.payload },
      };
    case "CLEAR_BOOKING_DRAFT":
      return {
        ...state,
        bookingDraft: { pickup: null, dropoff: null, mode: "share", selectedAvailableRide: null, vehicleClass: "standard", sharedMatchStatus: null, safetyMode: "standard" },
      };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "TOGGLE_DRIVER_MODE":
      return { ...state, driverMode: !state.driverMode };
    default:
      return state;
  }
}

interface RidesContextValue {
  state: RidesState;
  setBookingDraft: (draft: Partial<BookingDraft>) => void;
  clearBookingDraft: () => void;
  addRide: (ride: Ride) => Promise<void>;
  updateRide: (id: string, updates: Partial<Ride>) => Promise<void>;
  setActiveRide: (ride: Ride | null) => Promise<void>;
  toggleDriverMode: () => void;
}

const RidesContext = createContext<RidesContextValue | null>(null);

export function RidesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(ridesReducer, initialState);
  const { user } = useAuth();

  // Scope ride history to the signed-in user — same pattern as active ride.
  useEffect(() => {
    dispatch({ type: "SET_RIDES", payload: [] });
    if (!user?.id) return;
    AsyncStorage.getItem(`${RIDES_KEY}:${user.id}`)
      .then((json: string | null) => dispatch({ type: "SET_RIDES", payload: json ? JSON.parse(json) : [] }))
      .catch(() => dispatch({ type: "SET_RIDES", payload: [] }));
  }, [user?.id]);

  // Scope active ride to the signed-in user. Clears on logout; loads the correct
  // user's ride on login — prevents cross-user data leakage in shared browsers.
  useEffect(() => {
    dispatch({ type: "SET_ACTIVE_RIDE", payload: null });
    if (!user?.id) return;
    AsyncStorage.getItem(`${ACTIVE_RIDE_KEY}:${user.id}`)
      .then((json: string | null) => {
        if (json) dispatch({ type: "SET_ACTIVE_RIDE", payload: JSON.parse(json) });
      })
      .catch(() => {});
  }, [user?.id]);

  const setBookingDraft = useCallback((draft: Partial<BookingDraft>) => {
    dispatch({ type: "SET_BOOKING_DRAFT", payload: draft });
  }, []);

  const clearBookingDraft = useCallback(() => {
    dispatch({ type: "CLEAR_BOOKING_DRAFT" });
  }, []);

  const addRide = useCallback(
    async (ride: Ride) => {
      dispatch({ type: "ADD_RIDE", payload: ride });
      const updated = [ride, ...state.myRides];
      const key = user?.id ? `${RIDES_KEY}:${user.id}` : RIDES_KEY;
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    },
    [state.myRides, user?.id]
  );

  const updateRide = useCallback(
    async (id: string, updates: Partial<Ride>) => {
      dispatch({ type: "UPDATE_RIDE", payload: { id, updates } });
      const updated = state.myRides.map((r) => (r.id === id ? { ...r, ...updates } : r));
      const key = user?.id ? `${RIDES_KEY}:${user.id}` : RIDES_KEY;
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    },
    [state.myRides, user?.id]
  );

  const setActiveRide = useCallback(async (ride: Ride | null) => {
    dispatch({ type: "SET_ACTIVE_RIDE", payload: ride });
    const key = user?.id ? `${ACTIVE_RIDE_KEY}:${user.id}` : ACTIVE_RIDE_KEY;
    if (ride) {
      await AsyncStorage.setItem(key, JSON.stringify(ride));
    } else {
      await AsyncStorage.removeItem(key);
    }
  }, [user?.id]);

  const toggleDriverMode = useCallback(() => {
    dispatch({ type: "TOGGLE_DRIVER_MODE" });
  }, []);

  return (
    <RidesContext.Provider
      value={{
        state,
        setBookingDraft,
        clearBookingDraft,
        addRide,
        updateRide,
        setActiveRide,
        toggleDriverMode,
      }}
    >
      {children}
    </RidesContext.Provider>
  );
}

export function useRides() {
  const ctx = useContext(RidesContext);
  if (!ctx) throw new Error("useRides must be used within RidesProvider");
  return ctx;
}
