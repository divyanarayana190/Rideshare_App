import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldOff, Search, AlertTriangle, CheckCircle2, XCircle, ArrowUpRight,
  RefreshCw, Filter, TrendingUp,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { api } from '@/lib/api';
import { IfRole } from '@/components/RequireRole';
import { clsx } from 'clsx';

interface FraudFlag {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  flagType: string;
  score: number;
  details: Record<string, any>;
  status: 'pending' | 'reviewed' | 'blocked' | 'cleared';
  reviewedBy: string | null;
  createdAt: string;
}

interface Pattern {
  type: string;
  userId: number;
  userName: string;
  details: string;
  count: number;
}

const FLAG_COLORS: Record<string, string> = {
  high_cancellation_rate: 'text-orange-400',
  gps_anomaly: 'text-red-400',
  immediate_promo_use: 'text-yellow-400',
  account_sharing: 'text-purple-400',
  payment_fraud: 'text-red-400',
};

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  reviewed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  blocked:  'bg-red-500/20 text-red-400 border-red-500/30',
  cleared:  'bg-green-500/20 text-green-400 border-green-500/30',
};

export default function FraudPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [scanning, setScanning] = useState(false);
  const [showDetails, setShowDetails] = useState<FraudFlag | null>(null);

  const { data, isLoading } = useQuery<{ flags: FraudFlag[]; total: number }>({
    queryKey: ['fraud-flags', page, statusFilter],
    queryFn: () => api.get(`/admin/fraud-flags?page=${page}&status=${statusFilter}`),
    refetchInterval: 60_000,
  });

  const { data: intelligence } = useQuery<any>({
    queryKey: ['fraud-intelligence'],
    queryFn: () => api.get('/admin/fraud/intelligence'),
    refetchInterval: 60_000,
  });

  const { data: patternData } = useQuery<{ patterns: Pattern[] }>({
    queryKey: ['fraud-patterns'],
    queryFn: () => api.get('/admin/pattern-detection'),
    staleTime: 120_000,
  });
  const patterns = patternData?.patterns ?? [];

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'block' | 'allow' | 'escalate' }) =>
      api.patch(`/admin/fraud-flags/${id}/review`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fraud-flags'] });
      setShowDetails(null);
    },
  });

  const runScan = async () => {
    setScanning(true);
    try {
      await api.post('/admin/fraud-flags/scan', {});
      qc.invalidateQueries({ queryKey: ['fraud-flags'] });
    } finally {
      setScanning(false);
    }
  };

  const flags = data?.flags ?? [];
  const total = data?.total ?? 0;

  const pending = flags.filter(f => f.status === 'pending').length;
  const blocked = flags.filter(f => f.status === 'blocked').length;
  const avgScore = flags.length > 0 ? flags.reduce((s, f) => s + f.score, 0) / flags.length : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldOff size={24} className="text-red-400" /> Fraud Intelligence Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">Risk scores, pattern detection, and fraud trends from production data</p>
        </div>
        <IfRole role="admin">
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanning…' : 'Run Scan'}
          </button>
        </IfRole>
      </div>

      {/* Intelligence summary */}
      {intelligence && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Open Flags', value: intelligence.summary.openFlags, cls: 'text-yellow-400' },
              { label: 'Blocked Accounts', value: intelligence.summary.blockedAccounts, cls: 'text-red-400' },
              { label: 'Wallet Abuse Flags', value: intelligence.summary.openAbuseFlags, cls: 'text-orange-400' },
              { label: 'Avg Flag Score', value: intelligence.summary.avgFlagScore, cls: 'text-white' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className={clsx('text-2xl font-bold mt-1', s.cls)}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {intelligence.trend?.length > 0 && (
              <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5">
                <p className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><TrendingUp size={14} /> Fraud Trend (30d)</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={intelligence.trend}>
                    <XAxis dataKey="date" stroke="#64748B" fontSize={10} />
                    <YAxis stroke="#64748B" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: 8 }} />
                    <Area type="monotone" dataKey="count" stroke="#EF4444" fill="#EF444422" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {intelligence.flagsByType?.length > 0 && (
              <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5">
                <p className="text-sm font-semibold text-white mb-3">Flags by Type</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={intelligence.flagsByType.slice(0, 6)}>
                    <XAxis dataKey="type" stroke="#64748B" fontSize={9} tickFormatter={(v) => v.replace(/_/g, ' ').slice(0, 12)} />
                    <YAxis stroke="#64748B" fontSize={10} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#F97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {intelligence.topRiskUsers?.length > 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5">
              <p className="text-sm font-semibold text-white mb-3">Top Risk Users (computed score 0–100)</p>
              <div className="space-y-2">
                {intelligence.topRiskUsers.map((u: any) => (
                  <div key={u.userId} className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30">
                    <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold',
                      u.score >= 75 ? 'bg-red-500/30 text-red-400' : u.score >= 50 ? 'bg-orange-500/30 text-orange-400' : 'bg-yellow-500/30 text-yellow-400')}>
                      {u.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{u.userName || `User #${u.userId}`}</p>
                      <p className="text-xs text-slate-400 truncate">{u.explanations?.[0]}</p>
                    </div>
                    <span className="text-xs capitalize text-slate-500">{u.riskLevel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Stats row (current page flags) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Flags', value: total, cls: 'text-white' },
          { label: 'Pending Review', value: pending, cls: 'text-yellow-400' },
          { label: 'Blocked', value: blocked, cls: 'text-red-400' },
          { label: 'Avg Risk Score', value: avgScore.toFixed(1), cls: 'text-orange-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={clsx('text-2xl font-bold mt-1', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pattern Detection */}
      {patterns.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5">
          <p className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <Search size={14} className="text-yellow-400" /> Detected Patterns
          </p>
          <div className="space-y-2">
            {patterns.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-700/30 last:border-0">
                <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-orange-400">{p.type.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-400 ml-2">{p.userName}</span>
                  <p className="text-xs text-slate-500 truncate">{p.description || (p as any).details}</p>
                </div>
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{p.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flags Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-3">
          <Filter size={14} className="text-slate-400" />
          <div className="flex gap-1">
            {['pending', 'reviewed', 'blocked', 'cleared', 'all'].map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s === 'all' ? '' : s); setPage(1); }}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  statusFilter === (s === 'all' ? '' : s)
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : flags.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No fraud flags</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['User', 'Flag Type', 'Risk Score', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flags.map(flag => (
                <tr key={flag.id} className="border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-white font-medium">{flag.userName}</p>
                    <p className="text-xs text-slate-400">{flag.userEmail}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={clsx('text-xs font-semibold', FLAG_COLORS[flag.flagType] ?? 'text-slate-300')}>
                      {flag.flagType.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-1.5 w-16">
                        <div
                          className={clsx('h-1.5 rounded-full', flag.score >= 70 ? 'bg-red-500' : flag.score >= 40 ? 'bg-yellow-500' : 'bg-green-500')}
                          style={{ width: `${Math.min(flag.score, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-white">{flag.score}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full border', STATUS_STYLES[flag.status])}>
                      {flag.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{new Date(flag.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <IfRole role="admin">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => reviewMutation.mutate({ id: flag.id, action: 'allow' })}
                          className="p-1 text-slate-400 hover:text-green-400 transition-colors"
                          title="Clear"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <button
                          onClick={() => reviewMutation.mutate({ id: flag.id, action: 'block' })}
                          className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                          title="Block"
                        >
                          <XCircle size={14} />
                        </button>
                        <button
                          onClick={() => setShowDetails(flag)}
                          className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                          title="Details"
                        >
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </IfRole>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > 20 && (
          <div className="px-5 py-3 border-t border-slate-700/50 flex items-center gap-3 text-sm">
            <span className="text-slate-400">Page {page}</span>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="text-blue-400 disabled:opacity-30">Prev</button>
            <button disabled={flags.length < 20} onClick={() => setPage(p => p + 1)} className="text-blue-400 disabled:opacity-30">Next</button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Flag Details</h2>
              <button onClick={() => setShowDetails(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">User</span><span className="text-white">{showDetails.userName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Type</span><span className="text-orange-400">{showDetails.flagType}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Risk Score</span><span className="text-red-400 font-bold">{showDetails.score}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Status</span><span className={clsx('px-2 py-0.5 rounded-full text-xs border', STATUS_STYLES[showDetails.status])}>{showDetails.status}</span></div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">Evidence</p>
              <pre className="bg-slate-700 rounded-lg p-3 text-xs text-slate-300 overflow-auto max-h-40">
                {JSON.stringify(showDetails.details, null, 2)}
              </pre>
            </div>
            <IfRole role="admin">
              <div className="flex gap-2 pt-2">
                <button onClick={() => reviewMutation.mutate({ id: showDetails.id, action: 'allow' })} className="flex-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 py-2 rounded-lg text-sm border border-green-500/30 transition-colors">
                  Clear
                </button>
                <button onClick={() => reviewMutation.mutate({ id: showDetails.id, action: 'block' })} className="flex-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 py-2 rounded-lg text-sm border border-red-500/30 transition-colors">
                  Block
                </button>
                <button onClick={() => reviewMutation.mutate({ id: showDetails.id, action: 'escalate' })} className="flex-1 bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 py-2 rounded-lg text-sm border border-orange-500/30 transition-colors">
                  Escalate
                </button>
              </div>
            </IfRole>
          </div>
        </div>
      )}
    </div>
  );
}
