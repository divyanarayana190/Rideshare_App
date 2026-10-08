import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, X, Play, Trash2, ToggleLeft, ToggleRight, Calculator } from 'lucide-react';
import { api } from '@/lib/api';
import { IfRole } from '@/components/RequireRole';
import { clsx } from 'clsx';

interface PricingRule {
  id: number;
  name: string;
  type: string;
  condition: string;
  multiplier: string;
  flatAdjustment: string | null;
  priority: number;
  isActive: boolean;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: string | null;
  zoneIds: string | null;
  createdAt: string;
}

interface SimResult {
  baseFare: number;
  adjustedFare: number;
  appliedRules: string[];
  finalMultiplier: number;
}

const RULE_TYPES = ['surge', 'discount', 'flat_fee', 'time_based', 'zone_based'];

export default function PricingRulesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editRule, setEditRule] = useState<PricingRule | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simInput, setSimInput] = useState({ baseFare: 1200, distanceKm: 10, hour: 8, dayOfWeek: 1, zone: '' });

  const emptyForm = { name: '', type: 'surge', condition: '', multiplier: '1.0', flatAdjustment: '', priority: 1, startTime: '', endTime: '', daysOfWeek: '', zoneIds: '' };
  const [form, setForm] = useState(emptyForm);

  const { data: rules = [], isLoading } = useQuery<PricingRule[]>({
    queryKey: ['pricing-rules'],
    queryFn: () => api.get('/admin/pricing-rules'),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post('/admin/pricing-rules', { ...body, multiplier: parseFloat(body.multiplier), flatAdjustment: body.flatAdjustment ? parseInt(body.flatAdjustment) : null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing-rules'] }); setShowCreate(false); setForm(emptyForm); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<PricingRule> }) => api.patch(`/admin/pricing-rules/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing-rules'] }); setEditRule(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/pricing-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }),
  });

  const runSimulation = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const result = await api.post<SimResult>('/admin/pricing-rules/simulate', simInput);
      setSimResult(result);
    } finally {
      setSimLoading(false);
    }
  };

  const activeRules = rules.filter(r => r.isActive);
  const inactiveRules = rules.filter(r => !r.isActive);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag size={24} className="text-purple-400" /> Pricing Rules
          </h1>
          <p className="text-sm text-slate-400 mt-1">Configure dynamic pricing, surge multipliers, and discounts</p>
        </div>
        <IfRole role="admin">
          <button
            onClick={() => { setShowCreate(true); setForm(emptyForm); }}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Rule
          </button>
        </IfRole>
      </div>

      {/* Simulator */}
      <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5">
        <p className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <Calculator size={14} className="text-yellow-400" /> Fare Simulator (Dry Run)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Base Fare (¢)', key: 'baseFare', type: 'number' },
            { label: 'Distance (km)', key: 'distanceKm', type: 'number' },
            { label: 'Hour (0-23)', key: 'hour', type: 'number' },
            { label: 'Day (0=Sun)', key: 'dayOfWeek', type: 'number' },
            { label: 'Zone', key: 'zone', type: 'text' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
              <input
                type={f.type}
                value={(simInput as any)[f.key]}
                onChange={e => setSimInput(s => ({ ...s, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={runSimulation}
            disabled={simLoading}
            className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={14} /> {simLoading ? 'Running…' : 'Simulate'}
          </button>
          {simResult && (
            <div className="flex items-center gap-6 text-sm">
              <span className="text-slate-400">Base: <span className="text-white font-semibold">${(simResult.baseFare / 100).toFixed(2)}</span></span>
              <span className="text-slate-400">Adjusted: <span className="text-green-400 font-bold">${(simResult.adjustedFare / 100).toFixed(2)}</span></span>
              <span className="text-slate-400">Multiplier: <span className="text-yellow-400 font-semibold">{simResult.finalMultiplier.toFixed(2)}x</span></span>
              {simResult.appliedRules.length > 0 && (
                <span className="text-slate-400 text-xs">Rules: {simResult.appliedRules.join(', ')}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Active Rules */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Active Rules ({activeRules.length})</h2>
        {isLoading ? (
          <div className="text-center py-8 text-slate-500">Loading…</div>
        ) : activeRules.length === 0 ? (
          <div className="text-center py-8 text-slate-500 bg-slate-800 rounded-xl border border-slate-700/50">No active rules</div>
        ) : (
          <div className="space-y-2">
            {activeRules.map(rule => <RuleCard key={rule.id} rule={rule} onToggle={id => updateMutation.mutate({ id, body: { isActive: false } })} onDelete={id => deleteMutation.mutate(id)} />)}
          </div>
        )}
      </div>

      {/* Inactive Rules */}
      {inactiveRules.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Inactive Rules ({inactiveRules.length})</h2>
          <div className="space-y-2">
            {inactiveRules.map(rule => <RuleCard key={rule.id} rule={rule} onToggle={id => updateMutation.mutate({ id, body: { isActive: true } })} onDelete={id => deleteMutation.mutate(id)} />)}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreate || editRule) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editRule ? 'Edit Rule' : 'New Pricing Rule'}</h2>
              <button onClick={() => { setShowCreate(false); setEditRule(null); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Rule name" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Multiplier</label>
                  <input type="number" step="0.1" value={form.multiplier} onChange={e => setForm(f => ({ ...f, multiplier: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <input value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                placeholder="Condition (e.g. demand > 80)" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  placeholder="Start time (HH:MM)" className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
                <input value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  placeholder="End time (HH:MM)" className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
              <input value={form.daysOfWeek} onChange={e => setForm(f => ({ ...f, daysOfWeek: e.target.value }))}
                placeholder="Days of week (0,1,2 = Sun,Mon,Tue)" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={form.flatAdjustment} onChange={e => setForm(f => ({ ...f, flatAdjustment: e.target.value }))}
                  placeholder="Flat adj. (cents)" className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
                <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
                  placeholder="Priority" className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowCreate(false); setEditRule(null); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={() => {
                  if (editRule) updateMutation.mutate({ id: editRule.id, body: { ...form, multiplier: parseFloat(form.multiplier) as any } });
                  else createMutation.mutate(form);
                }}
                disabled={!form.name || createMutation.isPending || updateMutation.isPending}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving…' : editRule ? 'Update' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleCard({ rule, onToggle, onDelete }: { rule: PricingRule; onToggle: (id: number) => void; onDelete: (id: number) => void }) {
  return (
    <div className={clsx('bg-slate-800 rounded-xl border p-4 flex items-center gap-4 transition-colors', rule.isActive ? 'border-slate-700/50' : 'border-slate-700/30 opacity-60')}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">{rule.name}</span>
          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">{rule.type}</span>
          <span className="text-xs text-yellow-400 font-semibold">{parseFloat(rule.multiplier).toFixed(2)}x</span>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
          {rule.condition && <span>if {rule.condition}</span>}
          {rule.startTime && rule.endTime && <span>{rule.startTime}–{rule.endTime}</span>}
          <span className="text-slate-500">Priority {rule.priority}</span>
        </div>
      </div>
      <IfRole role="admin">
        <button onClick={() => onToggle(rule.id)} className="text-slate-400 hover:text-white transition-colors">
          {rule.isActive ? <ToggleRight size={22} className="text-green-400" /> : <ToggleLeft size={22} />}
        </button>
        <button onClick={() => onDelete(rule.id)} className="text-slate-500 hover:text-red-400 transition-colors">
          <Trash2 size={16} />
        </button>
      </IfRole>
    </div>
  );
}
