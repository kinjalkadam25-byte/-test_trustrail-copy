import { Router } from 'express';
import { withTransaction, pool } from '../db/pool';
import { withUniqueCode } from '../utils/codes';
import { appendLedgerEntry } from '../utils/ledger';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

// POST /api/donations — donor — {ngoId, amount} -> {donation}
router.post('/', authMiddleware, requireRole('donor'), async (req, res) => {
  const { ngoId, amount } = req.body ?? {};
  const numericAmount = Number(amount);

  if (!ngoId || !numericAmount || numericAmount <= 0) {
    return res.status(400).json({ error: 'ngoId and a positive amount are required' });
  }

  try {
    const ngoCheck = await pool.query(`SELECT id FROM ngos WHERE id = $1`, [ngoId]);
    if (ngoCheck.rowCount === 0) return res.status(404).json({ error: 'NGO not found' });

    const donation = await withTransaction(async (client) => {
      const inserted = await withUniqueCode((code) =>
        client.query(
          `INSERT INTO donations (donor_id, ngo_id, amount, remaining_amount, donation_code)
           VALUES ($1, $2, $3, $3, $4) RETURNING *`,
          [req.user!.userId, ngoId, numericAmount, code]
        )
      );
      const donationRow = inserted.rows[0];

      await appendLedgerEntry(client, 'donation', donationRow.id, {
        donorId: req.user!.userId,
        ngoId,
        amount: numericAmount,
      });

      return donationRow;
    });

    res.status(201).json({
      donation: {
        id: donation.id,
        ngoId: donation.ngo_id,
        donorId: donation.donor_id,
        amount: donation.amount,
        remainingAmount: donation.remaining_amount,
        donationCode: donation.donation_code,
        createdAt: donation.created_at,
      },
    });
  } catch (err) {
    console.error('create donation error:', err);
    res.status(500).json({ error: 'Failed to create donation' });
  }
});

// GET /api/donations/:code — public (the code IS the access control) — the donor traceability lookup
router.get('/:code', async (req, res) => {
  try {
    const donationRes = await pool.query(
      `SELECT d.*, n.name AS ngo_name FROM donations d
       JOIN ngos n ON n.id = d.ngo_id
       WHERE d.donation_code = $1`,
      [req.params.code]
    );
    const donation = donationRes.rows[0];
    if (!donation) return res.status(404).json({ error: 'No donation found for that code' });

    const allocationsRes = await pool.query(
      `SELECT a.amount_allocated, dis.id AS disbursement_id, dis.amount AS disbursement_amount,
              dis.purpose, dis.category, dis.status, dis.verification_code, dis.created_at AS disbursed_at
       FROM allocations a
       JOIN disbursements dis ON dis.id = a.disbursement_id
       WHERE a.donation_id = $1
       ORDER BY dis.created_at ASC`,
      [donation.id]
    );

    res.json({
      donation: {
        id: donation.id,
        ngoId: donation.ngo_id,
        ngoName: donation.ngo_name,
        amount: donation.amount,
        remainingAmount: donation.remaining_amount,
        donationCode: donation.donation_code,
        createdAt: donation.created_at,
      },
      allocations: allocationsRes.rows.map((r) => ({
        amountAllocated: r.amount_allocated,
        disbursement: {
          id: r.disbursement_id,
          amount: r.disbursement_amount,
          purpose: r.purpose,
          category: r.category,
          status: r.status,
          verificationCode: r.verification_code,
          createdAt: r.disbursed_at,
        },
      })),
    });
  } catch (err) {
    console.error('lookup donation error:', err);
    res.status(500).json({ error: 'Failed to look up donation' });
  }
});

export default router;
