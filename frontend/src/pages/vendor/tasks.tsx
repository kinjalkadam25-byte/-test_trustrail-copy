import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../components/ProtectedRoute';
import StatusPill from '../../components/StatusPill';
import { useAuth, ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { VendorBankAccount, VendorDisbursement } from '../../types';
import ui from '../../styles/ui.module.css';

function BankAccountSection() {
  const { token } = useAuth();
  const [account, setAccount] = useState<VendorBankAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ bankAccount: VendorBankAccount | null }>('/api/vendor/bank-account', token)
      .then((res) => setAccount(res.bankAccount))
      .catch(() => setAccount(null))
      .finally(() => setLoaded(true));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ bankAccount: VendorBankAccount }>(
        '/api/vendor/bank-account',
        { accountNumber, ifscCode, accountHolderName },
        token
      );
      setAccount(res.bankAccount);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save bank account');
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return null;

  return (
    <div className={ui.card}>
      <h3>Payout bank account</h3>
      <p className={ui.helpText} style={{ marginTop: '-0.4rem', marginBottom: '1rem' }}>
        Disbursements assigned to you can only be paid out (and later marked verified) once this is on file.
      </p>

      {!editing && account && (
        <div className={ui.row} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div>{account.accountHolderName}</div>
            <div className={ui.helpText}>
              A/C ending {account.accountNumber.slice(-4)} · {account.ifscCode}
            </div>
          </div>
          <button type="button" className={ui.buttonSecondary} onClick={() => setEditing(true)}>
            Update
          </button>
        </div>
      )}

      {!editing && !account && (
        <button type="button" className={ui.button} onClick={() => setEditing(true)}>
          Add bank account
        </button>
      )}

      {editing && (
        <form onSubmit={handleSubmit}>
          {error && (
            <div className={ui.field}>
              <div className={ui.error}>{error}</div>
            </div>
          )}
          <div className={ui.field}>
            <label className={ui.label} htmlFor="accountHolderName">
              Account holder name
            </label>
            <input
              id="accountHolderName"
              required
              className={ui.input}
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
            />
          </div>
          <div className={ui.grid2}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="accountNumber">
                Account number
              </label>
              <input
                id="accountNumber"
                required
                inputMode="numeric"
                className={ui.input}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="ifscCode">
                IFSC code
              </label>
              <input
                id="ifscCode"
                required
                className={ui.input}
                placeholder="e.g. HDFC0001234"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div className={ui.row} style={{ gap: '0.5rem' }}>
            <button type="submit" className={ui.button} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
            {account && (
              <button type="button" className={ui.buttonSecondary} onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

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

      <BankAccountSection />

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
