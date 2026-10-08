import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, FunnelChart, Funnel, LabelList, Cell } from 'recharts';
import { Download, TrendingUp, DollarSign, Star, Car, Loader2, Brain, GitBranch, MapPin } from 'lucide-react';
import Header from '@/components/layout/Header';
import ExportMenu from '@/components/ExportMenu';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface RevenuePoint {
  date: string;
  revenue: number;
}

interface RideDay {
  date: string;
  completed: number;
  cancelled: number;
}

interface UserGrowthPoint {
  date: string;
  newUsers: number;
}

interface PopularRoute {
  pickup?: string;
  pickupAddress?: string;
  dropoff?: string;
  dropoffAddress?: string;
  count?: number;
  rideCount?: number;
  avgFare?: number;
}

interface PeakHour {
  hour: string;
  mon?: number;
  tue?: number;
  wed?: number;
  thu?: number;
  fri?: number;
  sat?: number;
  sun?: number;
}

interface AnalyticsSummary {
  totalRides: number;
  avgFare: number | string;
  completionRate: number | string;
  avgRating: number | string;
}

interface ForecastPoint {
  date: string;
  value: number;
  type: 'historical' | 'forecast';
}

interface FunnelData {
  periodDays: number;
  rideLifecycle: { requested: number; matched: number; driverAssigned: number; inProgress: number; completed: number; cancelled: number; conversionRate: number };
  passengerFunnel: { signups: number; firstRide: number; completedRide: number; repeatRiders: number; signupToFirstRide: number; firstToCompleted: number; repeatRate: number };
  driverFunnel: { applications: number; approved: number; activeDrivers: number; approvalRate: number };
  revenueFunnel: { completedRides: number; paid: number; refunded: number; paymentRate: number };
  cancellation: { reasons: Array<{ reason: string; count: number }>; byHour: Array<{ hour: number; label: string; count: number }>; rate: number };
  geographic: Array<{ area: string; total: number; completed: number; cancelled: number; gmv: number; conversionRate: number }>;
  cohortRetention: Array<{ week: string; cohortSize: number; retention: number[] }>;
}

const FUNNEL_COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#10B981'];

const periods = ['7D', '30D', '90D'];
const tooltipStyle = { backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#E2E8F0' };

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30D');
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [ridesPerDay, setRidesPerDay] = useState<RideDay[]>([]);
  const [userGrowth, setUserGrowth] = useState<UserGrowthPoint[]>([]);
  const [popularRoutes, setPopularRoutes] = useState<PopularRoute[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [forecastMetric, setForecastMetric] = useState<'demand' | 'revenue'>('demand');
  const [forecastData, setForecastData] = useState<ForecastPoint[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'funnels' | 'reports'>('funnels');

  const funnelDays = period === '7D' ? 7 : period === '90D' ? 90 : 30;
  const { data: funnels, isLoading: funnelsLoading } = useQuery<FunnelData>({
    queryKey: ['analytics-funnels', funnelDays],
    queryFn: () => api.get(`/admin/analytics/funnels?days=${funnelDays}`),
    staleTime: 120_000,
  });

  const rideFunnelChart = funnels ? [
    { name: 'Requested', value: funnels.rideLifecycle.requested, fill: FUNNEL_COLORS[0] },
    { name: 'Matched', value: funnels.rideLifecycle.matched, fill: FUNNEL_COLORS[1] },
    { name: 'Driver Assigned', value: funnels.rideLifecycle.driverAssigned, fill: FUNNEL_COLORS[2] },
    { name: 'In Progress', value: funnels.rideLifecycle.inProgress, fill: FUNNEL_COLORS[3] },
    { name: 'Completed', value: funnels.rideLifecycle.completed, fill: FUNNEL_COLORS[4] },
  ] : [];

  const retentionChart = (funnels?.cohortRetention ?? []).slice(-4).map((c) => ({
    week: c.week,
    ...c.retention.reduce((acc, r, i) => ({ ...acc, [`W${i}`]: r }), {} as Record<string, number>),
  }));

  // Fetch all analytics data
  useEffect(() => {
    setLoading(true);
    const days = period === '7D' ? 7 : period === '90D' ? 90 : 30;
    const periodParam = period === '7D' ? '7d' : period === '90D' ? '90d' : '30d';
    Promise.all([
      api.get<RevenuePoint[]>(`/admin/stats/revenue?period=${periodParam}`),
      api.get<RideDay[]>(`/admin/analytics/rides-per-day?days=${days}`),
      api.get<UserGrowthPoint[]>(`/admin/analytics/user-growth?days=${days}`),
      api.get<PopularRoute[]>('/admin/analytics/popular-routes'),
      api.get<PeakHour[]>('/admin/analytics/peak-hours'),
      api.get<AnalyticsSummary>(`/admin/analytics/summary?period=${period}`),
    ]).then(([rev, rpd, ug, pr, ph, sum]) => {
      setRevenueData(rev || []);
      setRidesPerDay(rpd || []);
      setUserGrowth(ug || []);
      setPopularRoutes(pr || []);
      setPeakHours(ph || []);
      setSummary(sum);
    }).catch(console.error).finally(() => setLoading(false));
  }, [period]);

  // Fetch forecast when metric changes
  useEffect(() => {
    setForecastLoading(true);
    api.get<{ historical: Omit<ForecastPoint, 'type'>[]; forecast: Omit<ForecastPoint, 'type'>[] }>(`/admin/analytics/forecast?metric=${forecastMetric}&days=14`)
      .then((d) => {
        const historical: ForecastPoint[] = (d.historical || []).map((p) => ({ ...p, type: 'historical' as const }));
        const forecast: ForecastPoint[] = (d.forecast || []).map((p) => ({ ...p, type: 'forecast' as const }));
        setForecastData([...historical, ...forecast]);
      })
      .catch(console.error)
      .finally(() => setForecastLoading(false));
  }, [forecastMetric]);

  return (
    <>
      <Header title="Analytics" subtitle="Conversion funnels, cohort retention, and platform reporting" />
      <div className="p-6 space-y-6">
        {/* Tab + Period Selector */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {(['funnels', 'reports'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={clsx('px-3 py-2 rounded-md text-sm font-medium transition-colors capitalize flex items-center gap-1.5',
                  activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                {tab === 'funnels' && <GitBranch size={14} />}
                {tab}
              </button>
            ))}
          </div>
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {periods.map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={clsx('px-3 py-2 rounded-md text-sm font-medium transition-colors', period === p ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'funnels' && (
          <>
            {funnelsLoading ? (
              <div className="py-12 text-center text-slate-500"><Loader2 size={20} className="animate-spin inline mr-2" />Loading funnels…</div>
            ) : funnels ? (
              <>
                {/* Conversion KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Ride Conversion', value: `${funnels.rideLifecycle.conversionRate}%`, sub: `${funnels.rideLifecycle.completed} completed` },
                    { label: 'Signup → First Ride', value: `${funnels.passengerFunnel.signupToFirstRide}%`, sub: `${funnels.passengerFunnel.firstRide} riders` },
                    { label: 'Payment Rate', value: `${funnels.revenueFunnel.paymentRate}%`, sub: `${funnels.revenueFunnel.paid} paid` },
                    { label: 'Cancellation Rate', value: `${funnels.cancellation.rate}%`, sub: `${funnels.rideLifecycle.cancelled} cancelled` },
                  ].map((s, i) => (
                    <div key={i} className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
                      <p className="text-xl font-bold text-white">{s.value}</p>
                      <p className="text-xs text-slate-400">{s.label}</p>
                      <p className="text-xs text-slate-500 mt-1">{s.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Ride lifecycle funnel */}
                  <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                    <h2 className="text-lg font-semibold text-white mb-4">Ride Lifecycle Funnel</h2>
                    {rideFunnelChart.some((d) => d.value > 0) ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <FunnelChart>
                          <Tooltip contentStyle={tooltipStyle} />
                          <Funnel dataKey="value" data={rideFunnelChart} isAnimationActive>
                            <LabelList position="right" fill="#E2E8F0" stroke="none" dataKey="name" />
                            {rideFunnelChart.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Funnel>
                        </FunnelChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-slate-500 text-sm py-8 text-center">No ride data in period</p>
                    )}
                  </div>

                  {/* Passenger + driver funnels */}
                  <div className="space-y-4">
                    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                      <h3 className="text-sm font-semibold text-white mb-3">Passenger Funnel</h3>
                      <div className="space-y-2">
                        {[
                          { label: 'Signups', value: funnels.passengerFunnel.signups, pct: 100 },
                          { label: 'First Ride', value: funnels.passengerFunnel.firstRide, pct: funnels.passengerFunnel.signupToFirstRide },
                          { label: 'Completed Ride', value: funnels.passengerFunnel.completedRide, pct: funnels.passengerFunnel.firstToCompleted },
                          { label: 'Repeat Riders', value: funnels.passengerFunnel.repeatRiders, pct: funnels.passengerFunnel.repeatRate },
                        ].map((step) => (
                          <div key={step.label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-300">{step.label}</span>
                              <span className="text-slate-400">{step.value.toLocaleString()} ({step.pct}%)</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(step.pct, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                      <h3 className="text-sm font-semibold text-white mb-3">Driver & Revenue Funnel</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400 text-xs">Applications</p>
                          <p className="text-white font-bold">{funnels.driverFunnel.applications}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs">Approved ({funnels.driverFunnel.approvalRate}%)</p>
                          <p className="text-white font-bold">{funnels.driverFunnel.approved}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs">Active Drivers</p>
                          <p className="text-white font-bold">{funnels.driverFunnel.activeDrivers}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs">Refunded Payments</p>
                          <p className="text-white font-bold">{funnels.revenueFunnel.refunded}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Cancellation analysis */}
                  <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                    <h2 className="text-lg font-semibold text-white mb-4">Cancellation Reasons</h2>
                    {funnels.cancellation.reasons.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={funnels.cancellation.reasons} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis type="number" stroke="#64748B" fontSize={11} />
                          <YAxis type="category" dataKey="reason" stroke="#64748B" fontSize={10} width={100} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="count" fill="#EF4444" radius={[0, 2, 2, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-slate-500 text-sm py-8 text-center">No cancellations in period</p>
                    )}
                  </div>

                  {/* Cohort retention */}
                  <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                    <h2 className="text-lg font-semibold text-white mb-4">Cohort Retention</h2>
                    {retentionChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={retentionChart}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="week" stroke="#64748B" fontSize={10} />
                          <YAxis stroke="#64748B" fontSize={11} unit="%" />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend />
                          {[0, 1, 2, 3].map((i) => (
                            <Line key={i} type="monotone" dataKey={`W${i}`} stroke={FUNNEL_COLORS[i]} strokeWidth={2} dot={false} name={`Week ${i}`} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-slate-500 text-sm py-8 text-center">Not enough cohort data</p>
                    )}
                  </div>
                </div>

                {/* Geographic */}
                {funnels.geographic.length > 0 && (
                  <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <MapPin size={18} className="text-blue-400" /> Geographic Performance
                    </h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left py-2 text-slate-400 font-medium">Pickup Area</th>
                          <th className="text-left py-2 text-slate-400 font-medium">Trips</th>
                          <th className="text-left py-2 text-slate-400 font-medium">Completed</th>
                          <th className="text-left py-2 text-slate-400 font-medium">Conversion</th>
                          <th className="text-left py-2 text-slate-400 font-medium">GMV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funnels.geographic.map((g, i) => (
                          <tr key={i} className="border-b border-slate-700/30">
                            <td className="py-2 text-white">{g.area}</td>
                            <td className="py-2 text-slate-300">{g.total}</td>
                            <td className="py-2 text-slate-300">{g.completed}</td>
                            <td className="py-2 text-purple-400">{g.conversionRate}%</td>
                            <td className="py-2 text-green-400">${g.gmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </>
        )}

        {activeTab === 'reports' && (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Rides', value: summary ? summary.totalRides.toLocaleString() : '—', icon: Car, color: '#3B82F6' },
            { label: 'Avg Fare', value: summary ? `$${summary.avgFare}` : '—', icon: DollarSign, color: '#10B981' },
            { label: 'Completion Rate', value: summary ? `${summary.completionRate}%` : '—', icon: TrendingUp, color: '#8B5CF6' },
            { label: 'Avg Rating', value: summary ? summary.avgRating : '—', icon: Star, color: '#F59E0B' },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50 flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${s.color}20` }}>
                <s.icon size={18} style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Revenue Chart */}
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">Revenue Over Time</h2>
          {revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v: number | string) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [`$${Number(v).toLocaleString()}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#8B5CF6" fill="url(#revGrad2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-500">
              {loading ? <><Loader2 size={20} className="animate-spin mr-2" /> Loading chart data...</> : 'No revenue data available'}
            </div>
          )}
        </div>

        {/* Two Column Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rides Per Day */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Rides Per Day</h2>
            {ridesPerDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={ridesPerDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="completed" stackId="a" fill="#10B981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="cancelled" stackId="a" fill="#EF4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-slate-500">
                {loading ? 'Loading...' : 'No ride data available'}
              </div>
            )}
          </div>

          {/* User Growth */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">User Growth</h2>
            {userGrowth.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={userGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Line type="monotone" dataKey="newUsers" stroke="#3B82F6" strokeWidth={2} dot={false} name="New Users" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-slate-500">
                {loading ? 'Loading...' : 'No user growth data'}
              </div>
            )}
          </div>
        </div>

        {/* Popular Routes */}
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">Popular Routes</h2>
          {popularRoutes.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left py-2 text-slate-400 font-medium">#</th>
                  <th className="text-left py-2 text-slate-400 font-medium">Route</th>
                  <th className="text-left py-2 text-slate-400 font-medium">Rides</th>
                  <th className="text-left py-2 text-slate-400 font-medium">Avg Fare</th>
                </tr>
              </thead>
              <tbody>
                {popularRoutes.map((route, i) => (
                  <tr key={i} className="border-b border-slate-700/30">
                    <td className="py-3 text-slate-500">{i + 1}</td>
                    <td className="py-3">
                      <span className="text-white">{route.pickup || route.pickupAddress || 'Unknown'}</span>
                      <span className="text-slate-500 mx-2">→</span>
                      <span className="text-slate-300">{route.dropoff || route.dropoffAddress || 'Unknown'}</span>
                    </td>
                    <td className="py-3 text-white font-medium">{Number(route.count || route.rideCount || 0).toLocaleString()}</td>
                    <td className="py-3 text-green-400">${Number(route.avgFare || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-slate-500">
              {loading ? 'Loading...' : 'No route data available'}
            </div>
          )}
        </div>

        {/* Predictive Forecast */}
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/20">
                <Brain size={16} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">14-Day Forecast</h2>
                <p className="text-xs text-slate-400">Linear regression on last 30 days · dashed = predicted</p>
              </div>
            </div>
            <div className="flex gap-1">
              {(['demand', 'revenue'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setForecastMetric(m)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                    forecastMetric === m ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {forecastLoading ? (
            <div className="h-[280px] flex items-center justify-center text-slate-500">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-purple-400" />
                <span className="text-sm">Generating forecast…</span>
              </div>
            </div>
          ) : forecastData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm">
              Not enough historical data for forecast (need 3+ days)
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={forecastData}>
                <defs>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#64748B" fontSize={11} tick={{ fill: '#94A3B8' }} />
                <YAxis stroke="#64748B" fontSize={11} tick={{ fill: '#94A3B8' }}
                  tickFormatter={(v: number | string) => forecastMetric === 'revenue' ? `$${Number(v).toLocaleString()}` : String(v)} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number | string, _: unknown, props: { payload?: ForecastPoint }) => [
                    forecastMetric === 'revenue' ? `$${Number(v).toLocaleString()}` : v,
                    props.payload?.type === 'forecast' ? 'Forecast' : 'Actual',
                  ]}
                />
                {/* Split into two lines so forecast renders dashed */}
                <Line
                  data={forecastData.filter((d) => d.type === 'historical')}
                  type="monotone"
                  dataKey="value"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={false}
                  name="Actual"
                  connectNulls
                />
                <Line
                  data={forecastData.filter((d) => d.type === 'forecast')}
                  type="monotone"
                  dataKey="value"
                  stroke="#C084FC"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ fill: '#C084FC', r: 3 }}
                  name="Forecast"
                  connectNulls
                />
                <ReferenceLine
                  x={forecastData.find((d) => d.type === 'forecast')?.date}
                  stroke="#475569"
                  strokeDasharray="4 4"
                  label={{ value: 'Today', fill: '#64748B', fontSize: 11, position: 'top' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Export row */}
        <div className="flex justify-end">
          <ExportMenu endpoint="/admin/export/rides" filename="analytics_rides" />
        </div>

        {/* Peak Hours */}
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">Peak Hours Heatmap</h2>
          {peakHours.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 text-xs min-w-[500px]">
                <div />
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="text-center text-slate-400 py-1">{d}</div>
                ))}
                {peakHours.filter((_, i) => i % 2 === 0).map((row) => (
                  <div key={row.hour} className="contents">
                    <div className="text-slate-400 py-1 text-right pr-2">{row.hour}</div>
                    {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => {
                      const val = Number(row[day] || 0);
                      return (
                        <div key={`${row.hour}-${day}`} className="rounded h-6"
                          style={{ backgroundColor: `rgba(59, 130, 246, ${0.1 + val * 0.8})` }}
                          title={`${row.hour} ${day}: ${Math.round(val * 100)}% load`} />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500">
              {loading ? 'Loading...' : 'No peak hours data'}
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </>
  );
}
