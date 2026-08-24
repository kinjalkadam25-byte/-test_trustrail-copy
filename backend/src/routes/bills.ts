import { Router } from 'express';
import { withTransaction } from '../db/pool';
import { appendLedgerEntry } from '../utils/ledger';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

// POST /api/bills — vendor — {disbursementId, fileBase64, mimeType, amountClaimed} -> {bill}
router.post('/', authMiddleware, requireRole('vendor'), async (req, res) => {
  const { disbursementId, fileBase64, mimeType, amountClaimed } = req.body ?? {};
  const numericAmountClaimed = Number(amountClaimed);

  if (!disbursementId || !fileBase64 || !mimeType || !numericAmountClaimed) {
    return res.status(400).json({ error: 'disbursementId, fileBase64, mimeType, and amountClaimed are required' });
  }

  try {
    const result = await withTransaction(async (client) => {
      const disbursementRes = await client.query(`SELECT * FROM disbursements WHERE id = $1 FOR UPDATE`, [
        disbursementId,
      ]);
      const disbursement = disbursementRes.rows[0];
      if (!disbursement) throw Object.assign(new Error('Disbursement not found'), { httpStatus: 404 });
      if (disbursement.vendor_id !== req.user!.userId) {
        throw Object.assign(new Error('This disbursement is not assigned to you'), { httpStatus: 403 });
      }

      const fileBuffer = Buffer.from(fileBase64, 'base64');

      const billRes = await client.query(
        `INSERT INTO bills (disbursement_id, vendor_id, file_data, file_mime_type, amount_claimed)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, disbursement_id, vendor_id, file_mime_type, amount_claimed, uploaded_at`,
        [disbursementId, req.user!.userId, fileBuffer, mimeType, numericAmountClaimed]
      );
      const bill = billRes.rows[0];

      await client.query(`UPDATE disbursements SET status = 'pending_review' WHERE id = $1`, [disbursementId]);

      await appendLedgerEntry(client, 'bill_upload', bill.id, {
        disbursementId,
        vendorId: req.user!.userId,
        amountClaimed: numericAmountClaimed,
      });

      return bill;
    });

    res.status(201).json({ bill: result });
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'A bill has already been uploaded for this disbursement' });
    if (err?.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    console.error('upload bill error:', err);
    res.status(500).json({ error: 'Failed to upload bill' });
  }
});

export default router;
