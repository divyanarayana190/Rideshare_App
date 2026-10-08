import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Star, Car, DollarSign, FileWarning, CheckCircle2,
  AlertTriangle, Clock, Shield, HeadphonesIcon, ScrollText, Ban,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

const EXPIRY_CLS: Record<string, string> = {
  valid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  warning_30: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  warning_15: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  warning_7: 'bg-red-500/20 text-red-400 border-red-500/30',
  expired: 'bg-red-600/30 text-red-300 border-red-500/50',
  unknown: 'bg-slate-600/30 text-slate-400 border-slate-600/50',
};

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const driverId = parseInt(id || '0');

  const { data, isLoading, error } = useQuery({
    queryKey: ['driver-detail', driverId],
    queryFn: () => api.get<any>(`/admin/drivers/${driverId}/detail`),
    enabled: driverId > 0,
  });

  if (isLoading) {
    return (
      <>
        <Header title="Driver Detail" subtitle="Loading…" />
        <div className="p-6 flex items-center justify-center h-64 text-slate-500">Loading driver profile…</div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <Header title="Driver Detail" subtitle="Not found" />
        <div className="p-6 text-center">
          <p className="text-red-400 mb-4">Driver not found</p>
          <button onClick={() => navigate('/drivers')} className="text-blue-400 hover:text-blue-300">← Back to drivers</button>
        </div>
      </>
    );
  }

  const { user, profile, session, documents, complianceWarnings, analytics, recentRides, ratings, payouts, supportTickets, auditLogs } = data;

  return (
    <>
      <Header title={user.name || 'Driver Detail'} subtitle={user.email} />
      <div className="p-6 space-y-6">
        <button onClick={() => navigate('/drivers')} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Back to drivers
        </button>

        {/* Compliance warnings banner */}
        {complianceWarnings?.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileWarning size={18} className="text-red-400" />
              <h3 className="text-red-400 font-semibold">Document Compliance Warnings ({complianceWarnings.length})</h3>
            </div>
            <div className="space-y-1">
              {complianceWarnings.map((d: any, i: number) => (
                <p key={i} className="text-sm text-red-300">{d.label}: {d.status.replace('warning_', '').replace('_', ' ')} — expires {d.expiry || 'N/A'}</p>
              ))}
            </div>
          </div>
        )}

        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Rating', value: Number(analytics.averageRating || 0).toFixed(1), icon: Star, color: '#F59E0B' },
            { label: 'Completed Rides', value: analytics.completedRides, icon: Car, color: '#3B82F6' },
            { label: 'Cancel Rate', value: `${analytics.cancellationRate}%`, icon: Ban, color: '#EF4444' },
            { label: 'Earnings', value: `$${(analytics.totalEarningsCents / 100).toLocaleString()}`, icon: DollarSign, color: '#10B981' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-xs">{label}</p>
                  <p className="text-xl font-bold text-white mt-1">{value}</p>
                </div>
                <Icon size={20} style={{ color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Documents */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Shield size={18} className="text-blue-400" /> Compliance Documents
            </h2>
            <div className="space-y-3">
              {(documents || []).map((doc: any) => (
                <div key={doc.type} className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 border border-slate-700/50">
                  <div>
                    <p className="text-sm font-medium text-white">{doc.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {doc.expiry ? `Expires ${doc.expiry}` : doc.label}
                      {doc.number && ` · ${doc.number}`}
                      {doc.provider && ` · ${doc.provider}`}
                    </p>
                  </div>
                  <span className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border capitalize', EXPIRY_CLS[doc.status] || EXPIRY_CLS.unknown)}>
                    {doc.status === 'expired' ? 'Expired' : doc.status.startsWith('warning') ? doc.expiryLabel : doc.expiryLabel || doc.status}
                  </span>
                </div>
              ))}
              {(!documents || documents.length === 0) && (
                <p className="text-slate-500 text-sm">No application documents on file</p>
              )}
            </div>
          </div>

          {/* Session & vehicle */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Profile & Session</h2>
            <dl className="space-y-2 text-sm">
              {[
                ['Status', session?.status || 'offline'],
                ['Vehicle', `${profile?.vehicleType || '—'} · ${profile?.vehicleColor || ''} · ${profile?.licensePlate || ''}`],
                ['Phone', profile?.phoneNumber || '—'],
                ['Stripe Connect', profile?.stripeConnectId ? 'Connected' : 'Not connected'],
                ['Banned', profile?.isBanned ? `Yes — ${profile.banReason}` : 'No'],
                ['Acceptance Rate', session?.acceptanceRate != null ? `${session.acceptanceRate}%` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="text-white text-right capitalize">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Recent rides */}
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <h2 className="text-lg font-semibold text-white">Ride History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700/50">
                  <th className="text-left px-4 py-3">Ride ID</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Route</th>
                  <th className="text-right px-4 py-3">Fare</th>
                  <th className="text-right px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {(recentRides || []).map((ride: any) => (
                  <tr key={ride.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-mono text-xs text-white">{ride.rideId}</td>
                    <td className="px-4 py-3 capitalize text-slate-300">{ride.status}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{ride.pickupAddress}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">${Number(ride.totalFare).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{new Date(ride.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {(!recentRides || recentRides.length === 0) && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No rides</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payouts */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-3">Payout History</h2>
            <div className="space-y-2">
              {(payouts || []).slice(0, 8).map((p: any) => (
                <div key={p.id} className="flex justify-between text-sm p-2 rounded bg-slate-700/30">
                  <span className="text-slate-300">${(p.amountCents / 100).toFixed(2)}</span>
                  <span className="text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
              {(!payouts || payouts.length === 0) && <p className="text-slate-500 text-sm">No payouts recorded</p>}
            </div>
          </div>

          {/* Support & audit */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <HeadphonesIcon size={16} /> Support & Audit
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(supportTickets || []).map((t: any) => (
                <div key={t.ticketId} className="text-sm p-2 rounded bg-slate-700/30">
                  <span className="text-white">{t.subject}</span>
                  <span className="text-slate-500 ml-2 capitalize">{t.status}</span>
                </div>
              ))}
              {(auditLogs || []).slice(0, 5).map((log: any) => (
                <div key={log.id} className="text-xs p-2 rounded bg-slate-700/20 text-slate-400">
                  <ScrollText size={10} className="inline mr-1" />
                  {log.action} — {log.details?.slice(0, 60)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
