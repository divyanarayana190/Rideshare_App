import { useEffect, useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { ADMIN_ROLES, type AdminRole } from '@shared/adminRbac';
import { useRole } from '@/hooks/usePermissions';
import { Navigate } from 'react-router-dom';

type AdminRow = { id: number; name: string | null; email: string | null; role: AdminRole };

export default function AdminRolesPage() {
  const myRole = useRole();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    api.get<AdminRow[]>('/admin/rbac/roles').then(setRows).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (myRole !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const updateRole = async (userId: number, role: AdminRole) => {
    setSaving(userId);
    try {
      await api.patch(`/admin/rbac/roles/${userId}`, { role });
      setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, role } : r)));
    } catch (e) {
      console.error(e);
      alert('Failed to update role');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <Header title="Department Roles" subtitle="Assign admin panel access levels per team member" />
      <div className="p-6">
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <Shield size={18} className="text-violet-400" />
            <h2 className="text-white font-semibold">Admin Accounts</h2>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center text-slate-500"><Loader2 className="animate-spin" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 font-medium">Admin</th>
                  <th className="text-left px-5 py-3 font-medium">Email</th>
                  <th className="text-left px-5 py-3 font-medium">Department Role</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="px-5 py-3 text-white">{r.name || '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{r.email}</td>
                    <td className="px-5 py-3">
                      <select
                        value={r.role}
                        disabled={saving === r.id}
                        onChange={(e) => updateRole(r.id, e.target.value as AdminRole)}
                        className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-200 text-sm capitalize"
                      >
                        {ADMIN_ROLES.map((role) => (
                          <option key={role} value={role}>{role.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Roles: Support → Ops → Admin → Super Admin. Server APIs enforce the same permissions.
        </p>
      </div>
    </>
  );
}
