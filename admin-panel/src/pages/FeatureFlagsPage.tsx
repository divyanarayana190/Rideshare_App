import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flag, Plus, X, ToggleLeft, ToggleRight, Trash2, Edit2 } from 'lucide-react';
import { api } from '@/lib/api';
import { IfRole } from '@/components/RequireRole';
import { clsx } from 'clsx';

interface FeatureFlag {
  id: number;
  key: string;
  description: string | null;
  isEnabled: boolean;
  rolloutPercent: number;
  allowlist: string | null;
  environments: string | null;
  createdAt: string;
  updatedAt: string;
}

const emptyForm = { key: '', description: '', isEnabled: false, rolloutPercent: 100, allowlist: '', environments: 'production,staging' };

export default function FeatureFlagsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editFlag, setEditFlag] = useState<FeatureFlag | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');

  const { data: flags = [], isLoading } = useQuery<FeatureFlag[]>({
    queryKey: ['feature-flags'],
    queryFn: () => api.get('/admin/feature-flags'),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post('/admin/feature-flags', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feature-flags'] }); setShowCreate(false); setForm(emptyForm); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<FeatureFlag> }) => api.patch(`/admin/feature-flags/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feature-flags'] }); setEditFlag(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/feature-flags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feature-flags'] }),
  });

  const openEdit = (flag: FeatureFlag) => {
    setEditFlag(flag);
    setForm({ key: flag.key, description: flag.description ?? '', isEnabled: flag.isEnabled, rolloutPercent: flag.rolloutPercent, allowlist: flag.allowlist ?? '', environments: flag.environments ?? '' });
  };

  const filtered = flags.filter(f =>
    f.key.toLowerCase().includes(search.toLowerCase()) ||
    (f.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = flags.filter(f => f.isEnabled).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Flag size={24} className="text-yellow-400" /> Feature Flags
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {enabledCount}/{flags.length} enabled · Manage feature rollouts and experiments
          </p>
        </div>
        <IfRole role="admin">
          <button
            onClick={() => { setShowCreate(true); setForm(emptyForm); }}
            className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Flag
          </button>
        </IfRole>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search flags…"
        className="w-full max-w-sm bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
      />

      {/* Flags Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No feature flags found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(flag => (
            <div
              key={flag.id}
              className={clsx(
                'bg-slate-800 rounded-xl border p-4 transition-all',
                flag.isEnabled ? 'border-yellow-500/30' : 'border-slate-700/50'
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm font-mono truncate">{flag.key}</p>
                  {flag.description && (
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{flag.description}</p>
                  )}
                </div>
                <IfRole role="admin">
                  <button
                    onClick={() => updateMutation.mutate({ id: flag.id, body: { isEnabled: !flag.isEnabled } })}
                    className="shrink-0"
                  >
                    {flag.isEnabled
                      ? <ToggleRight size={24} className="text-yellow-400" />
                      : <ToggleLeft size={24} className="text-slate-500" />
                    }
                  </button>
                </IfRole>
              </div>

              {/* Rollout bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Rollout</span>
                  <span>{flag.rolloutPercent}%</span>
                </div>
                <div className="bg-slate-700 rounded-full h-1.5">
                  <div
                    className="bg-yellow-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${flag.rolloutPercent}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(flag.environments ?? '').split(',').filter(Boolean).map(env => (
                    <span key={env} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{env.trim()}</span>
                  ))}
                </div>
                <IfRole role="admin">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(flag)} className="p-1 text-slate-500 hover:text-blue-400 transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => deleteMutation.mutate(flag.id)} className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </IfRole>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editFlag) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editFlag ? 'Edit Flag' : 'New Feature Flag'}</h2>
              <button onClick={() => { setShowCreate(false); setEditFlag(null); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Key (e.g. new_ride_ui)</label>
                <input
                  value={form.key}
                  onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                  placeholder="feature_key"
                  disabled={!!editFlag}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description…"
                rows={2}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Rollout %</label>
                  <input
                    type="number" min="0" max="100"
                    value={form.rolloutPercent}
                    onChange={e => setForm(f => ({ ...f, rolloutPercent: Number(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Environments</label>
                  <input
                    value={form.environments}
                    onChange={e => setForm(f => ({ ...f, environments: e.target.value }))}
                    placeholder="production,staging"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Allowlist (user IDs, comma separated)</label>
                <input
                  value={form.allowlist}
                  onChange={e => setForm(f => ({ ...f, allowlist: e.target.value }))}
                  placeholder="1,2,3"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={e => setForm(f => ({ ...f, isEnabled: e.target.checked }))}
                  className="w-4 h-4 rounded accent-yellow-500"
                />
                <span className="text-sm text-white">Enable immediately</span>
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowCreate(false); setEditFlag(null); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={() => {
                  if (editFlag) updateMutation.mutate({ id: editFlag.id, body: form });
                  else createMutation.mutate(form);
                }}
                disabled={!form.key || createMutation.isPending || updateMutation.isPending}
                className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving…' : editFlag ? 'Update' : 'Create Flag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
