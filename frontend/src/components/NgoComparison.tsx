import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import type { NgoScoreRow } from '../types';
import styles from './NgoComparison.module.css';

type Tier = 'verified' | 'pending' | 'flagged';

function tierFor(score: number): Tier {
  if (score >= 75) return 'verified';
  if (score >= 45) return 'pending';
  return 'flagged';
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function strengthsFor(row: NgoScoreRow): string[] {
  if (row.totalDisbursements === 0) return [];
  const out: string[] = [];
  if (row.verifiedPct >= 80) out.push(`${row.verifiedPct}% of disbursements verified with vendor bills`);
  if (row.confirmedIssues === 0) out.push('No confirmed anomalies on the ledger');
  if (row.avgVerificationTime !== null && row.avgVerificationTime <= 48) {
    out.push(`Fast to document — bills uploaded in ${row.avgVerificationTime}h on average`);
  }
  if (row.trustScore >= 90) out.push('Top-tier trust score');
  return out;
}

function concernsFor(row: NgoScoreRow): string[] {
  if (row.totalDisbursements === 0) return ['No disbursement history yet — nothing to verify'];
  const out: string[] = [];
  if (row.verifiedPct < 50) out.push(`Only ${row.verifiedPct}% of disbursements verified with proof`);
  if (row.confirmedIssues > 0) {
    out.push(`${row.confirmedIssues} confirmed ${pluralize(row.confirmedIssues, 'anomaly', 'anomalies')} on the ledger`);
  }
  if (row.avgVerificationTime !== null && row.avgVerificationTime > 72) {
    out.push(`Slow to document — ${row.avgVerificationTime}h average to bill upload`);
  }
  return out;
}

export default function NgoComparison({ rows }: { rows: NgoScoreRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className={styles.emptyState}>No NGOs to compare yet.</p>;
  }

  const sorted = [...rows].sort((a, b) => b.trustScore - a.trustScore);
  const selected = sorted.find((r) => r.ngo.id === selectedId) ?? sorted[0];
  const strengths = strengthsFor(selected);
  const concerns = concernsFor(selected);
  const selectedTier = tierFor(selected.trustScore);

  return (
    <div className={styles.layout}>
      <div className={styles.chart}>
        {sorted.map((row) => {
          const tier = tierFor(row.trustScore);
          const isSelected = row.ngo.id === selected.ngo.id;
          return (
            <button
              key={row.ngo.id}
              type="button"
              className={`${styles.barRow} ${isSelected ? styles.barRowSelected : ''}`}
              aria-pressed={isSelected}
              onClick={() => setSelectedId(row.ngo.id)}
            >
              <span className={styles.barName}>{row.ngo.name}</span>
              <span className={styles.track}>
                <span
                  className={`${styles.fill} ${styles[tier]}`}
                  style={{ width: `${Math.max(row.trustScore, 2)}%` }}
                />
              </span>
              <span className={styles.barScore}>{row.trustScore}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <h3>{selected.ngo.name}</h3>
          <span className={`${styles.tierChip} ${styles[selectedTier]}`}>Trust score {selected.trustScore}</span>
        </div>

        <div className={styles.columns}>
          <div>
            <div className={styles.columnHead}>
              <Check size={14} className={styles.strengthIcon} />
              Strengths
            </div>
            <ul className={styles.list}>
              {strengths.length > 0 ? (
                strengths.map((s, i) => <li key={i}>{s}</li>)
              ) : (
                <li className={styles.emptyItem}>No standout strengths yet.</li>
              )}
            </ul>
          </div>

          <div>
            <div className={styles.columnHead}>
              <AlertTriangle size={14} className={styles.concernIcon} />
              Concerns
            </div>
            <ul className={styles.list}>
              {concerns.length > 0 ? (
                concerns.map((c, i) => <li key={i}>{c}</li>)
              ) : (
                <li className={styles.emptyItem}>No concerns flagged.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
