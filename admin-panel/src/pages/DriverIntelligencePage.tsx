import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Truck, TrendingDown, Award, AlertTriangle, Users, X,
} from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface Scorecard {
  driverId: number;
  name: string;
  compositeScore: number;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze';
  metrics: {
    acceptanceRate: number;
    completionRate: number;
    avgRating: number;
    cancellationRate: number;
    onTimeRate: number;
    totalRides: number;
  };
}

interface ChurnRisk {
  driverId: number;
  name: string;
  riskScore: number;
  riskLevel: 'high' | 'medium' | 'low';
  lastActive: string;
  avgRidesPerWeek: number;
  trend: 'declining' | 'stable' | 'growing';
}

interface FunnelStep {
  step: string;
  count: number;
  dropoffRate: number;
}

const TIER_COLORS: Record<string, string> = {
  platinum: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
  gold:     'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
  silver:   'text-slate-300 bg-slate-500/20 border-slate-500/30',
  bronze:   'text-orange-400 bg-orange-500/20 border-orange-500/30',
};

const RISK_COLORS: Record<string, string> = {
  high:   'text-red-400 bg-red-500/20 border-red-500/30',
  medium: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
  low:    'text-green-400 bg-green-500/20 border-green-500/30',
};

export default function DriverIntelligencePage() {
  const { data: scorecards = [], isLoading: scLoading } = useQuery<Scorecard[]>({
    queryKey: ['driver-scorecards'],
    queryFn: () => api.get('/admin/driver-scorecard'),
    staleTime: 120_000,
  });

  const { data: churnRisks = [], isLoading: chLoading } = useQuery<ChurnRisk[]>({
    queryKey: ['driver-churn'],
    queryFn: () => api.get('/admin/driver-churn'),
    staleTime: 120_000,
  });

  const { data: funnel = [], isLoading: fnLoading } = useQuery<FunnelStep[]>({
    queryKey: ['driver-onboarding-funnel'],
    queryFn: () => api.get('/admin/driver-onboarding-funnel'),
    staleTime: 300_000,
  });

  const [selected, setSelected] = useState<Scorecard | null>(null);

  const tierCounts = scorecards.reduce((acc, s) => {
    acc[s.tier] = (acc[s.tier] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const highRisk = churnRisks.filter(c => c.riskLevel === 'high').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Truck size={24} className="text-blue-400" /> Driver Intelligence
        </h1>
        <p className="text-sm text-slate-400 mt-1">Scorecards, churn prediction, and onboarding analytics</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400">Total Drivers</p>
          <p className="text-2xl font-bold text-white mt-1">{scorecards.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400">Platinum Drivers</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">{tierCounts.platinum ?? 0}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400">Churn Risk (High)</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{highRisk}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400">Avg Score</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {scorecards.length > 0 ? (scorecards.reduce((s, d) => s + d.compositeScore, 0) / scorecards.length).toFixed(1) : 'N/A'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scorecards */}
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <Award size={16} className="text-yellow-400" />
            <h3 className="text-sm font-semibold text-white">Driver Scorecards</h3>
          </div>
          {scLoading ? (
            <div className="p-8 text-center text-slate-500">Loading…</div>
          ) : scorecards.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No data</div>
          ) : (
            <div className="divide-y divide-slate-700/30 max-h-80 overflow-y-auto">
              {scorecards.map(sc => (
                <div key={sc.driverId} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-700/30 transition-colors cursor-pointer" onClick={() => setSelected(sc)}>
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 text-sm font-bold">
                    {sc.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{sc.name}</p>
                    <p className="text-xs text-slate-400">{sc.metrics.totalRides} rides</p>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full border', TIER_COLORS[sc.tier])}>{sc.tier}</span>
                  <span className="text-sm font-bold text-white w-10 text-right">{sc.compositeScore}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Churn Risk */}
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <TrendingDown size={16} className="text-red-400" />
            <h3 className="text-sm font-semibold text-white">Churn Risk</h3>
          </div>
          {chLoading ? (
            <div className="p-8 text-center text-slate-500">Loading…</div>
          ) : churnRisks.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No at-risk drivers</div>
          ) : (
            <div className="divide-y divide-slate-700/30 max-h-80 overflow-y-auto">
              {churnRisks.map(c => (
                <div key={c.driverId} className="flex items-center gap-3 px-5 py-3">
                  <AlertTriangle size={14} className={c.riskLevel === 'high' ? 'text-red-400' : c.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-slate-400">
                      {c.avgRidesPerWeek.toFixed(1)} rides/wk · last active {new Date(c.lastActive).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full border', RISK_COLORS[c.riskLevel])}>{c.riskLevel}</span>
                    <span className="text-xs text-white font-semibold w-6">{c.riskScore}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Onboarding Funnel */}
      <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5">
        <p className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <Users size={14} className="text-green-400" /> Onboarding Funnel
        </p>
        {fnLoading ? (
          <div className="text-center py-8 text-slate-500">Loading…</div>
        ) : funnel.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No data</div>
        ) : (
          <div className="space-y-3">
            {funnel.map((step, i) => {
              const pct = funnel[0] ? Math.round((step.count / funnel[0].count) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-slate-400 text-right shrink-0">{step.step.replace(/_/g, ' ')}</div>
                  <div className="flex-1 bg-slate-700 rounded-full h-5 relative overflow-hidden">
                    <div
                      className="h-5 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium">
                      {step.count}
                    </span>
                  </div>
                  <div className="w-12 text-xs text-slate-400 shrink-0">{pct}%</div>
                  {step.dropoffRate > 0 && (
                    <div className="text-xs text-red-400 w-20 shrink-0">-{step.dropoffRate.toFixed(1)}%</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Score Radar */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{selected.name}</h2>
              <div className="flex items-center gap-2">
                <span className={clsx('text-xs px-2 py-1 rounded-full border', TIER_COLORS[selected.tier])}>{selected.tier}</span>
                <button onClick={() => setSelected(null)} className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={[
                { metric: 'Acceptance', value: selected.metrics.acceptanceRate },
                { metric: 'Completion', value: selected.metrics.completionRate },
                { metric: 'Rating', value: selected.metrics.avgRating * 20 },
                { metric: 'On Time', value: selected.metrics.onTimeRate },
                { metric: 'Low Cancel', value: 100 - selected.metrics.cancellationRate },
              ]}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Radar name={selected.name} dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
              {[
                ['Composite Score', selected.compositeScore],
                ['Total Rides', selected.metrics.totalRides],
                ['Avg Rating', selected.metrics.avgRating.toFixed(2)],
                ['Acceptance Rate', `${selected.metrics.acceptanceRate.toFixed(1)}%`],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between bg-slate-700 rounded px-3 py-1.5">
                  <span className="text-slate-400">{k}</span>
                  <span className="text-white font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
