import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus, X, Play, Trophy, BarChart2, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { IfRole } from '@/components/RequireRole';
import { clsx } from 'clsx';

interface ABTest {
  id: number;
  name: string;
  description: string | null;
  hypothesis: string | null;
  variants: any;
  trafficSplit: any;
  metric: string;
  status: 'draft' | 'running' | 'completed' | 'stopped';
  winnerVariant: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-slate-500/20 text-slate-400 border-slate-500/30',
  running:   'bg-green-500/20 text-green-400 border-green-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  stopped:   'bg-red-500/20 text-red-400 border-red-500/30',
};

const emptyForm = {
  name: '', description: '', hypothesis: '',
  variants: '["control","variant_a"]',
  trafficSplit: '{"control":50,"variant_a":50}',
  metric: 'conversion_rate',
};

export default function ABTestsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [declareModal, setDeclareModal] = useState<ABTest | null>(null);
  const [winner, setWinner] = useState('');
  const [form, setForm] = useState(emptyForm);

  const { data: tests = [], isLoading } = useQuery<ABTest[]>({
    queryKey: ['ab-tests'],
    queryFn: () => api.get('/admin/ab-tests'),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post('/admin/ab-tests', {
      ...body,
      variants: JSON.parse(body.variants),
      trafficSplit: JSON.parse(body.trafficSplit),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ab-tests'] }); setShowCreate(false); setForm(emptyForm); },
  });

  const startMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/ab-tests/${id}/start`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ab-tests'] }),
  });

  const declareMutation = useMutation({
    mutationFn: ({ id, variant }: { id: number; variant: string }) =>
      api.post(`/admin/ab-tests/${id}/declare-winner`, { winner: variant }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ab-tests'] }); setDeclareModal(null); },
  });

  const running = tests.filter(t => t.status === 'running').length;
  const completed = tests.filter(t => t.status === 'completed').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FlaskConical size={24} className="text-cyan-400" /> A/B Tests
          </h1>
          <p className="text-sm text-slate-400 mt-1">{running} running · {completed} completed</p>
        </div>
        <IfRole role="admin">
          <button
            onClick={() => { setShowCreate(true); setForm(emptyForm); }}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Test
          </button>
        </IfRole>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: tests.length, cls: 'text-white' },
          { label: 'Running', value: running, cls: 'text-green-400' },
          { label: 'Completed', value: completed, cls: 'text-blue-400' },
          { label: 'Drafts', value: tests.filter(t => t.status === 'draft').length, cls: 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={clsx('text-2xl font-bold mt-1', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tests */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500">Loading…</div>
      ) : tests.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No A/B tests yet</div>
      ) : (
        <div className="space-y-4">
          {tests.map(test => {
            const variants: string[] = Array.isArray(test.variants) ? test.variants : [];
            const split: Record<string, number> = test.trafficSplit ?? {};

            return (
              <div key={test.id} className="bg-slate-800 rounded-xl border border-slate-700/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-white font-semibold">{test.name}</h3>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full border', STATUS_STYLES[test.status])}>
                        {test.status}
                      </span>
                      {test.winnerVariant && (
                        <span className="flex items-center gap-1 text-xs text-yellow-400">
                          <Trophy size={12} /> {test.winnerVariant}
                        </span>
                      )}
                    </div>
                    {test.description && <p className="text-sm text-slate-400 mt-1">{test.description}</p>}
                    {test.hypothesis && <p className="text-xs text-slate-500 mt-1 italic">H: {test.hypothesis}</p>}
                  </div>

                  <IfRole role="admin">
                    <div className="flex items-center gap-2 shrink-0">
                      {test.status === 'draft' && (
                        <button
                          onClick={() => startMutation.mutate(test.id)}
                          className="flex items-center gap-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 px-3 py-1.5 rounded-lg text-xs border border-green-500/30 transition-colors"
                        >
                          <Play size={12} /> Start
                        </button>
                      )}
                      {test.status === 'running' && (
                        <button
                          onClick={() => { setDeclareModal(test); setWinner(variants[0] ?? ''); }}
                          className="flex items-center gap-1 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 px-3 py-1.5 rounded-lg text-xs border border-yellow-500/30 transition-colors"
                        >
                          <Trophy size={12} /> Declare Winner
                        </button>
                      )}
                    </div>
                  </IfRole>
                </div>

                {/* Traffic split */}
                <div className="mt-4">
                  <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><BarChart2 size={11} /> Traffic Split — Metric: {test.metric}</p>
                  <div className="flex h-5 rounded-full overflow-hidden gap-px">
                    {variants.map((v, i) => {
                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                      const pct = split[v] ?? 0;
                      return (
                        <div key={v} style={{ width: `${pct}%`, background: colors[i % colors.length] }}
                          className="flex items-center justify-center text-white text-xs font-medium"
                          title={`${v}: ${pct}%`}
                        >
                          {pct > 15 ? `${v} ${pct}%` : ''}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-1">
                    {variants.map((v, i) => {
                      const colors = ['text-blue-400', 'text-green-400', 'text-yellow-400', 'text-red-400'];
                      return (
                        <span key={v} className={clsx('text-xs', colors[i % colors.length])}>
                          {v}: {split[v] ?? 0}%
                        </span>
                      );
                    })}
                  </div>
                </div>

                {test.startedAt && (
                  <p className="text-xs text-slate-500 mt-2">
                    Started {new Date(test.startedAt).toLocaleDateString()}
                    {test.endedAt && ` · Ended ${new Date(test.endedAt).toLocaleDateString()}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">New A/B Test</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Test name" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description" rows={2} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none" />
              <textarea value={form.hypothesis} onChange={e => setForm(f => ({ ...f, hypothesis: e.target.value }))}
                placeholder="Hypothesis: We believe that…" rows={2} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none" />
              <div>
                <label className="text-xs text-slate-400 block mb-1">Variants (JSON array)</label>
                <input value={form.variants} onChange={e => setForm(f => ({ ...f, variants: e.target.value }))}
                  placeholder='["control","variant_a"]' className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Traffic Split (JSON object, must sum to 100)</label>
                <input value={form.trafficSplit} onChange={e => setForm(f => ({ ...f, trafficSplit: e.target.value }))}
                  placeholder='{"control":50,"variant_a":50}' className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Success Metric</label>
                <input value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
                  placeholder="conversion_rate" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || createMutation.isPending}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Declare Winner Modal */}
      {declareModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Trophy size={16} className="text-yellow-400" /> Declare Winner</h2>
              <button onClick={() => setDeclareModal(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-400">Select the winning variant for <span className="text-white font-medium">{declareModal.name}</span></p>
            <div className="space-y-2">
              {(Array.isArray(declareModal.variants) ? declareModal.variants : []).map((v: string) => (
                <label key={v} className={clsx('flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  winner === v ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-slate-700 hover:border-slate-600')}>
                  <input type="radio" name="winner" value={v} checked={winner === v} onChange={() => setWinner(v)} className="accent-yellow-500" />
                  <span className="text-white text-sm">{v}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeclareModal(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => declareMutation.mutate({ id: declareModal.id, variant: winner })}
                disabled={!winner || declareMutation.isPending}
                className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {declareMutation.isPending ? 'Declaring…' : 'Declare Winner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
