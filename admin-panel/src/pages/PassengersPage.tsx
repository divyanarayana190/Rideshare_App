import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, ChevronLeft, ChevronRight, ExternalLink, Shield } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

export default function PassengersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [university, setUniversity] = useState(searchParams.get('university') ?? '');

  useEffect(() => {
    const u = searchParams.get('university');
    if (u) setUniversity(u);
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['passengers', page, search, university],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) p.set('search', search);
      if (university) p.set('university', university);
      return api.get<any>(`/admin/passengers?${p}`);
    },
  });

  const { data: universities = [] } = useQuery({
    queryKey: ['universities'],
    queryFn: () => api.get<any[]>('/admin/universities'),
    staleTime: 300_000,
  });

  const passengers = data?.passengers ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <>
      <Header title="Passenger Management" subtitle={`${data?.total ?? 0} passengers`} />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name or email…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500" />
          </div>
          <select value={university} onChange={(e) => { setUniversity(e.target.value); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white min-w-[180px]">
            <option value="">All universities</option>
            {universities.map((u: any) => <option key={u.domain} value={u.domain}>{u.name}</option>)}
          </select>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700/50 text-xs uppercase">
                <th className="text-left px-4 py-3">Passenger</th>
                <th className="text-left px-4 py-3">University</th>
                <th className="text-left px-4 py-3">Rides</th>
                <th className="text-left px-4 py-3">Rating</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500">Loading…</td></tr>
              ) : passengers.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500">No passengers found</td></tr>
              ) : passengers.map((p: any) => (
                <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{p.name}</p>
                    <p className="text-slate-400 text-xs">{p.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{p.studentUniversityName || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{p.totalRides ?? 0}</td>
                  <td className="px-4 py-3 text-yellow-400">{Number(p.averageRating || 0).toFixed(1)}</td>
                  <td className="px-4 py-3">
                    {p.isBanned ? (
                      <span className="text-red-400 text-xs">Banned</span>
                    ) : p.isStudentVerified ? (
                      <span className="text-blue-400 text-xs">Student ✓</span>
                    ) : (
                      <span className="text-slate-500 text-xs">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/passengers/${p.id}`)}
                      className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs">
                      <ExternalLink size={14} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
