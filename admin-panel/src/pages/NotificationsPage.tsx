import { useState, useEffect } from 'react';
import { Bell, Send, Users, Car, Globe, User, Loader2, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

const targetOptions = [
  { value: 'all', label: 'All Users', icon: Globe, color: 'blue' },
  { value: 'users', label: 'Riders Only', icon: Users, color: 'green' },
  { value: 'drivers', label: 'Drivers Only', icon: Car, color: 'purple' },
  { value: 'specific', label: 'Specific User', icon: User, color: 'orange' },
];

const typeOptions = [
  { value: 'system', label: 'System' },
  { value: 'ride_request', label: 'Ride Request' },
  { value: 'driver_assigned', label: 'Driver Assigned' },
  { value: 'ride_completed', label: 'Ride Completed' },
  { value: 'ride_cancelled', label: 'Ride Cancelled' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'rating_request', label: 'Rating Request' },
  { value: 'promo_code', label: 'Promo Code' },
  { value: 'safety_alert', label: 'Safety Alert' },
];

export default function NotificationsPage() {
  const [target, setTarget] = useState('all');
  const [gender, setGender] = useState('all');
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('system');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState('');

  const [history, setHistory] = useState<any[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = (page: number) => {
    setLoadingHistory(true);
    api.get<any>(`/admin/notifications/history?page=${page}`)
      .then((d) => {
        setHistory(d.notifications || d || []);
        setTotalPages(d.totalPages || 1);
        setHistoryPage(d.page || page);
      })
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => { fetchHistory(1); }, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required');
      return;
    }
    if (target === 'specific' && !userId.trim()) {
      setError('User ID is required for specific user targeting');
      return;
    }
    setSending(true);
    setError('');
    setSent(false);
    try {
      const payload: any = { title, body, type };
      if (target === 'specific') {
        payload.userId = parseInt(userId);
      } else {
        payload.target = target;
        if (gender !== 'all') payload.gender = gender;
      }
      const res = await api.post<any>('/admin/notifications/send', payload);
      setSent(true);
      setSentCount(res.sentTo || 1);
      setTitle('');
      setBody('');
      setUserId('');
      fetchHistory(1);
      setTimeout(() => setSent(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Header title="Notification Center" subtitle="Send and manage push notifications" />
      <div className="p-6 space-y-6">
        {/* Send Notification Card */}
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <Bell size={18} className="text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Send Notification</h2>
          </div>

          <div className="p-5 space-y-5">
            {/* Target Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Target Audience</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {targetOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setTarget(opt.value); if (opt.value === 'specific') setGender('all'); }}
                    className={clsx(
                      'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all',
                      target === opt.value
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-white'
                    )}
                  >
                    <opt.icon size={16} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Gender Filter — shown for all audience types except Specific User */}
            {target !== 'specific' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Filter by Gender
                  <span className="ml-2 text-xs text-slate-500 font-normal">Only send to users matching this gender</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all', label: 'All Genders', color: 'blue' },
                    { value: 'female', label: 'Female', color: 'pink' },
                    { value: 'male', label: 'Male', color: 'sky' },
                    { value: 'non_binary', label: 'Non-Binary', color: 'violet' },
                  ].map((g) => (
                    <button
                      key={g.value}
                      onClick={() => setGender(g.value)}
                      className={clsx(
                        'px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                        gender === g.value
                          ? g.value === 'female'
                            ? 'border-pink-500 bg-pink-500/10 text-pink-400'
                            : g.value === 'male'
                            ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                            : g.value === 'non_binary'
                            ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                            : 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-white'
                      )}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                {gender !== 'all' && (
                  <p className="mt-2 text-xs text-amber-400">
                    ⚠ Only users who have set their gender to <span className="font-semibold capitalize">{gender.replace('_', '-')}</span> will receive this notification.
                  </p>
                )}
              </div>
            )}

            {/* Specific User ID */}
            {target === 'specific' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">User ID</label>
                <input
                  type="number"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter user ID"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}

            {/* Type + Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Notification Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                >
                  {typeOptions.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Notification title"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Body */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Message Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your notification message..."
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>

            {/* Error / Success */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2">
                {error}
              </div>
            )}
            {sent && sentCount === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm rounded-lg px-4 py-2">
                <p className="font-semibold">⚠ No users matched — notification was not sent.</p>
                {gender !== 'all' && (
                  <p className="mt-1 text-xs opacity-80">
                    The selected gender filter (<span className="font-semibold capitalize">{gender.replace('_', '-')}</span>) returned 0 users.
                    Users must have their gender set in <strong>Safety Preferences</strong> to be matched.
                    Try switching to <strong>All Genders</strong> to reach everyone.
                  </p>
                )}
              </div>
            )}
            {sent && sentCount > 0 && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg px-4 py-2 flex items-center gap-2">
                <CheckCircle size={16} />
                Notification sent to {sentCount} user{sentCount !== 1 ? 's' : ''}!
              </div>
            )}

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {sending ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </div>

        {/* Notification History */}
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Notification History</h2>
            <button
              onClick={() => fetchHistory(historyPage)}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No notifications sent yet</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-5 py-3 text-slate-400 font-medium">Title</th>
                      <th className="text-left px-5 py-3 text-slate-400 font-medium">User</th>
                      <th className="text-left px-5 py-3 text-slate-400 font-medium">Type</th>
                      <th className="text-left px-5 py-3 text-slate-400 font-medium">Status</th>
                      <th className="text-left px-5 py-3 text-slate-400 font-medium">Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((n: any) => (
                      <tr key={n.id} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                        <td className="px-5 py-3">
                          <p className="text-white font-medium">{n.title}</p>
                          <p className="text-slate-400 text-xs mt-0.5 max-w-xs truncate">{n.body}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-300">{n.userName || `User #${n.userId}`}</td>
                        <td className="px-5 py-3">
                          <span className={clsx(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            n.type === 'system' && 'bg-blue-500/20 text-blue-400',
                            n.type === 'promo' && 'bg-green-500/20 text-green-400',
                            n.type === 'ride_update' && 'bg-purple-500/20 text-purple-400',
                            n.type === 'payment' && 'bg-yellow-500/20 text-yellow-400',
                            n.type === 'safety' && 'bg-red-500/20 text-red-400',
                            n.type === 'chat' && 'bg-cyan-500/20 text-cyan-400',
                          )}>
                            {(n.type || 'system').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {n.isRead ? (
                            <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle size={12} /> Read</span>
                          ) : (
                            <span className="text-slate-500 text-xs">Unread</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">
                          {n.createdAt ? new Date(n.createdAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700/50">
                  <span className="text-sm text-slate-400">Page {historyPage} of {totalPages}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchHistory(historyPage - 1)}
                      disabled={historyPage <= 1}
                      className="p-1.5 rounded bg-slate-700 text-white disabled:opacity-30 hover:bg-slate-600"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => fetchHistory(historyPage + 1)}
                      disabled={historyPage >= totalPages}
                      className="p-1.5 rounded bg-slate-700 text-white disabled:opacity-30 hover:bg-slate-600"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
