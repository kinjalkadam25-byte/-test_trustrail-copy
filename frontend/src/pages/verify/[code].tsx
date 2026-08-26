import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import StatusPill from '../../components/StatusPill';
import { ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { VerifyResponse } from '../../types';
import ui from '../../styles/ui.module.css';

export default function VerifyCodePage() {
  const router = useRouter();
  const code = typeof router.query.code === 'string' ? router.query.code : '';

  const [data, setData] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    setError(null);
    api
      .get<VerifyResponse>(`/api/verify/${encodeURIComponent(code)}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to verify code'))
      .finally(() => setLoading(false));
  }, [code]);

  // The OCR receipt check runs in the background after upload (see
  // backend/src/routes/bills.ts's waitUntil call), so a bill uploaded just
  // moments ago can briefly have `ocr: null` -- poll a few times rather than
  // making the visitor manually refresh to see it show up. `pollAttempts` is
  // a ref (not state) so each tick doesn't retrigger this effect and reset
  // the counter -- only `needsPoll` flipping false actually stops it.
  const needsPoll = Boolean(code) && Boolean(data?.bill) && !data?.ocr;
  const pollAttempts = useRef(0);

  useEffect(() => {
    if (!needsPoll) {
      pollAttempts.current = 0;
      return;
    }
    const interval = setInterval(() => {
      pollAttempts.current += 1;
      api
        .get<VerifyResponse>(`/api/verify/${encodeURIComponent(code)}`)
        .then(setData)
        .catch(() => {
          /* ignore -- next tick (or the attempt cap below) will stop it */
        })
        .finally(() => {
          if (pollAttempts.current >= 5) clearInterval(interval);
        });
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPoll, code]);

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Public — no account needed</div>
        <h1>
          Verifying <span className={ui.mono}>{code}</span>
        </h1>
        <Link href="/verify" className={ui.helpText}>
          ← Check a different code
        </Link>
      </div>

      {loading && <p>Looking this up…</p>}
      {error && <div className={ui.error}>{error}</div>}

      {data && (
        <div className={ui.stack}>
          <div className={ui.card}>
            <div className={ui.row} style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ marginBottom: '0.2rem' }}>{data.disbursement.purpose}</h2>
                <p className={ui.helpText} style={{ margin: 0 }}>
                  {data.disbursement.ngoName} · {data.disbursement.category || 'Uncategorized'}
                </p>
              </div>
              <StatusPill status={data.disbursement.status} />
            </div>
            <div className={ui.statGrid} style={{ marginTop: '1.25rem' }}>
              <div className={ui.statCard}>
                <div className={ui.statValue}>₹{Number(data.disbursement.amount).toLocaleString('en-IN')}</div>
                <div className={ui.statLabel}>Disbursed amount</div>
              </div>
              {data.bill && (
                <div className={ui.statCard}>
                  <div className={ui.statValue}>₹{Number(data.bill.amountClaimed).toLocaleString('en-IN')}</div>
                  <div className={ui.statLabel}>Amount on the bill</div>
                </div>
              )}
            </div>
            {data.disbursement.underfunded && (
              <div className={ui.warning} style={{ marginTop: '1rem' }}>
                This disbursement was underfunded at the time it was logged — it drew on more than the NGO had
                available in unallocated donations.
              </div>
            )}
          </div>

          {data.amountMatch === false && (
            <div className={ui.error}>
              The bill amount does not match the disbursed amount. This is never hidden — flagged here for anyone
              checking this code.
            </div>
          )}
          {data.amountMatch === true && <div className={ui.success}>The bill amount matches the disbursed amount.</div>}

          {data.bill && (
            <div className={ui.card}>
              <h3>Automated receipt check (OCR)</h3>
              <p className={ui.helpText} style={{ marginTop: '-0.4rem', marginBottom: '1rem' }}>
                Reads the actual uploaded receipt image and cross-checks it against the amount the vendor entered —
                independent of the self-reported match above.
              </p>
              {!data.ocr ? (
                <div className={ui.helpText}>Checking the receipt image… this can take a few seconds.</div>
              ) : data.ocr.confidence === 'none' ? (
                <div className={ui.warning}>The uploaded file doesn&apos;t look like a receipt/bill.</div>
              ) : (
                <>
                  {data.ocr.amountMismatch === true && (
                    <div className={ui.error} style={{ marginBottom: '1rem' }}>
                      The amount read off the receipt image doesn&apos;t match what the vendor entered.
                    </div>
                  )}
                  {data.ocr.amountMismatch === false && (
                    <div className={ui.success} style={{ marginBottom: '1rem' }}>
                      The amount read off the receipt image matches what the vendor entered.
                    </div>
                  )}
                  <div className={ui.statGrid}>
                    <div className={ui.statCard}>
                      <div className={ui.statValue}>
                        {data.ocr.extractedAmount != null
                          ? `₹${Number(data.ocr.extractedAmount).toLocaleString('en-IN')}`
                          : '—'}
                      </div>
                      <div className={ui.statLabel}>Amount read from receipt</div>
                    </div>
                    <div className={ui.statCard}>
                      <div className={ui.statValue}>{data.ocr.vendorName || '—'}</div>
                      <div className={ui.statLabel}>Vendor name on receipt</div>
                    </div>
                    <div className={ui.statCard}>
                      <div className={ui.statValue}>
                        {data.ocr.date ? new Date(data.ocr.date).toLocaleDateString('en-IN') : '—'}
                      </div>
                      <div className={ui.statLabel}>Date on receipt</div>
                    </div>
                  </div>
                  {data.ocr.confidence === 'low' && (
                    <p className={ui.helpText} style={{ marginTop: '0.75rem' }}>
                      Low confidence — the receipt image was partially illegible.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className={ui.card}>
            <h3>Bill</h3>
            {!data.bill ? (
              <div className={ui.emptyState}>No bill has been uploaded for this disbursement yet.</div>
            ) : data.bill.mimeType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:${data.bill.mimeType};base64,${data.bill.fileBase64}`}
                alt="Uploaded bill"
                style={{ maxWidth: '100%', borderRadius: 4, border: '1px solid var(--border)' }}
              />
            ) : (
              <a
                className={ui.button}
                href={`data:${data.bill.mimeType};base64,${data.bill.fileBase64}`}
                download={`bill-${code}`}
              >
                Download bill file
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
