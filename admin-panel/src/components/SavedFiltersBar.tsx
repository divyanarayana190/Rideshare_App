import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkPlus, Trash2, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';

interface SavedFilter {
  id: string;
  name: string;
  page: string;
  filters: Record<string, string | boolean | number>;
}

interface Props {
  pageKey: string;
  currentFilters: Record<string, string | boolean | number>;
  onApply: (filters: Record<string, string | boolean | number>) => void;
}

export default function SavedFiltersBar({ pageKey, currentFilters, onApply }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const { data: saved = [] } = useQuery<SavedFilter[]>({
    queryKey: ['saved-filters', pageKey],
    queryFn: () => api.get(`/admin/preferences/saved-filters?page=${encodeURIComponent(pageKey)}`),
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (filterName: string) =>
      api.post('/admin/preferences/saved-filters', { name: filterName, page: pageKey, filters: currentFilters }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-filters', pageKey] });
      setName('');
      setOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/preferences/saved-filters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-filters', pageKey] }),
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:text-white"
      >
        <Bookmark size={14} />
        Saved ({saved.length})
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-2">
          {saved.length === 0 ? (
            <p className="text-xs text-slate-500 p-2">No saved filters yet</p>
          ) : (
            saved.map((f) => (
              <div key={f.id} className="flex items-center gap-1 group">
                <button
                  onClick={() => { onApply(f.filters); setOpen(false); }}
                  className="flex-1 text-left text-sm text-slate-300 hover:text-white px-2 py-1.5 rounded hover:bg-slate-800 truncate"
                >
                  {f.name}
                </button>
                <button
                  onClick={() => deleteMut.mutate(f.id)}
                  className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
          <div className="border-t border-slate-700 mt-2 pt-2 flex gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Filter name…"
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white"
            />
            <button
              disabled={!name.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate(name.trim())}
              className="p-1.5 bg-blue-600 rounded text-white disabled:opacity-50"
            >
              <BookmarkPlus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
