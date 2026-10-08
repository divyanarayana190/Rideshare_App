import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, Car, DollarSign, ShieldAlert, TrendingUp,
  RefreshCw, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface Company { domain: string; employees: number }

interface CorpIntel {
  domain: string;
  name: string;
  periodDays: number;
  employees: number;
  activeRiders: number;
  adoptionRate: number;
  drivers: number;
  trips: { total: number; completed: number; cancelled: number; completionRate: number; avgPerEmployee: number };
  revenue: { gmv: number; avgTripValue: number };
  popularRoutes: Array<{ pickup: string; dropoff: string; trips: number; avgFare: string }>;
  peakHours: Array<{ hour: number; label: string; trips: number }>;
  safety: { emergencyAlerts: number };
  tripsTrend: Array<{ date: string; trips: number; completed: number }>;
  topCommuters: Array<{ userId: number; name: string; trips: number; spend: string }>;
}

const PERIODS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

const tooltipStyle = { backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#E2E8F0' };

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
}) {
  return (
    <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${color}20` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <p className="text-slate-400 text-xs">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function CorporateDashboardPage() {
  const navigate = useNavigate();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);

  const { data: companies = [], isLoading: listLoading } = useQuery<Company[]>({
    queryKey: ['company-domains'],
    queryFn: () => api.get('/admin/company-domains'),
    staleTime: 300_000,
  });

  const { data, isLoading, refetch, isFetching } = useQuery<CorpIntel>({
    queryKey: ['corporate-intelligence', selectedDomain, period],
    queryFn: () => api.get(`/admin/corporate/${encodeURIComponent(selectedDomain!)}/intelligence?days=${period}`),
    enabled: !!selectedDomain,
    staleTime: 60_000,
  });

  return (
    <>
      <Header title="Corporate Mobility" subtitle="Email-domain grouping — inferred from user accounts (no B2B schema)" />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {PERIODS.map((p) => (
              <button key={p.days} onClick={() => setPeriod(p.days)}
                className={clsx('px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  period === p.days ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white')}>
                {p.label}
              </button>
            ))}
          </div>
          {selectedDomain && (
            <button onClick={() => refetch()} disabled={isFetching}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
              <Building2 size={16} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Company Domains ({companies.length})</h3>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {listLoading ? (
                <p className="p-4 text-slate-500 text-sm">Loading…</p>
              ) : companies.length === 0 ? (
                <p className="p-4 text-slate-500 text-sm">No corporate email domains detected yet.</p>
              ) : (
                companies.map((c) => (
                  <button key={c.domain} onClick={() => setSelectedDomain(c.domain)}
                    className={clsx(
                      'w-full text-left px-4 py-3 border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors flex items-center justify-between',
                      selectedDomain === c.domain && 'bg-emerald-600/10 border-l-2 border-l-emerald-500',
                    )}>
                    <div>
                      <p className="text-sm font-medium text-white">{c.domain}</p>
                    </div>
                    <p className="text-xs text-slate-400">{c.employees} accounts</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {!selectedDomain ? (
              <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-12 text-center">
                <Building2 size={48} className="mx-auto text-slate-600 mb-4" />
                <p className="text-slate-400">Select a company domain to view mobility metrics</p>
                <p className="text-xs text-slate-500 mt-2">Excludes .edu and consumer email providers</p>
              </div>
            ) : isLoading ? (
              <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-12 text-center text-slate-500">Loading…</div>
            ) : data ? (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white">{data.name}</h2>
                  <p className="text-sm text-slate-400">@{data.domain} · Last {data.periodDays} days</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard label="Employees" value={data.employees.toLocaleString()} icon={Users} color="#10B981" />
                  <MetricCard label="Active Riders" value={data.activeRiders} sub={`${data.adoptionRate}% adoption`} icon={TrendingUp} color="#3B82F6" />
                  <MetricCard label="Completed Trips" value={data.trips.completed.toLocaleString()} sub={`${data.trips.avgPerEmployee} avg/employee`} icon={Car} color="#8B5CF6" />
                  <MetricCard label="GMV" value={`$${data.revenue.gmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`$${data.revenue.avgTripValue.toFixed(2)} avg trip`} icon={DollarSign} color="#F59E0B" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <MetricCard label="Corporate Drivers" value={data.drivers} icon={Car} color="#6366F1" />
                  <MetricCard label="Safety Alerts" value={data.safety.emergencyAlerts} icon={ShieldAlert} color="#EF4444" />
                </div>

                {data.tripsTrend.length > 0 && (
                  <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                    <h3 className="text-sm font-semibold text-white mb-4">Trip Volume Trend</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data.tripsTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="date" stroke="#64748B" fontSize={11} />
                        <YAxis stroke="#64748B" fontSize={11} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="trips" stroke="#10B981" strokeWidth={2} dot={false} name="All trips" />
                        <Line type="monotone" dataKey="completed" stroke="#3B82F6" strokeWidth={2} dot={false} name="Completed" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.peakHours.length > 0 && (
                    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                      <h3 className="text-sm font-semibold text-white mb-4">Commute Peak Hours</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.peakHours}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="label" stroke="#64748B" fontSize={10} interval={2} />
                          <YAxis stroke="#64748B" fontSize={11} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="trips" fill="#10B981" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {data.topCommuters.length > 0 && (
                    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                      <h3 className="text-sm font-semibold text-white mb-4">Top Commuters</h3>
                      <div className="space-y-2">
                        {data.topCommuters.map((c) => (
                          <button key={c.userId} onClick={() => navigate(`/passengers/${c.userId}`)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-700/40 text-left">
                            <span className="text-sm text-white">{c.name}</span>
                            <div className="text-right">
                              <span className="text-xs text-slate-400">{c.trips} trips · ${c.spend}</span>
                              <ChevronRight size={12} className="inline ml-1 text-slate-500" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {data.popularRoutes.length > 0 && (
                  <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                    <h3 className="text-sm font-semibold text-white mb-4">Popular Commute Routes</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left py-2 text-slate-400 font-medium">Route</th>
                          <th className="text-left py-2 text-slate-400 font-medium">Trips</th>
                          <th className="text-left py-2 text-slate-400 font-medium">Avg Fare</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.popularRoutes.map((r, i) => (
                          <tr key={i} className="border-b border-slate-700/30">
                            <td className="py-2 text-slate-300">
                              <span className="text-white">{r.pickup}</span>
                              <span className="text-slate-500 mx-1">→</span>
                              {r.dropoff}
                            </td>
                            <td className="py-2 text-white">{r.trips}</td>
                            <td className="py-2 text-green-400">${r.avgFare}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
