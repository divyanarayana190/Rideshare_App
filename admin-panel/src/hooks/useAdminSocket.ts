import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface DriverLocation {
  driverId: number;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
}

export interface AdminRideUpdate {
  rideId: string;
  status: string;
  driverId?: number;
  driverLocation?: { latitude: number; longitude: number };
  eta?: number;
}

interface UseAdminSocketReturn {
  connected: boolean;
  driverLocations: DriverLocation[];
  recentRideUpdates: AdminRideUpdate[];
  lastPing: Date | null;
  infraLive: { operations?: Record<string, number>; system?: { healthScore?: number; status?: string }; timestamp?: string } | null;
}

export function useAdminSocket(): UseAdminSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [recentRideUpdates, setRecentRideUpdates] = useState<AdminRideUpdate[]>([]);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [infraLive, setInfraLive] = useState<UseAdminSocketReturn['infraLive']>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    const socket = io(`${WS_URL}/admin`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setLastPing(new Date());
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('driver_locations', (locations: DriverLocation[]) => {
      setDriverLocations(locations);
      setLastPing(new Date());
    });

    socket.on('ride_update', (update: AdminRideUpdate) => {
      setRecentRideUpdates((prev) => [update, ...prev.slice(0, 49)]);
    });

    socket.on('infra:update', (payload: UseAdminSocketReturn['infraLive']) => {
      setInfraLive(payload);
      setLastPing(new Date());
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { connected, driverLocations, recentRideUpdates, lastPing, infraLive };
}
