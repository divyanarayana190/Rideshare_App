import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Car, Star, DollarSign, ChevronLeft, ChevronRight,
  Wifi, WifiOff, Ban, CheckCircle, X, Download, AlertCircle, FileWarning, ExternalLink,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface DriverSession {
  status: string;
  todayRides?: number;
  todayEarnings?: number | string;
  acceptanceRate?: number;
  lastSeenAt?: string;
}

interface Driver {
  id: number;
  name?: string;
  email?: string;
  phoneNumber?: string;
  vehicleType?: string;
  vehicleColor?: string;
  licensePlate?: string;
  averageRating?: number | string;
  totalRides?: number;
  totalEarnings?: number | string;
  isBanned?: boolean;
  createdAt?: string;
  session?: DriverSession;
}

const STATUS_TABS = ['All', 'Online', 'Offline', 'Banned'];

function sessionBadge(driver: Driver) {
  const status = driver.session?.status;
  if (!status) return <span className="text-slate-500 text-xs">Offline</span>;
  const map: Record<string, { label: string; cls: string }> = {
    online: { label: 'Online', cls: 'bg-green-500/20 text-green-400' },
    on_ride: { label: 'On Ride', cls: 'bg-blue-500/20 text-blue-400' },
    offline: { label: 'Offline', cls: 'bg-slate-600/40 text-slate-400' },
  };
  const cfg = map[status] || { label: status, cls: 'bg-slate-600/40 text-slate-400' };
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

export default function DriversPage() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('All');
  const [university, setUniversity] = useState('');
  const [selected, setSelected] = useState<Driver | null>(null);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);

  const { data: universities = [] } = useQuery<Array<{ domain: string; name: string }>>({
    queryKey: ['universities'],
    queryFn: () => api.get('/admin/universities'),
    staleTime: 300_000,
  });

  const { data: expiringDocs = [] } = useQuery<Array<{ driverId: number; documentType: string; status: string }>>({
    queryKey: ['expiring-docs'],
    queryFn: () => api.get('/admin/drivers/documents/expiring?withinDays=30'),
    staleTime: 120_000,
  });

  const fetchDrivers = useCallback(() => {
    setLoading(true);
    const statusParam = tab === 'Online' ? 'online' : tab === 'Banned' ? 'banned' : tab === 'Offline' ? 'offline' : 'all';
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      status: statusParam,
      ...(search ? { search } : {}),
      ...(university ? { university } : {}),
    });
    api.get<{ drivers: Driver[]; total: number; totalPages: number }>(`/admin/drivers?${params}`)
      .then((d) => {
        setDrivers(d.drivers || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, tab, search, university]);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);
  useEffect(() => { setPage(1); }, [tab, search, university]);

  const handleSuspend = async (driverId: number, action: 'suspend' | 'activate') => {
    const reason = action === 'suspend' ? prompt('Suspension reason:') : null;
    if (action === 'suspend' && !reason) return;
    setSuspendLoading(true);
    try {
      await api.patch(`/admin/drivers/${driverId}/status`, { action, reason });
      fetchDrivers();
      if (selected?.id === driverId) setSelected(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSuspendLoading(false);
    }
  };

  const handlePayout = async () => {
    const cents = Math.round(parseFloat(payoutAmount) * 100);
    if (!cents || cents < 100) { setPayoutError('Minimum payout is $1.00'); return; }
    setPayoutLoading(true);
    setPayoutError('');
    try {
      await api.post(`/admin/drivers/${selected.id}/payout`, { amountCents: cents });
      setPayoutOpen(false);
      setPayoutAmount('');
      alert('Payout initiated successfully');
    } catch (e: any) {
      setPayoutError(e.message);
    } finally {
      setPayoutLoading(false);
    }
  };

  const exportCSV = () => {
    const token = localStorage.getItem('admin_token');
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/admin/export/users?role=driver`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drivers_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const onlineCount = drivers.filter((d) => d.session?.status === 'online' || d.session?.status === 'on_ride').length;
  const bannedCount = drivers.filter((d) => d.isBanned).length;
  const avgRating = drivers.length ? (drivers.reduce((s, d) => s + (parseFloat(d.averageRating) || 0), 0) / drivers.length).toFixed(2) : '—';

  return (
    <>
      <Header title="Driver Management" subtitle={`${total} total drivers`} />
      <div className="p-6 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Drivers', value: total, color: 'text-blue-400', icon: Car },
            { label: 'Online Now', value: onlineCount, color: 'text-green-400', icon: Wifi },
            { label: 'Avg Rating', value: avgRating, color: 'text-yellow-400', icon: Star },
            { label: 'Suspended', value: bannedCount, color: 'text-red-400', icon: Ban },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={color} />
                <p className="text-xs text-slate-400">{label}</p>
              </div>
              <p className={clsx('text-xl font-bold', color)}>{value}</p>
            </div>
          ))}
        </div>

        {/* Document expiry alert */}
        {expiringDocs.length > 0 && (
          <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3">
            <FileWarning size={18} className="text-orange-400 flex-shrink-0" />
            <p className="text-sm text-orange-300 flex-1">
              {expiringDocs.length} document{expiringDocs.length !== 1 ? 's' : ''} expiring within 30 days across the fleet
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white min-w-[160px]"
          >
            <option value="">All universities</option>
            {universities.map((u) => (
              <option key={u.domain} value={u.domain}>{u.name}</option>
            ))}
          </select>

          <div className="flex gap-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  tab === t ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-left">Vehicle</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Rating</th>
                <th className="px-4 py-3 text-left">Rides</th>
                <th className="px-4 py-3 text-left">Earnings</th>
                <th className="px-4 py-3 text-left">Today</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading drivers…</span>
                    </div>
                  </td>
                </tr>
              ) : drivers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">No drivers found</td>
                </tr>
              ) : (
                drivers.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelected(d)}
                    className={clsx(
                      'border-b border-slate-700/30 hover:bg-slate-700/30 cursor-pointer transition-colors',
                      d.isBanned && 'opacity-60'
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold', d.isBanned ? 'bg-red-700 text-white' : 'bg-blue-600 text-white')}>
                          {d.name?.[0] || '?'}
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{d.name}</p>
                          <p className="text-slate-400 text-xs">{d.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-300 text-xs capitalize">{d.vehicleType || '—'}</p>
                      <p className="text-slate-500 text-xs">{d.licensePlate || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      {d.isBanned ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Suspended</span>
                      ) : (
                        sessionBadge(d)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Star size={12} className="fill-yellow-400 text-yellow-400" />
                        <span className="text-white text-xs">{parseFloat(d.averageRating || 0).toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{d.totalRides || 0}</td>
                    <td className="px-4 py-3 text-green-400 text-xs">${parseFloat(d.totalEarnings || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {d.session ? (
                        <div>
                          <p className="text-white text-xs">{d.session.todayRides || 0} rides</p>
                          <p className="text-green-400 text-xs">${parseFloat(d.session.todayEarnings || 0).toFixed(2)}</p>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/drivers/${d.id}`)}
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                        >
                          <ExternalLink size={14} />
                          View
                        </button>
                        {d.isBanned ? (
                        <button
                          onClick={() => handleSuspend(d.id, 'activate')}
                          disabled={suspendLoading}
                          className="flex items-center gap-1 text-green-400 hover:text-green-300 text-xs"
                        >
                          <CheckCircle size={14} />
                          Activate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSuspend(d.id, 'suspend')}
                          disabled={suspendLoading}
                          className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs"
                        >
                          <Ban size={14} />
                          Suspend
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Page {page} of {totalPages} · {total} total</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Driver detail panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={() => { setSelected(null); setPayoutOpen(false); }}>
          <div className="w-full max-w-md bg-slate-900 h-full overflow-y-auto p-6 space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Driver Detail</h2>
              <button onClick={() => { setSelected(null); setPayoutOpen(false); }} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {selected.isBanned && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
                <Ban size={16} />
                Account suspended
              </div>
            )}

            {/* Profile */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 space-y-3">
              <div className="flex items-center gap-3">
                <div className={clsx('w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold', selected.isBanned ? 'bg-red-700 text-white' : 'bg-blue-600 text-white')}>
                  {selected.name?.[0] || '?'}
                </div>
                <div>
                  <p className="text-white font-semibold">{selected.name}</p>
                  <p className="text-slate-400 text-sm">{selected.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Phone', selected.phoneNumber || '—'],
                  ['Vehicle', selected.vehicleType || '—'],
                  ['Color', selected.vehicleColor || '—'],
                  ['Plate', selected.licensePlate || '—'],
                  ['Rating', `${parseFloat(selected.averageRating || 0).toFixed(2)} ★`],
                  ['Total Rides', selected.totalRides || 0],
                  ['Total Earnings', `$${parseFloat(selected.totalEarnings || 0).toFixed(2)}`],
                  ['Joined', selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs text-slate-500 mb-0.5">{k}</p>
                    <p className="text-white">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Session */}
            {selected.session && (
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Live Session</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Status', selected.session.status],
                    ['Today Rides', selected.session.todayRides || 0],
                    ['Today Earnings', `$${parseFloat(selected.session.todayEarnings || 0).toFixed(2)}`],
                    ['Acceptance Rate', `${Math.round((selected.session.acceptanceRate || 0) * 100)}%`],
                    ['Last Seen', selected.session.lastSeenAt ? new Date(selected.session.lastSeenAt).toLocaleTimeString() : '—'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-slate-500 mb-0.5">{k}</p>
                      <p className="text-white capitalize">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {selected.isBanned ? (
                <button
                  onClick={() => handleSuspend(selected.id, 'activate')}
                  disabled={suspendLoading}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium text-sm transition-colors"
                >
                  <CheckCircle size={16} />
                  Activate Driver
                </button>
              ) : (
                <button
                  onClick={() => handleSuspend(selected.id, 'suspend')}
                  disabled={suspendLoading}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-colors"
                >
                  <Ban size={16} />
                  Suspend Driver
                </button>
              )}

              <button
                onClick={() => { setPayoutOpen(true); setPayoutError(''); setPayoutAmount(''); }}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors"
              >
                <DollarSign size={16} />
                Initiate Payout
              </button>
            </div>

            {/* Payout form */}
            {payoutOpen && (
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 space-y-3">
                <p className="text-sm font-medium text-white">Payout Amount (USD)</p>
                {payoutError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-2">
                    <AlertCircle size={14} />
                    {payoutError}
                  </div>
                )}
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="e.g. 25.00"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handlePayout}
                    disabled={payoutLoading}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {payoutLoading ? 'Processing…' : 'Confirm Payout'}
                  </button>
                  <button
                    onClick={() => setPayoutOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
