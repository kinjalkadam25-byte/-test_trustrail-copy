import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth, ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { NgoDashboard } from '../../types';
import ui from '../../styles/ui.module.css';

function Dashboard() {
  const { token, user } = useAuth();
  const [data, setData] = useState<NgoDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<NgoDashboard>('/api/ngo/dashboard', token)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load dashboard'));
  }, [token]);

  return (
    <div className={ui.stack}>
     <div className={ui.pageHead}>
  <div className={ui.eyebrow}>NGO Admin — {user?.name}</div>
  <h1>Dashboard</h1>
  <p className={ui.helpText}>A live overview of your NGO's donations, disbursements, and verification status.</p>
</div>

      {error && <div className={ui.error}>{error}</div>}

      {data && (
        <div className={ui.statGrid}>
          <div className={ui.statCard}>
            <div className={ui.statValue}>₹{data.totalDonations.toLocaleString('en-IN')}</div>
            <div className={ui.statLabel}>Total donations received</div>
          </div>
          <div className={ui.statCard}>
            <div className={ui.statValue}>₹{data.totalDisbursed.toLocaleString('en-IN')}</div>
            <div className={ui.statLabel}>Total disbursed</div>
          </div>
          <div className={ui.statCard}>
            <div className={ui.statValue}>{data.verifiedPct}%</div>
            <div className={ui.statLabel}>Disbursements verified</div>
          </div>
          <div className={ui.statCard}>
            <div className={ui.statValue}>{data.avgVerificationTime !== null ? `${data.avgVerificationTime}h` : '—'}</div>
            <div className={ui.statLabel}>Avg. time to bill upload</div>
          </div>
          <div className={ui.statCard}>
            <div className={ui.statValue}>{data.pendingCount}</div>
            <div className={ui.statLabel}>Pending disbursements</div>
          </div>
        </div>
      )}

      <div className={ui.card}>
        <div className={ui.row} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ marginBottom: '0.2rem' }}>Log a disbursement</h3>
            <p className={ui.helpText} style={{ margin: 0 }}>FIFO allocation and ledger writes happen automatically.</p>
          </div>
          <Link href="/ngo/disbursements" className={ui.button}>
            Go to disbursements
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function NgoDashboardPage() {
  return (
    <ProtectedRoute allow={['ngo_admin']}>
      <Dashboard />
    </ProtectedRoute>
  );
}
