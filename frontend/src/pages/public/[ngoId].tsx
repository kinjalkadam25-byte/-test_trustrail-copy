import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { TrustScore } from '../../types';
import ui from '../../styles/ui.module.css';

const POLL_MS = 5000; // matches the backend's 5s Redis cache TTL

export default function PublicNgoPage() {
  const router = useRouter();
  const ngoId = typeof router.query.ngoId === 'string' ? router.query.ngoId : '';

  const [data, setData] = useState<TrustScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ngoId) return;
    let cancelled = false;

    function poll() {
      api
        .get<TrustScore>(`/api/public/ngo/${ngoId}/trust-score`)
        .then((res) => {
          if (!cancelled) {
            setData(res);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load trust score');
        });
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ngoId]);

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <Link href="/public" className={ui.helpText}>
          ← All NGOs
        </Link>
        <h1>NGO transparency dashboard</h1>
        <p className={ui.helpText}>Refreshes every 5 seconds — served from Redis when the cache is warm.</p>
      </div>

      {error && <div className={ui.error}>{error}</div>}

      {data && (
        <div className={ui.stack}>
          <div className={ui.statGrid}>
            <div className={ui.statCard}>
              <div className={ui.statValue}>{data.trustScore}</div>
              <div className={ui.statLabel}>Trust score</div>
            </div>
            <div className={ui.statCard}>
              <div className={ui.statValue}>{data.verifiedPct}%</div>
              <div className={ui.statLabel}>Disbursements verified</div>
            </div>
            <div className={ui.statCard}>
              <div className={ui.statValue}>{data.avgVerificationTime !== null ? `${data.avgVerificationTime}h` : '—'}</div>
              <div className={ui.statLabel}>Avg. time to bill upload</div>
            </div>
          </div>
          <p className={ui.helpText}>
            Last response was {data.cached ? 'served from the Redis cache' : 'freshly computed from the database'}.
          </p>
        </div>
      )}
    </div>
  );
}
