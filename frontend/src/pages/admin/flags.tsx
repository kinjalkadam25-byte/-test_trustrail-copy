import { useEffect, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth, ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { AdminFlagRow } from '../../types';
import ui from '../../styles/ui.module.css';

function FlagQueue() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AdminFlagRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<AdminFlagRow[]>('/api/admin/flags', token);
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load flags');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function review(id: string, reviewStatus: 'confirmed_ok' | 'confirmed_issue') {
    setBusyId(id);
    try {
      await api.post(`/api/admin/flags/${id}/review`, { reviewStatus }, token);
      setRows((prev) => prev.filter((r) => r.anomalyFlag.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit review');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Platform Admin</div>
        <h1>Flag queue</h1>
        <p className={ui.helpText}>
          Anomaly scoring is advisory only — every flag here is reviewed by a human, never acted on automatically.
        </p>
      </div>

      {error && <div className={ui.error}>{error}</div>}

      {rows.length === 0 && !error ? (
        <div className={ui.card}>
          <div className={ui.emptyState}>Nothing unreviewed right now.</div>
        </div>
      ) : (
        <div className={ui.stack}>
          {rows.map((r) => (
            <div className={ui.card} key={r.anomalyFlag.id}>
              <div className={ui.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ marginBottom: '0.2rem' }}>{r.disbursement.purpose}</h3>
                  <p className={ui.helpText} style={{ margin: 0 }}>
                    {r.disbursement.ngoName} · ₹{Number(r.disbursement.amount).toLocaleString('en-IN')}
                    {r.disbursement.verificationCode && (
                      <>
                        {' '}
                        · <span className={ui.mono}>{r.disbursement.verificationCode}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className={ui.row}>
                  <button
                    type="button"
                    className={ui.buttonSecondary}
                    disabled={busyId === r.anomalyFlag.id}
                    onClick={() => review(r.anomalyFlag.id, 'confirmed_ok')}
                  >
                    Mark OK
                  </button>
                  <button
                    type="button"
                    className={ui.button}
                    style={{ background: 'var(--flagged)' }}
                    disabled={busyId === r.anomalyFlag.id}
                    onClick={() => review(r.anomalyFlag.id, 'confirmed_issue')}
                  >
                    Confirm issue
                  </button>
                </div>
              </div>
              <p style={{ marginTop: '0.85rem', marginBottom: 0 }}>{r.anomalyFlag.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminFlagsPage() {
  return (
    <ProtectedRoute allow={['platform_admin']}>
      <FlagQueue />
    </ProtectedRoute>
  );
}
