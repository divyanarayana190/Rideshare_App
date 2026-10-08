import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, Users, Car, DollarSign, ShieldAlert, Star,
  TrendingUp, RefreshCw, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface University { domain: string; name: string; students: number; drivers: number }

interface UniIntel {
  domain: string;
  name: string;
  periodDays: number;
  students: { total: number; verified: number };
  drivers: number;
  trips: { total: number; completed: number; cancelled: number; completionRate: number };
  revenue: { gmv: number };
  popularRoutes: Array<{ pickup: string; dropoff: string; trips: number; avgFare: string }>;
  peakHours: Array<{ hour: number; label: string; trips: number }>;
  safety: { emergencyAlerts: number; lowRatings: number };
  ratings: { average: string };
  tripsTrend: Array<{ date: string; trips: number; completed: number }>;
  retention: Array<{ week: string; cohortSize: number; retention: number[] }>;
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

export default function UniversityDashboardPage() {
  const navigate = useNavigate();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);

  const { data: universities = [], isLoading: listLoading } = useQuery<University[]>({
    queryKey: ['universities'],
    queryFn: () => api.get('/admin/universities'),
    staleTime: 300_000,
  });

  const { data, isLoading, refetch, isFetching } = useQuery<UniIntel>({
    queryKey: ['university-intelligence', selectedDomain, period],
    queryFn: () => api.get(`/admin/universities/${encodeURIComponent(selectedDomain!)}/intelligence?days=${period}`),
    enabled: !!selectedDomain,
    staleTime: 60_000,
  });

  const retentionChart = (data?.retention ?? []).slice(-4).map((c) => ({
    week: c.week,
    ...c.retention.reduce((acc, r, i) => ({ ...acc, [`W${i}`]: r }), {} as Record<string, number>),
  }));

  return (
    <>
      <Header title="University Intelligence" subtitle="Auto-discovered from verified student profiles — no hardcoded list" />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {PERIODS.map((p) => (
              <button key={p.days} onClick={() => setPeriod(p.days)}
                className={clsx('px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  period === p.days ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
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
          {/* Institution picker */}
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
              <GraduationCap size={16} className="text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Institutions ({universities.length})</h3>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {listLoading ? (
                <p className="p-4 text-slate-500 text-sm">Loading…</p>
              ) : universities.length === 0 ? (
                <p className="p-4 text-slate-500 text-sm">No verified university domains in database yet.</p>
              ) : (
                universities.map((u) => (
                  <button key={u.domain} onClick={() => setSelectedDomain(u.domain)}
                    className={clsx(
                      'w-full text-left px-4 py-3 border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors flex items-center justify-between',
                      selectedDomain === u.domain && 'bg-blue-600/10 border-l-2 border-l-blue-500',
                    )}>
                    <div>
                      <p className="text-sm font-medium text-white truncate">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.domain}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs text-slate-400">{u.students} students</p>
                      <p className="text-xs text-slate-500">{u.drivers} drivers</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2 space-y-6">
            {!selectedDomain ? (
              <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-12 text-center">
                <GraduationCap size={48} className="mx-auto text-slate-600 mb-4" />
                <p className="text-slate-400">Select an institution to view intelligence metrics</p>
              </div>
            ) : isLoading ? (
              <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-12 text-center text-slate-500">Loading…</div>
            ) : data ? (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white">{data.name}</h2>
                  <p className="text-sm text-slate-400">{data.domain} · Last {data.periodDays} days</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard label="Students" value={data.students.total.toLocaleString()} sub={`${data.students.verified} verified`} icon={Users} color="#3B82F6" />
                  <MetricCard label="Drivers" value={data.drivers} icon={Car} color="#10B981" />
                  <MetricCard label="Trips" value={data.trips.completed.toLocaleString()} sub={`${data.trips.completionRate}% completion`} icon={TrendingUp} color="#8B5CF6" />
                  <MetricCard label="GMV" value={`$${data.revenue.gmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} color="#F59E0B" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <MetricCard label="Safety Alerts" value={data.safety.emergencyAlerts} icon={ShieldAlert} color="#EF4444" />
                  <MetricCard label="Low Ratings" value={data.safety.lowRatings} icon={Star} color="#F97316" />
                  <MetricCard label="Avg Rating" value={data.ratings.average} icon={Star} color="#EAB308" />
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
                        <Line type="monotone" dataKey="trips" stroke="#3B82F6" strokeWidth={2} dot={false} name="All trips" />
                        <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2} dot={false} name="Completed" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.peakHours.length > 0 && (
                    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                      <h3 className="text-sm font-semibold text-white mb-4">Peak Hours</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.peakHours}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="label" stroke="#64748B" fontSize={10} interval={2} />
                          <YAxis stroke="#64748B" fontSize={11} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="trips" fill="#6366F1" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {retentionChart.length > 0 && (
                    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                      <h3 className="text-sm font-semibold text-white mb-4">Student Retention (weekly cohorts)</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={retentionChart}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="week" stroke="#64748B" fontSize={10} />
                          <YAxis stroke="#64748B" fontSize={11} unit="%" />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend />
                          {[0, 1, 2, 3].map((i) => (
                            <Line key={i} type="monotone" dataKey={`W${i}`} stroke={['#3B82F6', '#10B981', '#F59E0B', '#EF4444'][i]} strokeWidth={2} dot={false} name={`Week ${i}`} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {data.popularRoutes.length > 0 && (
                  <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                    <h3 className="text-sm font-semibold text-white mb-4">Popular Routes</h3>
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

                <button onClick={() => navigate(`/passengers?university=${encodeURIComponent(data.domain)}`)}
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                  View passengers from {data.name} <ChevronRight size={14} />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
