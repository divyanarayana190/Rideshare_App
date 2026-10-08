import { useState, useEffect } from 'react';
import { Bell, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, AlertTriangle, Info, CheckCircle, AlertCircle, Zap, Radio, Loader2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface AlertRule {
  id: number;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  severity: string;
  isActive: boolean;
  createdAt?: string;
}

interface EngineStatus {
  activeRules: number;
  activeAlerts: number;
  webhookChannels: number;
  channels: string[];
  currentMetrics: Record<string, number>;
  recentDeliveries: Array<{ id: number; status: string; responseCode: number | null; createdAt: string }>;
}

interface SystemAlert {
  id: number;
  message: string;
  metric: string;
  currentValue: number | string;
  threshold: number | string;
  severity: string;
  status: 'active' | 'dismissed' | string;
  createdAt?: string;
}

const METRICS = [
  { value: 'cancellation_rate', label: 'Cancellation Rate (%)' },
  { value: 'online_drivers', label: 'Online Drivers (count)' },
  { value: 'driver_shortage', label: 'Driver Shortage (online count)' },
  { value: 'demand_spike', label: 'Demand Spike (waiting trips)' },
  { value: 'waiting_trips', label: 'Waiting Trips (searching)' },
  { value: 'fill_rate', label: 'Fill Rate (%)' },
  { value: 'revenue_drop_pct', label: 'Revenue Drop vs Yesterday (%)' },
  { value: 'active_sos', label: 'Active SOS Alerts' },
  { value: 'fraud_open_flags', label: 'Open Fraud Flags' },
  { value: 'support_backlog', label: 'Support Backlog (open tickets)' },
  { value: 'today_rides', label: "Today's Ride Count" },
  { value: 'avg_rating', label: 'Platform Avg Rating' },
];

const OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
];

const SEVERITIES = [
  { value: 'info', label: 'Info', icon: Info, cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'warning', label: 'Warning', icon: AlertTriangle, cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { value: 'critical', label: 'Critical', icon: AlertCircle, cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

const EMPTY_FORM = { name: '', metric: 'cancellation_rate', operator: 'gt', threshold: '', severity: 'warning' };

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITIES.find((s) => s.value === severity) || SEVERITIES[1];
  const Icon = cfg.icon;
  return (
    <span className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.cls)}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

export default function AlertRulesPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.get<AlertRule[]>('/admin/alert-rules'),
      api.get<SystemAlert[]>('/admin/system-alerts?status=all'),
      api.get<EngineStatus>('/admin/alerts/engine-status'),
    ])
      .then(([r, a, e]) => { setRules(r); setSystemAlerts(a); setEngine(e); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const runEvaluation = async () => {
    setEvaluating(true);
    try {
      await api.post('/admin/alerts/evaluate', {});
      fetchData();
    } catch (e) { console.error(e); }
    finally { setEvaluating(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (rule: AlertRule) => {
    setEditing(rule);
    setForm({ name: rule.name, metric: rule.metric, operator: rule.operator, threshold: String(rule.threshold), severity: rule.severity });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.threshold) { setError('Name and threshold are required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.patch(`/admin/alert-rules/${editing.id}`, { ...form, threshold: parseFloat(form.threshold) });
      } else {
        await api.post('/admin/alert-rules', { ...form, threshold: parseFloat(form.threshold) });
      }
      setModalOpen(false);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this alert rule?')) return;
    await api.delete(`/admin/alert-rules/${id}`).catch(console.error);
    fetchData();
  };

  const handleToggle = async (rule: AlertRule) => {
    await api.patch(`/admin/alert-rules/${rule.id}`, { isActive: !rule.isActive }).catch(console.error);
    fetchData();
  };

  const handleDismissAlert = async (id: number) => {
    await api.post(`/admin/system-alerts/${id}/dismiss`, {}).catch(console.error);
    setSystemAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: 'dismissed' } : a));
  };

  const activeAlerts = systemAlerts.filter((a) => a.status === 'active');
  const dismissedAlerts = systemAlerts.filter((a) => a.status === 'dismissed');

  return (
    <>
      <Header title="Alert Engine" subtitle="Automated thresholds with multi-channel delivery (admin panel, webhooks)" />
      <div className="p-6 space-y-6">

        {/* Engine status */}
        {engine && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-slate-800/80 rounded-xl border border-slate-700/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Radio size={16} className="text-green-400" />
                  <h3 className="text-sm font-semibold text-white">Live Metrics</h3>
                </div>
                <button onClick={runEvaluation} disabled={evaluating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-lg disabled:opacity-50">
                  {evaluating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                  Evaluate Now
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {Object.entries(engine.currentMetrics).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="bg-slate-900/50 rounded-lg px-2 py-1.5">
                    <p className="text-slate-500 truncate">{k.replace(/_/g, ' ')}</p>
                    <p className="text-white font-medium">{typeof v === 'number' ? v.toLocaleString() : v}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">Channels: {engine.channels.join(' · ')}</p>
            </div>
            <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 space-y-2">
              <p className="text-xs text-slate-400">Engine Status</p>
              <p className="text-2xl font-bold text-white">{engine.activeRules} active rules</p>
              <p className="text-sm text-yellow-400">{engine.activeAlerts} firing alerts</p>
              <p className="text-sm text-slate-400">{engine.webhookChannels} webhook channels</p>
            </div>
          </div>
        )}

        {/* Active system alerts banner */}
        {activeAlerts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Active System Alerts</p>
            {activeAlerts.map((a) => {
              const cfg = SEVERITIES.find((s) => s.value === a.severity) || SEVERITIES[1];
              return (
                <div key={a.id} className={clsx('flex items-start gap-3 p-3 rounded-xl border', cfg.cls.replace('text-', 'border-'), 'bg-slate-800/80')}>
                  <AlertTriangle size={16} className={cfg.cls.split(' ').find((c) => c.startsWith('text-')) || 'text-yellow-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{a.message}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Metric: <span className="text-slate-300">{a.metric}</span> · Value: <span className="text-slate-300">{a.currentValue}</span> · Threshold: <span className="text-slate-300">{a.threshold}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDismissAlert(a.id)}
                    className="text-xs text-slate-400 hover:text-white border border-slate-600 rounded-lg px-2.5 py-1 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Rules table */}
        <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-slate-400" />
              <h2 className="text-base font-semibold text-white">Alert Rules</h2>
              <span className="text-xs text-slate-500">({rules.length} rules)</span>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} />
              New Rule
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-500">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading rules…</p>
            </div>
          ) : rules.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Bell size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No alert rules configured</p>
              <p className="text-xs mt-1 text-slate-600">Click "New Rule" to add your first threshold alert</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700/30">
                  <th className="px-5 py-3 text-left">Rule Name</th>
                  <th className="px-4 py-3 text-left">Condition</th>
                  <th className="px-4 py-3 text-left">Severity</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const metricLabel = METRICS.find((m) => m.value === rule.metric)?.label || rule.metric;
                  const opLabel = OPERATORS.find((o) => o.value === rule.operator)?.label || rule.operator;
                  return (
                    <tr key={rule.id} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-white font-medium">{rule.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-slate-300 bg-slate-700/50 rounded px-2 py-0.5">
                          {metricLabel} {opLabel} {rule.threshold}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <SeverityBadge severity={rule.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggle(rule)}
                          className={clsx(
                            'flex items-center gap-1.5 text-xs font-medium transition-colors',
                            rule.isActive ? 'text-green-400 hover:text-green-300' : 'text-slate-500 hover:text-slate-400'
                          )}
                        >
                          {rule.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          {rule.isActive ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {rule.createdAt ? new Date(rule.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => openEdit(rule)}
                            className="text-slate-400 hover:text-white transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(rule.id)}
                            className="text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Dismissed alerts history */}
        {dismissedAlerts.length > 0 && (
          <div className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700/50">
              <CheckCircle size={16} className="text-slate-400" />
              <h2 className="text-base font-semibold text-white">Alert History</h2>
              <span className="text-xs text-slate-500">({dismissedAlerts.length} dismissed)</span>
            </div>
            <div className="divide-y divide-slate-700/20 max-h-64 overflow-y-auto">
              {dismissedAlerts.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center gap-3 opacity-60">
                  <SeverityBadge severity={a.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300 truncate">{a.message}</p>
                    <p className="text-xs text-slate-500">{a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}</p>
                  </div>
                  <span className="text-xs text-slate-500">Dismissed</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700/50 w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{editing ? 'Edit Rule' : 'New Alert Rule'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Rule Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. High Cancellation Rate"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Metric</label>
                <select
                  value={form.metric}
                  onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Operator</label>
                  <select
                    value={form.operator}
                    onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Threshold</label>
                  <input
                    type="number"
                    value={form.threshold}
                    onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                    placeholder="e.g. 20"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Severity</label>
                <div className="grid grid-cols-3 gap-2">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, severity: s.value }))}
                      className={clsx(
                        'flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors',
                        form.severity === s.value ? s.cls : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      )}
                    >
                      <s.icon size={12} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Rule'}
              </button>
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition-colors border border-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
