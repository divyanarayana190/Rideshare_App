import { useState, useEffect, useCallback } from 'react';
import { Zap, MapPin, Settings, Plus, Pencil, Trash2, X, Loader2, Save, RotateCcw, CheckCircle } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

// ─── Surge Zones ─────────────────────────────────────────────────────────────

function SurgeTab() {
  const [surgeZones, setSurgeZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editZone, setEditZone] = useState<any>(null);
  const [form, setForm] = useState({ name: '', centerLat: '', centerLng: '', radiusKm: '', multiplier: '', reason: '', activeFrom: '', activeUntil: '' });

  const fetchZones = useCallback(() => {
    setLoading(true);
    api.get<any[]>('/admin/surge-zones').then(d => setSurgeZones(d || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const openCreate = () => {
    setEditZone(null);
    setForm({ name: '', centerLat: '', centerLng: '', radiusKm: '', multiplier: '', reason: '', activeFrom: '', activeUntil: '' });
    setShowModal(true);
  };

  const openEdit = (zone: any) => {
    setEditZone(zone);
    setForm({
      name: zone.name || '',
      centerLat: zone.centerLat || '',
      centerLng: zone.centerLng || '',
      radiusKm: zone.radiusKm || '',
      multiplier: zone.multiplier || '',
      reason: zone.reason || '',
      activeFrom: zone.activeFrom ? new Date(zone.activeFrom).toISOString().slice(0, 16) : '',
      activeUntil: zone.activeUntil ? new Date(zone.activeUntil).toISOString().slice(0, 16) : '',
    });
    setShowModal(true);
  };

  const save = () => {
    const payload = { ...form };
    const req = editZone
      ? api.patch(`/admin/surge-zones/${editZone.id}`, payload)
      : api.post('/admin/surge-zones', payload);
    req.then(() => { setShowModal(false); fetchZones(); }).catch(console.error);
  };

  const deleteZone = (id: number) => {
    if (!confirm('Delete this surge zone?')) return;
    api.delete(`/admin/surge-zones/${id}`).then(fetchZones).catch(console.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{surgeZones.filter(z => z.isActive).length} active surge zones</p>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <Plus size={16} /> Create Zone
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500"><Loader2 size={24} className="animate-spin mr-2" /> Loading...</div>
      ) : surgeZones.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No surge zones configured</div>
      ) : (
        <div className="grid gap-4">
          {surgeZones.map(zone => (
            <div key={zone.id} className={clsx('bg-slate-800/80 rounded-xl p-5 border', zone.isActive ? 'border-yellow-500/30' : 'border-slate-700/50')}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium">{zone.name}</h3>
                    {zone.isActive && (
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" /> Active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-slate-400">
                    <p>Multiplier: <span className="text-yellow-400 font-bold">{zone.multiplier}x</span></p>
                    <p>Radius: {zone.radiusKm} km — Center: {zone.centerLat}, {zone.centerLng}</p>
                    {zone.reason && <p>Reason: {zone.reason}</p>}
                    {zone.activeFrom && <p>Active: {new Date(zone.activeFrom).toLocaleString()} — {zone.activeUntil ? new Date(zone.activeUntil).toLocaleString() : 'ongoing'}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(zone)} className="p-2 rounded-lg hover:bg-blue-500/20 text-slate-400 hover:text-blue-400"><Pencil size={14} /></button>
                  <button onClick={() => deleteZone(zone.id)} className="p-2 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowModal(false)} />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700 max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editZone ? 'Edit Surge Zone' : 'Create Surge Zone'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Zone Name', key: 'name', type: 'text', placeholder: 'e.g. Downtown Core' },
                { label: 'Center Lat', key: 'centerLat', type: 'number', placeholder: '40.7128' },
                { label: 'Center Lng', key: 'centerLng', type: 'number', placeholder: '-74.0060' },
                { label: 'Radius (km)', key: 'radiusKm', type: 'number', placeholder: '2.5' },
                { label: 'Multiplier', key: 'multiplier', type: 'number', placeholder: '1.5' },
                { label: 'Reason', key: 'reason', type: 'text', placeholder: 'Peak hours' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-sm text-slate-300 block mb-1">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                {['activeFrom', 'activeUntil'].map(k => (
                  <div key={k}>
                    <label className="text-sm text-slate-300 block mb-1">{k === 'activeFrom' ? 'Active From' : 'Active Until'}</label>
                    <input type="datetime-local" value={(form as any)[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Cancel</button>
              <button onClick={save} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">{editZone ? 'Save Changes' : 'Create Zone'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── System Config ────────────────────────────────────────────────────────────

function ConfigTab() {
  const [config, setConfig] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const fetchConfig = useCallback(() => {
    setLoading(true);
    api.get<any[]>('/admin/config').then(d => setConfig(d || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const startEdit = (key: string, val: string) => setEditing(prev => ({ ...prev, [key]: val }));

  const saveConfig = async (key: string) => {
    const val = editing[key];
    if (val === undefined) return;
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      await api.patch(`/admin/config/${key}`, { value: val });
      setConfig(prev => prev.map(c => c.key === key ? { ...c, value: val } : c));
      setEditing(prev => { const n = { ...prev }; delete n[key]; return n; });
      setSaved(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setSaved(prev => { const n = { ...prev }; delete n[key]; return n; }), 2000);
    } catch (err) { console.error(err); }
    finally { setSaving(prev => { const n = { ...prev }; delete n[key]; return n; }); }
  };

  const resetAll = async () => {
    if (!confirm('Reset all config values to defaults?')) return;
    await api.post('/admin/config/reset', {});
    fetchConfig();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Platform operational parameters — changes take effect immediately</p>
        <button onClick={resetAll} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors">
          <RotateCcw size={14} /> Reset Defaults
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500"><Loader2 size={24} className="animate-spin mr-2" /> Loading config...</div>
      ) : (
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="divide-y divide-slate-700/30">
            {config.map(cfg => {
              const isEditing = editing[cfg.key] !== undefined;
              const isSaving = saving[cfg.key];
              const isSaved = saved[cfg.key];
              return (
                <div key={cfg.key} className="flex items-center justify-between px-5 py-4 hover:bg-slate-700/20 transition-colors">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm text-white font-medium">{cfg.description || cfg.key}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{cfg.key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <input
                          type={cfg.type === 'number' ? 'number' : 'text'}
                          value={editing[cfg.key]}
                          onChange={e => setEditing(prev => ({ ...prev, [cfg.key]: e.target.value }))}
                          className="w-28 px-3 py-1.5 bg-slate-700 border border-slate-500 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          autoFocus
                        />
                        <button onClick={() => saveConfig(cfg.key)} disabled={isSaving}
                          className="p-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-400 transition-colors">
                          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        </button>
                        <button onClick={() => setEditing(prev => { const n = { ...prev }; delete n[cfg.key]; return n; })}
                          className="p-1.5 rounded-lg bg-slate-600/50 hover:bg-slate-600 text-slate-400 transition-colors">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        {isSaved ? (
                          <span className="flex items-center gap-1 text-green-400 text-xs font-medium px-3 py-1.5">
                            <CheckCircle size={12} /> Saved
                          </span>
                        ) : (
                          <span className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm font-mono min-w-[80px] text-center">{cfg.value}</span>
                        )}
                        <button onClick={() => startEdit(cfg.key, cfg.value)}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                          <Pencil size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Geofence Tab ─────────────────────────────────────────────────────────────

function GeofenceTab() {
  const [surgeZones, setSurgeZones] = useState<any[]>([]);
  useEffect(() => { api.get<any[]>('/admin/surge-zones').then(d => setSurgeZones(d || [])).catch(console.error); }, []);

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-700/50">
          <h3 className="text-white font-medium">Service Zones</h3>
          <p className="text-xs text-slate-400 mt-1">Active surge zones define operational boundaries. {surgeZones.filter(z => z.isActive).length} zones active.</p>
        </div>
        <div className="divide-y divide-slate-700/30">
          {surgeZones.length === 0 ? (
            <p className="px-5 py-8 text-center text-slate-500">No zones configured. Create surge zones to define service areas.</p>
          ) : surgeZones.map(zone => (
            <div key={zone.id} className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">{zone.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">Center: {Number(zone.centerLat).toFixed(4)}, {Number(zone.centerLng).toFixed(4)} · Radius: {zone.radiusKm}km · {zone.multiplier}x surge</p>
              </div>
              <span className={clsx('px-2 py-0.5 text-xs rounded-full', zone.isActive ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-600/30 text-slate-400')}>
                {zone.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500 text-center">Map visualization requires a Google Maps API key configured in the environment.</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const tabs = [
  { id: 'surge' as const, label: 'Surge Pricing', icon: Zap },
  { id: 'geofence' as const, label: 'Geofencing', icon: MapPin },
  { id: 'config' as const, label: 'System Config', icon: Settings },
];

export default function OperationsPage() {
  const [tab, setTab] = useState<'surge' | 'geofence' | 'config'>('surge');

  return (
    <>
      <Header title="Operations" subtitle="Surge pricing, geofencing and platform configuration" />
      <div className="p-6 space-y-4">
        <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx('flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>
        {tab === 'surge' && <SurgeTab />}
        {tab === 'geofence' && <GeofenceTab />}
        {tab === 'config' && <ConfigTab />}
      </div>
    </>
  );
}
