import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Webhook, Plus, X, Play, Trash2, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { IfRole } from '@/components/RequireRole';
import { clsx } from 'clsx';

interface WebhookRecord {
  id: number;
  name: string;
  url: string;
  events: string;
  secret: string | null;
  isActive: boolean;
  lastDeliveryStatus: string | null;
  lastDeliveryAt: string | null;
  createdAt: string;
}

interface WebhookDelivery {
  id: number;
  webhookId: number;
  event: string;
  payload: any;
  responseStatus: number | null;
  responseBody: string | null;
  deliveredAt: string;
  success: boolean;
  error: string | null;
}

const EVENT_OPTIONS = [
  'ride.created', 'ride.completed', 'ride.cancelled',
  'payment.succeeded', 'payment.failed', 'payment.refunded',
  'driver.approved', 'driver.suspended', 'user.banned',
  'incident.created', 'incident.resolved',
];

const emptyForm = { name: '', url: '', events: ['ride.completed'], secret: '' };

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, string>>({});
  const [form, setForm] = useState(emptyForm);

  const { data: webhooks = [], isLoading } = useQuery<WebhookRecord[]>({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/admin/webhooks'),
  });

  const { data: deliveries = [] } = useQuery<WebhookDelivery[]>({
    queryKey: ['webhook-deliveries', expandedId],
    queryFn: () => api.get(`/admin/webhooks/${expandedId}/deliveries`),
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post('/admin/webhooks', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); setShowCreate(false); setForm(emptyForm); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/admin/webhooks/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const testDelivery = async (id: number) => {
    try {
      const result = await api.post<{ success: boolean; status: number }>(`/admin/webhooks/${id}/test`, {});
      setTestResults(r => ({ ...r, [id]: result.success ? `✓ ${result.status}` : `✗ ${result.status}` }));
    } catch (e: any) {
      setTestResults(r => ({ ...r, [id]: `✗ ${e.message}` }));
    }
  };

  const toggleEvent = (event: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  const active = webhooks.filter(w => w.isActive).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Webhook size={24} className="text-indigo-400" /> Webhooks
          </h1>
          <p className="text-sm text-slate-400 mt-1">{active}/{webhooks.length} active · Manage outbound event integrations</p>
        </div>
        <IfRole role="admin">
          <button
            onClick={() => { setShowCreate(true); setForm(emptyForm); }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Webhook
          </button>
        </IfRole>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500">Loading…</div>
      ) : webhooks.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No webhooks configured</div>
      ) : (
        <div className="space-y-3">
          {webhooks.map(wh => {
            const events: string[] = typeof wh.events === 'string' ? JSON.parse(wh.events) : wh.events;
            const expanded = expandedId === wh.id;
            const testResult = testResults[wh.id];

            return (
              <div key={wh.id} className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold text-sm">{wh.name}</p>
                      {wh.isActive
                        ? <span className="w-2 h-2 bg-green-400 rounded-full" title="Active" />
                        : <span className="w-2 h-2 bg-slate-500 rounded-full" title="Inactive" />
                      }
                      {wh.lastDeliveryStatus && (
                        <span className={clsx('text-xs px-1.5 py-0.5 rounded',
                          wh.lastDeliveryStatus === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        )}>
                          {wh.lastDeliveryStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-blue-400 truncate mt-0.5">{wh.url}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {events.slice(0, 4).map(e => (
                        <span key={e} className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{e}</span>
                      ))}
                      {events.length > 4 && (
                        <span className="text-xs text-slate-500">+{events.length - 4} more</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {testResult && (
                      <span className={clsx('text-xs font-mono', testResult.startsWith('✓') ? 'text-green-400' : 'text-red-400')}>
                        {testResult}
                      </span>
                    )}
                    <IfRole role="admin">
                      <button
                        onClick={() => testDelivery(wh.id)}
                        className="text-xs flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded transition-colors"
                      >
                        <Play size={11} /> Test
                      </button>
                      <button onClick={() => toggleMutation.mutate({ id: wh.id, isActive: !wh.isActive })}>
                        {wh.isActive
                          ? <ToggleRight size={22} className="text-green-400" />
                          : <ToggleLeft size={22} className="text-slate-500" />
                        }
                      </button>
                      <button onClick={() => deleteMutation.mutate(wh.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </IfRole>
                    <button
                      onClick={() => setExpandedId(expanded ? null : wh.id)}
                      className="text-slate-400 hover:text-white"
                    >
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-700/50 p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Recent Deliveries</p>
                    {deliveries.length === 0 ? (
                      <p className="text-xs text-slate-500">No deliveries yet</p>
                    ) : (
                      <div className="space-y-1">
                        {deliveries.map(d => (
                          <div key={d.id} className="flex items-center gap-3 py-1.5 border-b border-slate-700/30 last:border-0">
                            {d.success
                              ? <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                              : <XCircle size={13} className="text-red-400 shrink-0" />
                            }
                            <span className="text-xs text-slate-400 w-28 shrink-0">{d.event}</span>
                            <span className={clsx('text-xs font-mono', d.success ? 'text-green-400' : 'text-red-400')}>
                              {d.responseStatus ?? 'N/A'}
                            </span>
                            <span className="text-xs text-slate-500 ml-auto flex items-center gap-1">
                              <Clock size={10} /> {new Date(d.deliveredAt).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
              <h2 className="text-lg font-bold text-white">New Webhook</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Webhook name" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://example.com/webhook" type="url" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <input value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
                placeholder="Signing secret (optional)" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <div>
                <p className="text-xs text-slate-400 mb-2">Events to subscribe</p>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {EVENT_OPTIONS.map(event => (
                    <label key={event} className={clsx(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs',
                      form.events.includes(event) ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-700 text-slate-400 hover:bg-slate-600 border border-transparent'
                    )}>
                      <input type="checkbox" checked={form.events.includes(event)} onChange={() => toggleEvent(event)} className="accent-indigo-500 w-3 h-3" />
                      {event}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || !form.url || form.events.length === 0 || createMutation.isPending}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Webhook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
