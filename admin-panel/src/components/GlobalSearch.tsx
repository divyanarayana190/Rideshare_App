import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Car, CreditCard, X, Command } from 'lucide-react';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface SearchResult {
  users: any[];
  rides: any[];
  payments: any[];
}

export function GlobalSearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors"
    >
      <Search size={14} />
      <span className="hidden sm:inline">Search…</span>
      <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-slate-500 bg-slate-700 rounded px-1.5 py-0.5">
        <Command size={10} />K
      </kbd>
    </button>
  );
}

export default function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>({ users: [], rides: [], payments: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(
    (() => {
      let timer: ReturnType<typeof setTimeout>;
      return (q: string) => {
        clearTimeout(timer);
        if (!q || q.length < 2) {
          setResults({ users: [], rides: [], payments: [] });
          return;
        }
        timer = setTimeout(() => {
          setLoading(true);
          api.get<SearchResult>(`/admin/search?q=${encodeURIComponent(q)}`)
            .then(setResults)
            .catch(console.error)
            .finally(() => setLoading(false));
        }, 250);
      };
    })(),
    []
  );

  useEffect(() => { search(query); setActiveIndex(0); }, [query]);

  const allItems = [
    ...results.users.map((u) => ({ type: 'user', id: u.id, label: u.name, sub: u.email, path: '/users' })),
    ...results.rides.map((r) => ({ type: 'ride', id: r.id, label: r.rideId, sub: `${r.status} · $${r.totalFare}`, path: '/rides' })),
    ...results.payments.map((p) => ({ type: 'payment', id: p.id, label: p.paymentId, sub: `$${p.amount} · ${p.status}`, path: '/payments' })),
  ];

  const handleSelect = (item: (typeof allItems)[number]) => {
    navigate(item.path);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, allItems.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && allItems[activeIndex]) handleSelect(allItems[activeIndex]);
  };

  const typeIcon = (type: string) => {
    if (type === 'user') return <Users size={14} className="text-blue-400" />;
    if (type === 'ride') return <Car size={14} className="text-green-400" />;
    return <CreditCard size={14} className="text-purple-400" />;
  };

  const typeBadge = (type: string) => {
    const map: Record<string, string> = { user: 'User', ride: 'Ride', payment: 'Payment' };
    const colors: Record<string, string> = {
      user: 'bg-blue-500/20 text-blue-400',
      ride: 'bg-green-500/20 text-green-400',
      payment: 'bg-purple-500/20 text-purple-400',
    };
    return (
      <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', colors[type])}>
        {map[type]}
      </span>
    );
  };

  const hasResults = allItems.length > 0;

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-700/50">
          <Search size={18} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search users, rides, payments…"
            className="flex-1 bg-transparent text-white text-sm placeholder:text-slate-500 focus:outline-none"
          />
          {loading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {!query || query.length < 2 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <Search size={24} className="mx-auto mb-2 opacity-40" />
              <p>Type at least 2 characters to search</p>
              <p className="text-xs mt-1 text-slate-600">Searches users, ride IDs, payment IDs</p>
            </div>
          ) : !hasResults && !loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <p>No results for "<span className="text-slate-400">{query}</span>"</p>
            </div>
          ) : (
            <>
              {results.users.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] text-slate-500 uppercase tracking-widest font-medium bg-slate-800/50 border-b border-slate-700/30">
                    Users
                  </div>
                  {results.users.map((u, i) => {
                    const globalIdx = i;
                    return (
                      <button
                        key={u.id}
                        onClick={() => handleSelect({ type: 'user', id: u.id, label: u.name, sub: u.email, path: '/users' })}
                        className={clsx(
                          'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800 transition-colors border-b border-slate-700/20',
                          activeIndex === globalIdx && 'bg-slate-800'
                        )}
                      >
                        {typeIcon('user')}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">{u.name}</p>
                          <p className="text-slate-400 text-xs truncate">{u.email}</p>
                        </div>
                        {typeBadge('user')}
                      </button>
                    );
                  })}
                </div>
              )}

              {results.rides.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] text-slate-500 uppercase tracking-widest font-medium bg-slate-800/50 border-b border-slate-700/30">
                    Rides
                  </div>
                  {results.rides.map((r, i) => {
                    const globalIdx = results.users.length + i;
                    return (
                      <button
                        key={r.id}
                        onClick={() => handleSelect({ type: 'ride', id: r.id, label: r.rideId, sub: `${r.status} · $${r.totalFare}`, path: '/rides' })}
                        className={clsx(
                          'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800 transition-colors border-b border-slate-700/20',
                          activeIndex === globalIdx && 'bg-slate-800'
                        )}
                      >
                        {typeIcon('ride')}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-mono truncate">{r.rideId}</p>
                          <p className="text-slate-400 text-xs truncate capitalize">{r.status?.replace('_', ' ')} · ${r.totalFare}</p>
                        </div>
                        {typeBadge('ride')}
                      </button>
                    );
                  })}
                </div>
              )}

              {results.payments.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] text-slate-500 uppercase tracking-widest font-medium bg-slate-800/50 border-b border-slate-700/30">
                    Payments
                  </div>
                  {results.payments.map((p, i) => {
                    const globalIdx = results.users.length + results.rides.length + i;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleSelect({ type: 'payment', id: p.id, label: p.paymentId, sub: `$${p.amount} · ${p.status}`, path: '/payments' })}
                        className={clsx(
                          'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800 transition-colors border-b border-slate-700/20',
                          activeIndex === globalIdx && 'bg-slate-800'
                        )}
                      >
                        {typeIcon('payment')}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-mono truncate">{p.paymentId}</p>
                          <p className="text-slate-400 text-xs truncate">${p.amount} · {p.status}</p>
                        </div>
                        {typeBadge('payment')}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-700/50 text-[10px] text-slate-600">
          <span className="flex items-center gap-1"><kbd className="bg-slate-700 rounded px-1 py-0.5 text-slate-400">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="bg-slate-700 rounded px-1 py-0.5 text-slate-400">↵</kbd> go to page</span>
          <span className="flex items-center gap-1"><kbd className="bg-slate-700 rounded px-1 py-0.5 text-slate-400">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
