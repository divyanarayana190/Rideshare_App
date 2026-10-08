import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign, TrendingUp, TrendingDown, CreditCard, AlertCircle,
  Download, Calendar,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface PnL {
  grossBookings: number;
  platformRevenue: number;
  driverPayouts: number;
  promoSpend: number;
  stripeFees: number;
  netRevenue: number;
  takeRate: number;
  margin: number;
  chart: { date: string; gross: number; net: number; payouts: number }[];
}

interface Chargeback {
  id: number;
  amount: number;
  currency: string;
  status: string;
  userId: number;
  userName: string;
  createdAt: string;
}

const PERIODS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
];

function fmt(dollars: number) {
  return `$${Number(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(v: number) { return `${v.toFixed(1)}%`; }

export default function FinancePage() {
  const [days, setDays] = useState('30');

  const { data: pnl, isLoading: pnlLoading } = useQuery<PnL>({
    queryKey: ['pnl', days],
    queryFn: () => api.get(`/admin/pnl?days=${days}`),
    staleTime: 60_000,
  });

  const { data: chargebacks = [], isLoading: cbLoading } = useQuery<Chargeback[]>({
    queryKey: ['chargebacks'],
    queryFn: () => api.get('/admin/chargebacks'),
  });

  const exportCSV = async () => {
    const token = localStorage.getItem('admin_token');
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const res = await fetch(`${base}/admin/export/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'payments.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const metrics = pnl ? [
    { label: 'Gross Bookings',    value: fmt(pnl.grossBookings),    icon: DollarSign,   cls: 'text-blue-400' },
    { label: 'Platform Revenue',  value: fmt(pnl.platformRevenue),  icon: TrendingUp,   cls: 'text-green-400' },
    { label: 'Driver Payouts',    value: fmt(pnl.driverPayouts),    icon: TrendingDown, cls: 'text-orange-400' },
    { label: 'Promo Spend',       value: fmt(pnl.promoSpend),       icon: CreditCard,   cls: 'text-purple-400' },
    { label: 'Stripe Fees',       value: fmt(pnl.stripeFees),       icon: CreditCard,   cls: 'text-slate-400' },
    { label: 'Net Revenue',       value: fmt(pnl.netRevenue),       icon: TrendingUp,   cls: 'text-emerald-400' },
    { label: 'Take Rate',         value: pct(pnl.takeRate),         icon: TrendingUp,   cls: 'text-cyan-400' },
    { label: 'Net Margin',        value: pct(pnl.margin),           icon: TrendingUp,   cls: pnl.margin >= 0 ? 'text-green-400' : 'text-red-400' },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <DollarSign size={24} className="text-green-400" /> Finance & Revenue
          </h1>
          <p className="text-sm text-slate-400 mt-1">P&L, take rate, margins, and chargebacks</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700/50">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  days === p.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-300 px-3 py-2 rounded-lg text-sm transition-colors"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      {pnlLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400">{m.label}</p>
                  <Icon size={14} className={m.cls} />
                </div>
                <p className={clsx('text-xl font-bold', m.cls)}>{m.value}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Revenue Chart */}
      {pnl?.chart && pnl.chart.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700/50">
          <p className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-blue-400" /> Revenue Over Time
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={pnl.chart}>
              <defs>
                <linearGradient id="gross" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="net" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${Number(v).toFixed(0)}`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`]}
              />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
              <Area type="monotone" dataKey="gross" name="Gross" stroke="#3b82f6" fill="url(#gross)" strokeWidth={2} />
              <Area type="monotone" dataKey="net"   name="Net Revenue" stroke="#10b981" fill="url(#net)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payouts Bar Chart */}
      {pnl?.chart && pnl.chart.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700/50">
          <p className="text-sm font-semibold text-white mb-4">Revenue vs Driver Payouts</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pnl.chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${Number(v).toFixed(0)}`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`]}
              />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
              <Bar dataKey="gross"   name="Gross Bookings" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="payouts" name="Driver Payouts"  fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chargebacks */}
      <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
          <AlertCircle size={16} className="text-red-400" />
          <h3 className="text-sm font-semibold text-white">Chargebacks & Disputes</h3>
          <span className="ml-auto text-xs text-slate-400">{chargebacks.length} dispute(s)</span>
        </div>
        {cbLoading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : chargebacks.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No chargebacks found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['User', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chargebacks.map(cb => (
                <tr key={cb.id} className="border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 text-white">{cb.userName}</td>
                  <td className="px-5 py-3 text-red-400 font-semibold">{fmt(cb.amount)}</td>
                  <td className="px-5 py-3">
                    <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">{cb.status}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{new Date(cb.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
