import { useState, useEffect, useCallback } from 'react';
import { Search, Car, Clock, DollarSign, X, ChevronLeft, ChevronRight, Navigation, XCircle, Loader2, Trash2, CheckSquare, Square } from 'lucide-react';
import Header from '@/components/layout/Header';
import SavedFiltersBar from '@/components/SavedFiltersBar';
import ExportMenu from '@/components/ExportMenu';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

const statusColors: Record<string, string> = {
  searching: 'bg-yellow-500/20 text-yellow-400', matched: 'bg-blue-500/20 text-blue-400',
  driver_arrived: 'bg-teal-500/20 text-teal-400', in_progress: 'bg-green-500/20 text-green-400',
  completed: 'bg-slate-500/20 text-slate-400', cancelled: 'bg-red-500/20 text-red-400',
};
const statusTabs = ['All', 'Active', 'Completed', 'Cancelled'];
const CANCELABLE = ['searching', 'matched', 'driver_arrived', 'in_progress'];

export default function RidesPage() {
  const [rides, setRides] = useState<any[]>([]);
  const [activeRides, setActiveRides] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [modeFilter, setModeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedRide, setSelectedRide] = useState<any>(null);
  const [rideDetail, setRideDetail] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchRides = useCallback(() => {
    setLoading(true);
    const statusParam = statusFilter === 'Active' ? 'active' : statusFilter === 'Completed' ? 'completed' : statusFilter === 'Cancelled' ? 'cancelled' : '';
    api.get<any>(`/admin/rides?page=${page}&status=${statusParam}&mode=${modeFilter}&search=${encodeURIComponent(search)}`)
      .then((d) => { setRides(d.rides || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1); })
      .catch(console.error).finally(() => setLoading(false));
  }, [page, statusFilter, modeFilter, search]);

  useEffect(() => { fetchRides(); }, [fetchRides]);
  useEffect(() => { setSelected(new Set()); setPage(1); }, [statusFilter, modeFilter, search]);

  useEffect(() => {
    api.get<any[]>('/admin/rides/active').then(setActiveRides).catch(() => {});
    const interval = setInterval(() => {
      api.get<any[]>('/admin/rides/active').then(setActiveRides).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const openRideDetail = (rideId: number) => {
    api.get<any>(`/admin/rides/${rideId}`).then((d) => { setRideDetail(d); setSelectedRide(d); }).catch(console.error);
  };

  const cancelRide = (rideId: number) => {
    const reason = prompt('Cancel reason:');
    if (!reason) return;
    api.post(`/admin/rides/${rideId}/cancel`, { reason }).then(() => { fetchRides(); setSelectedRide(null); }).catch(console.error);
  };

  // Bulk helpers
  const toggleAll = () => {
    if (selected.size === rides.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rides.map((r) => r.id)));
    }
  };

  const toggleOne = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkCancel = async () => {
    const reason = prompt(`Cancel reason for ${selected.size} rides:`);
    if (!reason) return;
    setBulkLoading(true);
    try {
      await api.post('/admin/rides/bulk-cancel', { rideIds: Array.from(selected), reason });
      setSelected(new Set());
      fetchRides();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const allSelected = rides.length > 0 && selected.size === rides.length;
  const someSelected = selected.size > 0 && !allSelected;
  const cancelableSelected = rides.filter((r) => selected.has(r.id) && CANCELABLE.includes(r.status));

  return (
    <>
      <Header title="Ride Management" subtitle={`${total} total rides`} />
      <div className="p-6 space-y-4">

        {/* Active Rides Banner */}
        {activeRides.length > 0 && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-green-400 font-medium text-sm">{activeRides.length} Active Rides</span>
            </span>
            <div className="flex gap-2 ml-4 overflow-x-auto">
              {activeRides.slice(0, 6).map((r: any) => (
                <div key={r.id} onClick={() => openRideDetail(r.id)}
                  className="flex-shrink-0 bg-slate-800/50 rounded-lg px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-700/50">
                  <span className="text-white font-medium">{r.rideId}</span>
                  <span className={clsx('ml-2 px-1.5 py-0.5 rounded-full text-[10px]', statusColors[r.status])}>{r.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {statusTabs.map((tab) => (
              <button key={tab} onClick={() => { setStatusFilter(tab); setPage(1); }}
                className={clsx('px-3 py-2 rounded-md text-xs font-medium transition-colors', statusFilter === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                {tab}
              </button>
            ))}
          </div>
          <select value={modeFilter} onChange={(e) => { setModeFilter(e.target.value); setPage(1); }}
            className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500">
            <option value="all">All Modes</option>
            <option value="solo">Solo</option>
            <option value="share">Shared</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Ride ID..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500" />
          </div>
          <SavedFiltersBar
            pageKey="rides"
            currentFilters={{ status: statusFilter, mode: modeFilter, search }}
            onApply={(f) => {
              if (f.status != null) setStatusFilter(String(f.status));
              if (f.mode != null) setModeFilter(String(f.mode));
              if (f.search != null) setSearch(String(f.search));
            }}
          />
          <ExportMenu endpoint="/admin/export/rides" filename="rides" />
        </div>

        {/* Bulk Action Bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <span className="text-blue-400 text-sm font-medium">{selected.size} ride{selected.size !== 1 ? 's' : ''} selected</span>
            <div className="flex-1" />
            {cancelableSelected.length > 0 && (
              <button onClick={bulkCancel} disabled={bulkLoading}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                <Trash2 size={13} />
                {bulkLoading ? 'Cancelling…' : `Cancel ${cancelableSelected.length} Active`}
              </button>
            )}
            <button onClick={() => setSelected(new Set())}
              className="text-slate-400 hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-slate-700 transition-colors">
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleAll} className="text-slate-400 hover:text-white transition-colors">
                      {allSelected ? <CheckSquare size={16} className="text-blue-400" /> : someSelected ? <CheckSquare size={16} className="text-slate-500" /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Ride ID</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Driver</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Mode</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Route</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Fare</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Distance</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading rides...
                  </td></tr>
                ) : rides.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">No rides found</td></tr>
                ) : rides.map((ride: any) => (
                  <tr key={ride.id} onClick={() => openRideDetail(ride.id)}
                    className={clsx(
                      'border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors',
                      selected.has(ride.id) && 'bg-blue-500/5'
                    )}>
                    <td className="px-4 py-3" onClick={(e) => toggleOne(ride.id, e)}>
                      {selected.has(ride.id)
                        ? <CheckSquare size={16} className="text-blue-400" />
                        : <Square size={16} className="text-slate-600 hover:text-slate-400" />}
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-400 text-xs">{ride.rideId}</td>
                    <td className="px-4 py-3 text-white">{ride.driverName || `#${ride.driverId}`}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 text-xs rounded-full', ride.mode === 'share' ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-600/30 text-slate-300')}>
                        {ride.mode}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 text-xs rounded-full', statusColors[ride.status] || 'bg-slate-600/30 text-slate-300')}>
                        {ride.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-slate-300 truncate text-xs">{ride.pickupAddress}</p>
                      <p className="text-slate-500 truncate text-xs">→ {ride.dropoffAddress}</p>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">${ride.totalFare}</td>
                    <td className="px-4 py-3 text-slate-400">{ride.distanceKm} km</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(ride.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <p className="text-sm text-slate-400">Page {page} of {totalPages} ({total} total)</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm">{page}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* Ride Detail Modal */}
      {selectedRide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedRide(null)} />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Ride {selectedRide.rideId}</h2>
                  <span className={clsx('px-2 py-0.5 text-xs rounded-full mt-1 inline-block', statusColors[selectedRide.status])}>{selectedRide.status.replace('_', ' ')}</span>
                </div>
                <button onClick={() => setSelectedRide(null)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><X size={20} /></button>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-green-500 mt-1" /><div className="w-0.5 h-8 bg-slate-600" /><div className="w-3 h-3 rounded-full bg-red-500" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div><p className="text-xs text-slate-400">Pickup</p><p className="text-sm text-white">{selectedRide.pickupAddress}</p></div>
                    <div><p className="text-xs text-slate-400">Dropoff</p><p className="text-sm text-white">{selectedRide.dropoffAddress}</p></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: DollarSign, color: 'text-green-400', val: `$${selectedRide.totalFare}`, label: 'Total Fare' },
                  { icon: Navigation, color: 'text-blue-400', val: `${selectedRide.distanceKm} km`, label: 'Distance' },
                  { icon: Clock, color: 'text-violet-400', val: `${selectedRide.estimatedMinutes} min`, label: 'Duration' },
                  { icon: Car, color: 'text-yellow-400', val: `${selectedRide.surgeMultiplier}x`, label: 'Surge' },
                ].map((s, i) => (
                  <div key={i} className="bg-slate-800/50 rounded-xl p-3 text-center">
                    <s.icon size={16} className={`${s.color} mx-auto mb-1`} />
                    <p className="text-lg font-bold text-white">{s.val}</p>
                    <p className="text-xs text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>

              {rideDetail?.driver && (
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-2">Driver</p>
                  <p className="text-white font-medium">{rideDetail.driver.name || `Driver #${selectedRide.driverId}`}</p>
                </div>
              )}

              {rideDetail?.passengers?.length > 0 && (
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-2">Passengers ({rideDetail.passengers.length})</p>
                  {rideDetail.passengers.map((p: any) => (
                    <div key={p.id} className="text-sm text-slate-300">Passenger #{p.passengerId} — ${p.fareShare} ({p.status})</div>
                  ))}
                </div>
              )}

              {rideDetail?.payments?.length > 0 && (
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-2">Payments</p>
                  {rideDetail.payments.map((p: any) => (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span className="text-slate-300">{p.paymentId}</span>
                      <span className={p.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}>${p.amount} ({p.status})</span>
                    </div>
                  ))}
                </div>
              )}

              {CANCELABLE.includes(selectedRide.status) && (
                <button onClick={() => cancelRide(selectedRide.id)}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <XCircle size={16} /> Cancel Ride
                </button>
              )}

              {selectedRide.cancelReason && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-xs text-red-400">Cancel Reason: {selectedRide.cancelReason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
