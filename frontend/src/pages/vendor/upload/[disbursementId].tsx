import { useRouter } from 'next/router';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useAuth, ApiError } from '../../../context/AuthContext';
import { api } from '../../../lib/api';
import ui from '../../../styles/ui.module.css';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix — backend wants raw base64
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

function UploadForm() {
  const router = useRouter();
  const { token } = useAuth();
  const disbursementId = typeof router.query.disbursementId === 'string' ? router.query.disbursementId : '';

  const [file, setFile] = useState<File | null>(null);
  const [amountClaimed, setAmountClaimed] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Choose a receipt image or PDF to upload');
      return;
    }
    setSubmitting(true);
    try {
      const fileBase64 = await fileToBase64(file);
      await api.post(
        '/api/bills',
        { disbursementId, fileBase64, mimeType: file.type || 'application/octet-stream', amountClaimed: Number(amountClaimed) },
        token
      );
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload bill');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={ui.card} style={{ maxWidth: 480 }}>
        <div className={ui.success}>Bill uploaded. This disbursement is now awaiting NGO/donor review.</div>
        <Link href="/vendor/tasks" className={ui.button} style={{ marginTop: '1rem', display: 'inline-flex' }}>
          Back to my tasks
        </Link>
      </div>
    );
  }

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Vendor</div>
        <h1>Upload bill</h1>
        <p className={ui.helpText}>
          For disbursement <span className={ui.mono}>{disbursementId.slice(0, 8)}…</span>
        </p>
      </div>

      <div className={ui.card} style={{ maxWidth: 480 }}>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className={ui.field}>
              <div className={ui.error}>{error}</div>
            </div>
          )}
          <div className={ui.field}>
            <label className={ui.label} htmlFor="file">
              Receipt / bill (image or PDF)
            </label>
            <input
              id="file"
              type="file"
              accept="image/*,application/pdf"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="amountClaimed">
              Amount on the bill (₹)
            </label>
            <input
              id="amountClaimed"
              type="number"
              min={0}
              step="0.01"
              required
              className={ui.input}
              value={amountClaimed}
              onChange={(e) => setAmountClaimed(e.target.value)}
            />
            <span className={ui.helpText}>If this doesn&apos;t match the disbursement amount, it&apos;s flagged clearly — never hidden.</span>
          </div>
          <button type="submit" className={ui.button} disabled={submitting || !disbursementId}>
            {submitting ? 'Uploading…' : 'Upload bill'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function VendorUploadPage() {
  return (
    <ProtectedRoute allow={['vendor']}>
      <UploadForm />
    </ProtectedRoute>
  );
}
