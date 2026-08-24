import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, FormEvent } from 'react';
import { useAuth, ApiError } from '../context/AuthContext';
import { homeForRole } from '../lib/roleHome';
import styles from '../styles/Auth.module.css';
import ui from '../styles/ui.module.css';

export default function LoginPage() {
  const { login, loading, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to log in');
    }
  }

  if (user) {
    router.replace(homeForRole(user.role));
    return null;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        <span className={styles.tabActive}>Log in</span>
        <Link href="/register" className={styles.tab}>
          Register
        </Link>
      </div>

      <div className={ui.card}>
        <h1>Welcome back</h1>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className={ui.field}>
              <div className={ui.error}>{error}</div>
            </div>
          )}
          <div className={ui.field}>
            <label className={ui.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={ui.input}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className={ui.input}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className={ui.button} disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}
