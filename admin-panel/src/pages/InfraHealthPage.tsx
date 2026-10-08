import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, CheckCircle2, AlertTriangle, RefreshCw, Server, Database,
  Radio, Cpu, Bell, Zap, Globe, DollarSign, TrendingUp, Shield,
  Wifi, WifiOff, Layers,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';
import { useAdminSocket } from '@/hooks/useAdminSocket';

type InfraPayload = Awaited<ReturnType<typeof api.get<any>>>;

const STATUS_COLORS: Record<string, string> = {
  healthy: 'text-green-400 bg-green-500/10 border-green-500/30',
  warning: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  partial_degradation: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  major_outage: 'text-red-400 bg-red-500/10 border-red-500/30',
  critical_failure: 'text-red-500 bg-red-500/20 border-red-500/40',
  degraded: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  down: 'text-red-400 bg-red-500/10 border-red-500/30',
  unknown: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const TABS = ['Overview', 'Infrastructure', 'Realtime', 'Alerts & Forecast'] as const;

function Metric({ label, value, sub, alert }: { label: string; value: string | number; sub?: string; alert?: boolean }) {
  return (
    <div className={clsx('bg-slate-800/80 rounded-xl p-4 border', alert ? 'border-red-500/40' : 'border-slate-700/50')}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={clsx('text-xl font-bold', alert ? 'text-red-400' : 'text-white')}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<any>; children: React.ReactNode }) {
  return (
    <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-2">
        <Icon size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ServiceRow({ name, status, latencyMs, message }: { name: string; status: string; latencyMs: number | null; message: string | null }) {
  return (
    <div className={clsx('flex items-center justify-between p-3 rounded-lg border mb-2', STATUS_COLORS[status] ?? STATUS_COLORS.unknown)}>
      <div>
        <p className="text-sm font-medium text-white">{name}</p>
        {message && <p className="text-xs opacity-80 mt-0.5">{message}</p>}
      </div>
      <div className="text-right">
        <p className="text-xs capitalize font-medium">{status}</p>
        {latencyMs != null && <p className="text-xs opacity-70">{latencyMs}ms</p>}
      </div>
    </div>
  );
}

export default function InfraHealthPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const { connected: wsConnected, infraLive } = useAdminSocket();

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useQuery<InfraPayload>({
    queryKey: ['infra-health'],
    queryFn: () => api.get('/admin/infra-health'),
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  const ops = infraLive?.operations ?? data?.operations;
  const system = infraLive?.system ?? data?.system;
  const score = system?.healthScore ?? 0;
  const status = system?.status ?? data?.overallStatus ?? 'unknown';
  const statusCls = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;

  return (
    <>
      <Header
        title="Infrastructure Command Center"
        subtitle="Real-time production telemetry — auto-refresh every 10s"
      />
      <div className="p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {wsConnected ? (
              <span className="flex items-center gap-1 text-green-400"><Wifi size={14} /> Live WS</span>
            ) : (
              <span className="flex items-center gap-1 text-slate-500"><WifiOff size={14} /> WS offline</span>
            )}
            {dataUpdatedAt > 0 && (
              <span className="text-slate-500">· REST {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
            )}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* System Health Banner */}
        {!isLoading && data && (
          <div className={clsx('rounded-xl border p-5 flex flex-wrap items-center gap-6', statusCls)}>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80 mb-1">System Status</p>
              <p className="text-2xl font-bold capitalize">{system?.label ?? status.replace(/_/g, ' ')}</p>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex justify-between text-xs mb-1">
                <span>Health Score</span>
                <span className="font-bold">{score}/100</span>
              </div>
              <div className="h-3 bg-black/20 rounded-full overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all',
                    score >= 90 ? 'bg-green-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500')}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
            <div className="text-sm">
              <p>{system?.servicesHealthy ?? 0}/{system?.servicesTotal ?? 0} services healthy</p>
              <p className="text-xs opacity-70 mt-1">Queue: {data.matching?.matchingQueueSize ?? 0} · API p95: {data.api?.p95Ms ?? 0}ms</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg w-fit">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx('px-4 py-2 rounded-md text-sm font-medium transition-colors',
                tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}
            >
              {t}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-slate-500">Unable to load infrastructure data.</p>
        ) : (
          <>
            {tab === 'Overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <Metric label="Live Trips" value={ops?.liveTrips ?? '—'} />
                  <Metric label="Live Drivers" value={ops?.liveDrivers ?? '—'} />
                  <Metric label="Live Riders" value={ops?.liveRiders ?? '—'} />
                  <Metric label="Matching Queue" value={ops?.activeMatchingRequests ?? '—'} />
                  <Metric label="Safety Incidents" value={ops?.openSafetyIncidents ?? 0} alert={(ops?.openSafetyIncidents ?? 0) > 0} />
                  <Metric label="Fraud Alerts" value={ops?.openFraudAlerts ?? 0} alert={(ops?.openFraudAlerts ?? 0) > 0} />
                  <Metric label="Support Tickets" value={ops?.openSupportTickets ?? 0} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Metric label="Cost / Ride" value={`$${((data.costs?.costPerRideCents ?? data.costPerRide ?? 0) / 100).toFixed(4)}`} />
                  <Metric label="Daily Cost (est.)" value={`$${((data.costs?.dailyCostCents ?? data.estimatedDailyCost ?? 0) / 100).toFixed(2)}`} />
                  <Metric label="Rides Today" value={data.costs?.ridesToday ?? data.ridesLast24h ?? 0} />
                </div>

                <Section title="Cost Breakdown (Today, estimated from ride volume)" icon={DollarSign}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(data.costs?.breakdown ?? {}).map(([k, v]) => (
                      <Metric key={k} label={k.replace(/([A-Z])/g, ' $1')} value={`$${(Number(v) / 100).toFixed(2)}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3">Weekly est. ${((data.costs?.weeklyCostCents ?? 0) / 100).toFixed(0)} · Monthly est. ${((data.costs?.monthlyCostCents ?? 0) / 100).toFixed(0)}</p>
                </Section>

                {data.regional?.length > 0 && (
                  <Section title="Regional Health (last hour)" icon={Globe}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-700">
                            <th className="text-left py-2">Region (lat,lng)</th>
                            <th className="text-right py-2">Trips</th>
                            <th className="text-right py-2">Cancelled</th>
                            <th className="text-right py-2">Health</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.regional.map((r: any) => (
                            <tr key={r.region} className="border-b border-slate-800">
                              <td className="py-2 text-slate-300">{r.region}</td>
                              <td className="py-2 text-right text-white">{r.tripsLastHour}</td>
                              <td className="py-2 text-right text-slate-400">{r.cancelled}</td>
                              <td className={clsx('py-2 text-right capitalize', r.health === 'healthy' ? 'text-green-400' : 'text-yellow-400')}>{r.health}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                )}
              </div>
            )}

            {tab === 'Infrastructure' && (
              <div className="space-y-6">
                <Section title="Railway / Runtime" icon={Server}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric label="Uptime" value={`${Math.floor((data.railway?.serverUptimeSeconds ?? 0) / 3600)}h ${Math.floor(((data.railway?.serverUptimeSeconds ?? 0) % 3600) / 60)}m`} />
                    <Metric label="Version" value={data.railway?.currentVersion ?? '—'} />
                    <Metric label="Memory (heap)" value={`${data.railway?.memoryUsageMb ?? 0} MB`} />
                    <Metric label="RSS" value={`${data.railway?.rssMb ?? 0} MB`} />
                    <Metric label="Environment" value={data.railway?.railwayEnvironment ?? data.railway?.environment ?? '—'} />
                    <Metric label="Env Validation" value={data.railway?.envValidation?.status ?? '—'} alert={!data.railway?.envValidation?.valid} />
                    <Metric label="Hostname" value={data.railway?.hostname ?? '—'} sub={data.railway?.nodeVersion} />
                    <Metric label="Started" value={data.railway?.lastSuccessfulDeployment ? new Date(data.railway.lastSuccessfulDeployment).toLocaleString() : '—'} />
                  </div>
                </Section>

                <Section title="Redis Health Center" icon={Zap}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <Metric label="Ping" value={data.redis?.pingMs != null ? `${data.redis.pingMs}ms` : data.redis?.responseTimeMs != null ? `${data.redis.responseTimeMs}ms` : '—'} alert={!data.redis?.connected} />
                    <Metric label="Connected" value={data.redis?.connected ? 'Yes' : 'No'} alert={!data.redis?.connected} />
                    <Metric label="Memory Used" value={data.redis?.memoryUsedMb != null ? `${data.redis.memoryUsedMb} MB` : '—'} />
                    <Metric label="Connected Clients" value={data.redis?.connectedClients ?? '—'} />
                    <Metric label="Cache Hit Rate" value={data.redis?.cacheHitRate != null ? `${data.redis.cacheHitRate}%` : '—'} sub={data.redis?.cacheHits != null ? `${data.redis.cacheHits.toLocaleString()} hits` : undefined} />
                    <Metric label="Cache Miss Rate" value={data.redis?.cacheMissRate != null ? `${data.redis.cacheMissRate}%` : '—'} sub={data.redis?.cacheMisses != null ? `${data.redis.cacheMisses.toLocaleString()} misses` : undefined} />
                    <Metric label="Key Count" value={data.redis?.keysCount ?? '—'} />
                    <Metric label="Uptime" value={data.redis?.uptimeSeconds != null ? `${Math.floor(data.redis.uptimeSeconds / 3600)}h ${Math.floor((data.redis.uptimeSeconds % 3600) / 60)}m` : '—'} />
                    <Metric label="Queue Backlog" value={data.redis?.queueBacklog ?? '—'} alert={(data.redis?.queueBacklog ?? 0) > 50} />
                    <Metric label="Memory Peak" value={data.redis?.memoryPeakMb != null ? `${data.redis.memoryPeakMb} MB` : '—'} />
                    <Metric label="Evictions" value={data.redis?.evictedKeys ?? '—'} />
                    <Metric label="Blocked Clients" value={data.redis?.blockedClients ?? '—'} />
                  </div>
                  {data.redis?.config && (
                    <p className="text-xs text-slate-500 mb-2 font-mono">
                      REDIS_URL: {data.redis.config.configuredViaEnv ? 'env' : 'fallback'} → {data.redis.config.connectionTarget}
                    </p>
                  )}
                  {(data.redis?.alerts ?? []).map((a: any, i: number) => (
                    <p key={i} className={clsx('text-xs px-3 py-2 rounded-lg mb-1', a.level === 'critical' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400')}>
                      {a.message}
                    </p>
                  ))}
                </Section>

                <Section title="Database Health" icon={Database}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric label="Pool Usage" value={`${data.database?.poolUsagePct ?? 0}%`} alert={(data.database?.poolUsagePct ?? 0) > 80} />
                    <Metric label="Active Connections" value={data.database?.activeConnections ?? '—'} />
                    <Metric label="Queued Requests" value={data.database?.queuedRequests ?? 0} alert={(data.database?.queuedRequests ?? 0) > 10} />
                    <Metric label="Query Latency" value={`${data.database?.queryLatencyMs ?? 0}ms`} />
                    <Metric label="DB Size" value={data.database?.dbSizeMb != null ? `${data.database.dbSizeMb} MB` : '—'} />
                    <Metric label="Tables" value={data.database?.tableCount ?? '—'} />
                    <Metric label="Index Issues" value={data.database?.indexHealthIssues ?? 0} alert={(data.database?.indexHealthIssues ?? 0) > 0} />
                  </div>
                </Section>

                <Section title="Third-Party Services" icon={Layers}>
                  {(data.thirdParty?.services ?? data.services ?? []).map((s: any) => (
                    <ServiceRow key={s.name} name={s.name} status={s.status} latencyMs={s.latencyMs} message={s.message} />
                  ))}
                </Section>

                <Section title="API Performance" icon={Activity}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <Metric label="Avg Response" value={`${data.api?.avgMs ?? 0}ms`} />
                    <Metric label="P95" value={`${data.api?.p95Ms ?? 0}ms`} />
                    <Metric label="P99" value={`${data.api?.p99Ms ?? 0}ms`} />
                    <Metric label="Req/min" value={data.api?.requestsPerMinute ?? 0} />
                    <Metric label="Error Rate" value={`${data.api?.errorRate ?? 0}%`} alert={(data.api?.errorRate ?? 0) > 5} />
                    <Metric label="Success Rate" value={`${data.api?.successRate ?? 100}%`} />
                    <Metric label="Timeouts" value={data.api?.timeouts ?? 0} />
                  </div>
                  {(data.api?.byRoute ?? []).length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-700">
                          <th className="text-left py-2">Route</th>
                          <th className="text-right py-2">RPM</th>
                          <th className="text-right py-2">Avg</th>
                          <th className="text-right py-2">P95</th>
                          <th className="text-right py-2">Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.api.byRoute.map((r: any) => (
                          <tr key={r.route} className="border-b border-slate-800">
                            <td className="py-2 text-slate-300 font-mono text-xs">{r.route}</td>
                            <td className="py-2 text-right text-white">{r.requestsPerMinute}</td>
                            <td className="py-2 text-right">{r.avgMs}ms</td>
                            <td className={clsx('py-2 text-right', r.p95Ms > 500 ? 'text-red-400' : 'text-slate-300')}>{r.p95Ms}ms</td>
                            <td className="py-2 text-right text-slate-400">{r.errorRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Section>
              </div>
            )}

            {tab === 'Realtime' && (
              <div className="space-y-6">
                <Section title="Socket.IO Monitoring" icon={Radio}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric label="Total Sockets" value={data.socket?.totalActiveSockets ?? 0} />
                    <Metric label="Drivers (sessions)" value={data.socket?.connectedDrivers ?? 0} />
                    <Metric label="Passengers (est.)" value={data.socket?.connectedPassengers ?? 0} />
                    <Metric label="Admin Sockets" value={data.socket?.connectedAdmins ?? 0} />
                    <Metric label="Events / min" value={data.socket?.eventsPerMinute ?? 0} />
                    <Metric label="Messages / min" value={data.socket?.messagesPerMinute ?? 0} />
                    <Metric label="Reconnects" value={data.socket?.reconnectCount ?? 0} />
                    <Metric label="Dropped" value={data.socket?.droppedConnections ?? 0} alert={(data.socket?.droppedConnections ?? 0) > 10} />
                  </div>
                  <div className="mt-4">
                    <p className="text-xs text-slate-400 mb-2">Top Socket Events</p>
                    <div className="flex flex-wrap gap-2">
                      {(data.socket?.labeledEvents ?? []).map((e: any) => (
                        <span key={e.event} className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-300">
                          {e.event}: <span className="text-white font-medium">{e.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </Section>

                <Section title="Driver Matching Engine" icon={Cpu}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <Metric label="Pending Requests" value={data.matching?.pendingRideRequests ?? 0} />
                    <Metric label="Queue Size" value={data.matching?.matchingQueueSize ?? 0} />
                    <Metric label="Avg Match Time" value={`${data.matching?.avgMatchTimeSeconds ?? 0}s`} />
                    <Metric label="Success Rate" value={`${data.matching?.matchSuccessRate ?? 0}%`} />
                    <Metric label="Fill Rate" value={`${data.matching?.rideFillRate ?? 0}%`} />
                    <Metric label="Success (1h)" value={data.matching?.successfulMatchesHour ?? 0} />
                    <Metric label="Failed (1h)" value={data.matching?.failedMatchesHour ?? 0} />
                  </div>
                  <p className="text-xs text-slate-400 mb-2">Breakdown (searching)</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {Object.entries(data.matching?.breakdown ?? {}).map(([k, v]) => (
                      <Metric key={k} label={k.replace(/([A-Z])/g, ' $1')} value={Number(v)} />
                    ))}
                  </div>
                  {(data.matching?.bottlenecks ?? []).length > 0 && (
                    <div className="mt-3 space-y-1">
                      {data.matching.bottlenecks.map((b: string) => (
                        <p key={b} className="text-xs text-yellow-400 flex items-center gap-1"><AlertTriangle size={12} /> {b}</p>
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Notification Center" icon={Bell}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Metric label="Sent Today" value={data.notifications?.sentToday ?? 0} />
                    <Metric label="Push Tokens" value={data.notifications?.pushTokensRegistered ?? 0} />
                    <Metric label="In-App Unread" value={data.notifications?.inAppUnread ?? 0} />
                    <Metric label="Expo Push (tokens)" value={data.notifications?.breakdown?.expoPush ?? 0} />
                  </div>
                </Section>
              </div>
            )}

            {tab === 'Alerts & Forecast' && (
              <div className="space-y-6">
                <Section title="Operational Alerts Feed" icon={Shield}>
                  {(data.alerts?.active ?? []).length === 0 ? (
                    <p className="text-slate-500 text-sm flex items-center gap-2"><CheckCircle2 size={16} className="text-green-400" /> No active system alerts</p>
                  ) : (
                    <div className="space-y-2">
                      {data.alerts.active.map((a: any) => (
                        <div key={a.id} className={clsx('p-3 rounded-lg border', STATUS_COLORS[a.severity] ?? STATUS_COLORS.warning)}>
                          <p className="text-sm font-medium">{a.message}</p>
                          <p className="text-xs opacity-70 mt-1">{a.metric} · {a.severity} · {new Date(a.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Service Dependency Graph" icon={Layers}>
                  <div className="flex flex-wrap gap-3">
                    {(data.thirdParty?.dependencyGraph ?? []).map((n: any) => (
                      <div key={n.id} className={clsx('px-4 py-3 rounded-xl border min-w-[140px]', STATUS_COLORS[n.status] ?? STATUS_COLORS.unknown)}>
                        <p className="text-sm font-semibold">{n.id}</p>
                        <p className="text-xs capitalize mt-1">{n.status}</p>
                        {n.latencyMs != null && <p className="text-xs opacity-70">{n.latencyMs}ms</p>}
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Capacity & Demand Forecast" icon={TrendingUp}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    <Metric label="Demand Forecast (this hour)" value={`${data.forecasting?.demandForecastTrips ?? 0} trips`} sub="7-day avg same hour" />
                    <Metric label="Driver Supply" value={data.forecasting?.driverSupplyForecast ?? 0} />
                    <Metric label="Capacity Utilization" value={`${data.forecasting?.capacityUtilization ?? 0}%`} />
                  </div>
                  {(data.forecasting?.predictiveWarnings ?? []).map((w: string) => (
                    <p key={w} className="text-xs text-yellow-400 flex items-center gap-1 mb-1"><AlertTriangle size={12} /> {w}</p>
                  ))}
                </Section>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
