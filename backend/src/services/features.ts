import type { PoolClient } from 'pg';
import type { FeatureVector } from '../types';

/**
 * Builds the 6-value feature vector Parth's Isolation Forest expects.
 * `days_since_donation` uses the OLDEST donation drawn on by this
 * disbursement's allocation (allocation rows are inserted oldest-first by
 * the FIFO algorithm, so the first row is that oldest donation) — that's the
 * donation that's been "waiting" longest, which is the more suspicious
 * direction (money sitting unspent, or spent very fast after arriving).
 */
export async function buildFeatureVector(
  client: PoolClient,
  ngoId: string,
  amount: number,
  disbursementCreatedAt: Date,
  firstAllocatedDonationId: string | null
): Promise<FeatureVector> {
  let daysSinceDonation = 0;
  if (firstAllocatedDonationId) {
    const donationRes = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM donations WHERE id = $1`,
      [firstAllocatedDonationId]
    );
    const donationCreatedAt = donationRes.rows[0]?.created_at;
    if (donationCreatedAt) {
      daysSinceDonation =
        (disbursementCreatedAt.getTime() - new Date(donationCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
    }
  }

  // Rolling average verification time for this NGO: hours between a disbursement
  // being created and its bill being uploaded, over past disbursements that have one.
  const avgRes = await client.query<{ avg_hours: string | null }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (b.uploaded_at - d.created_at)) / 3600.0) AS avg_hours
     FROM disbursements d
     JOIN bills b ON b.disbursement_id = d.id
     WHERE d.ngo_id = $1`,
    [ngoId]
  );
  const ngoAvgVerificationTime = avgRes.rows[0]?.avg_hours ? Number(avgRes.rows[0].avg_hours) : 0;

  const pendingRes = await client.query<{ total: string; pending: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status IN ('pending_bill', 'pending_review')) AS pending
     FROM disbursements WHERE ngo_id = $1`,
    [ngoId]
  );
  const total = Number(pendingRes.rows[0]?.total ?? 0);
  const pending = Number(pendingRes.rows[0]?.pending ?? 0);
  const ngoPendingRatio = total > 0 ? pending / total : 0;

  return {
    amount,
    days_since_donation: Math.round(daysSinceDonation * 100) / 100,
    ngo_avg_verification_time: Math.round(ngoAvgVerificationTime * 100) / 100,
    ngo_pending_ratio: Math.round(ngoPendingRatio * 100) / 100,
    is_round_number: amount % 1000 === 0,
    hour_of_day: disbursementCreatedAt.getHours(),
  };
}
