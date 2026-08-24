import type { PoolClient } from 'pg';

export interface AllocationRow {
  id: string;
  donation_id: string;
  disbursement_id: string;
  amount_allocated: string;
}

export interface AllocationResult {
  allocations: AllocationRow[];
  underfunded: boolean;
  shortfall: number;
}

/**
 * FIFO allocation: draws from the NGO's unallocated donations oldest-first,
 * splitting across as many donations as needed to cover the disbursement.
 *
 * Worked example (₹50,000 disbursement, donations A=20k oldest / B=15k / C=25k newest):
 *   take 20000 from A (A -> 0), take 15000 from B (B -> 0), take 15000 from C (C -> 10000 remaining)
 *   -> 3 allocation rows, ₹0 shortfall.
 *
 * `SELECT ... FOR UPDATE` row-locks the candidate donations for the duration
 * of the transaction, so two disbursements logged at the same instant can't
 * both read the same `remaining_amount` and double-spend a donation.
 */
export async function allocateDisbursement(
  client: PoolClient,
  disbursementId: string,
  ngoId: string,
  amount: number
): Promise<AllocationResult> {
  const donationsRes = await client.query<{ id: string; remaining_amount: string }>(
    `SELECT id, remaining_amount FROM donations
     WHERE ngo_id = $1 AND remaining_amount > 0
     ORDER BY created_at ASC
     FOR UPDATE`,
    [ngoId]
  );

  let remaining = amount;
  const allocations: AllocationRow[] = [];

  for (const donation of donationsRes.rows) {
    if (remaining <= 0) break;
    const available = Number(donation.remaining_amount);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);

    await client.query(`UPDATE donations SET remaining_amount = remaining_amount - $1 WHERE id = $2`, [
      take,
      donation.id,
    ]);

    const inserted = await client.query<AllocationRow>(
      `INSERT INTO allocations (donation_id, disbursement_id, amount_allocated)
       VALUES ($1, $2, $3) RETURNING *`,
      [donation.id, disbursementId, take]
    );
    allocations.push(inserted.rows[0]);

    remaining -= take;
  }

  return {
    allocations,
    underfunded: remaining > 0,
    shortfall: Math.round(remaining * 100) / 100,
  };
}
