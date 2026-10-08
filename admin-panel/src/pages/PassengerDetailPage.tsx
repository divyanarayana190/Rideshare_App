import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Star, Car, DollarSign, ShieldOff, Ban, Gift } from 'lucide-react';
import Header from '@/components/layout/Header';
import { api } from '@/lib/api';
import { clsx } from 'clsx';

const RISK_CLS: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/20 border-red-500/30',
  high: 'text-orange-400 bg-orange-500/20 border-orange-500/30',
  medium: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
  low: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
};

export default function PassengerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const passengerId = parseInt(id || '0');

  const { data, isLoading } = useQuery({
    queryKey: ['passenger-detail', passengerId],
    queryFn: () => api.get<any>(`/admin/passengers/${passengerId}/detail`),
    enabled: passengerId > 0,
  });

  if (isLoading) return <><Header title="Passenger Detail" subtitle="Loading…" /><div className="p-6 text-slate-500">Loading…</div></>;
  if (!data) return <><Header title="Passenger Detail" subtitle="Not found" /><div className="p-6 text-red-400">Passenger not found</div></>;

  const { user, profile, analytics, fraudProfile, rideHistory, payments, ratingsReceived, referralHistory, supportTickets } = data;

  return (
    <>
      <Header title={user.name || 'Passenger'} subtitle={user.email} />
      <div className="p-6 space-y-6">
        <button onClick={() => navigate('/passengers')} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={16} /> Back to passengers
        </button>

        {/* Fraud score */}
        <div className={clsx('rounded-xl p-4 border flex items-start gap-4', RISK_CLS[fraudProfile.riskLevel] || RISK_CLS.low)}>
          <ShieldOff size={24} />
          <div className="flex-1">
            <p className="font-semibold">Fraud Score: {fraudProfile.score}/100 · {fraudProfile.riskLevel.toUpperCase()}</p>
            <ul className="mt-2 space-y-1 text-sm opacity-90">
              {fraudProfile.explanations.map((e: string, i: number) => <li key={i}>• {e}</li>)}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Rating', value: Number(analytics.averageRating || 0).toFixed(1), icon: Star },
            { label: 'Completed', value: analytics.completedRides, icon: Car },
            { label: 'Cancel Rate', value: `${analytics.cancellationRate}%`, icon: Ban },
            { label: 'Total Spent', value: `$${(analytics.totalSpentCents / 100).toLocaleString()}`, icon: DollarSign },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
              <div className="flex justify-between"><p className="text-slate-400 text-xs">{label}</p><Icon size={16} className="text-slate-500" /></div>
              <p className="text-xl font-bold text-white mt-1">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-3">Ride History</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(rideHistory || []).map((r: any) => (
                <div key={r.id} className="flex justify-between text-sm p-2 rounded bg-slate-700/30">
                  <div><p className="text-white font-mono text-xs">{r.rideId}</p><p className="text-slate-400 text-xs truncate max-w-[200px]">{r.pickupAddress}</p></div>
                  <div className="text-right"><p className="capitalize text-slate-300">{r.status}</p><p className="text-emerald-400">${Number(r.totalFare).toFixed(2)}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold text-white mb-3">Payment History</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(payments || []).map((p: any) => (
                <div key={p.paymentId} className="flex justify-between text-sm p-2 rounded bg-slate-700/30">
                  <span className="text-slate-300 capitalize">{p.status}</span>
                  <span className="text-emerald-400">${(p.amountCents / 100).toFixed(2)}</span>
                </div>
              ))}
              {(!payments || payments.length === 0) && <p className="text-slate-500 text-sm">No payments</p>}
            </div>
          </div>
        </div>

        {(referralHistory?.length > 0 || supportTickets?.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {referralHistory?.length > 0 && (
              <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2"><Gift size={16} /> Referrals</h2>
                {referralHistory.map((r: any) => (
                  <div key={r.id} className="text-sm p-2 rounded bg-slate-700/30 mb-2">
                    <span className="text-white">{r.referralCode}</span>
                    <span className="text-slate-400 ml-2 capitalize">{r.status}</span>
                  </div>
                ))}
              </div>
            )}
            {supportTickets?.length > 0 && (
              <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                <h2 className="text-lg font-semibold text-white mb-3">Support Cases</h2>
                {supportTickets.map((t: any) => (
                  <div key={t.ticketId} className="text-sm p-2 rounded bg-slate-700/30 mb-2">
                    <p className="text-white">{t.subject}</p>
                    <p className="text-slate-400 capitalize">{t.status} · {t.category}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
