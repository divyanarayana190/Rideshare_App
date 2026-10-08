import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Pencil, Trash2, X, Gift, Users, Loader2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

export default function PromosPage() {
  const [tab, setTab] = useState<'promos' | 'referrals'>('promos');
  const [showCreate, setShowCreate] = useState(false);
  const [editPromo, setEditPromo] = useState<any>(null);
  const [promos, setPromos] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [form, setForm] = useState({
    code: '', description: '', discountType: 'percentage', discountValue: '',
    maxUses: '', minRideAmount: '', maxDiscount: '', validFrom: '', validUntil: '',
  });

  const fetchPromos = useCallback(() => {
    setLoading(true);
    api.get<any>('/admin/promos')
      .then((d) => setPromos(d.promos || d || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fetchReferrals = useCallback(() => {
    setLoading(true);
    api.get<any>('/admin/referrals?page=1&limit=50')
      .then((d) => setReferrals(d.referrals || d.items || d || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'promos') fetchPromos();
    else fetchReferrals();
  }, [tab, fetchPromos, fetchReferrals]);

  const openCreate = () => {
    setEditPromo(null);
    setForm({ code: '', description: '', discountType: 'percentage', discountValue: '', maxUses: '', minRideAmount: '', maxDiscount: '', validFrom: '', validUntil: '' });
    setShowCreate(true);
  };

  const openEdit = (p: any) => {
    setEditPromo(p);
    setForm({
      code: p.code || '', description: p.description || '', discountType: p.discountType || 'percentage',
      discountValue: String(p.discountValue || ''), maxUses: String(p.maxUses || ''),
      minRideAmount: String(p.minRideAmount || ''), maxDiscount: String(p.maxDiscount || ''),
      validFrom: p.validFrom?.slice(0, 10) || '', validUntil: p.validUntil?.slice(0, 10) || '',
    });
    setShowCreate(true);
  };

  const savePromo = () => {
    const body = {
      code: form.code, description: form.description, discountType: form.discountType,
      discountValue: form.discountValue, maxUses: form.maxUses ? Number(form.maxUses) : null,
      minRideAmount: form.minRideAmount || '0', maxDiscount: form.maxDiscount || null,
      validFrom: form.validFrom, validUntil: form.validUntil,
    };
    const req = editPromo
      ? api.patch(`/admin/promos/${editPromo.id}`, body)
      : api.post('/admin/promos', body);
    req.then(() => { setShowCreate(false); fetchPromos(); }).catch(console.error);
  };

  const deletePromo = (id: number) => {
    if (!confirm('Delete this promo code?')) return;
    api.delete(`/admin/promos/${id}`).then(() => fetchPromos()).catch(console.error);
  };

  const activePromos = promos.filter((p: any) => p.isActive);
  const totalRedemptions = promos.reduce((sum: number, p: any) => sum + (p.currentUses || 0), 0);

  return (
    <>
      <Header title="Promotions & Growth" subtitle="Manage promos and referrals" />
      <div className="p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: 'Active Promos', value: String(activePromos.length), icon: Tag, color: '#3B82F6' },
            { label: 'Total Redemptions', value: totalRedemptions.toLocaleString(), icon: Gift, color: '#10B981' },
            { label: 'Total Promos', value: String(promos.length), icon: Tag, color: '#F59E0B' },
            { label: 'Referrals', value: String(referrals.length), icon: Users, color: '#8B5CF6' },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${s.color}20` }}>
                  <s.icon size={18} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {(['promos', 'referrals'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={clsx('px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize',
                  tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                {t === 'promos' ? 'Promo Codes' : 'Referrals'}
              </button>
            ))}
          </div>
          {tab === 'promos' && (
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
              <Plus size={16} /> Create Promo
            </button>
          )}
        </div>

        {/* Promos Table */}
        {tab === 'promos' && (
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Code</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Value</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Uses</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Valid Period</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading promos...
                  </td></tr>
                ) : promos.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No promo codes found</td></tr>
                ) : promos.map((p: any) => (
                  <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">{p.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 text-xs rounded-full',
                        p.discountType === 'percentage' ? 'bg-violet-500/20 text-violet-400' : 'bg-green-500/20 text-green-400')}>
                        {p.discountType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      {p.discountType === 'percentage' ? `${p.discountValue}%` : `$${p.discountValue}`}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {p.currentUses || 0}{p.maxUses ? `/${p.maxUses}` : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {p.validFrom ? new Date(p.validFrom).toLocaleDateString() : '—'} — {p.validUntil ? new Date(p.validUntil).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 text-xs rounded-full',
                        p.isActive ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400')}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg hover:bg-slate-600/50 text-slate-400 hover:text-white"><Pencil size={14} /></button>
                      <button onClick={() => deletePromo(p.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Referrals Table */}
        {tab === 'referrals' && (
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Referrer</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Referred User</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Code</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Credit</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading referrals...
                  </td></tr>
                ) : referrals.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No referrals found</td></tr>
                ) : referrals.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-white">{r.referrerName || `User #${r.referrerId}`}</td>
                    <td className="px-4 py-3 text-slate-300">{r.referredName || `User #${r.referredId}`}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-400">{r.referralCode || r.code || '—'}</td>
                    <td className="px-4 py-3 text-green-400">${r.creditAmount || r.credit || '15.00'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 text-xs rounded-full',
                        r.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400')}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Promo Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editPromo ? 'Edit Promo' : 'Create Promo Code'}</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-300 block mb-1">Code</label>
                <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SUMMER30"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white uppercase focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-sm text-slate-300 block mb-1">Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Promo description"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 block mb-1">Type</label>
                  <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500">
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1">Value</label>
                  <input type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 block mb-1">Max Uses</label>
                  <input type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1">Min Ride $</label>
                  <input type="number" value={form.minRideAmount} onChange={(e) => setForm({ ...form, minRideAmount: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 block mb-1">Valid From</label>
                  <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1">Valid Until</label>
                  <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Cancel</button>
              <button onClick={savePromo} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
                {editPromo ? 'Save Changes' : 'Create Promo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
