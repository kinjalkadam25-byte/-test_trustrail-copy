import { useCallback, useEffect, useRef, useState } from 'react';
import { Wallet, Landmark, ShieldCheck, Clock, Search } from 'lucide-react';
import { ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import StatusPill from '../../components/StatusPill';
import DonutChart from '../../components/DonutChart';
import ui from '../../styles/ui.module.css';
import styles from './Ledger.module.css';

interface Transaction {
  verificationCode: string;
  amount: number;
  ngoName: string;
  vendorName: string | null;
  date: string;
  status: string;
}

interface LedgerSummary {
  totalDonated: number;
  totalDisbursed: number;
  verifiedPct: number;
  avgVerificationHours: number | null;
  disbursementStatus: { verifiedAmount: number; pendingAmount: number };
  transactions: Transaction[];
}

const POLL_INTERVAL_MS = 5000;

function formatCr(amount: number): string {
  const crores = amount / 10000000;
  if (crores >= 0.01) return `₹${crores.toFixed(2)}Cr`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function PublicLedgerPage() {
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'verified' | 'pending'>('all');
  const [paused, setPaused] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastFetchedAt = useRef<number>(Date.now());

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);
    try {
      const data = await api.get<LedgerSummary>(`/api/public/ledger?${params.toString()}`);
      setSummary(data);
      setError(null);
      lastFetchedAt.current = Date.now();
      setSecondsAgo(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the public ledger');
    }
  }, [search, status]);

  // Initial load + reload whenever search/status changes (debounced for search typing)
  useEffect(() => {
    const handle = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, search]);

  // Poll for live updates on the unfiltered view only
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      if (!search && status === 'all') load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, search, status, load]);

  // "updated Xs ago" ticker
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastFetchedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Public Ledger</div>
        <h1>The ledger, in real time.</h1>
        <p className={ui.helpText}>
          Every figure below reads directly off the hash-chained ledger — refreshed automatically, no donor
          identity attached. This is the same data auditors see.
        </p>
      </div>

      <div className={styles.liveRow}>
        <span className={styles.liveIndicator}>
          <span className={`${styles.liveDot} ${paused ? styles.paused : ''}`} />
          {paused ? 'Paused' : `Live — updated ${secondsAgo}s ago`}
        </span>
        <button type="button" className={styles.pauseBtn} onClick={() => setPaused((p) => !p)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {error && <div className={ui.error}>{error}</div>}

      {summary && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <Wallet size={16} />
              </div>
              <div className={styles.statValue}>{formatCr(summary.totalDonated)}</div>
              <div className={styles.statLabel}>Total donated</div>
              <div className={styles.statSub}>₹{summary.totalDonated.toLocaleString('en-IN')} exact</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <Landmark size={16} />
              </div>
              <div className={styles.statValue}>{formatCr(summary.totalDisbursed)}</div>
              <div className={styles.statLabel}>Total disbursed</div>
              <div className={styles.statSub}>
                {summary.totalDonated > 0
                  ? Math.round((summary.totalDisbursed / summary.totalDonated) * 1000) / 10
                  : 0}
                % of donated funds
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <ShieldCheck size={16} />
              </div>
              <div className={styles.statValue}>{summary.verifiedPct}%</div>
              <div className={styles.statLabel}>Verified with proof</div>
              <div className={styles.statSub}>Vendor-uploaded, ledger-matched</div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon}>
                <Clock size={16} />
              </div>
              <div className={styles.statValue}>
                {summary.avgVerificationHours !== null ? `${summary.avgVerificationHours}h` : '—'}
              </div>
              <div className={styles.statLabel}>Avg. verification lag</div>
              <div className={styles.statSub}>Disbursement → verified proof</div>
            </div>
          </div>

          <div className={styles.mainGrid}>
            <div className={ui.card}>
              <div className={styles.panelHead}>
                <div>
                  <h3 style={{ marginBottom: '0.2rem' }}>Recent transactions</h3>
                  <p className={ui.helpText} style={{ margin: 0 }}>
                    Donor identity is never shown in this view
                  </p>
                </div>
                <div className={styles.searchRow}>
                  <span style={{ position: 'relative' }}>
                    <Search
                      size={14}
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }}
                    />
                    <input
                      className={styles.searchInput}
                      style={{ paddingLeft: '1.9rem' }}
                      placeholder="Search VC, NGO, vendor"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </span>
                  <select
                    className={styles.statusSelect}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'all' | 'verified' | 'pending')}
                  >
                    <option value="all">All status</option>
                    <option value="verified">Verified</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>VC Code</th>
                    <th>Amount</th>
                    <th>NGO</th>
                    <th>Vendor</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.transactions.map((tx) => (
                    <tr key={tx.verificationCode}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{tx.verificationCode}</td>
                      <td>₹{tx.amount.toLocaleString('en-IN')}</td>
                      <td>{tx.ngoName}</td>
                      <td>{tx.vendorName ?? '—'}</td>
                      <td>{new Date(tx.date).toLocaleDateString('en-IN')}</td>
                      <td>
                        <StatusPill status={tx.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {summary.transactions.length === 0 && <div className={styles.emptyRow}>No transactions match this filter.</div>}
            </div>

            <div className={ui.card}>
              <h3 style={{ marginBottom: '0.2rem' }}>Disbursement status</h3>
              <p className={ui.helpText} style={{ marginBottom: '1rem' }}>
                Verified vs. pending, by value
              </p>
              <DonutChart
                verifiedAmount={summary.disbursementStatus.verifiedAmount}
                pendingAmount={summary.disbursementStatus.pendingAmount}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
