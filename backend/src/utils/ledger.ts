import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import type { LedgerEntryType } from '../types';

const GENESIS = 'GENESIS';

/**
 * Postgres's JSONB type does not guarantee it will hand back object keys in
 * the same order they were inserted with. If we hashed with plain
 * `JSON.stringify(payload)`, a payload read back from the DB could hash
 * differently than the payload we originally wrote — which would make
 * verifyChain() report tampering that never happened. Canonicalizing
 * (recursively sorting object keys) before stringifying makes the hash
 * independent of key order, so it only ever changes when the *values* change.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) out[key] = canonicalize((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

function computeHash(payload: object, previousHash: string): string {
  const canonical = canonicalize({ ...payload, previousHash });
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export interface LedgerEntry {
  // node-postgres returns BIGINT/BIGSERIAL columns as strings by default
  // (a JS `number` can't safely hold the full int8 range), which the live
  // test run below confirmed — id really does come back as "1", not 1.
  id: string;
  entry_type: LedgerEntryType;
  reference_id: string;
  payload: Record<string, unknown>;
  previous_hash: string;
  hash: string;
  created_at: string;
}

/**
 * Appends one entry to the hash chain. Must be called with a `client` that is
 * part of the same transaction as the write it documents, and the SELECT of
 * the previous hash uses FOR UPDATE so two concurrent writes can't both read
 * the same "previous" tail and fork the chain.
 */
export async function appendLedgerEntry(
  client: PoolClient,
  entryType: LedgerEntryType,
  referenceId: string,
  payload: Record<string, unknown>
): Promise<LedgerEntry> {
  const prevRes = await client.query<{ hash: string }>(
    `SELECT hash FROM ledger_entries ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  const previousHash = prevRes.rows[0]?.hash ?? GENESIS;
  const hash = computeHash(payload, previousHash);

  const res = await client.query<LedgerEntry>(
    `INSERT INTO ledger_entries (entry_type, reference_id, payload, previous_hash, hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [entryType, referenceId, payload, previousHash, hash]
  );
  return res.rows[0];
}

export interface VerifyResult {
  valid: boolean;
  brokenAtEntryId?: string;
  reason?: string;
  entriesChecked: number;
}

/**
 * Walks the whole ledger in order, recomputing each entry's hash from its
 * stored payload and comparing it against what's stored, and separately
 * checking previous_hash linkage. This is what the live-demo "edit a row,
 * run verifyChain(), watch it fail" moment calls.
 */
export async function verifyChain(): Promise<VerifyResult> {
  const res = await pool.query<LedgerEntry>(`SELECT * FROM ledger_entries ORDER BY id ASC`);

  let expectedPreviousHash = GENESIS;
  for (const row of res.rows) {
    if (row.previous_hash !== expectedPreviousHash) {
      return {
        valid: false,
        brokenAtEntryId: row.id,
        reason: 'previous_hash does not match the hash of the prior entry',
        entriesChecked: res.rows.length,
      };
    }
    const recomputed = computeHash(row.payload, row.previous_hash);
    if (recomputed !== row.hash) {
      return {
        valid: false,
        brokenAtEntryId: row.id,
        reason: 'stored hash does not match a fresh hash of the stored payload — payload was edited after the fact',
        entriesChecked: res.rows.length,
      };
    }
    expectedPreviousHash = row.hash;
  }

  return { valid: true, entriesChecked: res.rows.length };
}
