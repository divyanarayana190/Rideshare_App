import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Wifi, WifiOff, Car, RefreshCw, Layers, Flame } from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAdminSocket } from '@/hooks/useAdminSocket';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

// Fix Leaflet default marker icon path broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DRIVER_ICON = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;background:#3B82F6;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v9h-2M7 19a2 2 0 100 4 2 2 0 000-4M17 19a2 2 0 100 4 2 2 0 000-4"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function surgeColor(multiplier: number): string {
  if (multiplier >= 2.5) return '#EF4444';
  if (multiplier >= 2.0) return '#F97316';
  if (multiplier >= 1.5) return '#F59E0B';
  return '#10B981';
}

export default function LiveMapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const driverMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const surgeCirclesRef = useRef<L.Circle[]>([]);

  const heatmapLayerRef = useRef<L.Circle[]>([]);
  const { connected, driverLocations, recentRideUpdates, lastPing } = useAdminSocket();
  const [surgeZones, setSurgeZones] = useState<any[]>([]);
  const [showSurge, setShowSurge] = useState(true);
  const [showDrivers, setShowDrivers] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [37.7749, -122.4194], // San Francisco default
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Fetch surge zones
  const fetchSurgeZones = () => {
    api.get<any[]>('/admin/surge-zones').then(setSurgeZones).catch(console.error);
  };
  useEffect(() => { fetchSurgeZones(); }, []);

  // Fetch demand heatmap
  useEffect(() => {
    api.get<{ lat: number; lng: number }[]>('/admin/demand-heatmap')
      .then(setHeatmapPoints)
      .catch(console.error);
  }, []);

  // Draw demand heatmap circles (grid-aggregated)
  useEffect(() => {
    const map = mapInstanceRef.current;
    heatmapLayerRef.current.forEach(c => c.remove());
    heatmapLayerRef.current = [];
    if (!map || !showHeatmap || heatmapPoints.length === 0) return;

    const CELL = 0.008; // ~0.8km grid
    const density = new Map<string, number>();
    for (const p of heatmapPoints) {
      const key = `${Math.floor(p.lat / CELL)},${Math.floor(p.lng / CELL)}`;
      density.set(key, (density.get(key) ?? 0) + 1);
    }
    const maxDensity = Math.max(...density.values(), 1);

    density.forEach((count, key) => {
      const [latCell, lngCell] = key.split(',').map(Number);
      const lat = (latCell + 0.5) * CELL;
      const lng = (lngCell + 0.5) * CELL;
      const intensity = count / maxDensity;
      const r = Math.round(255 * Math.min(intensity * 2, 1));
      const g = Math.round(255 * Math.max(1 - intensity * 1.5, 0));
      const color = `rgb(${r},${g},0)`;
      const circle = L.circle([lat, lng], {
        radius: CELL * 111_000 * 0.6,
        color: 'transparent',
        fillColor: color,
        fillOpacity: 0.25 + intensity * 0.4,
        weight: 0,
      }).addTo(map);
      circle.bindTooltip(`${count} pickup${count !== 1 ? 's' : ''}`, { sticky: true });
      heatmapLayerRef.current.push(circle);
    });
  }, [heatmapPoints, showHeatmap]);

  // Draw / update surge zone circles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove old circles
    surgeCirclesRef.current.forEach((c) => c.remove());
    surgeCirclesRef.current = [];

    if (!showSurge) return;

    surgeZones.filter((z) => z.isActive).forEach((zone) => {
      const color = surgeColor(parseFloat(zone.multiplier));
      const circle = L.circle([parseFloat(zone.centerLat), parseFloat(zone.centerLng)], {
        radius: parseFloat(zone.radiusKm) * 1000,
        color,
        fillColor: color,
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);

      circle.bindPopup(`
        <div style="font-family:sans-serif;min-width:160px">
          <p style="font-weight:600;margin:0 0 4px">${zone.name}</p>
          <p style="margin:0;color:#6B7280;font-size:12px">${zone.multiplier}x surge · ${zone.radiusKm}km radius</p>
          ${zone.reason ? `<p style="margin:4px 0 0;font-size:11px;color:#9CA3AF">${zone.reason}</p>` : ''}
        </div>
      `);
      surgeCirclesRef.current.push(circle);
    });
  }, [surgeZones, showSurge]);

  // Update driver markers when locations change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !showDrivers) {
      // Hide all markers when layer toggled off
      driverMarkersRef.current.forEach((m) => m.remove());
      driverMarkersRef.current.clear();
      return;
    }

    const seenIds = new Set<number>();

    driverLocations.forEach((driver) => {
      seenIds.add(driver.driverId);
      const latlng: L.LatLngTuple = [driver.latitude, driver.longitude];

      if (driverMarkersRef.current.has(driver.driverId)) {
        driverMarkersRef.current.get(driver.driverId)!.setLatLng(latlng);
      } else {
        const marker = L.marker(latlng, { icon: DRIVER_ICON })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:sans-serif">
              <p style="font-weight:600;margin:0 0 2px">Driver #${driver.driverId}</p>
              <p style="margin:0;font-size:11px;color:#6B7280">${driver.latitude.toFixed(5)}, ${driver.longitude.toFixed(5)}</p>
              ${driver.heading != null ? `<p style="margin:2px 0 0;font-size:11px;color:#6B7280">Heading: ${driver.heading}°</p>` : ''}
            </div>
          `)
          .on('click', () => setSelectedDriver(driver.driverId));
        driverMarkersRef.current.set(driver.driverId, marker);
      }
    });

    // Remove markers for drivers no longer in the list
    driverMarkersRef.current.forEach((marker, id) => {
      if (!seenIds.has(id)) {
        marker.remove();
        driverMarkersRef.current.delete(id);
      }
    });
  }, [driverLocations, showDrivers]);

  const fitToDrivers = () => {
    const map = mapInstanceRef.current;
    if (!map || driverLocations.length === 0) return;
    const bounds = L.latLngBounds(driverLocations.map((d) => [d.latitude, d.longitude]));
    map.fitBounds(bounds, { padding: [40, 40] });
  };

  return (
    <>
      <Header title="Live Map" subtitle="Real-time driver positions and surge zones" />
      <div className="flex flex-col h-[calc(100vh-73px)]">

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-3 bg-slate-800/80 border-b border-slate-700/50 flex-shrink-0">
          {/* Connection status */}
          <div className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border',
            connected
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          )}>
            {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {connected ? 'Live' : 'Disconnected'}
            {lastPing && connected && (
              <span className="text-green-600 ml-1">· {lastPing.toLocaleTimeString()}</span>
            )}
          </div>

          {/* Driver count */}
          <div className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border',
            selectedDriver
              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
          )}>
            <Car size={13} />
            {selectedDriver ? `Driver #${selectedDriver} selected` : `${driverLocations.length} driver${driverLocations.length !== 1 ? 's' : ''} online`}
          </div>

          <div className="flex-1" />

          {/* Layer toggles */}
          <div className="flex items-center gap-1">
            <Layers size={14} className="text-slate-400" />
            <button
              onClick={() => setShowDrivers((v) => !v)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                showDrivers ? 'bg-blue-600/20 border-blue-500/40 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
              )}
            >
              Drivers
            </button>
            <button
              onClick={() => setShowSurge((v) => !v)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                showSurge ? 'bg-orange-600/20 border-orange-500/40 text-orange-400' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
              )}
            >
              Surge Zones
            </button>
            <button
              onClick={() => setShowHeatmap((v) => !v)}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                showHeatmap ? 'bg-red-600/20 border-red-500/40 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'
              )}
            >
              <Flame size={12} /> Demand
            </button>
          </div>

          <button
            onClick={fitToDrivers}
            disabled={driverLocations.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white text-xs transition-colors disabled:opacity-40"
          >
            Fit to Drivers
          </button>

          <button
            onClick={fetchSurgeZones}
            className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Map */}
          <div ref={mapRef} className="flex-1 z-0" />

          {/* Side panel */}
          <div className="w-72 bg-slate-900 border-l border-slate-700/50 flex flex-col overflow-hidden flex-shrink-0">
            {/* Recent ride events */}
            <div className="px-4 py-3 border-b border-slate-700/50">
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Live Ride Events</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {recentRideUpdates.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-600 text-xs">
                  <Car size={20} className="mb-2 opacity-40" />
                  Waiting for events…
                </div>
              ) : (
                recentRideUpdates.slice(0, 30).map((u, i) => (
                  <div key={i} className="px-4 py-2.5 border-b border-slate-800 hover:bg-slate-800/40">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-mono text-xs text-blue-400">{u.rideId}</span>
                      <span className={clsx(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        u.status === 'completed' ? 'bg-slate-600/40 text-slate-400' :
                        u.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                        'bg-green-500/20 text-green-400'
                      )}>
                        {u.status.replace('_', ' ')}
                      </span>
                    </div>
                    {u.driverId && <p className="text-[10px] text-slate-500">Driver #{u.driverId}</p>}
                  </div>
                ))
              )}
            </div>

            {/* Surge zone legend */}
            <div className="border-t border-slate-700/50 px-4 py-3">
              <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2">Surge Legend</p>
              <div className="space-y-1.5">
                {[
                  { label: '1.0x – 1.4x', color: '#10B981' },
                  { label: '1.5x – 1.9x', color: '#F59E0B' },
                  { label: '2.0x – 2.4x', color: '#F97316' },
                  { label: '2.5x+', color: '#EF4444' },
                ].map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs text-slate-400">{label}</span>
                  </div>
                ))}
              </div>
              {surgeZones.filter((z) => z.isActive).length > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  {surgeZones.filter((z) => z.isActive).length} active zone{surgeZones.filter((z) => z.isActive).length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
