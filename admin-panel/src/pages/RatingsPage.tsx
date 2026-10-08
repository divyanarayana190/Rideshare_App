import { useState, useEffect, useCallback } from 'react';
import { Star, AlertTriangle, Search, ChevronLeft, ChevronRight, Filter, MessageSquare } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface Rating {
  id: number;
  rideId?: number | string;
  raterId?: number;
  ratedUserId?: number;
  raterName?: string;
  ratedName?: string;
  ratingType: 'driver' | 'passenger' | string;
  score: number;
  comment?: string;
  reportedUnsafeBehavior?: boolean;
  createdAt?: string;
}

function StarRow({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={13}
          className={s <= score ? 'fill-yellow-400 text-yellow-400' : 'fill-slate-700 text-slate-700'}
        />
      ))}
    </span>
  );
}

const SCORE_COLORS: Record<number, string> = {
  1: 'text-red-400',
  2: 'text-orange-400',
  3: 'text-yellow-400',
  4: 'text-blue-400',
  5: 'text-green-400',
};

export default function RatingsPage() {
  const [rows, setRows] = useState<Rating[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [scoreFilter, setScoreFilter] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Rating | null>(null);

  const fetchRatings = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      ...(flaggedOnly ? { flagged: 'true' } : {}),
    });
    api.get<{ ratings: Rating[]; total: number; totalPages: number }>(`/admin/ratings?${params}`)
      .then((d) => {
        setRows(d.ratings || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, flaggedOnly]);

  useEffect(() => { fetchRatings(); }, [fetchRatings]);
  useEffect(() => { setPage(1); }, [flaggedOnly, scoreFilter]);

  const filtered = scoreFilter
    ? rows.filter((r) => r.score === scoreFilter)
    : search
    ? rows.filter(
        (r) =>
          r.raterName?.toLowerCase().includes(search.toLowerCase()) ||
          r.ratedName?.toLowerCase().includes(search.toLowerCase()) ||
          r.comment?.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  const flaggedCount = rows.filter((r) => r.reportedUnsafeBehavior).length;

  return (
    <>
      <Header title="Ratings & Reviews" subtitle={`${total} total ratings`} />
      <div className="p-6 space-y-4">

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Ratings', value: total, color: 'text-blue-400' },
            { label: 'Flagged / Unsafe', value: flaggedCount, color: 'text-red-400' },
            { label: 'Avg Score (page)', value: rows.length ? (rows.reduce((s, r) => s + (r.score || 0), 0) / rows.length).toFixed(2) : '—', color: 'text-yellow-400' },
            { label: 'With Comment', value: rows.filter((r) => r.comment).length, color: 'text-green-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className={clsx('text-xl font-bold', color)}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or comment…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => { setFlaggedOnly(!flaggedOnly); setPage(1); }}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
              flaggedOnly
                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            )}
          >
            <AlertTriangle size={14} />
            Flagged Only
          </button>

          <div className="flex items-center gap-1">
            <Filter size={14} className="text-slate-400" />
            {[null, 1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setScoreFilter(s)}
                className={clsx(
                  'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  scoreFilter === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                )}
              >
                {s === null ? 'All' : `${s}★`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Ride</th>
                <th className="px-4 py-3 text-left">From</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Score</th>
                <th className="px-4 py-3 text-left">Comment</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading ratings…</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    No ratings found
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={clsx(
                      'border-b border-slate-700/30 hover:bg-slate-700/30 cursor-pointer transition-colors',
                      r.reportedUnsafeBehavior && 'bg-red-500/5'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{r.rideId || `#${r.id}`}</td>
                    <td className="px-4 py-3 text-white">{r.raterName || `User ${r.raterId}`}</td>
                    <td className="px-4 py-3 text-slate-300">{r.ratedName || `User ${r.ratedUserId}`}</td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        r.ratingType === 'driver'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      )}>
                        {r.ratingType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StarRow score={r.score} />
                        <span className={clsx('text-xs font-bold', SCORE_COLORS[r.score])}>{r.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {r.comment ? (
                        <span className="text-slate-300 text-xs truncate block">{r.comment}</span>
                      ) : (
                        <span className="text-slate-600 text-xs italic">No comment</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.reportedUnsafeBehavior ? (
                        <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                          <AlertTriangle size={12} />
                          Unsafe
                        </span>
                      ) : (
                        <span className="text-green-400 text-xs">Normal</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
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
            <span className="text-sm text-slate-400">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail slide-over */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-md bg-slate-900 h-full overflow-y-auto p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Rating Detail</h2>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
            </div>

            {selected.reportedUnsafeBehavior && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
                <AlertTriangle size={16} />
                This rating flagged unsafe behavior
              </div>
            )}

            <div className="bg-slate-800 rounded-xl p-4 space-y-3 border border-slate-700/50">
              <div className="flex items-center gap-2">
                <StarRow score={selected.score} />
                <span className={clsx('font-bold', SCORE_COLORS[selected.score])}>{selected.score} / 5</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Ride ID', selected.rideId || `#${selected.id}`],
                  ['Type', selected.ratingType],
                  ['Reviewer', selected.raterName || `User ${selected.raterId}`],
                  ['Reviewed', selected.ratedName || `User ${selected.ratedUserId}`],
                  ['Date', selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs text-slate-500 mb-0.5">{k}</p>
                    <p className="text-white">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {selected.comment && (
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare size={14} className="text-slate-400" />
                  <span className="text-xs text-slate-400 uppercase tracking-wide">Comment</span>
                </div>
                <p className="text-slate-200 text-sm leading-relaxed">"{selected.comment}"</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
