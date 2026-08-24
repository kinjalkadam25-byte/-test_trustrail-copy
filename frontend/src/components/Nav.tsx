import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { HeartHandshake, Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import styles from './Layout.module.css';

const ROLE_LINKS: Record<string, { href: string; label: string }[]> = {
  donor: [
    { href: '/donor/donate', label: 'Donate' },
    { href: '/donor/lookup', label: 'My donations' },
  ],
  ngo_admin: [
    { href: '/ngo/dashboard', label: 'Dashboard' },
    { href: '/ngo/disbursements', label: 'Disbursements' },
  ],
  vendor: [{ href: '/vendor/tasks', label: 'My tasks' }],
  platform_admin: [
    { href: '/admin/flags', label: 'Flag queue' },
    { href: '/admin/ledger', label: 'Ledger integrity' },
  ],
};

export default function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('trusttrail-theme');
    const dark = saved === 'dark';
    setIsDark(dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    window.localStorage.setItem('trusttrail-theme', next ? 'dark' : 'light');
  }

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const roleLinks = user ? ROLE_LINKS[user.role] ?? [] : [];

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon}>
            <HeartHandshake size={18} />
          </span>
          <span className={styles.brandMark}>TrustTrail</span>
        </Link>

        <nav className={styles.nav}>
          {roleLinks.map((link) => (
            <Link key={link.href} href={link.href} className={styles.navLink}>
              {link.label}
            </Link>
          ))}
          <Link href="/verify" className={styles.navLink}>
            Verify a code
          </Link>
          <Link href="/public" className={styles.navLink}>
            Public Ledger
          </Link>

          <button
            type="button"
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {user ? (
            <button type="button" className={styles.iconLogout} onClick={handleLogout} aria-label="Log out">
              <LogOut size={16} />
            </button>
          ) : (
            <>
              <Link href="/login" className={styles.navLink}>
                Log in
              </Link>
              <Link href="/register" className={styles.ctaLink}>
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}