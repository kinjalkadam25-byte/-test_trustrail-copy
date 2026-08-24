import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import CodeBadge from '../../components/CodeBadge';
import StatusPill from '../../components/StatusPill';
import { ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { Allocation, Donation } from '../../types';
import ui from '../../styles/ui.module.css';

interface LookupResponse {
  donation: Donation;
  allocations: Allocation[];
}

export default function DonorLookupPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LookupResponse | null>(null);

  async function runLookup(lookupCode: string) {
    if (!lookupCode) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await api.get<LookupResponse>(`/api/donations/${encodeURIComponent(lookupCode)}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to look up donation');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const queryCode = router.query.code;
    if (typeof queryCode === 'string' && queryCode) {
      setCode(queryCode);
      runLookup(queryCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.code]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runLookup(code.trim().toUpperCase());
  }

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Donor</div>
        <h1>Trace a donation</h1>
        <p className={ui.helpText}>Enter your Donation Code to see exactly which disbursements it funded.</p>
      </div>

      <div className={ui.card} style={{ maxWidth: 480 }}>
        <form onSubmit={handleSubmit} className={ui.row} style={{ alignItems: 'flex-end' }}>
          <div className={ui.field} style={{ flex: 1, marginBottom: 0 }}>
            <label className={ui.label} htmlFor="code">
              Donation code
            </label>
            <input
              id="code"
              className={`${ui.input} ${ui.mono}`}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="E.G. A1B2C3D4"
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <button type="submit" className={ui.button} disabled={loading}>
            {loading ? 'Looking up…' : 'Look up'}
          </button>
        </form>
      </div>

      {error && <div className={ui.error}>{error}</div>}

      {data && (
        <div className={ui.stack}>
          <div className={ui.card}>
            <div className={ui.eyebrow}>Donation</div>
            <div className={ui.row} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ marginBottom: '0.2rem' }}>{data.donation.ngoName}</h2>
                <p className={ui.helpText} style={{ margin: 0 }}>
                  Donated {new Date(data.donation.createdAt).toLocaleDateString('en-IN')}
                </p>
              </div>
              <CodeBadge label="Donation code" code={data.donation.donationCode} />
            </div>
            <div className={ui.statGrid} style={{ marginTop: '1.25rem' }}>
              <div className={ui.statCard}>
                <div className={ui.statValue}>₹{Number(data.donation.amount).toLocaleString('en-IN')}</div>
                <div className={ui.statLabel}>Total donated</div>
              </div>
              <div className={ui.statCard}>
                <div className={ui.statValue}>₹{Number(data.donation.remainingAmount).toLocaleString('en-IN')}</div>
                <div className={ui.statLabel}>Not yet allocated</div>
              </div>
              <div className={ui.statCard}>
                <div className={ui.statValue}>{data.allocations.length}</div>
                <div className={ui.statLabel}>Disbursements funded</div>
              </div>
            </div>
          </div>

          <div className={ui.card}>
            <h3>Where this money went</h3>
            {data.allocations.length === 0 ? (
              <div className={ui.emptyState}>Not allocated to any disbursement yet.</div>
            ) : (
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Purpose</th>
                    <th>Category</th>
                    <th>Amount from this donation</th>
                    <th>Status</th>
                    <th>Verification code</th>
                  </tr>
                </thead>
                <tbody>
                  {data.allocations.map((a) => (
                    <tr key={a.disbursement.id}>
                      <td>{a.disbursement.purpose}</td>
                      <td>{a.disbursement.category || '—'}</td>
                      <td>₹{Number(a.amountAllocated).toLocaleString('en-IN')}</td>
                      <td>
                        <StatusPill status={a.disbursement.status} />
                      </td>
                      <td className={ui.mono}>{a.disbursement.verificationCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
