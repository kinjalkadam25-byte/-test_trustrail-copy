import { waitUntil } from '@vercel/functions';
import { Router } from 'express';
import { withTransaction } from '../db/pool';
import { withUniqueCode } from '../utils/codes';
import { appendLedgerEntry } from '../utils/ledger';
import { authMiddleware, requireRole } from '../middleware/auth';
import { allocateDisbursement } from '../services/allocation';
import { buildFeatureVector } from '../services/features';
import { getAnomalyFlag } from '../utils/mlClient';
import { initiatePayout, simulatePayoutOutcome } from '../utils/payoutClient';
import { reconcileDisbursementStatus } from '../utils/verification';

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
    const { result, payoutPending } = await withTransaction(async (client) => {
      let vendorBankAccount: { id: string } | null = null;
      if (vendorId) {
        const vendorCheck = await client.query(
          `SELECT id FROM users WHERE id = $1 AND role = 'vendor' AND ngo_id = $2`,
          [vendorId, ngoId]
        );
        if (vendorCheck.rowCount === 0) {
          throw Object.assign(new Error('vendorId must be a vendor assigned to this NGO'), { httpStatus: 400 });
        }
        const bankAccountRes = await client.query(`SELECT id FROM vendor_bank_accounts WHERE vendor_id = $1`, [
          vendorId,
        ]);
        vendorBankAccount = bankAccountRes.rows[0] ?? null;
      }

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

      // Kick off the payout to the vendor's bank account (mocked -- see
      // utils/payoutClient.ts) right away if one's on file. This disbursement
      // can only ever reach 'verified' once this payout settles as 'success'
      // (see utils/verification.ts's reconcileDisbursementStatus) -- if no
      // bank account is on file yet, it simply stays unverifiable until one
      // is added and a payout is (re)triggered.
      let payoutPending = false;
      if (vendorBankAccount) {
        const { providerReferenceId } = await initiatePayout();
        await client.query(
          `INSERT INTO payouts (disbursement_id, vendor_bank_account_id, amount, status, provider_reference_id)
           VALUES ($1, $2, $3, 'processing', $4)`,
          [disbursement.id, vendorBankAccount.id, numericAmount, providerReferenceId]
        );
        await appendLedgerEntry(client, 'payout', disbursement.id, {
          disbursementId: disbursement.id,
          vendorId,
          amount: numericAmount,
          providerReferenceId,
          status: 'processing',
        });
        payoutPending = true;
      }

      return { result: { disbursement: { ...disbursement, underfunded }, allocations, underfunded }, payoutPending };
    });

    res.status(201).json(result);

    if (payoutPending) {
      waitUntil(
        (async () => {
          try {
            const outcome = await simulatePayoutOutcome();
            await withTransaction(async (client) => {
              await client.query(
                `UPDATE payouts SET status = $1, failure_reason = $2, completed_at = now() WHERE disbursement_id = $3`,
                [outcome.status, outcome.failureReason, result.disbursement.id]
              );
              await appendLedgerEntry(client, 'payout', result.disbursement.id, {
                disbursementId: result.disbursement.id,
                status: outcome.status,
                failureReason: outcome.failureReason,
              });
              await reconcileDisbursementStatus(client, result.disbursement.id);
            });
          } catch (err) {
            console.error('payout settlement background step failed:', err);
          }
        })()
      );
    }
  } catch (err: any) {
    if (err?.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    console.error('create disbursement error:', err);
    res.status(500).json({ error: 'Failed to create disbursement' });
  }
});

// POST /api/disbursements/:id/payout — ngo_admin — (re)trigger a payout for a
// disbursement whose vendor didn't have a bank account on file at creation
// time (or where the previous attempt failed). No-ops with 409 if a payout
// already exists and isn't 'failed' -- this never overwrites an in-flight or
// successful one.
router.post('/:id/payout', authMiddleware, requireRole('ngo_admin'), async (req, res) => {
  const ngoId = req.user!.ngoId;
  const disbursementId = req.params.id;

  try {
    const { disbursement, vendorBankAccount, previousPayout } = await withTransaction(async (client) => {
      const disbursementRes = await client.query(`SELECT * FROM disbursements WHERE id = $1 AND ngo_id = $2`, [
        disbursementId,
        ngoId,
      ]);
      const disbursement = disbursementRes.rows[0];
      if (!disbursement) throw Object.assign(new Error('Disbursement not found'), { httpStatus: 404 });
      if (!disbursement.vendor_id) {
        throw Object.assign(new Error('This disbursement has no vendor assigned'), { httpStatus: 400 });
      }

      const bankAccountRes = await client.query(`SELECT id FROM vendor_bank_accounts WHERE vendor_id = $1`, [
        disbursement.vendor_id,
      ]);
      const vendorBankAccount = bankAccountRes.rows[0];
      if (!vendorBankAccount) {
        throw Object.assign(new Error('This vendor has no bank account on file yet'), { httpStatus: 400 });
      }

      const previousPayoutRes = await client.query(`SELECT * FROM payouts WHERE disbursement_id = $1`, [
        disbursementId,
      ]);
      const previousPayout = previousPayoutRes.rows[0] ?? null;
      if (previousPayout && previousPayout.status !== 'failed') {
        throw Object.assign(new Error('A payout for this disbursement is already processing or has succeeded'), {
          httpStatus: 409,
        });
      }

      return { disbursement, vendorBankAccount, previousPayout };
    });

    const { providerReferenceId } = await initiatePayout();
    await withTransaction(async (client) => {
      if (previousPayout) {
        await client.query(
          `UPDATE payouts SET status = 'processing', provider_reference_id = $1, failure_reason = NULL, completed_at = NULL, initiated_at = now() WHERE disbursement_id = $2`,
          [providerReferenceId, disbursementId]
        );
      } else {
        await client.query(
          `INSERT INTO payouts (disbursement_id, vendor_bank_account_id, amount, status, provider_reference_id)
           VALUES ($1, $2, $3, 'processing', $4)`,
          [disbursementId, vendorBankAccount.id, Number(disbursement.amount), providerReferenceId]
        );
      }
      await appendLedgerEntry(client, 'payout', disbursementId, {
        disbursementId,
        vendorId: disbursement.vendor_id,
        amount: Number(disbursement.amount),
        providerReferenceId,
        status: 'processing',
        retry: Boolean(previousPayout),
      });
    });

    res.status(202).json({ status: 'processing' });

    waitUntil(
      (async () => {
        try {
          const outcome = await simulatePayoutOutcome();
          await withTransaction(async (client) => {
            await client.query(
              `UPDATE payouts SET status = $1, failure_reason = $2, completed_at = now() WHERE disbursement_id = $3`,
              [outcome.status, outcome.failureReason, disbursementId]
            );
            await appendLedgerEntry(client, 'payout', disbursementId, {
              disbursementId,
              status: outcome.status,
              failureReason: outcome.failureReason,
            });
            await reconcileDisbursementStatus(client, disbursementId);
          });
        } catch (err) {
          console.error('payout retry settlement background step failed:', err);
        }
      })()
    );
  } catch (err: any) {
    if (err?.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    console.error('trigger payout error:', err);
    res.status(500).json({ error: 'Failed to trigger payout' });
  }
});

export default router;
