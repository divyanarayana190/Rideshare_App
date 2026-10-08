import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Check, XCircle, Eye, Clock, CheckCircle, AlertTriangle, FileText, Car, Shield, Loader2, Image, MessageSquare } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

interface DriverApp {
  id: number;
  applicationId: string;
  userId: number;
  fullName: string;
  phoneNumber: string | null;
  profilePhotoUrl: string | null;
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: string;
  licenseFrontUrl: string | null;
  licenseBackUrl: string | null;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  plateNumber: string;
  vehicleType: string;
  vehicleRegistrationUrl: string | null;
  insurancePolicyNumber: string;
  insuranceProvider: string;
  insuranceExpiry: string;
  insuranceDocUrl: string | null;
  vehiclePhotoUrl: string | null;
  bankName: string;
  accountLast4: string;
  routingLast4: string;
  status: string;
  rejectionReason: string | null;
  actionRequiredReason: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  actionRequiredAt: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  tosAcceptedAt: string | null;
  tosVersion: string | null;
}

interface Stats {
  draft: number;
  pending: number;
  under_review: number;
  action_required: number;
  approved: number;
  rejected: number;
  total: number;
}

// R2 key fields that need signed URLs
const DOCUMENT_FIELDS = [
  'profilePhotoUrl',
  'licenseFrontUrl',
  'licenseBackUrl',
  'vehicleRegistrationUrl',
  'insuranceDocUrl',
  'vehiclePhotoUrl',
] as const;

type DocumentField = typeof DOCUMENT_FIELDS[number];

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  action_required: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const tabs = [
  { key: 'under_review', label: 'Under Review', icon: Eye },
  { key: 'action_required', label: 'Action Required', icon: AlertTriangle },
  { key: 'pending', label: 'Pending (Legacy)', icon: Clock },
  { key: 'approved', label: 'Approved', icon: CheckCircle },
  { key: 'rejected', label: 'Rejected', icon: XCircle },
  { key: 'all', label: 'All', icon: FileText },
];

type ModalType = 'reject' | 'request_changes' | null;

export default function DriverApplicationsPage() {
  const [apps, setApps] = useState<DriverApp[]>([]);
  const [stats, setStats] = useState<Stats>({ draft: 0, pending: 0, under_review: 0, action_required: 0, approved: 0, rejected: 0, total: 0 });
  const [status, setStatus] = useState('under_review');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DriverApp | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // Signed URLs for the open detail panel (keyed by document field name)
  const [signedUrls, setSignedUrls] = useState<Partial<Record<DocumentField, string>>>({});
  const [signedUrlsLoading, setSignedUrlsLoading] = useState(false);

  // Fetch signed URLs whenever the detail panel opens for a new application
  useEffect(() => {
    if (!selected) {
      setSignedUrls({});
      return;
    }

    let cancelled = false;
    setSignedUrlsLoading(true);

    const fetchSignedUrls = async () => {
      const entries = DOCUMENT_FIELDS
        .map((field) => ({ field, key: selected[field] }))
        .filter((e): e is { field: DocumentField; key: string } => Boolean(e.key));

      const results = await Promise.allSettled(
        entries.map(async ({ field, key }) => {
          const data = await api.get<{ signedUrl: string }>(
            `/admin/files/signed-url?key=${encodeURIComponent(key)}`,
          );
          return { field, signedUrl: data.signedUrl };
        }),
      );

      if (cancelled) return;

      const urls: Partial<Record<DocumentField, string>> = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          urls[result.value.field] = result.value.signedUrl;
        }
      }
      setSignedUrls(urls);
      setSignedUrlsLoading(false);
    };

    fetchSignedUrls().catch(() => {
      if (!cancelled) setSignedUrlsLoading(false);
    });

    return () => { cancelled = true; };
  }, [selected?.applicationId]);

  const fetchStats = useCallback(() => {
    api.get<Stats>('/admin/driver-applications/stats').then(setStats).catch(console.error);
  }, []);

  const fetchApps = useCallback(() => {
    setLoading(true);
    api.get<any>(`/admin/driver-applications?status=${status}&page=${page}&limit=20`)
      .then((d) => {
        setApps(d.applications || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleApprove = async (app: DriverApp) => {
    if (!confirm(`Approve ${app.fullName} as a driver? This will grant them full Driver Mode access.`)) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/driver-applications/${app.applicationId}/approve`);
      fetchApps();
      fetchStats();
      setSelected(null);
    } catch (err: any) {
      alert(err.message || 'Failed to approve');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !reasonText.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/driver-applications/${selected.applicationId}/reject`, { reason: reasonText });
      fetchApps();
      fetchStats();
      setSelected(null);
      setActiveModal(null);
      setReasonText('');
    } catch (err: any) {
      alert(err.message || 'Failed to reject');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!selected || !reasonText.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/driver-applications/${selected.applicationId}/request-changes`, { reason: reasonText });
      fetchApps();
      fetchStats();
      setSelected(null);
      setActiveModal(null);
      setReasonText('');
    } catch (err: any) {
      alert(err.message || 'Failed to request changes');
    } finally {
      setActionLoading(false);
    }
  };

  const openModal = (type: ModalType) => {
    setReasonText('');
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
    setReasonText('');
  };

  const openImagePreview = (signedUrl: string | undefined) => {
    if (signedUrl) setImagePreview(signedUrl);
  };

  const isActionable = (s: string) => ['pending', 'under_review', 'action_required'].includes(s);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="Driver Applications" subtitle="Review and manage driver onboarding" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { key: 'under_review', label: 'Under Review', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { key: 'action_required', label: 'Action Req.', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
            { key: 'pending', label: 'Pending', color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
            { key: 'approved', label: 'Approved', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
            { key: 'rejected', label: 'Rejected', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
            { key: 'total', label: 'Total', color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/50' },
          ].map((s) => (
            <div key={s.key} className={clsx('rounded-xl p-3 border border-slate-200 dark:border-slate-700', s.bg)}>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className={clsx('text-2xl font-bold mt-1', s.color)}>{stats[s.key as keyof Stats] ?? 0}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 pb-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatus(tab.key); setPage(1); }}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                status === tab.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}
            >
              <tab.icon size={15} />
              {tab.label}
              {tab.key !== 'all' && stats[tab.key as keyof Stats] > 0 && (
                <span className={clsx('text-xs px-1.5 py-0.5 rounded-full', statusColors[tab.key])}>
                  {stats[tab.key as keyof Stats]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-blue-500" size={32} />
            </div>
          ) : apps.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="mx-auto text-slate-300 dark:text-slate-600" size={48} />
              <p className="text-slate-500 mt-3">No {status.replace('_', ' ')} applications</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Applicant</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Vehicle</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">License</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Applied</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Always show initials avatar — profile photo requires signed URL fetched on open */}
                        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-sm">
                          {(app.fullName || '?')[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-white">{app.fullName}</p>
                          <p className="text-xs text-slate-500">{app.userEmail || `User #${app.userId}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700 dark:text-slate-200">{app.vehicleYear} {app.vehicleMake} {app.vehicleModel}</p>
                      <p className="text-xs text-slate-500">{app.vehicleColor} | {app.plateNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700 dark:text-slate-200">{app.licenseNumber}</p>
                      <p className="text-xs text-slate-500">{app.licenseState} | Exp: {app.licenseExpiry}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex px-2 py-1 rounded-full text-xs font-semibold', statusColors[app.status] || statusColors.pending)}>
                        {app.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelected(app)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-500 transition-colors"
                          title="View Details"
                        >
                          <Eye size={15} />
                        </button>
                        {isActionable(app.status) && (
                          <>
                            <button
                              onClick={() => handleApprove(app)}
                              className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-slate-500 hover:text-green-600 transition-colors"
                              title="Approve"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => { setSelected(app); openModal('request_changes'); }}
                              className="p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 text-slate-500 hover:text-orange-600 transition-colors"
                              title="Request Changes"
                            >
                              <MessageSquare size={15} />
                            </button>
                            <button
                              onClick={() => { setSelected(app); openModal('reject'); }}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 transition-colors"
                              title="Reject"
                            >
                              <XCircle size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500">{total} applications total</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-slate-600 dark:text-slate-300">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Side Panel */}
      {selected && !activeModal && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelected(null)} />
          <div className="relative ml-auto w-full max-w-lg bg-white dark:bg-slate-800 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Application Details</h2>
              <div className="flex items-center gap-2">
                {signedUrlsLoading && <Loader2 className="animate-spin text-slate-400" size={16} />}
                <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Status Banner */}
              <div className={clsx('rounded-lg px-4 py-3 flex items-center gap-3', statusColors[selected.status] || statusColors.pending)}>
                {selected.status === 'under_review' && <Eye size={18} />}
                {selected.status === 'approved' && <CheckCircle size={18} />}
                {selected.status === 'rejected' && <XCircle size={18} />}
                {selected.status === 'action_required' && <AlertTriangle size={18} />}
                {selected.status === 'pending' && <Clock size={18} />}
                <span className="font-semibold capitalize">{selected.status.replace(/_/g, ' ')}</span>
              </div>

              {/* Action Required Reason */}
              {selected.actionRequiredReason && (
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                  <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-1">Changes Requested</p>
                  <p className="text-sm text-orange-600 dark:text-orange-300">{selected.actionRequiredReason}</p>
                  {selected.actionRequiredAt && (
                    <p className="text-xs text-orange-400 mt-1">{new Date(selected.actionRequiredAt).toLocaleString()}</p>
                  )}
                </div>
              )}

              {/* Profile */}
              <Section title="Personal Info" icon={<Car size={16} />}>
                <div className="flex items-center gap-4 mb-4">
                  {signedUrls.profilePhotoUrl ? (
                    <img
                      src={signedUrls.profilePhotoUrl}
                      className="w-16 h-16 rounded-full object-cover cursor-pointer border-2 border-slate-200"
                      onClick={() => openImagePreview(signedUrls.profilePhotoUrl)}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
                      {(selected.fullName || '?')[0]}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-lg text-slate-800 dark:text-white">{selected.fullName}</p>
                    <p className="text-sm text-slate-500">{selected.userEmail || `User ID: ${selected.userId}`}</p>
                    <p className="text-sm text-slate-500">Phone: {selected.phoneNumber || 'N/A'}</p>
                  </div>
                </div>
              </Section>

              {/* License */}
              <Section title="Driver License" icon={<FileText size={16} />}>
                <InfoRow label="Number" value={selected.licenseNumber} />
                <InfoRow label="State" value={selected.licenseState} />
                <InfoRow label="Expiry" value={selected.licenseExpiry} />
                <div className="flex gap-3 mt-3">
                  {selected.licenseFrontUrl && (
                    <DocThumb
                      label="Front"
                      signedUrl={signedUrls.licenseFrontUrl}
                      loading={signedUrlsLoading}
                      onClick={() => openImagePreview(signedUrls.licenseFrontUrl)}
                    />
                  )}
                  {selected.licenseBackUrl && (
                    <DocThumb
                      label="Back"
                      signedUrl={signedUrls.licenseBackUrl}
                      loading={signedUrlsLoading}
                      onClick={() => openImagePreview(signedUrls.licenseBackUrl)}
                    />
                  )}
                </div>
              </Section>

              {/* Vehicle */}
              <Section title="Vehicle" icon={<Car size={16} />}>
                <InfoRow label="Make" value={selected.vehicleMake} />
                <InfoRow label="Model" value={selected.vehicleModel} />
                <InfoRow label="Year" value={String(selected.vehicleYear)} />
                <InfoRow label="Color" value={selected.vehicleColor} />
                <InfoRow label="Plate" value={selected.plateNumber} />
                <InfoRow label="Type" value={selected.vehicleType} />
                {selected.vehicleRegistrationUrl && (
                  <div className="mt-3">
                    <DocThumb
                      label="Registration"
                      signedUrl={signedUrls.vehicleRegistrationUrl}
                      loading={signedUrlsLoading}
                      onClick={() => openImagePreview(signedUrls.vehicleRegistrationUrl)}
                    />
                  </div>
                )}
                {selected.vehiclePhotoUrl && (
                  <div className="mt-3">
                    <DocThumb
                      label="Vehicle Photo"
                      signedUrl={signedUrls.vehiclePhotoUrl}
                      loading={signedUrlsLoading}
                      onClick={() => openImagePreview(signedUrls.vehiclePhotoUrl)}
                    />
                  </div>
                )}
              </Section>

              {/* Insurance */}
              <Section title="Insurance" icon={<Shield size={16} />}>
                <InfoRow label="Provider" value={selected.insuranceProvider} />
                <InfoRow label="Policy #" value={selected.insurancePolicyNumber} />
                <InfoRow label="Expiry" value={selected.insuranceExpiry} />
                {selected.insuranceDocUrl && (
                  <div className="mt-3">
                    <DocThumb
                      label="Insurance Doc"
                      signedUrl={signedUrls.insuranceDocUrl}
                      loading={signedUrlsLoading}
                      onClick={() => openImagePreview(signedUrls.insuranceDocUrl)}
                    />
                  </div>
                )}
              </Section>

              {/* Agreements */}
              {selected.tosAcceptedAt && (
                <Section title="Agreements" icon={<FileText size={16} />}>
                  <InfoRow label="TOS Accepted" value={new Date(selected.tosAcceptedAt).toLocaleString()} />
                  {selected.tosVersion && <InfoRow label="TOS Version" value={selected.tosVersion} />}
                </Section>
              )}

              {/* Bank */}
              <Section title="Bank & Payout" icon={<FileText size={16} />}>
                <InfoRow label="Bank" value={selected.bankName || '—'} />
                <InfoRow label="Account" value={selected.accountLast4 ? `****${selected.accountLast4}` : '—'} />
                <InfoRow label="Routing" value={selected.routingLast4 ? `****${selected.routingLast4}` : '—'} />
              </Section>

              {/* Rejection Reason */}
              {selected.rejectionReason && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-600 dark:text-red-300">{selected.rejectionReason}</p>
                </div>
              )}

              {/* Action Buttons */}
              {isActionable(selected.status) && (
                <div className="flex gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => handleApprove(selected)}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50 text-sm"
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                    Approve
                  </button>
                  <button
                    onClick={() => openModal('request_changes')}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50 text-sm"
                  >
                    <MessageSquare size={16} />
                    Request Changes
                  </button>
                  <button
                    onClick={() => openModal('reject')}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50 text-sm"
                  >
                    <XCircle size={16} />
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject / Request Changes Modal */}
      {activeModal && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">
              {activeModal === 'reject' ? 'Reject Application' : 'Request Changes'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {activeModal === 'reject'
                ? `Rejecting application from ${selected.fullName}. Please provide a reason:`
                : `Requesting changes from ${selected.fullName}. Describe what needs to be updated:`}
            </p>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={activeModal === 'reject' ? 'Enter rejection reason...' : 'Describe the changes needed (e.g. license photo is blurry, please re-upload)...'}
              rows={4}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={activeModal === 'reject' ? handleReject : handleRequestChanges}
                disabled={!reasonText.trim() || actionLoading}
                className={clsx(
                  'flex-1 py-2.5 rounded-lg text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2',
                  activeModal === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'
                )}
              >
                {actionLoading ? <Loader2 className="animate-spin" size={16} /> : null}
                {activeModal === 'reject' ? 'Reject' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {imagePreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={() => setImagePreview(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative max-w-3xl max-h-[80vh]">
            <button onClick={() => setImagePreview(null)} className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg z-10">
              <X size={20} />
            </button>
            <img src={imagePreview} className="max-w-full max-h-[80vh] rounded-lg shadow-xl" />
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-500">{icon}</span>
        <h3 className="font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      </div>
      <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-4 space-y-2">
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-800 dark:text-white">{value}</span>
    </div>
  );
}

function DocThumb({
  label,
  signedUrl,
  loading,
  onClick,
}: {
  label: string;
  signedUrl: string | undefined;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!signedUrl && !loading}
      className="flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-default"
    >
      {loading ? (
        <Loader2 size={24} className="animate-spin text-slate-400" />
      ) : signedUrl ? (
        <img
          src={signedUrl}
          className="w-12 h-10 object-cover rounded"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <Image size={24} className="text-slate-400" />
      )}
      <span className="text-xs text-slate-500">{label}</span>
    </button>
  );
}
