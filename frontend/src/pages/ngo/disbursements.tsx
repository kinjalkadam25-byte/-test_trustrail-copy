import { useEffect, useState, FormEvent } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import CodeBadge from '../../components/CodeBadge';
import StatusPill from '../../components/StatusPill';
import { useAuth, ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { NgoDisbursementRow } from '../../types';
import ui from '../../styles/ui.module.css';

interface Vendor {
  id: string;
  name: string;
  email: string;
}

interface CreateResult {
  // null here is the normal case -- no code exists yet, it's only assigned
  // once the bill/OCR check and the bank payout have both succeeded.
  disbursement: { id: string; verificationCode: string | null; amount: string | number };
  allocations: { id: string; donation_id: string; amount_allocated: string }[];
  underfunded: boolean;
}

function DisbursementsPage() {
  const { token } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rows, setRows] = useState<NgoDisbursementRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [category, setCategory] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  const [payoutBusyId, setPayoutBusyId] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  async function loadList() {
    try {
      const data = await api.get<NgoDisbursementRow[]>('/api/ngo/disbursements', token);
      setRows(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to load disbursements');
    }
  }

  async function triggerPayout(disbursementId: string) {
    setPayoutError(null);
    setPayoutBusyId(disbursementId);
    try {
      await api.post(`/api/disbursements/${disbursementId}/payout`, {}, token);
      await loadList();
    } catch (err) {
      setPayoutError(err instanceof ApiError ? err.message : 'Failed to trigger payout');
    } finally {
      setPayoutBusyId(null);
    }
  }

  useEffect(() => {
    api
      .get<Vendor[]>('/api/ngo/vendors', token)
      .then(setVendors)
      .catch(() => setVendors([]));
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api.post<CreateResult>(
        '/api/disbursements',
        { amount: Number(amount), purpose, category: category || undefined, vendorId: vendorId || undefined },
        token
      );
      setResult(res);
      setAmount('');
      setPurpose('');
      setCategory('');
      setVendorId('');
      loadList();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to log disbursement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
  <div className={ui.eyebrow}>NGO Admin</div>
  <h1>Disbursements</h1>
  <p className={ui.helpText}>Log a new disbursement and the FIFO engine allocates it from your oldest unspent donations automatically.</p>
</div>

      <div className={ui.card}>
        <h3>Log a new disbursement</h3>
        <form onSubmit={handleSubmit}>
          {formError && (
            <div className={ui.field}>
              <div className={ui.error}>{formError}</div>
            </div>
          )}
          <div className={ui.grid2}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="amount">
                Amount (₹)
              </label>
              <input
                id="amount"
                type="number"
                min={1}
                step="0.01"
                required
                className={ui.input}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="category">
                Category
              </label>
              <input
                id="category"
                className={ui.input}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. School supplies"
              />
            </div>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="purpose">
              Purpose
            </label>
            <input
              id="purpose"
              required
              className={ui.input}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Notebooks & stationery for Term 2"
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="vendor">
              Assign to vendor (optional)
            </label>
            <select id="vendor" className={ui.select} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Unassigned for now</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={ui.button} disabled={submitting}>
            {submitting ? 'Logging…' : 'Log disbursement'}
          </button>
        </form>
      </div>

      {result && (
        <div className={ui.card}>
          {result.underfunded && (
            <div className={ui.warning} style={{ marginBottom: '1rem' }}>
              This disbursement is underfunded — available donations didn&apos;t fully cover it. It&apos;s been sent
              to the platform admin flag queue for manual resolution.
            </div>
          )}
          <div className={ui.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {result.disbursement.verificationCode ? (
              <CodeBadge label="Verification code" code={result.disbursement.verificationCode} />
            ) : (
              <div>
                <div className={ui.eyebrow}>Verification code</div>
                <p className={ui.helpText} style={{ margin: 0, maxWidth: 280 }}>
                  Not assigned yet — this appears once the vendor&apos;s bill is uploaded and confirmed, and the
                  payout to their bank account has succeeded.
                </p>
              </div>
            )}
            <div>
              <div className={ui.eyebrow}>Funded by</div>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Donation</th>
                    <th>Amount drawn</th>
                  </tr>
                </thead>
                <tbody>
                  {result.allocations.map((a) => (
                    <tr key={a.id}>
                      <td className={ui.mono}>{a.donation_id.slice(0, 8)}…</td>
                      <td>₹{Number(a.amount_allocated).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className={ui.card}>
        <h3>All disbursements</h3>
        {listError && <div className={ui.error}>{listError}</div>}
        {payoutError && <div className={ui.error}>{payoutError}</div>}
        {rows.length === 0 && !listError ? (
          <div className={ui.emptyState}>No disbursements logged yet.</div>
        ) : (
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Purpose</th>
                <th>Amount</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Payout</th>
                <th>Flag</th>
                <th>Verification code</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.disbursement.id}>
                  <td>
                    {r.disbursement.purpose}
                    {r.disbursement.underfunded && (
                      <div className={ui.helpText} style={{ color: 'var(--flagged)' }}>
                        Underfunded
                      </div>
                    )}
                  </td>
                  <td>₹{Number(r.disbursement.amount).toLocaleString('en-IN')}</td>
                  <td>{r.disbursement.vendorName || '—'}</td>
                  <td>
                    <StatusPill status={r.disbursement.status} />
                  </td>
                  <td>
                    {r.payoutStatus ? (
                      <span title={r.payoutFailureReason ?? undefined}>
                        <StatusPill status={r.payoutStatus} />
                      </span>
                    ) : r.disbursement.vendorId && r.vendorHasBankAccount ? (
                      <button
                        type="button"
                        className={ui.buttonSecondary}
                        disabled={payoutBusyId === r.disbursement.id}
                        onClick={() => triggerPayout(r.disbursement.id)}
                      >
                        {payoutBusyId === r.disbursement.id ? 'Sending…' : 'Send payout'}
                      </button>
                    ) : r.disbursement.vendorId ? (
                      <span className={ui.helpText}>Vendor has no bank account yet</span>
                    ) : (
                      '—'
                    )}
                    {r.payoutStatus === 'failed' && r.vendorHasBankAccount && (
                      <button
                        type="button"
                        className={ui.buttonSecondary}
                        style={{ marginTop: '0.4rem' }}
                        disabled={payoutBusyId === r.disbursement.id}
                        onClick={() => triggerPayout(r.disbursement.id)}
                      >
                        {payoutBusyId === r.disbursement.id ? 'Retrying…' : 'Retry payout'}
                      </button>
                    )}
                  </td>
                  <td>
                    {r.flagStatus ? (
                      <span title={r.flagStatus.reason}>
                        <StatusPill status={r.flagStatus.reviewStatus} />
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={ui.mono}>{r.disbursement.verificationCode || <span className={ui.helpText}>Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function NgoDisbursementsPage() {
  return (
    <ProtectedRoute allow={['ngo_admin']}>
      <DisbursementsPage />
    </ProtectedRoute>
  );
}
