import crypto from 'crypto';
import type { PoolClient } from 'pg';

// e.g. "A1B2C3D4" — short enough to read aloud/type into the lookup form,
// long enough that random collisions are effectively impossible.
export function generateCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Generates a code and inserts it via `insertFn`, retrying with a fresh code
 * if the unique constraint rejects it. At hackathon-demo data volumes this
 * will essentially never retry more than once, but the loop costs nothing.
 */
export async function withUniqueCode<T>(
  insertFn: (code: string) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateCode();
    try {
      return await insertFn(code);
    } catch (err: any) {
      lastErr = err;
      if (err?.code !== PG_UNIQUE_VIOLATION) throw err;
      // else: code collision, loop and try a new one
    }
  }
  throw lastErr;
}

export type { PoolClient };
