import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SEV_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#3B82F6',
};

interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  type?: string;
  severity?: string;
  userName?: string;
}

export default function SafetyAlertMap({ points, height = 240 }: { points: MapPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: true }).setView([40.7128, -74.006], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (points.length === 0) return;

    const bounds: L.LatLngExpression[] = [];
    for (const p of points) {
      if (!p.lat || !p.lng) continue;
      const color = SEV_COLOR[p.severity || 'high'] || '#EF4444';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([p.lat, p.lng], { icon })
        .bindPopup(`<strong>${p.userName || 'Alert'}</strong><br/>${p.type || 'SOS'}`)
        .addTo(map);
      markersRef.current.push(marker);
      bounds.push([p.lat, p.lng]);
    }
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }, [points]);

  return (
    <div ref={ref} style={{ height }} className="rounded-xl overflow-hidden border border-slate-700/50 w-full" />
  );
}
