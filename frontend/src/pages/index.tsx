import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import styles from './Home.module.css';
import ui from '../styles/ui.module.css';

const STEPS = [
  { title: 'Donate', body: 'A donor gives to an NGO and receives a unique Donation Code.' },
  { title: 'Allocate', body: 'When the NGO logs a disbursement, FIFO auto-matches it to the oldest donations that fund it — splitting across several if needed.' },
  { title: 'Disburse & bill', body: 'The disbursement gets its own Verification Code. The recipient vendor uploads a bill against it.' },
  { title: 'Verify', body: 'Anyone with the code can see exactly what the money paid for — and every write is hash-chained so edits are detectable.' },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div>
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>Donation traceability &amp; verification ledger</div>
        <h1 className={styles.heroTitle}>Every rupee, traceable from donor to receipt.</h1>
        <p className={styles.heroSub}>
          TrustTrail auto-generates the utilization certificate trail CSR Rule 4(5) requires — turning a manual
          paperwork process into a code you can look up in seconds.
        </p>
        <div className={styles.heroActions}>
          {!user && (
            <Link href="/register" className={ui.button}>
              Create an account
            </Link>
          )}
          {user && (
            <>
              <Link href="/public" className={ui.button}>
                View public ledger
              </Link>
              <Link href="/verify" className={ui.buttonSecondary}>
                Verify a code
              </Link>
            </>
          )}
        </div>
      </section>

      <div className={styles.steps}>
        {STEPS.map((step, i) => (
          <div className={styles.step} key={step.title}>
            <div className={styles.stepNum}>{String(i + 1).padStart(2, '0')}</div>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepBody}>{step.body}</p>
          </div>
        ))}
      </div>

      {!user && (
        <>
          <h2>Four roles, one ledger</h2>
          <div className={styles.roleGrid}>
            <div className={styles.roleCard}>
              <div className={styles.roleCardTitle}>Donor</div>
              <div className={styles.roleCardBody}>Give to an NGO and trace exactly where your donation went.</div>
            </div>
            <div className={styles.roleCard}>
              <div className={styles.roleCardTitle}>NGO Admin</div>
              <div className={styles.roleCardBody}>Log disbursements; FIFO allocation and bill tracking happen automatically.</div>
            </div>
            <div className={styles.roleCard}>
              <div className={styles.roleCardTitle}>Vendor / Recipient</div>
              <div className={styles.roleCardBody}>Upload a bill against an assigned disbursement.</div>
            </div>
            <div className={styles.roleCard}>
              <div className={styles.roleCardTitle}>Platform Admin</div>
              <div className={styles.roleCardBody}>Review flagged disbursements and check ledger integrity.</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}