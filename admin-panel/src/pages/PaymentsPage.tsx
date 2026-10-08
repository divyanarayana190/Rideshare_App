import { useState, useEffect, useCallback } from 'react';
import { DollarSign, RefreshCw, X, ChevronLeft, ChevronRight, Wallet, ArrowUpRight, Loader2, Download, Search } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

const methodBadge: Record<string, string> = {
  card: 'bg-blue-500/20 text-blue-400',
  wallet: 'bg-violet-500/20 text-violet-400',
  apple_pay: 'bg-slate-500/20 text-slate-300',
  google_pay: 'bg-green-500/20 text-green-400',
};

const statusBadge: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  failed: 'bg-red-500/20 text-red-400',
  refunded: 'bg-orange-500/20 text-orange-400',
};

const STATUS_FILTERS = ['all', 'completed', 'pending', 'failed', 'refunded'] as const;

export default function PaymentsPage() {
  const [tab, setTab] = useState<'payments' | 'transactions' | 'payouts'>('payments');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [refundModal, setRefundModal] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('Ride cancelled');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [payments, setPayments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payoutModal, setPayoutModal] = useState<any>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);

  useEffect(() => {
    api.get<any>('/admin/stats/payments').then(setStats).catch(() => {});
  }, []);

  const fetchPayments = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page) });
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    api.get<any>(`/admin/payments?${qs}`)
      .then(d => { setPayments(d.payments || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1); })
      .catch(console.error).finally(() => setLoading(false));
  }, [page, statusFilter]);

  const fetchTransactions = useCallback(() => {
    setLoading(true);
    api.get<any>(`/admin/transactions?page=${page}`)
      .then(d => { setTransactions(d.transactions || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1); })
      .catch(console.error).finally(() => setLoading(false));
  }, [page]);

  const fetchPayouts = useCallback(() => {
    setLoading(true);
    api.get<any[]>('/admin/drivers/payouts').then(d => setPayouts(d || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'payments') fetchPayments();
    else if (tab === 'transactions') fetchTransactions();
    else fetchPayouts();
  }, [tab, fetchPayments, fetchTransactions, fetchPayouts]);

  const processRefund = () => {
    if (!refundModal) return;
    api.post(`/admin/payments/${refundModal.id}/refund`, { amount: refundAmount, reason: refundReason })
      .then(() => { setRefundModal(null); fetchPayments(); api.get<any>('/admin/stats/payments').then(setStats).catch(() => {}); })
      .catch(console.error);
  };

  const triggerPayout = async () => {
    if (!payoutModal) return;
    const cents = Math.round(parseFloat(payoutAmount) * 100);
    if (isNaN(cents) || cents < 100) return;
    setPayoutSubmitting(true);
    try {
      await api.post(`/admin/drivers/${payoutModal.driverId}/payout`, { amountCents: cents });
      setPayoutModal(null);
      setPayoutAmount('');
      fetchPayouts();
    } catch (err: any) {
      alert(err.message || 'Payout failed');
    } finally { setPayoutSubmitting(false); }
  };

  const exportCsv = (type: string) => {
    const token = localStorage.getItem('admin_token');
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/admin/export/${type}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const u = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = u;
        link.download = `${type}_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(u);
      });
  };

  const filtered = search
    ? payments.filter(p => p.paymentId?.includes(search) || p.passengerName?.toLowerCase().includes(search.toLowerCase()))
    : payments;

  return (
    <>
      <Header title="Payments & Finance" subtitle="Financial management and payouts" />
      <div className="p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Revenue', value: stats ? `$${Number(stats.totalRevenue).toLocaleString()}` : '—', icon: DollarSign, color: '#10B981' },
            { label: 'Pending Payouts', value: stats ? `$${Number(stats.pendingPayouts).toLocaleString()}` : '—', icon: Wallet, color: '#F59E0B', sub: stats ? `${stats.pendingCount} pending` : '' },
            { label: 'Refunds', value: stats ? `$${Number(stats.refundsTotal).toLocaleString()}` : '—', icon: RefreshCw, color: '#EF4444', sub: stats ? `${stats.refundsCount} refunds` : '' },
            { label: 'Commission Earned', value: stats ? `$${Number(stats.commissionEarned).toLocaleString()}` : '—', icon: ArrowUpRight, color: '#8B5CF6', sub: stats ? `${stats.commissionPct}% rate` : '' },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-sm">{s.label}</p>
                  <p className="text-xl font-bold text-white mt-1">{s.value}</p>
                  {s.sub && <p className="text-xs text-slate-400 mt-1">{s.sub}</p>}
                </div>
                <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${s.color}20` }}>
                  <s.icon size={18} style={{ color: s.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {(['payments', 'transactions', 'payouts'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setPage(1); }}
                className={clsx('px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize', tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                {t}
              </button>
            ))}
          </div>
          {tab === 'payments' && (
            <button onClick={() => exportCsv('payments')}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors">
              <Download size={14} /> Export CSV
            </button>
          )}
          {tab === 'transactions' && (
            <button onClick={() => exportCsv('payments')}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors">
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>

        {/* Payments Tab */}
        {tab === 'payments' && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
                {STATUS_FILTERS.map(s => (
                  <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                    className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize', statusFilter === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ID or name..."
                  className="pl-8 pr-4 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 w-56" />
              </div>
            </div>

            <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      {['Payment ID', 'Passenger', 'Amount', 'Method', 'Status', 'Date', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        <Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading...
                      </td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No payments found</td></tr>
                    ) : filtered.map((p: any) => (
                      <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-blue-400">{p.paymentId}</td>
                        <td className="px-4 py-3 text-white">{p.passengerName || `User #${p.passengerId}`}</td>
                        <td className="px-4 py-3 text-white font-medium">${p.amount}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-0.5 text-xs rounded-full', methodBadge[p.paymentMethod] || 'bg-slate-600/30 text-slate-300')}>
                            {(p.paymentMethod || 'unknown').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-0.5 text-xs rounded-full', statusBadge[p.status] || 'bg-slate-600/30 text-slate-300')}>{p.status}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {p.status === 'completed' && (
                            <button onClick={() => { setRefundModal(p); setRefundAmount(p.amount); }}
                              className="px-3 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-lg hover:bg-orange-500/30 transition-colors">
                              Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loading && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                  <p className="text-sm text-slate-400">Page {page} of {totalPages} ({total} total)</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
                    <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm">{page}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {tab === 'transactions' && (
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    {['Transaction ID', 'User', 'Type', 'Amount', 'Description', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading...</td></tr>
                  ) : transactions.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No transactions found</td></tr>
                  ) : transactions.map((t: any) => (
                    <tr key={t.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-blue-400">{t.transactionId || `TXN-${t.id}`}</td>
                      <td className="px-4 py-3 text-white">{t.userName || `User #${t.userId}`}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('px-2 py-0.5 text-xs rounded-full capitalize',
                          t.type === 'credit' ? 'bg-green-500/20 text-green-400' : t.type === 'debit' ? 'bg-red-500/20 text-red-400' :
                          t.type === 'refund' ? 'bg-orange-500/20 text-orange-400' : 'bg-violet-500/20 text-violet-400')}>{t.type}</span>
                      </td>
                      <td className={clsx('px-4 py-3 font-medium', t.type === 'credit' || t.type === 'refund' ? 'text-green-400' : 'text-red-400')}>
                        {t.type === 'credit' || t.type === 'refund' ? '+' : '-'}${t.amount}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs max-w-[200px] truncate">{t.description}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{new Date(t.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
                <p className="text-sm text-slate-400">Page {page} of {totalPages}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
                  <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm">{page}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Payouts Tab */}
        {tab === 'payouts' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">{payouts.length} drivers with pending earnings</p>
            <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    {['Driver', 'Pending Earnings (85%)', 'Rides', 'Stripe Status', 'Action'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading...</td></tr>
                  ) : payouts.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No payout data</td></tr>
                  ) : payouts.map((d: any, i: number) => (
                    <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-white">{d.name}</td>
                      <td className="px-4 py-3 text-green-400 font-medium">${Number(d.pendingEarnings).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{d.rideCount}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('px-2 py-0.5 text-xs rounded-full', d.stripeConnected ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/30 text-slate-400')}>
                          {d.stripeConnected ? 'Connected' : 'Not connected'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {d.stripeConnected && (
                          <button onClick={() => { setPayoutModal(d); setPayoutAmount(String(d.pendingEarnings)); }}
                            className="px-3 py-1 bg-green-600/20 text-green-400 text-xs rounded-lg hover:bg-green-600/30 transition-colors">
                            Payout
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRefundModal(null)} />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Process Refund</h3>
              <button onClick={() => setRefundModal(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-400">Refunding payment {refundModal.paymentId} — ${refundModal.amount}</p>
            <div>
              <label className="text-sm text-slate-300 block mb-1">Amount</label>
              <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-sm text-slate-300 block mb-1">Reason</label>
              <select value={refundReason} onChange={e => setRefundReason(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500">
                <option>Ride cancelled</option><option>Service issue</option><option>Overcharge</option><option>Customer request</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRefundModal(null)} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Cancel</button>
              <button onClick={processRefund} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-medium transition-colors">Process Refund</button>
            </div>
          </div>
        </div>
      )}

      {/* Payout Modal */}
      {payoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPayoutModal(null)} />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Trigger Driver Payout</h3>
              <button onClick={() => setPayoutModal(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-400">Send Stripe transfer to <span className="text-white font-medium">{payoutModal.name}</span></p>
            <div>
              <label className="text-sm text-slate-300 block mb-1">Amount ($)</label>
              <input type="number" step="0.01" min="1" value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPayoutModal(null)} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Cancel</button>
              <button onClick={triggerPayout} disabled={payoutSubmitting}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {payoutSubmitting && <Loader2 size={14} className="animate-spin" />} Send Payout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
