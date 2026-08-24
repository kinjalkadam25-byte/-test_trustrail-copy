import Link from 'next/link';
import { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';
import styles from './ProtectedRoute.module.css';

/**
 * Client-side route gating for UX only — every route it guards is also
 * enforced by requireRole() on the backend, which is the real security
 * boundary (see Technical Architecture §3).
 */
export default function ProtectedRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className={styles.notice}>
        <h2>Log in to continue</h2>
        <p>This page needs an account. Since sessions aren&apos;t persisted across refreshes, you&apos;ll need to log in again after reloading the page.</p>
        <Link href="/login">Go to log in</Link>
      </div>
    );
  }

  if (!allow.includes(user.role)) {
    return (
      <div className={styles.notice}>
        <h2>Not available for your role</h2>
        <p>
          You&apos;re signed in as <strong>{user.role}</strong>, and this page is for {allow.join(' / ')} accounts.
        </p>
        <Link href="/">Back to home</Link>
      </div>
    );
  }

  return <>{children}</>;
}
