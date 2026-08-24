import { useRouter } from 'next/router';
import { useState, FormEvent } from 'react';
import ui from '../../styles/ui.module.css';

export default function VerifyIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) router.push(`/verify/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <div className={ui.eyebrow}>Public — no account needed</div>
        <h1>Verify a disbursement</h1>
        <p className={ui.helpText}>Enter a Verification Code to see the bill it&apos;s backed by.</p>
      </div>

      <div className={ui.card} style={{ maxWidth: 480 }}>
        <form onSubmit={handleSubmit} className={ui.row} style={{ alignItems: 'flex-end' }}>
          <div className={ui.field} style={{ flex: 1, marginBottom: 0 }}>
            <label className={ui.label} htmlFor="code">
              Verification code
            </label>
            <input
              id="code"
              className={`${ui.input} ${ui.mono}`}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="E.G. F00DCAFE"
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <button type="submit" className={ui.button}>
            Verify
          </button>
        </form>
      </div>
    </div>
  );
}
