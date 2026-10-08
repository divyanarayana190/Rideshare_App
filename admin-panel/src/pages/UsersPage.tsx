import { useState, useEffect, useCallback } from 'react';
import { Search, Star, ChevronLeft, ChevronRight, X, Shield, Ban, Mail, Phone, Loader2, UserPlus, ChevronDown, Download, CheckSquare, Pencil, Save, AlertTriangle } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface UserRow {
  id: number; name: string | null; email: string | null; role: string; createdAt: string; lastSignedIn: string;
  profile: {
    phoneNumber: string | null; isDriver: boolean; averageRating: string; totalRides: number;
    totalEarnings: string; vehicleType: string | null; licensePlate: string | null;
    gender: string | null; isBanned: boolean; banReason: string | null;
    isStudent: boolean; collegeEmail: string | null;
    isStudentVerified: boolean; studentUniversityName: string | null;
    studentUniversityDomain: string | null; studentVerifiedAt: string | null;
  } | null;
}
interface UserDetail extends UserRow {
  wallet: { balance: string; totalSpent: string; totalEarned: string } | null;
  recentRides: any[]; recentTransactions: any[]; ratings: any[];
}

const FILTERS = ['All', 'Passengers', 'Drivers', 'Admins', 'Students'];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [gender, setGender] = useState('all');
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Ban modal
  const [banModal, setBanModal] = useState<{ userId: number; name: string } | null>(null);
  const [banReason, setBanReason] = useState('');

  // Edit mode in detail panel
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phoneNumber: '', vehicleType: '', vehicleColor: '', licensePlate: '', driverLicense: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', phone: '', role: 'user', gender: 'male', isDriver: false, vehicleType: '', vehicleColor: '', licensePlate: '', driverLicense: '' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const filterParam = filter === 'Drivers' ? 'drivers' : filter === 'Passengers' ? 'passengers' : filter === 'Admins' ? 'admins' : filter === 'Students' ? 'students' : 'all';
    api.get<any>(`/admin/users?page=${page}&search=${encodeURIComponent(search)}&filter=${filterParam}&gender=${gender}`)
      .then(d => { setUsers(d.users || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1); })
      .catch(console.error).finally(() => setLoading(false));
  }, [page, search, filter, gender]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); fetchUsers(); }, 300); return () => clearTimeout(t); }, [search]);

  const openDetail = (userId: number) => {
    setEditMode(false);
    setLoadingDetail(true);
    api.get<UserDetail>(`/admin/users/${userId}`)
      .then(u => {
        setSelectedUser(u);
        setEditForm({ name: u.name || '', email: u.email || '', phoneNumber: u.profile?.phoneNumber || '', vehicleType: u.profile?.vehicleType || '', vehicleColor: '', licensePlate: u.profile?.licensePlate || '', driverLicense: '' });
      })
      .catch(console.error).finally(() => setLoadingDetail(false));
  };

  const saveEdit = async () => {
    if (!selectedUser) return;
    setEditSaving(true);
    try {
      await api.patch(`/admin/users/${selectedUser.id}/profile`, editForm);
      setEditMode(false);
      openDetail(selectedUser.id);
      fetchUsers();
    } catch (err) { console.error(err); } finally { setEditSaving(false); }
  };

  const confirmBan = async () => {
    if (!banModal) return;
    await api.post(`/admin/users/${banModal.userId}/ban`, { reason: banReason });
    setBanModal(null); setBanReason('');
    fetchUsers();
    if (selectedUser?.id === banModal.userId) openDetail(banModal.userId);
  };

  const unban = async (userId: number) => {
    await api.post(`/admin/users/${userId}/unban`, {});
    fetchUsers();
    if (selectedUser?.id === userId) openDetail(userId);
  };

  const handleBulkBan = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Ban ${selected.size} selected users?`)) return;
    await api.post('/admin/users/bulk-ban', { userIds: Array.from(selected), reason: 'Bulk ban by admin' });
    setSelected(new Set()); fetchUsers();
  };

  const exportCsv = () => {
    const token = localStorage.getItem('admin_token');
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/admin/export/users`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = u; a.download = `users_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(u);
      });
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    if (selected.size === users.length) setSelected(new Set());
    else setSelected(new Set(users.map(u => u.id)));
  };

  const handleRoleChange = (userId: number, role: string) => {
    if (!confirm(`Change role to ${role.toUpperCase()}?`)) return;
    api.patch(`/admin/users/${userId}/role`, { role }).then(() => { fetchUsers(); if (selectedUser) openDetail(userId); });
  };

  const handleGenderChange = (userId: number, g: string) => {
    api.patch(`/admin/users/${userId}/gender`, { gender: g }).then(() => { fetchUsers(); if (selectedUser) openDetail(userId); });
  };

  const handleDriverToggle = (userId: number, isDriver: boolean) => {
    if (!confirm(`${isDriver ? 'Grant' : 'Revoke'} driver access?`)) return;
    api.patch(`/admin/users/${userId}/driver-status`, { isDriver }).then(() => { fetchUsers(); if (selectedUser) openDetail(userId); });
  };

  const handleCreate = () => {
    if (!createForm.name || !createForm.email) { setCreateError('Name and email are required'); return; }
    setCreateLoading(true); setCreateError('');
    api.post('/admin/users', createForm)
      .then(() => { setShowCreate(false); setCreateForm({ name: '', email: '', phone: '', role: 'user', gender: 'male', isDriver: false, vehicleType: '', vehicleColor: '', licensePlate: '', driverLicense: '' }); fetchUsers(); })
      .catch(err => setCreateError(err.message || 'Failed')).finally(() => setCreateLoading(false));
  };

  return (
    <>
      <Header title="User Management" subtitle={`${total} total users`} />
      <div className="p-6 space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {FILTERS.map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(1); }}
                className={clsx('px-3 py-2 rounded-md text-xs font-medium transition-colors', filter === f ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                {f}
              </button>
            ))}
          </div>
          <div className="relative">
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select value={gender} onChange={e => { setGender(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 focus:outline-none focus:border-blue-500">
              <option value="all">All Genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non_binary">Non-Binary</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors">
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors font-medium">
              <UserPlus size={16} /> New User
            </button>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-600/10 border border-blue-500/30 rounded-xl">
            <CheckSquare size={16} className="text-blue-400" />
            <span className="text-blue-300 text-sm font-medium">{selected.size} selected</span>
            <div className="flex gap-2 ml-2">
              <button onClick={handleBulkBan} className="px-3 py-1.5 bg-red-600/20 text-red-400 text-xs rounded-lg hover:bg-red-600/30 transition-colors border border-red-500/30">
                Ban Selected
              </button>
            </div>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-slate-400 hover:text-white"><X size={16} /></button>
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={selected.size === users.length && users.length > 0} onChange={toggleAll}
                      className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-0" />
                  </th>
                  {['User', 'Contact', 'Gender', 'Role', 'Rating', 'Rides', 'Status', 'Joined'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500"><Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">No users found</td></tr>
                ) : users.map(user => (
                  <tr key={user.id} onClick={() => openDetail(user.id)}
                    className={clsx('border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors', selected.has(user.id) && 'bg-blue-600/5')}>
                    <td className="px-4 py-3" onClick={e => toggleSelect(user.id, e)}>
                      <input type="checkbox" checked={selected.has(user.id)} onChange={() => {}} onClick={e => e.stopPropagation()}
                        className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-0 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold', user.profile?.isBanned ? 'bg-red-600/70' : 'bg-gradient-to-br from-blue-500 to-violet-500')}>
                          {user.name?.[0] || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-white">{user.name || 'Unknown'}</p>
                          <p className="text-xs text-slate-400">ID: {user.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-300 text-xs">{user.email || '—'}</p>
                      <p className="text-xs text-slate-500">{user.profile?.phoneNumber || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 text-xs rounded-full capitalize',
                        user.profile?.gender === 'male' ? 'bg-sky-500/20 text-sky-400' :
                        user.profile?.gender === 'female' ? 'bg-pink-500/20 text-pink-400' :
                        user.profile?.gender === 'non_binary' ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-600/30 text-slate-400')}>
                        {user.profile?.gender?.replace('_', ' ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {user.role === 'admin' && <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-xs rounded-full">Admin</span>}
                        {user.profile?.isDriver
                          ? <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">Driver</span>
                          : <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">Rider</span>}
                        {user.profile?.isStudentVerified && (
                          <span title={user.profile.studentUniversityName ?? 'Verified Student'}
                            className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full flex items-center gap-1">
                            🎓 Student
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-yellow-400">
                        <Star size={12} fill="currentColor" />
                        <span className="text-white text-xs">{user.profile?.averageRating || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{user.profile?.totalRides || 0}</td>
                    <td className="px-4 py-3">
                      {user.profile?.isBanned
                        ? <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1 w-fit"><Ban size={10} /> Banned</span>
                        : <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full w-fit">Active</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(user.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <p className="text-sm text-slate-400">Page {page} of {totalPages} ({total} total)</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i;
                if (p > totalPages) return null;
                return <button key={p} onClick={() => setPage(p)} className={clsx('px-3 py-1 rounded-lg text-sm', p === page ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-slate-700')}>{p}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        </div>
      </div>

      {/* ── User Detail Slide Panel ── */}
      {(selectedUser || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setSelectedUser(null); setEditMode(false); }} />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">User Profile</h2>
                <div className="flex gap-2">
                  {selectedUser && !editMode && (
                    <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors">
                      <Pencil size={14} /> Edit
                    </button>
                  )}
                  <button onClick={() => { setSelectedUser(null); setEditMode(false); }} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><X size={20} /></button>
                </div>
              </div>

              {loadingDetail ? (
                <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-blue-400" /></div>
              ) : selectedUser && (
                <>
                  {/* Ban banner */}
                  {selectedUser.profile?.isBanned && (
                    <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                      <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-red-400 font-semibold text-sm">This user is banned</p>
                        {selectedUser.profile.banReason && <p className="text-red-300/70 text-xs mt-0.5">{selectedUser.profile.banReason}</p>}
                      </div>
                      <button onClick={() => unban(selectedUser.id)} className="text-xs px-3 py-1 bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 border border-green-500/30 transition-colors shrink-0">
                        Unban
                      </button>
                    </div>
                  )}

                  {/* Avatar */}
                  <div className="text-center">
                    <div className={clsx('w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto', selectedUser.profile?.isBanned ? 'bg-red-600/70' : 'bg-gradient-to-br from-blue-500 to-violet-500')}>
                      {selectedUser.name?.[0] || '?'}
                    </div>
                    <h3 className="text-lg font-bold text-white mt-3">{selectedUser.name}</h3>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      {selectedUser.role === 'admin' && <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-xs rounded-full">Admin</span>}
                      {selectedUser.profile?.isDriver ? <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">Driver</span> : <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">Passenger</span>}
                    </div>
                  </div>

                  {/* Edit Form OR Info */}
                  {editMode ? (
                    <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-blue-500/30">
                      <p className="text-sm font-semibold text-blue-400">Edit Profile</p>
                      {[
                        { label: 'Name', key: 'name', type: 'text' },
                        { label: 'Email', key: 'email', type: 'email' },
                        { label: 'Phone', key: 'phoneNumber', type: 'tel' },
                        { label: 'Vehicle Type', key: 'vehicleType', type: 'text' },
                        { label: 'License Plate', key: 'licensePlate', type: 'text' },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                          <input type={f.type} value={(editForm as any)[f.key]} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setEditMode(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">Cancel</button>
                        <button onClick={saveEdit} disabled={editSaving}
                          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                          {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-3 text-sm"><Mail size={16} className="text-slate-400" /><span className="text-slate-200">{selectedUser.email || 'N/A'}</span></div>
                      <div className="flex items-center gap-3 text-sm"><Phone size={16} className="text-slate-400" /><span className="text-slate-200">{selectedUser.profile?.phoneNumber || 'N/A'}</span></div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-white">{selectedUser.profile?.totalRides || 0}</p><p className="text-xs text-slate-400 mt-1">Total Rides</p></div>
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-yellow-400">{selectedUser.profile?.averageRating || '—'}</p><p className="text-xs text-slate-400 mt-1">Avg Rating</p></div>
                    {selectedUser.wallet && (
                      <div className="bg-slate-800/50 rounded-xl p-4 text-center col-span-2">
                        <p className="text-2xl font-bold text-green-400">${Number(selectedUser.wallet.balance || 0).toFixed(2)}</p>
                        <p className="text-xs text-slate-400 mt-1">Wallet Balance</p>
                      </div>
                    )}
                    {selectedUser.profile?.isDriver && (
                      <div className="bg-slate-800/50 rounded-xl p-4 text-center col-span-2">
                        <p className="text-2xl font-bold text-green-400">${Number(selectedUser.profile.totalEarnings).toLocaleString()}</p>
                        <p className="text-xs text-slate-400 mt-1">Total Earnings</p>
                      </div>
                    )}
                  </div>

                  {/* Student Verification */}
                  {(selectedUser.profile?.isStudent || selectedUser.profile?.isStudentVerified) && (
                    <div className={clsx(
                      'rounded-xl p-4 space-y-2 border',
                      selectedUser.profile.isStudentVerified
                        ? 'bg-indigo-500/10 border-indigo-500/30'
                        : 'bg-slate-800/50 border-slate-700/50',
                    )}>
                      <div className="flex items-center gap-2">
                        <span className="text-base">🎓</span>
                        <h4 className="text-sm font-semibold text-white">Student Status</h4>
                        {selectedUser.profile.isStudentVerified
                          ? <span className="ml-auto px-2 py-0.5 bg-indigo-500/30 text-indigo-300 text-xs rounded-full border border-indigo-500/40">Verified</span>
                          : <span className="ml-auto px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded-full border border-yellow-500/30">Unverified</span>}
                      </div>
                      {selectedUser.profile.isStudentVerified ? (
                        <div className="space-y-1 text-xs text-slate-300">
                          <p><span className="text-slate-400">University: </span>{selectedUser.profile.studentUniversityName || '—'}</p>
                          <p><span className="text-slate-400">Domain: </span>{selectedUser.profile.studentUniversityDomain || '—'}</p>
                          <p><span className="text-slate-400">Verified email: </span>{selectedUser.profile.collegeEmail || '—'}</p>
                          {selectedUser.profile.studentVerifiedAt && (
                            <p><span className="text-slate-400">Verified at: </span>{new Date(selectedUser.profile.studentVerifiedAt).toLocaleString()}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          Self-declared student.{selectedUser.profile.collegeEmail ? ` Unverified email: ${selectedUser.profile.collegeEmail}` : ' No college email on file.'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Recent Rides */}
                  {selectedUser.recentRides?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 mb-2">Recent Rides</h4>
                      <div className="space-y-2">
                        {selectedUser.recentRides.map((r: any) => (
                          <div key={r.id} className="bg-slate-800/50 rounded-lg p-3 text-xs">
                            <div className="flex justify-between">
                              <span className="text-blue-400 font-mono">{r.rideId}</span>
                              <span className={clsx('px-1.5 py-0.5 rounded-full', r.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/30 text-slate-300')}>{r.status}</span>
                            </div>
                            <p className="text-slate-400 mt-1">${r.totalFare} — {new Date(r.createdAt).toLocaleDateString()}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Role Management */}
                  <div className="bg-slate-800/50 rounded-xl p-4 space-y-4 border border-slate-700/50">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Shield size={16} className="text-blue-400" /> Role Management</h4>
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm font-medium text-slate-200">System Role</p><p className="text-xs text-slate-400 mt-0.5">Controls admin panel access</p></div>
                      <select value={selectedUser.role} onChange={e => handleRoleChange(selectedUser.id, e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                        <option value="user">User</option><option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="border-t border-slate-700/50" />
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm font-medium text-slate-200">Driver Access</p><p className="text-xs text-slate-400 mt-0.5">Can accept rides</p></div>
                      <button onClick={() => handleDriverToggle(selectedUser.id, !selectedUser.profile?.isDriver)}
                        className={clsx('relative inline-flex h-7 w-12 items-center rounded-full transition-colors', selectedUser.profile?.isDriver ? 'bg-green-500' : 'bg-slate-600')}>
                        <span className={clsx('inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm', selectedUser.profile?.isDriver ? 'translate-x-6' : 'translate-x-1')} />
                      </button>
                    </div>
                  </div>

                  {/* Gender */}
                  <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-700/50">
                    <h4 className="text-sm font-semibold text-white">Gender</h4>
                    <div className="flex flex-wrap gap-2">
                      {[{ v: 'male', l: 'Male', a: 'border-sky-500 bg-sky-500/10 text-sky-400' }, { v: 'female', l: 'Female', a: 'border-pink-500 bg-pink-500/10 text-pink-400' }, { v: 'non_binary', l: 'Non-Binary', a: 'border-violet-500 bg-violet-500/10 text-violet-400' }, { v: 'prefer_not_to_say', l: 'Prefer Not', a: 'border-slate-400 bg-slate-400/10 text-slate-300' }].map(g => (
                        <button key={g.v} onClick={() => handleGenderChange(selectedUser.id, g.v)}
                          className={clsx('px-3 py-1.5 rounded-lg border text-xs font-medium transition-all', selectedUser.profile?.gender === g.v ? g.a : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500 hover:text-white')}>
                          {g.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/20">
                    <h4 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h4>
                    {selectedUser.profile?.isBanned ? (
                      <button onClick={() => unban(selectedUser.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500/10 rounded-xl text-green-400 hover:bg-green-500/20 transition-colors text-sm font-medium border border-green-500/20">
                        Unban User
                      </button>
                    ) : (
                      <button onClick={() => setBanModal({ userId: selectedUser.id, name: selectedUser.name || `User #${selectedUser.id}` })}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 rounded-xl text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium border border-red-500/20">
                        <Ban size={16} /> Ban User
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {banModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setBanModal(null)} />
          <div className="relative bg-slate-900 rounded-2xl border border-red-500/30 max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-red-400">Ban {banModal.name}</h3>
            <p className="text-sm text-slate-400">This will prevent the user from logging in and using the app.</p>
            <div>
              <label className="text-sm text-slate-300 block mb-1">Reason (required)</label>
              <textarea rows={3} value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Describe why this user is being banned..."
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-400 focus:outline-none focus:border-red-500 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setBanModal(null)} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Cancel</button>
              <button onClick={confirmBan} disabled={!banReason.trim()}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40">
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Create New User</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            {createError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{createError}</div>}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[{ l: 'Full Name *', k: 'name', t: 'text', p: 'John Smith' }, { l: 'Email *', k: 'email', t: 'email', p: 'user@email.com' }].map(f => (
                  <div key={f.k}>
                    <label className="text-sm text-slate-300 block mb-1">{f.l}</label>
                    <input type={f.t} value={(createForm as any)[f.k]} onChange={e => setCreateForm({ ...createForm, [f.k]: e.target.value })} placeholder={f.p}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-300 block mb-1">Phone</label>
                  <input type="tel" value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="1234567890"
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-1">Role</label>
                  <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm">
                    <option value="user">User</option><option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={createForm.isDriver} onChange={e => setCreateForm({ ...createForm, isDriver: e.target.checked })} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600" />
                <span className="text-sm text-slate-300">Register as Driver</span>
              </label>
              {createForm.isDriver && (
                <div className="grid grid-cols-2 gap-3">
                  {[{ l: 'Vehicle Type', k: 'vehicleType', p: 'Sedan' }, { l: 'License Plate', k: 'licensePlate', p: 'ABC-1234' }].map(f => (
                    <div key={f.k}>
                      <label className="text-sm text-slate-300 block mb-1">{f.l}</label>
                      <input type="text" value={(createForm as any)[f.k]} onChange={e => setCreateForm({ ...createForm, [f.k]: e.target.value })} placeholder={f.p}
                        className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={createLoading}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {createLoading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
