import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, Shield, Loader2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import ExportMenu from '@/components/ExportMenu';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

const actionColors: Record<string, string> = {
  login: 'bg-blue-500/20 text-blue-400',
  create: 'bg-green-500/20 text-green-400',
  update: 'bg-yellow-500/20 text-yellow-400',
  delete: 'bg-red-500/20 text-red-400',
  ban: 'bg-red-500/20 text-red-400',
  role_change: 'bg-violet-500/20 text-violet-400',
  refund: 'bg-orange-500/20 text-orange-400',
  cancel: 'bg-red-500/20 text-red-400',
  send_notification: 'bg-teal-500/20 text-teal-400',
};

const actions = ['All', 'login', 'create', 'update', 'delete', 'ban', 'role_change', 'refund', 'cancel', 'send_notification'];
const entities = ['All', 'admin', 'user', 'ride', 'payment', 'promo', 'surge_zone', 'emergency_alert', 'notification'];

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [entityFilter, setEntityFilter] = useState('All');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (actionFilter !== 'All') params.set('action', actionFilter);
    if (entityFilter !== 'All') params.set('entity', entityFilter);
    if (search) params.set('search', search);
    api.get<any>(`/admin/audit-logs?${params.toString()}`)
      .then((d) => {
        setLogs(d.logs || d || []);
        setTotal(d.total || (Array.isArray(d) ? d.length : 0));
        setTotalPages(d.totalPages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, actionFilter, entityFilter, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <>
      <Header title="Audit Logs" subtitle="Track all admin actions" />
      <div className="p-6 space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search logs..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500" />
          </div>
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500">
            {actions.map((a) => <option key={a} value={a}>{a === 'All' ? 'All Actions' : a.replace('_', ' ')}</option>)}
          </select>
          <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
            className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500">
            {entities.map((e) => <option key={e} value={e}>{e === 'All' ? 'All Entities' : e.replace('_', ' ')}</option>)}
          </select>
          <div className="flex bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
            {(['table', 'timeline'] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)}
                className={clsx('px-3 py-2 rounded-md text-xs font-medium capitalize transition-colors', viewMode === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}>
                {v}
              </button>
            ))}
          </div>
          <ExportMenu endpoint="/admin/export/audit-logs" filename="audit_logs" />
        </div>

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium w-8" />
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Timestamp</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Admin</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Entity</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Details</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" /> Loading logs...
                  </td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No audit logs found</td></tr>
                ) : logs.map((log: any) => (
                  <tr key={log.id} onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-slate-400">
                      {expandedRow === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-400 text-xs font-bold">
                          {(log.adminName || 'A')[0]}
                        </div>
                        <span className="text-white text-xs">{log.adminName || `Admin #${log.adminId}`}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 text-xs rounded-full capitalize', actionColors[log.action] || 'bg-slate-600/30 text-slate-300')}>
                        {(log.action || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs capitalize">{(log.entity || '').replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">{log.details}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{log.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
              <p className="text-sm text-slate-400">Page {page} of {totalPages} ({total} total)</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronLeft size={16} /></button>
                <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm">{page}</span>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
        )}

        {/* Timeline View */}
        {viewMode === 'timeline' && (
          <div className="space-y-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <Loader2 size={24} className="animate-spin mr-2" /> Loading logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No audit logs found</div>
            ) : logs.map((log: any, i: number) => (
              <div key={log.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center',
                    log.action === 'login' ? 'bg-blue-500/20' :
                    log.action === 'create' ? 'bg-green-500/20' :
                    ['delete', 'ban', 'cancel'].includes(log.action) ? 'bg-red-500/20' :
                    'bg-yellow-500/20'
                  )}>
                    <Shield size={14} className={
                      log.action === 'login' ? 'text-blue-400' :
                      log.action === 'create' ? 'text-green-400' :
                      ['delete', 'ban', 'cancel'].includes(log.action) ? 'text-red-400' :
                      'text-yellow-400'
                    } />
                  </div>
                  {i < logs.length - 1 && <div className="w-0.5 h-full min-h-[40px] bg-slate-700" />}
                </div>
                <div className="pb-6 flex-1">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx('px-2 py-0.5 text-xs rounded-full capitalize', actionColors[log.action] || 'bg-slate-600/30 text-slate-300')}>
                        {(log.action || '').replace('_', ' ')}
                      </span>
                      <span className="text-slate-500 text-xs">{(log.entity || '').replace('_', ' ')} #{log.entityId}</span>
                    </div>
                    <p className="text-sm text-white">{log.details}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Clock size={10} /> {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</span>
                      <span>{log.adminName || `Admin #${log.adminId}`}</span>
                      {log.ipAddress && <span className="font-mono">{log.ipAddress}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
