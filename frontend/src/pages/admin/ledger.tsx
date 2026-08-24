import { useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth, ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { LedgerVerifyResult } from '../../types';
import ui from '../../styles/ui.module.css';

function LedgerCheck() {
  const { token } = useAuth();
  const [result, setResult] = useState<LedgerVerifyResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.get<LedgerVerifyResult>('/api/admin/ledger/verify', token);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to run integrity check');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Platform Admin</div>
        <h1>Ledger integrity check</h1>
        <p className={ui.helpText}>
          Walks every entry in the hash chain, recomputes its hash from the stored payload, and checks the
          previous-hash linkage. If any past entry was edited after the fact, this — and every entry after it —
          will fail.
        </p>
      </div>

      <div className={ui.card} style={{ maxWidth: 560 }}>
        <button type="button" className={ui.button} onClick={runCheck} disabled={checking}>
          {checking ? 'Verifying…' : 'Run integrity check'}
        </button>

        {error && (
          <div className={ui.error} style={{ marginTop: '1rem' }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: '1.25rem' }}>
            {result.valid ? (
              <div className={ui.success}>
                Chain intact — all {result.entriesChecked} entries verified.
              </div>
            ) : (
              <div className={ui.error}>
                Chain broken at entry #{result.brokenAtEntryId}: {result.reason}
                <div className={ui.helpText} style={{ marginTop: '0.4rem' }}>
                  {result.entriesChecked} entries checked before the break was found.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminLedgerPage() {
  return (
    <ProtectedRoute allow={['platform_admin']}>
      <LedgerCheck />
    </ProtectedRoute>
  );
}
