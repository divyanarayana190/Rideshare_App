import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Clock, TrendingUp, UserCheck } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface JourneyEvent {
  timestamp: string;
  type: string;
  details: string;
  metadata: Record<string, any>;
}

interface CohortWeek {
  week: string;
  cohortSize: number;
  retention: number[];
}

interface LtvSegment {
  segment: 'champions' | 'regular' | 'occasional' | 'at_risk';
  count: number;
  avgLtv: number;
  avgRides: number;
}

const SEGMENT_STYLES: Record<string, { cls: string; desc: string }> = {
  champions:  { cls: 'border-cyan-500/30 bg-cyan-500/10',   desc: 'High LTV, frequent riders' },
  regular:    { cls: 'border-green-500/30 bg-green-500/10', desc: 'Consistent, reliable users' },
  occasional: { cls: 'border-yellow-500/30 bg-yellow-500/10', desc: 'Infrequent but active' },
  at_risk:    { cls: 'border-red-500/30 bg-red-500/10',     desc: 'Haven\'t ridden recently' },
};

const EVENT_ICONS: Record<string, string> = {
  signup: '👤', first_ride: '🚗', payment: '💳', rating: '⭐',
  cancellation: '❌', promo_used: '🎁', support_ticket: '🎫',
};

export default function UserIntelligencePage() {
  const [userId, setUserId] = useState('');
  const [searchId, setSearchId] = useState<number | null>(null);

  const { data: journey = [], isLoading: journeyLoading } = useQuery<JourneyEvent[]>({
    queryKey: ['user-journey', searchId],
    queryFn: () => api.get(`/admin/user-journey/${searchId}`),
    enabled: !!searchId,
  });

  const { data: cohortData = [], isLoading: cohortLoading } = useQuery<CohortWeek[]>({
    queryKey: ['cohort-retention'],
    queryFn: () => api.get('/admin/cohort-retention'),
    staleTime: 300_000,
  });

  const { data: ltvSegments = [], isLoading: ltvLoading } = useQuery<LtvSegment[]>({
    queryKey: ['ltv-segments'],
    queryFn: () => api.get('/admin/ltv-segments'),
    staleTime: 300_000,
  });

  const totalUsers = ltvSegments.reduce((s, seg) => s + seg.count, 0);
  const avgLtv = ltvSegments.length > 0
    ? ltvSegments.reduce((s, seg) => s + seg.avgLtv * seg.count, 0) / Math.max(totalUsers, 1)
    : 0;

  // Build retention chart data from cohort
  const retentionChartData = cohortData.slice(0, 4).map(c => ({
    week: c.week,
    ...c.retention.reduce((acc, r, i) => ({ ...acc, [`W${i}`]: r }), {}),
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users size={24} className="text-purple-400" /> User Intelligence
        </h1>
        <p className="text-sm text-slate-400 mt-1">Journey replay, cohort retention, and LTV segmentation</p>
      </div>

      {/* LTV Segments */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {ltvLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-800 rounded-xl border border-slate-700/50 p-4 animate-pulse h-28" />
          ))
        ) : ltvSegments.map(seg => {
          const style = SEGMENT_STYLES[seg.segment] ?? SEGMENT_STYLES.regular;
          return (
            <div key={seg.segment} className={clsx('rounded-xl border p-4', style.cls)}>
              <p className="text-xs text-slate-400 capitalize">{seg.segment.replace('_', ' ')}</p>
              <p className="text-2xl font-bold text-white mt-1">{seg.count.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">{style.desc}</p>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-slate-300">Avg LTV: <strong className="text-green-400">${(seg.avgLtv / 100).toFixed(0)}</strong></span>
                <span className="text-slate-300">{seg.avgRides.toFixed(1)} rides</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Journey Replay */}
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock size={14} className="text-blue-400" /> User Journey Replay
            </h3>
            <div className="flex gap-2 mt-3">
              <input
                value={userId}
                onChange={e => setUserId(e.target.value)}
                placeholder="Enter User ID"
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => setSearchId(parseInt(userId) || null)}
                disabled={!userId}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm transition-colors"
              >
                <Search size={14} />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {journeyLoading ? (
              <div className="p-8 text-center text-slate-500">Loading…</div>
            ) : !searchId ? (
              <div className="p-8 text-center text-slate-500">Enter a user ID to see their journey</div>
            ) : journey.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No events found for user {searchId}</div>
            ) : (
              <div className="relative">
                <div className="absolute left-8 top-0 bottom-0 w-px bg-slate-700" />
                <div className="space-y-0">
                  {journey.map((event, i) => (
                    <div key={i} className="flex gap-4 px-5 py-3 hover:bg-slate-700/30 transition-colors">
                      <div className="relative z-10 w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sm shrink-0">
                        {EVENT_ICONS[event.type] ?? '📍'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white capitalize">{event.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-400">{event.details}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{new Date(event.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cohort Retention */}
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-green-400" /> 8-Week Cohort Retention
          </h3>
          {cohortLoading ? (
            <div className="text-center py-8 text-slate-500">Loading…</div>
          ) : cohortData.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No cohort data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={retentionChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(v: number) => [`${v}%`]}
                  />
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Line key={i} type="monotone" dataKey={`W${i}`} name={`Week ${i}`}
                      stroke={`hsl(${210 + i * 15}, 70%, 60%)`} strokeWidth={1.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-slate-400 py-1 pr-3">Cohort</th>
                      <th className="text-right text-slate-400 py-1 pr-2">Size</th>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <th key={i} className="text-right text-slate-400 py-1 px-1">W{i}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohortData.map((row, i) => (
                      <tr key={i} className="border-t border-slate-700/30">
                        <td className="text-slate-300 py-1 pr-3 whitespace-nowrap">{row.week}</td>
                        <td className="text-right text-slate-400 py-1 pr-2">{row.cohortSize}</td>
                        {Array.from({ length: 8 }).map((_, j) => {
                          const v = row.retention[j];
                          return (
                            <td key={j} className={clsx('text-right py-1 px-1 font-medium',
                              v == null ? 'text-slate-600' :
                              v >= 60 ? 'text-green-400' :
                              v >= 30 ? 'text-yellow-400' : 'text-red-400'
                            )}>
                              {v != null ? `${v}%` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400 mb-1">Total Segmented Users</p>
          <p className="text-2xl font-bold text-white">{totalUsers.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
          <p className="text-xs text-slate-400 mb-1">Average LTV</p>
          <p className="text-2xl font-bold text-green-400">${(avgLtv / 100).toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
