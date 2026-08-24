import { Router } from 'express';
import { withTransaction } from '../db/pool';
import { withUniqueCode } from '../utils/codes';
import { appendLedgerEntry } from '../utils/ledger';
import { authMiddleware, requireRole } from '../middleware/auth';
import { allocateDisbursement } from '../services/allocation';
import { buildFeatureVector } from '../services/features';
import { getAnomalyFlag } from '../utils/mlClient';

const router = Router();

// POST /api/disbursements — ngo_admin — {amount, purpose, category, vendorId?}
// -> {disbursement, allocations, underfunded}
router.post('/', authMiddleware, requireRole('ngo_admin'), async (req, res) => {
  const { amount, purpose, category, vendorId } = req.body ?? {};
  const numericAmount = Number(amount);
  const ngoId = req.user!.ngoId;

  if (!ngoId) return res.status(400).json({ error: 'This account is not linked to an NGO' });
  if (!numericAmount || numericAmount <= 0) return res.status(400).json({ error: 'A positive amount is required' });
  if (!purpose) return res.status(400).json({ error: 'purpose is required' });

  try {
    const result = await withTransaction(async (client) => {
      const inserted = await withUniqueCode((code) =>
        client.query(
          `INSERT INTO disbursements (ngo_id, vendor_id, amount, purpose, category, verification_code)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [ngoId, vendorId ?? null, numericAmount, purpose, category ?? null, code]
        )
      );
      const disbursement = inserted.rows[0];

      const { allocations, underfunded, shortfall } = await allocateDisbursement(
        client,
        disbursement.id,
        ngoId,
        numericAmount
      );

      if (underfunded) {
        await client.query(`UPDATE disbursements SET underfunded = true WHERE id = $1`, [disbursement.id]);
        // Surface it in the same admin flag queue the ML anomaly flags use, per
        // "flagForAdminReview" in the Technical Architecture doc — the disbursement
        // is still created, but a platform admin needs to resolve the gap.
        await client.query(
          `INSERT INTO anomaly_flags (disbursement_id, score, is_anomalous, reason, review_status)
           VALUES ($1, 1, true, $2, 'unreviewed')`,
          [
            disbursement.id,
            `Underfunded disbursement: only ₹${(numericAmount - shortfall).toFixed(2)} of ₹${numericAmount.toFixed(
              2
            )} was covered by available donations (₹${shortfall.toFixed(2)} shortfall).`,
          ]
        );
      }

      for (const allocation of allocations) {
        await appendLedgerEntry(client, 'allocation', allocation.id, {
          donationId: allocation.donation_id,
          disbursementId: allocation.disbursement_id,
          amountAllocated: Number(allocation.amount_allocated),
        });
      }

      await appendLedgerEntry(client, 'disbursement', disbursement.id, {
        ngoId,
        vendorId: vendorId ?? null,
        amount: numericAmount,
        purpose,
        category: category ?? null,
        underfunded,
      });

      // Anomaly scoring (optional — no-ops cleanly if ML_SERVICE_URL isn't set)
      const firstDonationId = allocations[0]?.donation_id ?? null;
      const features = await buildFeatureVector(
        client,
        ngoId,
        numericAmount,
        new Date(disbursement.created_at),
        firstDonationId
      );
      const anomaly = await getAnomalyFlag(features);
      if (anomaly?.isAnomalous) {
        await client.query(
          `INSERT INTO anomaly_flags (disbursement_id, score, is_anomalous, reason, review_status)
           VALUES ($1, $2, $3, $4, 'unreviewed')`,
          [disbursement.id, anomaly.score, anomaly.isAnomalous, anomaly.reason]
        );
      }

      return { disbursement: { ...disbursement, underfunded }, allocations, underfunded };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('create disbursement error:', err);
    res.status(500).json({ error: 'Failed to create disbursement' });
  }
});

export default router;
