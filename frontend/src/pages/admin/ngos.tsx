import { useEffect, useState, FormEvent } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth, ApiError } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { Ngo, NgoScoreRow } from '../../types';
import ui from '../../styles/ui.module.css';

function ManageNgos() {
  const { token } = useAuth();
  const [ngos, setNgos] = useState<Ngo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function load() {
    try {
      const rows = await api.get<NgoScoreRow[]>('/api/public/ngos');
      setNgos(rows.map((r) => r.ngo));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load NGOs');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccess(false);
    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }

    setSubmitting(true);
    try {
      const { ngo } = await api.post<{ ngo: Ngo }>(
        '/api/admin/ngos',
        {
          name: name.trim(),
          registrationNumber: registrationNumber.trim() || undefined,
          description: description.trim() || undefined,
        },
        token
      );
      setNgos((prev) => [...prev, ngo].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setRegistrationNumber('');
      setDescription('');
      setSuccess(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to add NGO');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Platform Admin</div>
        <h1>NGOs</h1>
        <p className={ui.helpText}>
          Add a new NGO so donors can start donating to it, and NGO admins / vendors can register against it.
        </p>
      </div>

      <div className={ui.card} style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Add NGO</h3>
        <form onSubmit={handleSubmit}>
          {formError && (
            <div className={ui.field}>
              <div className={ui.error}>{formError}</div>
            </div>
          )}
          {success && (
            <div className={ui.field}>
              <div className={ui.success}>NGO added.</div>
            </div>
          )}
          <div className={ui.field}>
            <label className={ui.label} htmlFor="ngo-name">
              Name
            </label>
            <input id="ngo-name" className={ui.input} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="ngo-reg">
              Registration number
            </label>
            <input
              id="ngo-reg"
              className={ui.input}
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder="e.g. CSR-REG-10234"
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="ngo-desc">
              Description
            </label>
            <textarea
              id="ngo-desc"
              className={ui.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button type="submit" className={ui.button} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add NGO'}
          </button>
        </form>
      </div>

      <div className={ui.card}>
        <h3 style={{ marginBottom: '0.2rem' }}>Registered NGOs</h3>
        <p className={ui.helpText} style={{ marginBottom: '1rem' }}>
          {ngos.length} total
        </p>

        {loadError && <div className={ui.error}>{loadError}</div>}

        {!loadError && ngos.length === 0 && <div className={ui.emptyState}>No NGOs yet.</div>}

        {ngos.length > 0 && (
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Registration #</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {ngos.map((ngo) => (
                <tr key={ngo.id}>
                  <td>{ngo.name}</td>
                  <td className={ui.mono}>{ngo.registrationNumber ?? '—'}</td>
                  <td>{ngo.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AdminNgosPage() {
  return (
    <ProtectedRoute allow={['platform_admin']}>
      <ManageNgos />
    </ProtectedRoute>
  );
}
