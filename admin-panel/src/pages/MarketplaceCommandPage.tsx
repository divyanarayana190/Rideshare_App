import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Radio, Car, Users, AlertTriangle, Wifi, WifiOff, RefreshCw,
  Filter, X, Siren, HeadphonesIcon, TrendingUp, MapPin,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { useAdminSocket } from '@/hooks/useAdminSocket';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface MarketplaceData {
  supply: { online: number; onRide: number; offline: number; totalDrivers: number; utilization: number };
  demand: { waitingTrips: number; passengersWaiting: number };
  marketplace: { activeTrips: number; tripsWithoutDriver: number; cancelledTrips: number; fillRate: number; health: string };
  safety: { sosEvents: number; supportEscalations: number };
  activeRides: Array<{
    id: number; rideId: string; status: string; mode: string; safetyMode: string;
    pickupAddress: string; dropoffAddress: string; totalFare: string; driverName: string; createdAt: string;
  }>;
  timestamp: string;
}

interface University { domain: string; name: string; students: number; drivers: number }
interface Company { domain: string; employees: number }

const HEALTH_CLS: Record<string, string> = {
  healthy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  degraded: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
};

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-2xl font-bold text-white" style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function MarketplaceCommandPage() {
  const navigate = useNavigate();
  const { connected, driverLocations, recentRideUpdates, lastPing } = useAdminSocket();
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    city: '', university: '', company: '', rideType: 'all',
    womenOnly: false, studentVerified: false, scheduled: '',
    dateFrom: '', dateTo: '',
  });

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.city) p.set('city', filters.city);
    if (filters.university) p.set('university', filters.university);
    if (filters.company) p.set('company', filters.company);
    if (filters.rideType !== 'all') p.set('rideType', filters.rideType);
    if (filters.womenOnly) p.set('womenOnly', 'true');
    if (filters.studentVerified) p.set('studentVerified', 'true');
    if (filters.scheduled === 'true') p.set('scheduled', 'true');
    if (filters.scheduled === 'false') p.set('scheduled', 'false');
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) p.set('dateTo', filters.dateTo);
    return p.toString();
  }, [filters]);

  const { data, isLoading, refetch, isFetching } = useQuery<MarketplaceData>({
    queryKey: ['marketplace-ops', queryParams],
    queryFn: () => api.get(`/admin/marketplace/ops?${queryParams}`),
    refetchInterval: 15_000,
  });

  const { data: universities = [] } = useQuery<University[]>({
    queryKey: ['universities'],
    queryFn: () => api.get('/admin/universities'),
    staleTime: 300_000,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['company-domains'],
    queryFn: () => api.get('/admin/company-domains'),
    staleTime: 300_000,
  });

  const liveOnline = driverLocations.length || data?.supply.online || 0;

  return (
    <>
      <Header title="Marketplace Command Center" subtitle="Real-time supply, demand, and trip operations" />
      <div className="p-6 space-y-6">
        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={clsx('flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border',
              connected ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-red-400 bg-red-500/10 border-red-500/30')}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? 'Live' : 'Disconnected'}
            </span>
            {lastPing && <span className="text-xs text-slate-500">Last update {lastPing.toLocaleTimeString()}</span>}
            {data && (
              <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full border capitalize', HEALTH_CLS[data.marketplace.health] || HEALTH_CLS.degraded)}>
                Marketplace {data.marketplace.health}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowFilters(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-white">
              <Filter size={14} /> Filters
            </button>
            <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white disabled:opacity-50">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Filters */}
          {showFilters && (
            <div className="w-64 flex-shrink-0 bg-slate-800/80 rounded-xl p-4 border border-slate-700/50 space-y-3 h-fit">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Filters</h3>
                <button onClick={() => setFilters({ city: '', university: '', company: '', rideType: 'all', womenOnly: false, studentVerified: false, scheduled: '', dateFrom: '', dateTo: '' })}
                  className="text-xs text-slate-400 hover:text-white">Clear</button>
              </div>
              <input placeholder="City / area" value={filters.city} onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500" />
              <select value={filters.university} onChange={e => setFilters(f => ({ ...f, university: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">All universities</option>
                {universities.map(u => <option key={u.domain} value={u.domain}>{u.name} ({u.students})</option>)}
              </select>
              <select value={filters.company} onChange={e => setFilters(f => ({ ...f, company: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">All companies</option>
                {companies.map(c => <option key={c.domain} value={c.domain}>{c.domain} ({c.employees})</option>)}
              </select>
              <select value={filters.rideType} onChange={e => setFilters(f => ({ ...f, rideType: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="all">All ride types</option>
                <option value="solo">Solo</option>
                <option value="share">Share</option>
              </select>
              <select value={filters.scheduled} onChange={e => setFilters(f => ({ ...f, scheduled: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Any scheduling</option>
                <option value="false">Immediate</option>
                <option value="true">Scheduled</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={filters.womenOnly} onChange={e => setFilters(f => ({ ...f, womenOnly: e.target.checked }))} className="rounded" />
                Women only rides
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={filters.studentVerified} onChange={e => setFilters(f => ({ ...f, studentVerified: e.target.checked }))} className="rounded" />
                Student verified
              </label>
              <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
              <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          )}

          <div className="flex-1 space-y-6 min-w-0">
            {/* Supply */}
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Supply</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Drivers Online (live)" value={liveOnline} sub={`${data?.supply.onRide ?? 0} on ride`} color="#10B981" />
                <MetricCard label="Drivers Offline" value={data?.supply.offline ?? '—'} />
                <MetricCard label="Driver Utilization" value={data ? `${data.supply.utilization}%` : '—'} color="#F59E0B" />
                <MetricCard label="Total Drivers" value={data?.supply.totalDrivers ?? '—'} />
              </div>
            </div>

            {/* Demand */}
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Demand</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Passengers Waiting" value={data?.demand.passengersWaiting ?? '—'} color="#F59E0B" />
                <MetricCard label="Trips Without Driver" value={data?.marketplace.tripsWithoutDriver ?? '—'} color="#EF4444" />
                <MetricCard label="Active Trips" value={data?.marketplace.activeTrips ?? '—'} color="#3B82F6" />
                <MetricCard label="Fill Rate" value={data ? `${data.marketplace.fillRate}%` : '—'} color="#10B981" />
              </div>
            </div>

            {/* Safety & ops */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Cancelled Trips" value={data?.marketplace.cancelledTrips ?? '—'} />
              <MetricCard label="SOS Events" value={data?.safety.sosEvents ?? '—'} color="#EF4444" />
              <MetricCard label="Support Escalations" value={data?.safety.supportEscalations ?? '—'} color="#F59E0B" />
              <MetricCard label="Live GPS Drivers" value={driverLocations.length} sub="WebSocket feed" color="#0EA5E9" />
            </div>

            {/* Active rides table */}
            <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Active Trips</h2>
                <button onClick={() => navigate('/rides')} className="text-xs text-blue-400 hover:text-blue-300">View all rides →</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700/50">
                      <th className="text-left px-4 py-3 font-medium">Ride ID</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium">Driver</th>
                      <th className="text-left px-4 py-3 font-medium">Route</th>
                      <th className="text-right px-4 py-3 font-medium">Fare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                    ) : (data?.activeRides ?? []).length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No active trips</td></tr>
                    ) : (data?.activeRides ?? []).map(ride => (
                      <tr key={ride.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                        <td className="px-4 py-3 text-white font-mono text-xs">{ride.rideId}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400 capitalize">{ride.status.replace('_', ' ')}</span>
                          {ride.safetyMode !== 'none' && <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-pink-500/20 text-pink-400">WO</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{ride.driverName}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                          <MapPin size={10} className="inline mr-1" />{ride.pickupAddress}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-400">${Number(ride.totalFare).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live ride updates feed */}
            {recentRideUpdates.length > 0 && (
              <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-400" /> Live Ride Updates
                </h2>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recentRideUpdates.slice(0, 10).map((u, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-slate-700/30">
                      <Car size={14} className="text-blue-400 flex-shrink-0" />
                      <span className="text-white font-mono text-xs">{u.rideId}</span>
                      <span className="text-slate-400 capitalize">{u.status?.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
