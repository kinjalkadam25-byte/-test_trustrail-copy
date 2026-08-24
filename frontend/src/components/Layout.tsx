import { ReactNode } from 'react';
import Link from 'next/link';
import { HeartHandshake, ShieldCheck } from 'lucide-react';
import Nav from './Nav';
import styles from './Layout.module.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <Nav />
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrandCol}>
            <div className={styles.footerBrand}>
              <HeartHandshake size={16} />
              TrustTrail
            </div>
            <p className={styles.footerText}>
              A donation traceability and verification ledger for NGO fund transparency.
            </p>
          </div>

          <div className={styles.footerCol}>
            <p className={styles.footerHeading}>Quick links</p>
            <Link href="/verify" className={styles.footerLink}>Verify a code</Link>
            <Link href="/public" className={styles.footerLink}>Public Ledger</Link>
            <Link href="/login" className={styles.footerLink}>Log in</Link>
          </div>

          <div className={styles.footerCol}>
            <p className={styles.footerHeading}>About</p>
            <p className={styles.footerLink} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={14} />
              Hash-chained ledger
            </p>
            <p className={styles.footerText}>Built by Team Diet Code · Smart India Hackathon</p>
          </div>
        </div>

        <div className={styles.footerBottom}>© 2026 TrustTrail. All rights reserved.</div>
      </footer>
    </div>
  );
}