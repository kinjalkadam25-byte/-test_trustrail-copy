import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { HeartHandshake, ShieldCheck } from 'lucide-react';
import Nav from './Nav';
import { useAuth } from '../context/AuthContext';
import styles from './Layout.module.css';

// Login and registration are standalone entry points -- no site chrome around them.
const NO_CHROME_ROUTES = ['/login', '/register'];

export default function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();

  if (NO_CHROME_ROUTES.includes(router.pathname)) {
    return <div className={styles.shell}>{children}</div>;
  }

  // Mirrors Nav.tsx: the signed-out landing page has its own single focused
  // CTA, so these are redundant clutter there specifically, not on any other page.
  const isSignedOutHome = !user && router.pathname === '/';

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
            {/* Donors trace donations by donation code and never need this -- see Nav.tsx */}
            {user?.role !== 'donor' && !isSignedOutHome && (
              <Link href="/verify" className={styles.footerLink}>Verify a code</Link>
            )}
            {!isSignedOutHome && (
              <Link href="/public" className={styles.footerLink}>Public Ledger</Link>
            )}
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