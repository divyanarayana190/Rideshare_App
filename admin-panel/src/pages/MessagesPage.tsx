import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, X, Check, XCircle, Clock, User, Phone, Tag, Loader2, MessageCircle, ChevronRight } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface ChatSession {
  id: number; sessionId: string; userId: number; adminId: number | null;
  category: string; issueDescription: string; status: string; priority: string;
  rejectionReason: string | null; rating: number | null; ratingFeedback: string | null;
  startedAt: string | null; endedAt: string | null; createdAt: string; updatedAt: string;
  userName: string; userPhone: string | null;
}

interface ChatMessage {
  id: number; sessionId: string; senderId: number; senderType: 'user' | 'admin' | 'system';
  messageType: string; content: string; attachmentUrl: string | null; isRead: boolean; createdAt: string;
}

interface ChatDetail extends ChatSession { messages: ChatMessage[]; }
interface ChatStats { waiting: number; active: number; ended: number; rejected: number; total: number; }

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const STATUS_COLORS: Record<string, string> = {
  waiting: 'bg-yellow-500/20 text-yellow-400', active: 'bg-green-500/20 text-green-400',
  ended: 'bg-slate-500/20 text-slate-400', rejected: 'bg-red-500/20 text-red-400',
  missed: 'bg-orange-500/20 text-orange-400',
};

const CAT_LABELS: Record<string, string> = {
  general: 'General', ride_issue: 'Ride Issue', payment: 'Payment', account: 'Account',
  technical: 'Technical', safety: 'Safety', driver_support: 'Driver', other: 'Other',
};

export default function MessagesPage() {
  const [tab, setTab] = useState<'queue' | 'active' | 'history'>('queue');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [stats, setStats] = useState<ChatStats>({ waiting: 0, active: 0, ended: 0, rejected: 0, total: 0 });
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch sessions
  const fetchSessions = useCallback(() => {
    const statusParam = tab === 'queue' ? 'waiting' : tab === 'active' ? 'active' : undefined;
    const endpoint = tab === 'history'
      ? '/admin/chat/history?limit=50'
      : `/admin/chat/queue?status=${statusParam}`;

    api.get<any>(endpoint).then((data) => {
      setSessions(data.sessions || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [tab]);

  const fetchStats = useCallback(() => {
    api.get<ChatStats>('/admin/chat/stats').then(setStats).catch(console.error);
  }, []);

  // ── Fetch detail
  const fetchDetail = useCallback((sessionId: string) => {
    setDetailLoading(true);
    api.get<ChatDetail>(`/admin/chat/${sessionId}`).then((d) => {
      setDetail(d);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }).catch(console.error).finally(() => setDetailLoading(false));
  }, []);

  // ── Polling
  useEffect(() => {
    fetchSessions();
    fetchStats();
    const interval = setInterval(() => {
      fetchSessions();
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions, fetchStats]);

  // ── Poll detail messages
  useEffect(() => {
    if (!selectedId || !detail || (detail.status !== 'active' && detail.status !== 'waiting')) return;
    const interval = setInterval(() => fetchDetail(selectedId), 3000);
    return () => clearInterval(interval);
  }, [selectedId, detail?.status, fetchDetail]);

  // ── Handlers
  const handleSelect = (sessionId: string) => {
    setSelectedId(sessionId);
    fetchDetail(sessionId);
  };

  const handleAccept = async () => {
    if (!selectedId) return;
    try {
      await api.post(`/admin/chat/${selectedId}/accept`);
      fetchDetail(selectedId);
      fetchSessions();
      fetchStats();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReject = async () => {
    if (!selectedId) return;
    try {
      await api.post(`/admin/chat/${selectedId}/reject`, { reason: rejectReason || 'Request declined' });
      setShowRejectModal(false);
      setRejectReason('');
      fetchDetail(selectedId);
      fetchSessions();
      fetchStats();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      await api.post(`/admin/chat/${selectedId}/message`, { content: message.trim() });
      setMessage('');
      fetchDetail(selectedId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleEndChat = async () => {
    if (!selectedId || !confirm('End this chat session?')) return;
    try {
      await api.post(`/admin/chat/${selectedId}/end`);
      fetchDetail(selectedId);
      fetchSessions();
      fetchStats();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <Header title="Messages" subtitle={`${stats.waiting} waiting \u00B7 ${stats.active} active`} />

      {/* Error toast */}
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/90 text-white px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          {error}
          <button onClick={() => setError('')} className="hover:text-red-200"><X size={14} /></button>
        </div>
      )}

      <div className="flex h-[calc(100vh-64px)]">
        {/* ═══ Left Panel — Chat List ═══ */}
        <div className="w-80 border-r border-slate-700/50 flex flex-col bg-slate-900/50">
          {/* Tabs */}
          <div className="flex border-b border-slate-700/50">
            {(['queue', 'active', 'history'] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setLoading(true); }}
                className={clsx('flex-1 py-3 text-xs font-semibold uppercase tracking-wide transition-colors relative',
                  tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white')}>
                {t === 'queue' ? 'Queue' : t === 'active' ? 'Active' : 'History'}
                {t === 'queue' && stats.waiting > 0 && (
                  <span className="absolute top-2 right-2 min-w-[18px] h-[18px] bg-yellow-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {stats.waiting}
                  </span>
                )}
                {t === 'active' && stats.active > 0 && (
                  <span className="absolute top-2 right-2 min-w-[18px] h-[18px] bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {stats.active}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No {tab} chats</p>
              </div>
            ) : sessions.map((s) => (
              <button key={s.sessionId} onClick={() => handleSelect(s.sessionId)}
                className={clsx('w-full text-left px-4 py-3 border-b border-slate-700/30 transition-colors hover:bg-slate-800/50',
                  selectedId === s.sessionId && 'bg-slate-800/80 border-l-2 border-l-blue-500')}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {s.userName?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white truncate">{s.userName}</p>
                      <span className="text-[10px] text-slate-500 shrink-0">{timeAgo(s.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={clsx('px-1.5 py-0.5 text-[10px] rounded-full font-semibold', STATUS_COLORS[s.status] || STATUS_COLORS.ended)}>
                        {s.status}
                      </span>
                      <span className="text-[10px] text-slate-500">{CAT_LABELS[s.category] || s.category}</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 truncate ml-10">{s.issueDescription}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ═══ Center Panel — Chat Window ═══ */}
        <div className="flex-1 flex flex-col">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-lg font-medium">Select a conversation</p>
                <p className="text-sm mt-1">Choose a chat from the left panel to start responding</p>
              </div>
            </div>
          ) : detailLoading && !detail ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-blue-400" />
            </div>
          ) : detail ? (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-bold">
                    {detail.userName?.[0] || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{detail.userName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={clsx('px-1.5 py-0.5 text-[10px] rounded-full font-semibold', STATUS_COLORS[detail.status])}>
                        {detail.status}
                      </span>
                      <span className="text-xs text-slate-400">{CAT_LABELS[detail.category] || detail.category}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {detail.status === 'waiting' && (
                    <>
                      <button onClick={handleAccept}
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors">
                        <Check size={14} /> Accept
                      </button>
                      <button onClick={() => setShowRejectModal(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold rounded-lg transition-colors border border-red-500/30">
                        <XCircle size={14} /> Reject
                      </button>
                    </>
                  )}
                  {detail.status === 'active' && (
                    <button onClick={handleEndChat}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold rounded-lg transition-colors">
                      <X size={14} /> End Chat
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {/* Issue description card */}
                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 mb-4">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Issue Description</p>
                  <p className="text-sm text-slate-300">{detail.issueDescription}</p>
                </div>

                {detail.messages.map((msg) => {
                  if (msg.senderType === 'system') {
                    return (
                      <div key={msg.id} className="text-center py-1">
                        <span className="text-xs text-slate-500 italic">{msg.content}</span>
                        <span className="text-[10px] text-slate-600 ml-2">{timeAgo(msg.createdAt)}</span>
                      </div>
                    );
                  }
                  const isAdmin = msg.senderType === 'admin';
                  return (
                    <div key={msg.id} className={clsx('flex gap-2', isAdmin ? 'justify-end' : 'justify-start')}>
                      {!isAdmin && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-1">
                          {detail.userName?.[0] || '?'}
                        </div>
                      )}
                      <div className={clsx('max-w-[70%] rounded-2xl px-3.5 py-2.5',
                        isAdmin ? 'bg-blue-600 rounded-br-md' : 'bg-slate-700 rounded-bl-md')}>
                        <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
                        <p className={clsx('text-[10px] mt-1 text-right', isAdmin ? 'text-blue-200/50' : 'text-slate-400/60')}>
                          {timeAgo(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              {detail.status === 'active' && (
                <div className="px-4 py-3 border-t border-slate-700/50 flex items-end gap-2 bg-slate-800/30">
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                    rows={1}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-none max-h-24"
                  />
                  <button onClick={handleSend} disabled={!message.trim() || sending}
                    className="w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40">
                    {sending ? <Loader2 size={16} className="animate-spin text-white" /> : <Send size={16} className="text-white" />}
                  </button>
                </div>
              )}

              {(detail.status === 'ended' || detail.status === 'rejected') && (
                <div className={clsx('px-4 py-3 border-t text-center text-sm font-medium',
                  detail.status === 'rejected' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-slate-800/50 border-slate-700/50 text-slate-400')}>
                  {detail.status === 'rejected'
                    ? `Chat declined${detail.rejectionReason ? `: ${detail.rejectionReason}` : ''}`
                    : 'This chat session has ended'}
                  {detail.rating && <span className="ml-2">Rating: {'⭐'.repeat(detail.rating)}</span>}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ═══ Right Panel — User Info ═══ */}
        {detail && (
          <div className="w-72 border-l border-slate-700/50 overflow-y-auto bg-slate-900/30">
            <div className="p-4 space-y-4">
              {/* User card */}
              <div className="text-center pt-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-2xl font-bold mx-auto">
                  {detail.userName?.[0] || '?'}
                </div>
                <p className="text-base font-semibold text-white mt-3">{detail.userName}</p>
                {detail.userPhone && (
                  <p className="text-xs text-slate-400 flex items-center justify-center gap-1 mt-1">
                    <Phone size={10} /> {detail.userPhone}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1">User ID: {detail.userId}</p>
              </div>

              {/* Chat info */}
              <div className="bg-slate-800/50 rounded-xl p-3 space-y-3 border border-slate-700/50">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Chat Details</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Category</span>
                  <span className="text-xs text-slate-200 font-medium">{CAT_LABELS[detail.category] || detail.category}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Priority</span>
                  <span className={clsx('text-xs font-medium',
                    detail.priority === 'urgent' ? 'text-red-400' : detail.priority === 'high' ? 'text-orange-400' : 'text-slate-300')}>
                    {detail.priority}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Started</span>
                  <span className="text-xs text-slate-300">
                    {detail.startedAt ? new Date(detail.startedAt).toLocaleTimeString() : 'Not yet'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Created</span>
                  <span className="text-xs text-slate-300">{new Date(detail.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Messages</span>
                  <span className="text-xs text-slate-300">{detail.messages.length}</span>
                </div>
              </div>

              {/* Issue */}
              <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Issue Description</p>
                <p className="text-xs text-slate-300 leading-relaxed">{detail.issueDescription}</p>
              </div>

              {/* Rating */}
              {detail.rating && (
                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">User Rating</p>
                  <p className="text-lg">{'⭐'.repeat(detail.rating)}{'☆'.repeat(5 - detail.rating)}</p>
                  {detail.ratingFeedback && (
                    <p className="text-xs text-slate-400 mt-1 italic">"{detail.ratingFeedback}"</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-slate-900 rounded-2xl border border-slate-700 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Decline Chat Request</h3>
              <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-400">
              The user will be notified that their chat request was declined. Optionally provide a reason.
            </p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for declining (optional)..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-red-500 resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">
                Cancel
              </button>
              <button onClick={handleReject}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <XCircle size={16} /> Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
