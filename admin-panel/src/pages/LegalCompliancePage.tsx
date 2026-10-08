import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale, Users, FileText, Loader2, Shield, Download, Trash2, RefreshCw, Clock } from 'lucide-react';
import Header from '@/components/layout/Header';
import ExportMenu from '@/components/ExportMenu';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

export default function LegalCompliancePage() {
  const [tab, setTab] = useState<'policy' | 'queues'>('queues');
  const [stats, setStats] = useState<any>(null);
  const [acceptances, setAcceptances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletionPage, setDeletionPage] = useState(1);
  const [exportPage, setExportPage] = useState(1);
  const [deletionStatus, setDeletionStatus] = useState('all');
  const [exportStatus, setExportStatus] = useState('all');

  const { data: queueStats } = useQuery({
    queryKey: ['compliance-stats'],
    queryFn: () => api.get<any>('/admin/compliance/stats'),
    staleTime: 60_000,
  });

  const { data: deletions, refetch: refetchDeletions } = useQuery({
    queryKey: ['deletion-requests', deletionPage, deletionStatus],
    queryFn: () => api.get<any>(`/admin/compliance/deletion-requests?page=${deletionPage}&status=${deletionStatus}`),
    enabled: tab === 'queues',
  });

  const { data: exports, refetch: refetchExports } = useQuery({
    queryKey: ['export-requests', exportPage, exportStatus],
    queryFn: () => api.get<any>(`/admin/compliance/export-requests?page=${exportPage}&status=${exportStatus}`),
    enabled: tab === 'queues',
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<any>('/admin/legal/stats'),
      api.get<any>('/admin/legal/acceptances?limit=50'),
    ])
      .then(([s, a]) => {
        setStats(s);
        setAcceptances(a.acceptances ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const processDeletion = async (id: number, action: 'processing' | 'completed' | 'cancelled') => {
    if (!confirm(`${action} deletion request #${id}?`)) return;
    await api.patch(`/admin/compliance/deletion-requests/${id}`, { action });
    refetchDeletions();
  };

  const retryExport = async (exportId: string) => {
    await api.post(`/admin/compliance/export-requests/${exportId}/retry`, {});
    refetchExports();
  };

  return (
    <div>
      <Header title="Legal & Compliance" subtitle="Policy acceptance, GDPR/CCPA deletion and data export queues" />
      <div className="p-6">
        <div className="flex gap-2 mb-6">
          {([
            { id: 'queues' as const, label: 'GDPR / CCPA Queues', icon: Shield },
            { id: 'policy' as const, label: 'Policy & Acceptances', icon: Scale },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={clsx('px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
                tab === id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {tab === 'queues' && (
          <div className="space-y-6">
            {queueStats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard icon={Trash2} label="Pending Deletions" value={String(queueStats.deletion?.pending ?? 0)} />
                <StatCard icon={Clock} label="Due ≤7 Days" value={String(queueStats.deletion?.dueWithin7Days ?? 0)} />
                <StatCard icon={Loader2} label="Processing" value={String(queueStats.deletion?.processing ?? 0)} />
                <StatCard icon={Download} label="Exports In Progress" value={String(queueStats.export?.inProgress ?? 0)} />
                <StatCard icon={FileText} label="Exports Ready" value={String(queueStats.export?.ready ?? 0)} />
              </div>
            )}

            <section className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Account Deletion Requests (GDPR/CCPA)</h2>
                <div className="flex items-center gap-2">
                  <ExportMenu endpoint="/admin/export/compliance?type=deletions" filename="compliance_deletions" />
                  <select value={deletionStatus} onChange={(e) => { setDeletionStatus(e.target.value); setDeletionPage(1); }}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300">
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="p-3">User</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Requested</th>
                      <th className="p-3">Scheduled</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(deletions?.requests ?? []).map((r: any) => (
                      <tr key={r.id} className="border-b border-slate-800 text-slate-200">
                        <td className="p-3">
                          <p className="text-white">{r.userName || `#${r.userId}`}</p>
                          <p className="text-xs text-slate-500">{r.userEmail}</p>
                        </td>
                        <td className="p-3"><StatusBadge status={r.status} /></td>
                        <td className="p-3 text-xs">{new Date(r.requestedAt).toLocaleString()}</td>
                        <td className="p-3 text-xs">{new Date(r.scheduledFor).toLocaleDateString()}</td>
                        <td className="p-3 text-xs text-slate-400 max-w-[200px] truncate">{r.reason || '—'}</td>
                        <td className="p-3">
                          {r.status === 'pending' && (
                            <div className="flex gap-1">
                              <ActionBtn onClick={() => processDeletion(r.id, 'processing')}>Process</ActionBtn>
                              <ActionBtn onClick={() => processDeletion(r.id, 'cancelled')}>Cancel</ActionBtn>
                            </div>
                          )}
                          {r.status === 'processing' && (
                            <ActionBtn onClick={() => processDeletion(r.id, 'completed')}>Complete</ActionBtn>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Data Export Requests</h2>
                <div className="flex items-center gap-2">
                  <ExportMenu endpoint="/admin/export/compliance?type=exports" filename="compliance_exports" />
                  <select value={exportStatus} onChange={(e) => { setExportStatus(e.target.value); setExportPage(1); }}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300">
                  <option value="all">All</option>
                  <option value="requested">Requested</option>
                  <option value="processing">Processing</option>
                  <option value="ready">Ready</option>
                  <option value="failed">Failed</option>
                  <option value="expired">Expired</option>
                </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="p-3">Export ID</th>
                      <th className="p-3">User</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Requested</th>
                      <th className="p-3">Expires</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(exports?.requests ?? []).map((r: any) => (
                      <tr key={r.id} className="border-b border-slate-800 text-slate-200">
                        <td className="p-3 font-mono text-xs">{r.exportId.slice(0, 20)}…</td>
                        <td className="p-3">{r.userName || `#${r.userId}`}</td>
                        <td className="p-3"><StatusBadge status={r.status} /></td>
                        <td className="p-3 text-xs">{new Date(r.requestedAt).toLocaleString()}</td>
                        <td className="p-3 text-xs">{r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'}</td>
                        <td className="p-3">
                          {r.status === 'ready' && (
                            <button
                              onClick={async () => {
                                const data = await api.get<any>(`/admin/compliance/export-requests/${r.exportId}/payload`);
                                const blob = new Blob([JSON.stringify(data.payload, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${r.exportId}.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="text-xs text-blue-400 hover:underline"
                            >
                              Download JSON
                            </button>
                          )}
                          {r.status === 'failed' && (
                            <button onClick={() => retryExport(r.exportId)} className="text-xs text-yellow-400 hover:underline flex items-center gap-1 inline-flex">
                              <RefreshCw size={10} /> Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === 'policy' && (
          loading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-400" /></div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard icon={Scale} label="Current Version" value={stats?.currentVersion ?? '—'} />
                <StatCard icon={Users} label="Users Accepted (any)" value={String(stats?.uniqueUsersAccepted ?? 0)} />
                <StatCard icon={FileText} label="On Current Version" value={String(stats?.usersOnCurrentVersion ?? 0)} />
              </div>

              <section className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
                <h2 className="text-lg font-semibold text-white mb-4">Policy Documents</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {(stats?.documents ?? []).map((d: any) => (
                    <div key={d.slug} className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                      <div className="font-medium text-white">{d.title}</div>
                      <div className="text-sm text-slate-400 mt-1">v{d.version} · {d.sectionCount} sections · {d.lastUpdated}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700">
                  <h2 className="text-lg font-semibold text-white">Recent Acceptances</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="p-3">User ID</th>
                        <th className="p-3">Version</th>
                        <th className="p-3">Terms</th>
                        <th className="p-3">Privacy</th>
                        <th className="p-3">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acceptances.map((r) => (
                        <tr key={r.id} className="border-b border-slate-800 text-slate-200">
                          <td className="p-3">{r.userId}</td>
                          <td className="p-3">{r.legalVersion}</td>
                          <td className="p-3 text-xs">{r.termsAcceptedAt ? new Date(r.termsAcceptedAt).toLocaleString() : '—'}</td>
                          <td className="p-3 text-xs">{r.privacyAcceptedAt ? new Date(r.privacyAcceptedAt).toLocaleString() : '—'}</td>
                          <td className="p-3 font-mono text-xs">{r.ipAddress ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )
        )}
      </div>
    </div>
  );
}


function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 flex items-center gap-4">
      <div className="p-3 rounded-lg bg-blue-500/20"><Icon className="text-blue-400" size={22} /></div>
      <div>
        <div className="text-slate-400 text-sm">{label}</div>
        <div className="text-2xl font-bold text-white">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-400',
    processing: 'bg-blue-500/10 text-blue-400',
    completed: 'bg-green-500/10 text-green-400',
    cancelled: 'bg-slate-500/10 text-slate-400',
    ready: 'bg-green-500/10 text-green-400',
    failed: 'bg-red-500/10 text-red-400',
    requested: 'bg-blue-500/10 text-blue-400',
  };
  return <span className={clsx('text-xs px-2 py-0.5 rounded capitalize', cls[status] || 'bg-slate-700 text-slate-300')}>{status}</span>;
}

function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white">
      {children}
    </button>
  );
}
