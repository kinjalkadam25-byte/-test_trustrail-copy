import { useEffect, useState, FormEvent } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import CodeBadge from '../../components/CodeBadge';
import { useAuth, ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { Donation, Ngo } from '../../types';
import ui from '../../styles/ui.module.css';

function DonateForm() {
  const { token } = useAuth();
  const [ngos, setNgos] = useState<Ngo[]>([]);
  const [ngoId, setNgoId] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Donation | null>(null);

  useEffect(() => {
    api
      .get<{ ngo: Ngo; trustScore: number }[]>('/api/public/ngos')
      .then((rows) => setNgos(rows.map((r) => r.ngo)))
      .catch(() => setNgos([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!ngoId) {
      setError('Choose an NGO to donate to');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ donation: Donation }>('/api/donations', { ngoId, amount: Number(amount) }, token);
      setResult(res.donation);
      setAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create donation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Donor</div>
        <h1>Make a donation</h1>
        <p className={ui.helpText}>You&apos;ll get a Donation Code — save it to trace exactly where this money goes.</p>
      </div>

      <div className={ui.card} style={{ maxWidth: 480 }}>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className={ui.field}>
              <div className={ui.error}>{error}</div>
            </div>
          )}
          <div className={ui.field}>
            <label className={ui.label} htmlFor="ngo">
              NGO
            </label>
            <select id="ngo" className={ui.select} required value={ngoId} onChange={(e) => setNgoId(e.target.value)}>
              <option value="" disabled>
                Select an NGO…
              </option>
              {ngos.map((ngo) => (
                <option key={ngo.id} value={ngo.id}>
                  {ngo.name}
                </option>
              ))}
            </select>
          </div>
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
          <button type="submit" className={ui.button} disabled={submitting}>
            {submitting ? 'Donating…' : 'Donate'}
          </button>
        </form>
      </div>

      {result && (
        <div className={ui.card} style={{ maxWidth: 480 }}>
          <div className={ui.success} style={{ marginBottom: '1rem' }}>
            Donation of ₹{Number(result.amount).toLocaleString('en-IN')} received. Save this code.
          </div>
          <CodeBadge label="Donation code" code={result.donationCode} />
        </div>
      )}
    </div>
  );
}

export default function DonatePage() {
  return (
    <ProtectedRoute allow={['donor']}>
      <DonateForm />
    </ProtectedRoute>
  );
}
