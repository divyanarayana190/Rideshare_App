import { useState, useEffect } from 'react';
import { Users, Car, DollarSign, Radio, TrendingUp, TrendingDown, AlertTriangle, Star, Clock, Brain, RefreshCw, Activity, Shield, HeadphonesIcon, CheckCircle2, LayoutGrid, X } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import WidgetReorderList from '@/components/WidgetReorderList';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' },
  warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-400' },
};

const PIE_COLORS = ['#10B981', '#EF4444', '#3B82F6', '#F59E0B', '#8B5CF6'];

function StatCard({ title, value, change, icon: Icon, color, loading }: {
  title: string; value: string; change?: number; icon: any; color: string; loading?: boolean;
}) {
  const isUp = (change ?? 0) >= 0;
  return (
    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm">{title}</p>
          {loading ? (
            <div className="h-8 w-24 bg-slate-700 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
          )}
          {change !== undefined && (
            <div className={clsx('flex items-center gap-1 mt-2 text-xs font-medium', isUp ? 'text-emerald-400' : 'text-red-400')}>
              {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{isUp ? '+' : ''}{change}%</span>
            </div>
          )}
        </div>
        <div className="p-3 rounded-xl" style={{ backgroundColor: `${color}20` }}>
          <Icon size={22} style={{ color }} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [ridesByStatus, setRidesByStatus] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [topDrivers, setTopDrivers] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [executive, setExecutive] = useState<any>(null);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<Array<{ id: string; label: string; enabled: boolean; order: number }>>([]);
  const [showWidgetPanel, setShowWidgetPanel] = useState(false);

  const widgetOn = (id: string) => widgets.length === 0 || widgets.find((w) => w.id === id)?.enabled !== false;
  const widgetOrder = (id: string) => widgets.find((w) => w.id === id)?.order ?? 99;

  useEffect(() => {
    api.get<any[]>('/admin/preferences/dashboard-widgets').then(setWidgets).catch(() => {});
  }, []);

  const saveWidgets = async (next: typeof widgets) => {
    setWidgets(next);
    await api.put('/admin/preferences/dashboard-widgets', { widgets: next }).catch(console.error);
  };

  // Fetch all dashboard data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<any>('/admin/stats'),
      api.get<any>('/admin/executive-metrics'),
      api.get<any[]>('/admin/stats/rides-by-status'),
      api.get<any[]>('/admin/stats/recent-activity'),
      api.get<any[]>('/admin/drivers/top'),
      api.get<any[]>('/admin/safety/alerts?status=active'),
    ]).then(([s, exec, rbs, act, drivers, alr]) => {
      setStats(s);
      setExecutive(exec);
      setRidesByStatus(rbs);
      setActivity(act);
      setTopDrivers(drivers);
      setAlerts(alr);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Fetch revenue when period changes
  useEffect(() => {
    api.get<any[]>(`/admin/stats/revenue?period=${period}`).then(setRevenue).catch(console.error);
  }, [period]);

  // Fetch AI insights
  const fetchInsights = () => {
    setInsightsLoading(true);
    api.get<any>('/admin/ai/insights').then(setInsights).catch(console.error).finally(() => setInsightsLoading(false));
  };
  useEffect(() => { fetchInsights(); }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      api.get<any>('/admin/stats').then(setStats).catch(() => {});
      api.get<any>('/admin/executive-metrics').then(setExecutive).catch(() => {});
      api.get<any[]>('/admin/safety/alerts?status=active').then(setAlerts).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const healthColor = executive?.systemHealth === 'healthy' ? '#10B981' : executive?.systemHealth === 'degraded' ? '#F59E0B' : '#EF4444';

  return (
    <>
      <Header title="Executive Dashboard" subtitle="Real-time platform metrics from production data" />
      <div className="p-6 flex flex-col gap-6">
        <div className="flex justify-end">
          <button onClick={() => setShowWidgetPanel(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-400 hover:text-white">
            <LayoutGrid size={14} /> Customize Widgets
          </button>
        </div>

        {showWidgetPanel && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Dashboard Widgets</h3>
                <button onClick={() => setShowWidgetPanel(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              <WidgetReorderList widgets={widgets} onChange={saveWidgets} />
            </div>
          </div>
        )}

        {widgetOn('kpi_revenue') && (
        <div style={{ order: widgetOrder('kpi_revenue') }}>
        {/* Revenue & GMV */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Revenue Today" value={executive ? `$${executive.revenueToday?.toLocaleString()}` : '—'} icon={DollarSign} color="#8B5CF6" loading={loading} />
          <StatCard title="Revenue This Week" value={executive ? `$${Math.round(executive.revenueWeek)?.toLocaleString()}` : '—'} icon={DollarSign} color="#6366F1" loading={loading} change={executive?.revenueGrowthPct} />
          <StatCard title="Revenue This Month" value={executive ? `$${Math.round(executive.revenueMonth)?.toLocaleString()}` : '—'} icon={DollarSign} color="#3B82F6" loading={loading} />
          <StatCard title="GMV Today" value={executive ? `$${Math.round(executive.gmvToday)?.toLocaleString()}` : '—'} icon={TrendingUp} color="#10B981" loading={loading} />
        </div>
        </div>
        )}

        {widgetOn('kpi_rides') && (
        <div style={{ order: widgetOrder('kpi_rides') }}>
        {/* Marketplace */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Platform Take Rate" value={executive ? `${executive.platformTakeRate}%` : '—'} icon={Activity} color="#0EA5E9" loading={loading} />
          <StatCard title="Online Drivers" value={String(executive?.onlineDrivers ?? stats?.onlineDrivers ?? '—')} icon={Radio} color="#0EA5E9" loading={loading} />
          <StatCard title="Driver Utilization" value={executive ? `${executive.driverUtilization}%` : '—'} icon={Car} color="#F59E0B" loading={loading} />
          <StatCard title="Marketplace Fill Rate" value={executive ? `${executive.marketplaceFillRate}%` : '—'} icon={TrendingUp} color="#10B981" loading={loading} />
        </div>

        {/* Trips */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Trips Today" value={String(executive?.tripsToday ?? '—')} icon={Car} color="#3B82F6" loading={loading} />
          <StatCard title="In Progress" value={String(executive?.tripsInProgress ?? '—')} icon={Car} color="#10B981" loading={loading} />
          <StatCard title="Waiting for Driver" value={String(executive?.tripsWaitingForDriver ?? '—')} icon={Clock} color="#F59E0B" loading={loading} />
          <StatCard title="Completed Today" value={String(executive?.tripsCompletedToday ?? '—')} icon={CheckCircle2} color="#8B5CF6" loading={loading} />
        </div>

        {/* Users & engagement */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="DAU" value={String(executive?.dau ?? '—')} icon={Users} color="#3B82F6" loading={loading} />
          <StatCard title="WAU" value={String(executive?.wau ?? '—')} icon={Users} color="#6366F1" loading={loading} />
          <StatCard title="MAU" value={String(executive?.mau ?? '—')} icon={Users} color="#8B5CF6" loading={loading} change={executive?.userGrowthPct} />
          <StatCard title="Repeat Rider %" value={executive ? `${executive.repeatRiderPct}%` : '—'} icon={TrendingUp} color="#10B981" loading={loading} />
        </div>

        {/* Operations health */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Avg Wait Time" value={executive ? `${executive.averageWaitTimeMinutes} min` : '—'} icon={Clock} color="#F59E0B" loading={loading} />
          <StatCard title="Avg Ride Distance" value={executive ? `${executive.averageRideDistanceKm} km` : '—'} icon={Car} color="#0EA5E9" loading={loading} />
          <StatCard title="Support Tickets Open" value={String(executive?.supportTicketsOpen ?? '—')} icon={HeadphonesIcon} color="#F59E0B" loading={loading} />
          <StatCard title="System Health" value={executive?.systemHealth ?? '—'} icon={Shield} color={healthColor} loading={loading} />
        </div>

        {/* Legacy summary row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Users" value={stats?.totalUsers?.toLocaleString() ?? '—'} icon={Users} color="#64748B" loading={loading} />
          <StatCard title="Active Drivers" value={String(executive?.activeDrivers ?? stats?.totalDrivers ?? '—')} icon={Radio} color="#64748B" loading={loading} change={executive?.driverGrowthPct} />
          <StatCard title="Safety Incidents" value={String(executive?.safetyIncidents ?? stats?.pendingAlerts ?? '—')} icon={AlertTriangle} color="#EF4444" loading={loading} />
          <StatCard title="Fraud Alerts" value={String(executive?.fraudAlerts ?? '—')} icon={Shield} color="#EF4444" loading={loading} />
        </div>
        </div>
        )}

        {widgetOn('ai_insights') && (
        <div style={{ order: widgetOrder('ai_insights') }}>
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/20">
                <Brain size={16} className="text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">AI Insights</h2>
              {insights?.generatedAt && (
                <span className="text-xs text-slate-500">
                  · updated {new Date(insights.generatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <button
              onClick={fetchInsights}
              disabled={insightsLoading}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} className={insightsLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {insights?.metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Today's Rides", value: insights.metrics.todayRides },
                { label: 'Online Drivers', value: insights.metrics.onlineDrivers },
                { label: 'Cancel Rate', value: `${insights.metrics.cancellationRate}%` },
                { label: 'Daily Avg (7d)', value: insights.metrics.avgDailyRides },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-700/40 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs mb-1">{label}</p>
                  <p className="text-white font-bold">{value}</p>
                </div>
              ))}
            </div>
          )}

          {insightsLoading && !insights ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              Analyzing platform data…
            </div>
          ) : insights?.insights?.length > 0 ? (
            <div className="space-y-2">
              {insights.insights.map((ins: any, i: number) => {
                const sev = SEVERITY_STYLES[ins.severity] || SEVERITY_STYLES.info;
                return (
                  <div key={i} className={clsx('flex items-start gap-3 p-3 rounded-xl border', sev.bg, sev.border)}>
                    <span className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', sev.dot)} />
                    <div className="flex-1 min-w-0">
                      <p className={clsx('text-sm font-medium', sev.text)}>{ins.title}</p>
                      <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{ins.description}</p>
                    </div>
                    {ins.action && (
                      <button
                        onClick={() => navigate(ins.action)}
                        className="text-xs text-slate-400 hover:text-white flex-shrink-0 underline underline-offset-2"
                      >
                        View
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No insights available</p>
          )}
        </div>
        </div>
        )}

        {widgetOn('revenue_chart') && (
        <div style={{ order: widgetOrder('revenue_chart') }}>
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Revenue Overview</h2>
            <div className="flex bg-slate-700/50 rounded-lg p-0.5">
              {(['7d', '30d', '90d'] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={clsx('px-3 py-1 rounded-md text-sm font-medium transition-colors',
                    period === p ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenue}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#E2E8F0' }}
                  formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fill="url(#revGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-500">
              {loading ? <div className="animate-pulse">Loading chart data...</div> : 'No revenue data available'}
            </div>
          )}
        </div>
        </div>
        )}

        {(widgetOn('rides_pie') || widgetOn('activity_feed')) && (
        <div style={{ order: Math.min(widgetOrder('rides_pie'), widgetOrder('activity_feed')) }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rides by Status */}
          {widgetOn('rides_pie') && (
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Rides by Status</h2>
            {ridesByStatus.length > 0 ? (
              <div className="flex items-center">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={ridesByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                      {ridesByStatus.map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#E2E8F0' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {ridesByStatus.map((item: any, i: number) => (
                    <div key={item.status} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-slate-300 capitalize">{item.status.replace('_', ' ')}</span>
                      </div>
                      <span className="text-white font-medium">{item.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-500">
                {loading ? 'Loading...' : 'No ride data'}
              </div>
            )}
          </div>
          )}

          {/* Recent Activity */}
          {widgetOn('activity_feed') && (
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {activity.length > 0 ? activity.slice(0, 8).map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-700/30 transition-colors">
                  <div className={clsx('p-2 rounded-lg mt-0.5',
                    item.type === 'ride' ? 'bg-blue-500/20 text-blue-400' :
                    item.type === 'alert' ? 'bg-red-500/20 text-red-400' :
                    'bg-green-500/20 text-green-400'
                  )}>
                    {item.type === 'ride' ? <Car size={14} /> : item.type === 'alert' ? <AlertTriangle size={14} /> : <DollarSign size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{item.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                    </p>
                  </div>
                </div>
              )) : (
                <p className="text-slate-500 text-sm">{loading ? 'Loading...' : 'No recent activity'}</p>
              )}
            </div>
          </div>
          )}
        </div>
        )}

        {(widgetOn('top_drivers') || widgetOn('safety_alerts')) && (
        <div style={{ order: Math.min(widgetOrder('top_drivers'), widgetOrder('safety_alerts')) }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {widgetOn('top_drivers') && (
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Top Drivers</h2>
            <div className="space-y-3">
              {topDrivers.length > 0 ? topDrivers.slice(0, 5).map((driver: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-700/30 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-sm font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{driver.name}</p>
                    <p className="text-xs text-slate-400">{driver.totalRides} rides</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-400">${Number(driver.totalEarnings || 0).toLocaleString()}</p>
                    <div className="flex items-center gap-1 text-xs text-yellow-400">
                      <Star size={10} fill="currentColor" /> {Number(driver.averageRating || 0).toFixed(1)}
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-slate-500 text-sm">{loading ? 'Loading...' : 'No driver data'}</p>
              )}
            </div>
          </div>
          )}

          {widgetOn('safety_alerts') && (
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Active Alerts</h2>
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                {alerts.length} active
              </span>
            </div>
            <div className="space-y-3">
              {alerts.length > 0 ? alerts.slice(0, 5).map((alert: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <AlertTriangle size={18} className={alert.alertType === 'sos' ? 'text-red-400' : 'text-orange-400'} />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">
                      {alert.alertType === 'sos' ? 'SOS' : alert.alertType?.replace('_', ' ')} — {alert.userName || `User #${alert.userId}`}
                    </p>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={10} /> {new Date(alert.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => {
                    api.patch(`/admin/safety/alerts/${alert.id}`, { status: 'responded' }).then(() => {
                      setAlerts((prev) => prev.filter((a: any) => a.id !== alert.id));
                    });
                  }} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-colors">
                    Respond
                  </button>
                </div>
              )) : (
                <p className="text-slate-500 text-sm text-center py-4">
                  {loading ? 'Loading...' : 'No active alerts — all clear!'}
                </p>
              )}
            </div>
          </div>
          )}
        </div>
        )}
      </div>
    </>
  );
}
