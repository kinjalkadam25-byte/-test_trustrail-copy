import styles from './StatusPill.module.css';

const STATUS_LABELS: Record<string, string> = {
  pending_bill: 'Awaiting bill',
  pending_review: 'Awaiting review',
  verified: 'Verified',
  under_review: 'Under review',
  unreviewed: 'Unreviewed',
  confirmed_ok: 'Confirmed OK',
  confirmed_issue: 'Confirmed issue',
};

const STATUS_TONE: Record<string, 'verified' | 'pending' | 'flagged' | 'neutral'> = {
  pending_bill: 'pending',
  pending_review: 'pending',
  verified: 'verified',
  under_review: 'flagged',
  unreviewed: 'pending',
  confirmed_ok: 'verified',
  confirmed_issue: 'flagged',
};

export default function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`${styles.pill} ${styles[tone]}`}>
      <span className={styles.dot} />
      {label}
    </span>
  );
}
