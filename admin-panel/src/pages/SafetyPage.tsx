import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Clock, MapPin, Phone, CheckCircle2, X, User, Car, Loader2, Search, Filter } from 'lucide-react';
import Header from '@/components/layout/Header';
import SafetyAlertMap from '@/components/SafetyAlertMap';
import { api } from '@/lib/api';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const SEV_CLS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const alertTypeConfig: Record<string, any> = {
  sos: { label: 'SOS Emergency', icon: ShieldAlert, color: 'text-red-400' },
  unsafe_driver: { label: 'Unsafe Driver', icon: Car, color: 'text-orange-400' },
  unsafe_passenger: { label: 'Unsafe Passenger', icon: User, color: 'text-yellow-400' },
  harassment_report: { label: 'Harassment Report', icon: User, color: 'text-red-400' },
  support_escalation: { label: 'Support Escalation', icon: ShieldAlert, color: 'text-orange-400' },
};

export default function SafetyPage() {
  const [severity, setSeverity] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const queryParams = new URLSearchParams();
  if (severity !== 'all') queryParams.set('severity', severity);
  if (search) queryParams.set('search', search);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['safety-dashboard', severity, search],
    queryFn: () => api.get<any>(`/admin/safety/dashboard?${queryParams}`),
    refetchInterval: 15_000,
  });

  const respondToAlert = (alertId: number) => {
    api.patch(`/admin/safety/alerts/${alertId}`, { status: 'responded' }).then(() => refetch());
  };

  const resolveAlert = (alertId: number) => {
    api.patch(`/admin/safety/alerts/${alertId}`, { status: 'resolved', notes: resolutionNotes })
      .then(() => { refetch(); setSelectedEvent(null); setResolutionNotes(''); });
  };

  const summary = data?.summary;
  const timeline = data?.timeline ?? [];
  const mapPoints = data?.mapPoints ?? [];
  const trend = data?.trend ?? [];

  return (
    <>
      <Header title="Safety Command Center" subtitle="SOS events, harassment reports, and escalations" />
      <div className="p-6 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Active SOS', value: summary?.activeSos ?? '—', cls: 'text-red-400' },
            { label: 'Active Alerts', value: summary?.activeAlerts ?? '—', cls: 'text-orange-400' },
            { label: 'Harassment Reports', value: summary?.harassmentReports ?? '—', cls: 'text-yellow-400' },
            { label: 'Safety Tickets', value: summary?.openSafetyTickets ?? '—', cls: 'text-blue-400' },
            { label: 'Women-Only Rides (7d)', value: summary?.womenOnlyRides7d ?? '—', cls: 'text-pink-400' },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
              <p className="text-xs text-slate-400">{s.label}</p>
              <p className={clsx('text-2xl font-bold mt-1', s.cls)}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-1 bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><MapPin size={16} /> Active Alert Map</h2>
            {mapPoints.length > 0 ? (
              <SafetyAlertMap points={mapPoints} height={280} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-slate-500 text-sm border border-slate-700 rounded-xl">No active map points</div>
            )}
          </div>

          {/* Trend */}
          <div className="lg:col-span-2 bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
            <h2 className="text-sm font-semibold text-white mb-3">Incident Trend (7 days)</h2>
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trend}>
                  <XAxis dataKey="date" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: 8, color: '#E2E8F0' }} />
                  <Area type="monotone" dataKey="count" stroke="#EF4444" fill="#EF444433" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-slate-500">No trend data</div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…"
              className="bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white w-56" />
          </div>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-500"><Loader2 className="animate-spin mr-2" /> Loading…</div>
          ) : timeline.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No safety events — all clear</div>
          ) : timeline.map((event: any) => {
            const config = alertTypeConfig[event.type] || alertTypeConfig.sos;
            const Icon = config.icon;
            const alertId = event.source === 'emergency_alert' ? parseInt(event.id.replace('alert-', '')) : null;
            return (
              <div key={event.id} onClick={() => setSelectedEvent({ ...event, alertId })}
                className={clsx('rounded-xl p-4 border cursor-pointer hover:bg-opacity-40 transition-colors', SEV_CLS[event.severity] || SEV_CLS.medium)}>
                <div className="flex items-start gap-3">
                  <Icon size={20} className={config.color} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white capitalize">{event.type.replace(/_/g, ' ')}</span>
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs border capitalize', SEV_CLS[event.severity])}>{event.severity}</span>
                      <span className="text-xs text-slate-500 capitalize">{event.status}</span>
                    </div>
                    <p className="text-slate-300 text-sm mt-1">{event.userName} — {event.description}</p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Clock size={10} /> {new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                  {alertId && event.status === 'active' && (
                    <button onClick={(e) => { e.stopPropagation(); respondToAlert(alertId); }}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg">Respond</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedEvent?.alertId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedEvent(null)} />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700 max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between"><h2 className="text-xl font-bold text-white">Alert Detail</h2><button onClick={() => setSelectedEvent(null)}><X /></button></div>
            {selectedEvent.latitude && <SafetyAlertMap points={[{ id: selectedEvent.alertId, lat: parseFloat(selectedEvent.latitude), lng: parseFloat(selectedEvent.longitude), severity: selectedEvent.severity, userName: selectedEvent.userName }]} height={180} />}
            <textarea rows={3} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Resolution notes…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            <div className="flex gap-2">
              <button onClick={() => respondToAlert(selectedEvent.alertId)} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm flex items-center justify-center gap-1"><Phone size={14} /> Respond</button>
              <button onClick={() => resolveAlert(selectedEvent.alertId)} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm flex items-center justify-center gap-1"><CheckCircle2 size={14} /> Resolve</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
