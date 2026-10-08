import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, X, Send, MessageSquare, CheckCircle, Clock, AlertCircle,
  ChevronLeft, ChevronRight, Plus, Edit2, Trash2, HelpCircle, Loader2,
  Gauge, Users, AlertTriangle,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Ticket {
  id: number;
  ticketId: string;
  userId: number;
  category: string;
  subject: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo: number | null;
  rideId: number | null;
  adminNotes?: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface Message {
  id: number;
  ticketId: string;
  senderId: number;
  senderType: string;
  message: string;
  attachmentUrl: string | null;
  createdAt: string;
}

interface FAQ {
  id: number;
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open: 'text-blue-400 bg-blue-500/10',
  in_progress: 'text-yellow-400 bg-yellow-500/10',
  resolved: 'text-green-400 bg-green-500/10',
  closed: 'text-gray-400 bg-gray-500/10',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-gray-400 bg-gray-500/10',
  medium: 'text-yellow-400 bg-yellow-500/10',
  high: 'text-orange-400 bg-orange-500/10',
  urgent: 'text-red-400 bg-red-500/10',
};

const CATEGORY_LABELS: Record<string, string> = {
  ride_issue: 'Ride Issue',
  payment: 'Payment',
  account: 'Account',
  driver: 'Driver',
  safety: 'Safety',
  app_bug: 'App Bug',
  feedback: 'Feedback',
  other: 'Other',
  general: 'General',
  rides: 'Rides',
  payments: 'Payments',
};

const FAQ_CATEGORIES = ['general', 'rides', 'payments', 'safety', 'account', 'driver'];

// ─── Component ──────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<'tickets' | 'faqs' | 'sla'>('tickets');

  return (
    <div className="flex-1">
      <Header title="Support Operations" subtitle="Tickets, SLA tracking, FAQs, and escalation queue" />
      <div className="p-6">
        <div className="flex gap-2 mb-6">
          {([
            { id: 'tickets' as const, label: 'Tickets', icon: MessageSquare },
            { id: 'sla' as const, label: 'SLA Dashboard', icon: Gauge },
            { id: 'faqs' as const, label: 'FAQs', icon: HelpCircle },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                activeTab === id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {activeTab === 'tickets' && <TicketsSection />}
        {activeTab === 'sla' && <SlaSection />}
        {activeTab === 'faqs' && <FAQsSection />}
      </div>
    </div>
  );
}

// ─── SLA Section ────────────────────────────────────────────────────────────

function SlaSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['support-sla'],
    queryFn: () => api.get<any>('/admin/support/sla-dashboard?days=30'),
    staleTime: 60_000,
  });

  const tooltipStyle = { backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', color: '#E2E8F0' };

  if (isLoading) {
    return <div className="py-16 text-center text-slate-500"><Loader2 className="animate-spin inline mr-2" />Loading SLA metrics…</div>;
  }
  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'SLA Compliance', value: `${s.slaComplianceRate}%`, icon: Gauge, color: 'text-green-400' },
          { label: 'Avg First Response', value: s.avgFirstResponseMin != null ? `${s.avgFirstResponseMin}m` : '—', icon: Clock, color: 'text-blue-400' },
          { label: 'Avg Resolution', value: s.avgResolutionMin != null ? `${s.avgResolutionMin}m` : '—', icon: CheckCircle, color: 'text-purple-400' },
          { label: 'Open Urgent', value: s.openUrgent, icon: AlertTriangle, color: 'text-red-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <Icon size={18} className={`${color} mb-2`} />
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.trend?.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-4">Ticket Volume Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#64748B" fontSize={11} />
                <YAxis stroke="#64748B" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="opened" stroke="#3B82F6" strokeWidth={2} dot={false} name="Opened" />
                <Line type="monotone" dataKey="resolved" stroke="#10B981" strokeWidth={2} dot={false} name="Resolved" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.agentPerformance?.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users size={14} /> Agent Performance</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-700">
                  <th className="text-left py-2">Agent</th>
                  <th className="text-left py-2">Assigned</th>
                  <th className="text-left py-2">Resolved</th>
                  <th className="text-left py-2">Avg Resolution</th>
                </tr>
              </thead>
              <tbody>
                {data.agentPerformance.map((a: any) => (
                  <tr key={a.agentId} className="border-b border-slate-700/30">
                    <td className="py-2 text-white">{a.name}</td>
                    <td className="py-2 text-slate-300">{a.assigned}</td>
                    <td className="py-2 text-slate-300">{a.resolved}</td>
                    <td className="py-2 text-slate-300">{a.avgResolutionMin != null ? `${a.avgResolutionMin}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.escalationQueue?.length > 0 && (
        <div className="bg-red-500/5 rounded-xl border border-red-500/20 p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2"><AlertTriangle size={14} /> SLA Breach Escalation Queue</h3>
          <div className="space-y-2">
            {data.escalationQueue.map((t: any) => (
              <div key={t.ticketId} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2 text-sm">
                <div>
                  <p className="text-white truncate max-w-md">{t.subject || t.ticketId.slice(0, 8)}</p>
                  <p className="text-xs text-slate-500">{t.userName} · {t.breachType.replace('_', ' ')}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={clsx('text-xs px-2 py-0.5 rounded', PRIORITY_COLORS[t.priority])}>{t.priority}</span>
                  <p className="text-xs text-slate-500 mt-1">{Math.round(t.ageMinutes / 60)}h old</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tickets Section ────────────────────────────────────────────────────────

function TicketsSection() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({ open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<Message[]>([]);
  const [ticketDetail, setTicketDetail] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterCategory) params.set('category', filterCategory);
      if (filterPriority) params.set('priority', filterPriority);
      if (search) params.set('search', search);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await api.get<{ tickets: Ticket[]; total: number }>(`/admin/support/tickets?${params}`);
      setTickets(res.tickets);
      setTotal(res.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterStatus, filterCategory, filterPriority, search, page]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.get<Record<string, number>>('/admin/support/tickets/stats');
      setStats(s);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const openDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setDetailLoading(true);
    try {
      const detail = await api.get<{ ticket: Ticket; messages: Message[] }>(`/admin/support/tickets/${ticket.ticketId}`);
      setTicketDetail(detail.ticket);
      setTicketMessages(detail.messages);
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setReplying(true);
    try {
      await api.post(`/admin/support/tickets/${selectedTicket.ticketId}/reply`, { message: replyText.trim() });
      setReplyText('');
      openDetail(selectedTicket);
      fetchTickets();
      fetchStats();
    } catch { /* ignore */ }
    setReplying(false);
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedTicket) return;
    try {
      await api.patch(`/admin/support/tickets/${selectedTicket.ticketId}/status`, { status });
      openDetail(selectedTicket);
      fetchTickets();
      fetchStats();
    } catch { /* ignore */ }
  };

  const handleAssign = async () => {
    if (!selectedTicket) return;
    try {
      await api.patch(`/admin/support/tickets/${selectedTicket.ticketId}/assign`, {});
      openDetail(selectedTicket);
      fetchTickets();
    } catch { /* ignore */ }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Open', value: stats.open, icon: AlertCircle, color: 'text-blue-400' },
          { label: 'In Progress', value: stats.in_progress, icon: Clock, color: 'text-yellow-400' },
          { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-green-400' },
          { label: 'Closed', value: stats.closed, icon: X, color: 'text-gray-400' },
          { label: 'Total', value: stats.total, icon: MessageSquare, color: 'text-white' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <Icon size={20} className={color} />
              <span className={clsx('text-2xl font-bold', color)}>{value}</span>
            </div>
            <p className="text-sm text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).filter(([k]) => !['general','rides','payments'].includes(k) || ['ride_issue','payment','account','driver','safety','app_bug','feedback','other'].includes(k)).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => { setFilterPriority(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
        >
          <option value="">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-300 placeholder-slate-500"
          />
        </div>
      </div>

      <div className="flex gap-6">
        {/* Table */}
        <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Ticket</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10"><Loader2 size={24} className="animate-spin mx-auto text-slate-400" /></td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-500">No tickets found</td></tr>
              ) : tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => openDetail(t)}
                  className={clsx(
                    'border-t border-slate-700/50 cursor-pointer hover:bg-slate-700/30 transition-colors',
                    selectedTicket?.ticketId === t.ticketId && 'bg-slate-700/40',
                  )}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-200 truncate max-w-[200px]">{t.subject}</p>
                    <p className="text-xs text-slate-500 font-mono">{t.ticketId.slice(0, 8)}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{t.userName || `User #${t.userId}`}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300">{CATEGORY_LABELS[t.category] || t.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs px-2 py-1 rounded font-medium', PRIORITY_COLORS[t.priority])}>{t.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs px-2 py-1 rounded font-medium', STATUS_COLORS[t.status])}>{t.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
              <p className="text-xs text-slate-400">Showing {(page-1)*limit + 1}-{Math.min(page*limit, total)} of {total}</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="p-1.5 rounded bg-slate-700 text-slate-300 disabled:opacity-30"><ChevronLeft size={14} /></button>
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} className="p-1.5 rounded bg-slate-700 text-slate-300 disabled:opacity-30"><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedTicket && (
          <div className="w-[400px] bg-slate-800/50 rounded-xl border border-slate-700/50 flex flex-col max-h-[calc(100vh-220px)]">
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white truncate flex-1">{ticketDetail?.subject || selectedTicket.subject}</h3>
              <button onClick={() => setSelectedTicket(null)} className="text-slate-400 hover:text-white ml-2"><X size={16} /></button>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
            ) : (
              <>
                {/* Ticket info */}
                <div className="p-4 border-b border-slate-700/50 space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">User</span><span className="text-slate-200">{ticketDetail?.userName || `#${ticketDetail?.userId}`}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Category</span><span className="text-slate-200">{CATEGORY_LABELS[ticketDetail?.category || ''] || ticketDetail?.category}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Priority</span><span className={clsx('px-2 py-0.5 rounded', PRIORITY_COLORS[ticketDetail?.priority || 'medium'])}>{ticketDetail?.priority}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Created</span><span className="text-slate-200">{ticketDetail?.createdAt ? new Date(ticketDetail.createdAt).toLocaleString() : ''}</span></div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <select
                      value={ticketDetail?.status || ''}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-300"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <button onClick={handleAssign} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs">Assign to me</button>
                  </div>
                </div>

                {/* Description */}
                {ticketDetail?.description && (
                  <div className="p-4 border-b border-slate-700/50">
                    <p className="text-xs text-slate-400 mb-1">Description</p>
                    <p className="text-sm text-slate-300">{ticketDetail.description}</p>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {ticketMessages.map((msg) => (
                    <div key={msg.id} className={clsx('flex', msg.senderType === 'admin' ? 'justify-end' : 'justify-start')}>
                      <div className={clsx('max-w-[80%] rounded-lg p-3', msg.senderType === 'admin' ? 'bg-blue-600/20 text-blue-200' : 'bg-slate-700 text-slate-200')}>
                        <p className="text-xs font-medium mb-1 opacity-60">{msg.senderType === 'admin' ? 'Admin' : 'User'}</p>
                        <p className="text-sm">{msg.message}</p>
                        <p className="text-xs opacity-40 mt-1">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply */}
                <div className="p-3 border-t border-slate-700/50 flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
                  />
                  <button onClick={handleReply} disabled={replying || !replyText.trim()} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg disabled:opacity-50">
                    {replying ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── FAQs Section ───────────────────────────────────────────────────────────

function FAQsSection() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editFaq, setEditFaq] = useState<FAQ | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Form
  const [fCategory, setFCategory] = useState('general');
  const [fQuestion, setFQuestion] = useState('');
  const [fAnswer, setFAnswer] = useState('');
  const [fSortOrder, setFSortOrder] = useState(0);
  const [fActive, setFActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<FAQ[]>('/admin/support/faqs');
      setFaqs(res);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);

  const openAdd = () => {
    setEditFaq(null);
    setFCategory('general');
    setFQuestion('');
    setFAnswer('');
    setFSortOrder(0);
    setFActive(true);
    setShowModal(true);
  };

  const openEdit = (faq: FAQ) => {
    setEditFaq(faq);
    setFCategory(faq.category);
    setFQuestion(faq.question);
    setFAnswer(faq.answer);
    setFSortOrder(faq.sortOrder);
    setFActive(faq.isActive);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!fQuestion.trim() || !fAnswer.trim()) return;
    setSaving(true);
    try {
      if (editFaq) {
        await api.patch(`/admin/support/faqs/${editFaq.id}`, { category: fCategory, question: fQuestion, answer: fAnswer, sortOrder: fSortOrder, isActive: fActive });
      } else {
        await api.post('/admin/support/faqs', { category: fCategory, question: fQuestion, answer: fAnswer, sortOrder: fSortOrder, isActive: fActive });
      }
      setShowModal(false);
      fetchFaqs();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this FAQ? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/support/faqs/${id}`);
      fetchFaqs();
    } catch { /* ignore */ }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.post('/admin/support/faqs/seed');
      fetchFaqs();
    } catch { /* ignore */ }
    setSeeding(false);
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-slate-400">{faqs.length} FAQs</p>
        <div className="flex gap-2">
          <button onClick={handleSeed} disabled={seeding} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
            {seeding ? <Loader2 size={14} className="animate-spin" /> : null}
            Seed Defaults
          </button>
          <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <Plus size={14} /> Add FAQ
          </button>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Category</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Question</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Order</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Active</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-10"><Loader2 size={24} className="animate-spin mx-auto text-slate-400" /></td></tr>
            ) : faqs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-slate-500">No FAQs yet. Click "Seed Defaults" to add starter FAQs.</td></tr>
            ) : faqs.map((faq) => (
              <tr key={faq.id} className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 capitalize">{faq.category}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-200 max-w-[400px] truncate">{faq.question}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{faq.sortOrder}</td>
                <td className="px-4 py-3">
                  <span className={clsx('text-xs px-2 py-1 rounded', faq.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
                    {faq.isActive ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(faq)} className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-white"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(faq.id)} className="p-1.5 rounded hover:bg-red-600/20 text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-[500px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-white font-bold">{editFaq ? 'Edit FAQ' : 'Add FAQ'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Category</label>
                <select
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
                >
                  {FAQ_CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Question</label>
                <textarea
                  value={fQuestion}
                  onChange={(e) => setFQuestion(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Answer</label>
                <textarea
                  value={fAnswer}
                  onChange={(e) => setFAnswer(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-slate-400 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={fSortOrder}
                    onChange={(e) => setFSortOrder(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-slate-400 mb-1">Active</label>
                  <button
                    onClick={() => setFActive(!fActive)}
                    className={clsx('w-full py-2 rounded-lg text-sm font-medium', fActive ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400')}
                  >
                    {fActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-700">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={handleSave} disabled={saving || !fQuestion.trim() || !fAnswer.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : editFaq ? 'Save Changes' : 'Create FAQ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
