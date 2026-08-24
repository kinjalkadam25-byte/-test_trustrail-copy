import { useState } from 'react';
import styles from './CodeBadge.module.css';

export default function CodeBadge({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — fail quietly, code is still visible to copy by hand.
    }
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{label}</span>
      <span className={styles.stamp}>
        <span className={styles.code}>{code}</span>
        <button type="button" className={styles.copyBtn} onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </span>
    </div>
  );
}
