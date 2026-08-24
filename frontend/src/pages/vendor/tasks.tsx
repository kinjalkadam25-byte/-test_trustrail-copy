import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import StatusPill from '../../components/StatusPill';
import { useAuth, ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { VendorDisbursement } from '../../types';
import ui from '../../styles/ui.module.css';

function Tasks() {
  const { token, user } = useAuth();
  const [rows, setRows] = useState<VendorDisbursement[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<VendorDisbursement[]>('/api/vendor/disbursements', token)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load tasks'));
  }, [token]);

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Vendor — {user?.name}</div>
        <h1>My assigned disbursements</h1>
      </div>

      {error && <div className={ui.error}>{error}</div>}

      <div className={ui.card}>
        {rows.length === 0 && !error ? (
          <div className={ui.emptyState}>No disbursements assigned to you yet.</div>
        ) : (
          <table className={ui.table}>
            <thead>
              <tr>
                <th>NGO</th>
                <th>Purpose</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.ngoName}</td>
                  <td>{r.purpose}</td>
                  <td>₹{Number(r.amount).toLocaleString('en-IN')}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>
                    {r.status === 'pending_bill' ? (
                      <Link href={`/vendor/upload/${r.id}`} className={ui.buttonSecondary}>
                        Upload bill
                      </Link>
                    ) : (
                      <span className={ui.helpText}>Bill submitted</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function VendorTasksPage() {
  return (
    <ProtectedRoute allow={['vendor']}>
      <Tasks />
    </ProtectedRoute>
  );
}
