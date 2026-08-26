import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState, FormEvent } from 'react';
import { useAuth, ApiError } from '../context/AuthContext';
import { api } from '../lib/api';
import { homeForRole } from '../lib/roleHome';
import type { Ngo, Role } from '../types';
import styles from '../styles/Auth.module.css';
import ui from '../styles/ui.module.css';

const ROLES: { value: Role; label: string }[] = [
  { value: 'donor', label: 'Donor' },
  { value: 'ngo_admin', label: 'NGO Admin' },
  { value: 'vendor', label: 'Vendor / Recipient' },
  { value: 'platform_admin', label: 'Platform Admin' },
];

export default function RegisterPage() {
  const { register, loading, user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('donor');
  const [ngoId, setNgoId] = useState('');
  const [ngos, setNgos] = useState<Ngo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const needsNgo = role === 'ngo_admin' || role === 'vendor';

  useEffect(() => {
    if (!needsNgo) return;
    api
      .get<{ ngo: Ngo; trustScore: number }[]>('/api/public/ngos')
      .then((rows) => setNgos(rows.map((r) => r.ngo)))
      .catch(() => setNgos([]));
  }, [needsNgo]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsNgo && !ngoId) {
      setError('Choose which NGO this account belongs to');
      return;
    }
    try {
      await register({ name, email, password, role, ngoId: needsNgo ? ngoId : undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to register');
    }
  }

  if (user) {
    router.replace(homeForRole(user.role));
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.tabs}>
          <Link href="/login" className={styles.tab}>
            Log in
          </Link>
          <span className={styles.tabActive}>Register</span>
        </div>

        <div className={ui.card}>
          <h1>Create an account</h1>
          <form onSubmit={handleSubmit}>
          {error && (
            <div className={ui.field}>
              <div className={ui.error}>{error}</div>
            </div>
          )}
          <div className={ui.field}>
            <label className={ui.label} htmlFor="name">
              Full name
            </label>
            <input id="name" className={ui.input} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={ui.input}
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
              type="password"
              className={ui.input}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="role">
              Role
            </label>
            <select
              id="role"
              className={ui.select}
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setNgoId('');
              }}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {needsNgo && (
            <div className={ui.field}>
              <label className={ui.label} htmlFor="ngo">
                NGO
              </label>
              <select id="ngo" className={ui.select} required value={ngoId} onChange={(e) => setNgoId(e.target.value)}>
                <option value="" disabled>
                  Select an NGO…
                </option>
                {ngos.map((ngo) => (
                  <option key={ngo.id} value={ngo.id}>
                    {ngo.name}
                  </option>
                ))}
              </select>
              <span className={ui.helpText}>
                {role === 'ngo_admin' ? 'Which NGO does this admin account manage?' : 'Which NGO assigns work to this vendor?'}
              </span>
            </div>
          )}
          <button type="submit" className={ui.button} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}
