import { useEffect, useState, type ComponentType } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert, Plus, X, CheckCircle2, Clock, AlertTriangle,
  Radio, ChevronDown, ChevronUp, Send, User, History,
} from 'lucide-react';
import { api } from '@/lib/api';
import { IfRole } from '@/components/RequireRole';
import { clsx } from 'clsx';

/** Backend enum + legacy / alias values seen in production data */
type Severity =
  | 'sev1' | 'sev2' | 'sev3' | 'sev4'
  | 'critical' | 'high' | 'medium' | 'low' | 'urgent';

type IncidentStatus =
  | 'open' | 'investigating' | 'mitigating' | 'resolved'
  | 'active' | 'closed';

interface Incident {
  id: number;
  title: string;
  description: string | null;
  severity: Severity | string | null;
  status: IncidentStatus | string | null;
  city: string | null;
  impact: string | null;
  /** @deprecated legacy client field — mapped from city */
  affectedArea?: string | null;
  assignedTo?: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface IncidentAction {
  id: number;
  adminId: number;
  adminName?: string;
  adminEmail?: string | null;
  action: string;
  note?: string | null;
  details?: string | null;
  createdAt: string;
}

type SevMeta = { label: string; cls: string };
type StatusMeta = { label: string; cls: string; icon: ComponentType<{ size?: number }> };

const UNKNOWN_SEV: SevMeta = {
  label: 'Unknown',
  cls: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
};

const UNKNOWN_STATUS: StatusMeta = {
  label: 'Unknown',
  cls: 'bg-gray-500/20 text-gray-400',
  icon: AlertTriangle,
};

const SEV: Record<string, SevMeta> = {
  // Backend canonical (drizzle schema)
  sev1: { label: 'SEV-1 Critical', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  sev2: { label: 'SEV-2 High', cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' },
  sev3: { label: 'SEV-3 Medium', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
  sev4: { label: 'SEV-4 Low', cls: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  // Legacy / alias values
  critical: { label: 'Critical', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  urgent: { label: 'Urgent', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  high: { label: 'High', cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' },
  medium: { label: 'Medium', cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
  low: { label: 'Low', cls: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
};

const STATUS: Record<string, StatusMeta> = {
  // Backend canonical
  open: { label: 'Open', cls: 'bg-red-500/20 text-red-400', icon: AlertTriangle },
  investigating: { label: 'Investigating', cls: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
  mitigating: { label: 'Mitigating', cls: 'bg-orange-500/20 text-orange-400', icon: ShieldAlert },
  resolved: { label: 'Resolved', cls: 'bg-green-500/20 text-green-400', icon: CheckCircle2 },
  // Legacy / alias values
  active: { label: 'Active', cls: 'bg-red-500/20 text-red-400', icon: AlertTriangle },
  closed: { label: 'Closed', cls: 'bg-green-500/20 text-green-400', icon: CheckCircle2 },
};

function getSeverityMeta(severity: string | null | undefined): SevMeta {
  if (severity == null || severity === '') {
    return { ...UNKNOWN_SEV, label: 'Unknown' };
  }
  return (
    SEV[severity as keyof typeof SEV] ?? {
      label: String(severity),
      cls: UNKNOWN_SEV.cls,
    }
  );
}

function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (status == null || status === '') {
    return { ...UNKNOWN_STATUS, label: 'Unknown' };
  }
  return (
    STATUS[status as keyof typeof STATUS] ?? {
      label: String(status),
      cls: UNKNOWN_STATUS.cls,
      icon: AlertTriangle,
    }
  );
}

function isResolvedStatus(status: string | null | undefined): boolean {
  return status === 'resolved' || status === 'closed';
}

function isCriticalSeverity(severity: string | null | undefined): boolean {
  return severity === 'sev1' || severity === 'critical' || severity === 'urgent';
}

function normalizeIncidents(raw: unknown): Incident[] {
  if (Array.isArray(raw)) return raw.filter(Boolean) as Incident[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.incidents)) return obj.incidents.filter(Boolean) as Incident[];
    if (Array.isArray(obj.data)) return obj.data.filter(Boolean) as Incident[];
  }
  console.error('[Incidents] Unexpected API response shape', raw);
  return [];
}

function normalizeActions(raw: unknown): IncidentAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(Boolean) as IncidentAction[];
}

function incidentArea(inc: Incident): string | null {
  return inc.city ?? inc.affectedArea ?? null;
}

function actionAuthor(a: IncidentAction): string {
  return a.adminName ?? a.adminEmail ?? `Admin #${a.adminId}`;
}

function actionText(a: IncidentAction): string {
  return a.note ?? a.details ?? a.action;
}

function IncidentCommandPageInner() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('open,investigating,mitigating');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [newNote, setNewNote] = useState<Record<number, string>>({});

  const [form, setForm] = useState({
    title: '',
    description: '',
    severity: 'sev2' as Severity,
    city: '',
    impact: '',
  });

  const { data: incidents = [], isLoading } = useQuery<Incident[]>({
    queryKey: ['incidents', statusFilter],
    queryFn: async () => {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const raw = await api.get<unknown>(`/admin/incidents${qs}`);
      return normalizeIncidents(raw);
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    console.log('INCIDENT DATA', incidents);
    incidents.forEach(i => {
      if (!SEV[i.severity as keyof typeof SEV]) {
        console.error('Unknown severity', i);
      }
      if (!STATUS[i.status as keyof typeof STATUS]) {
        console.error('Unknown status', i);
      }
    });
  }, [incidents]);

  const { data: timeline = [] } = useQuery<IncidentAction[]>({
    queryKey: ['incident-timeline', expandedId],
    queryFn: async () => {
      const raw = await api.get<unknown>(`/admin/incidents/${expandedId}/actions`);
      return normalizeActions(raw);
    },
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) =>
      api.post('/admin/incidents', {
        title: body.title,
        description: body.description,
        severity: body.severity,
        city: body.city || undefined,
        impact: body.impact || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      setShowCreate(false);
      setForm({ title: '', description: '', severity: 'sev2', city: '', impact: '' });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/admin/incidents/${id}/resolve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/admin/incidents/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  });

  const addActionMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      api.post(`/admin/incidents/${id}/actions`, { action: 'update', note }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['incident-timeline', id] });
      setNewNote(n => ({ ...n, [id]: '' }));
    },
  });

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setBroadcastSending(true);
    try {
      await api.post('/admin/incidents/broadcast', { message: broadcastMsg, severity: 'sev2' });
      setBroadcastMsg('');
    } finally {
      setBroadcastSending(false);
    }
  };

  const open = incidents.filter(i => !isResolvedStatus(i.status));
  const critical = incidents.filter(i => isCriticalSeverity(i.severity) && !isResolvedStatus(i.status));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert size={24} className="text-red-400" /> Incident Command
          </h1>
          <p className="text-sm text-slate-400 mt-1">Track, coordinate, and resolve operational incidents</p>
        </div>
        <IfRole role="ops">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Incident
          </button>
        </IfRole>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Open Incidents', value: open.length, cls: 'text-red-400' },
          { label: 'Critical', value: critical.length, cls: 'text-orange-400' },
          { label: 'Resolved Today', value: incidents.filter(i => isResolvedStatus(i.status)).length, cls: 'text-green-400' },
          { label: 'Total', value: incidents.length, cls: 'text-blue-400' },
        ].map(k => (
          <div key={k.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className={clsx('text-3xl font-bold mt-1', k.cls)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Broadcast Banner */}
      <IfRole role="admin">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
          <p className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <Radio size={14} className="text-yellow-400" /> Emergency Broadcast to All Active Users
          </p>
          <div className="flex gap-2">
            <input
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              placeholder="Type emergency message…"
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={sendBroadcast}
              disabled={broadcastSending || !broadcastMsg.trim()}
              className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Send size={14} /> {broadcastSending ? 'Sending…' : 'Broadcast'}
            </button>
          </div>
        </div>
      </IfRole>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'Active', value: 'open,investigating,mitigating' },
          { label: 'Open', value: 'open' },
          { label: 'Investigating', value: 'investigating' },
          { label: 'Mitigating', value: 'mitigating' },
          { label: 'Resolved', value: 'resolved' },
          { label: 'All', value: '' },
        ].map(f => (
          <button
            key={f.label}
            onClick={() => setStatusFilter(f.value)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              statusFilter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Incident List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-12 text-slate-500">Loading incidents…</div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-12 text-slate-500">No incidents found</div>
        ) : incidents.map(inc => {
          const sev = getSeverityMeta(inc.severity);
          const st = getStatusMeta(inc.status);
          const StIcon = st.icon;
          const expanded = expandedId === inc.id;
          const area = incidentArea(inc);
          const title = inc.title ?? 'Untitled incident';
          const description = inc.description ?? inc.impact ?? '';

          return (
            <div key={inc.id} className="bg-slate-800 rounded-xl border border-slate-700/50 overflow-hidden">
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                onClick={() => setExpandedId(expanded ? null : inc.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', sev.cls)}>{sev.label}</span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1', st.cls)}>
                      <StIcon size={10} /> {st.label}
                    </span>
                    <span className="text-white font-semibold text-sm truncate">{title}</span>
                  </div>
                  {description ? (
                    <p className="text-xs text-slate-400 mt-1 truncate">{description}</p>
                  ) : null}
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    {area && <span>Area: {area}</span>}
                    {inc.assignedTo && (
                      <span className="flex items-center gap-1"><User size={10} />{inc.assignedTo}</span>
                    )}
                    {inc.createdAt && (
                      <span>{new Date(inc.createdAt).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <IfRole role="ops">
                    {!isResolvedStatus(inc.status) && (
                      <button
                        onClick={e => { e.stopPropagation(); resolveMutation.mutate(inc.id); }}
                        className="text-xs bg-green-600/20 hover:bg-green-600/40 text-green-400 px-3 py-1 rounded-lg border border-green-500/30 transition-colors"
                      >
                        Resolve
                      </button>
                    )}
                    {(inc.status === 'open' || inc.status === 'active') && (
                      <button
                        onClick={e => { e.stopPropagation(); statusMutation.mutate({ id: inc.id, status: 'investigating' }); }}
                        className="text-xs bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 px-3 py-1 rounded-lg border border-yellow-500/30 transition-colors"
                      >
                        Investigate
                      </button>
                    )}
                    {inc.status === 'investigating' && (
                      <button
                        onClick={e => { e.stopPropagation(); statusMutation.mutate({ id: inc.id, status: 'mitigating' }); }}
                        className="text-xs bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 px-3 py-1 rounded-lg border border-orange-500/30 transition-colors"
                      >
                        Mitigate
                      </button>
                    )}
                  </IfRole>
                  {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </div>

              {expanded && (
                <div className="border-t border-slate-700/50 p-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-2">
                      <History size={12} /> Timeline
                    </p>
                    {timeline.length === 0 ? (
                      <p className="text-xs text-slate-500">No actions yet</p>
                    ) : (
                      <div className="space-y-2">
                        {timeline.map(a => (
                          <div key={a.id} className="flex gap-3 text-xs">
                            <span className="text-slate-500 whitespace-nowrap">
                              {a.createdAt ? new Date(a.createdAt).toLocaleTimeString() : '—'}
                            </span>
                            <span className="text-slate-400">{actionAuthor(a)}</span>
                            <span className="text-white">{actionText(a)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <IfRole role="ops">
                    <div className="flex gap-2">
                      <input
                        value={newNote[inc.id] || ''}
                        onChange={e => setNewNote(n => ({ ...n, [inc.id]: e.target.value }))}
                        placeholder="Add update note…"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => addActionMutation.mutate({ id: inc.id, note: newNote[inc.id] || '' })}
                        disabled={!newNote[inc.id]?.trim()}
                        className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </IfRole>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">New Incident</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Title" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description" rows={3} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Severity</label>
                  <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as Severity }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    <option value="sev1">SEV-1 Critical</option>
                    <option value="sev2">SEV-2 High</option>
                    <option value="sev3">SEV-3 Medium</option>
                    <option value="sev4">SEV-4 Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">City / Area</label>
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="e.g. Downtown SF" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <input value={form.impact} onChange={e => setForm(f => ({ ...f, impact: e.target.value }))}
                placeholder="Impact summary (optional)" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium transition-colors">Cancel</button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.title || createMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Incident'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IncidentCommandPage() {
  return <IncidentCommandPageInner />;
}
