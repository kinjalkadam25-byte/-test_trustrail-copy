import { Router } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

// Standard Indian bank formats: account number is digits only (banks vary in
// length, 9-18 covers virtually all of them); IFSC is 4 letters + '0' +
// 6 alphanumeric (the 5th character is reserved by RBI convention).
const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// POST /api/vendor/bank-account — vendor — {accountNumber, ifscCode, accountHolderName} -> {bankAccount}
// Format validation only -- confirms account number is a well-formed matching pattern, not that a real
// bank account exists (that requires a payout-provider integration; see utils/payoutClient.ts).
router.post('/bank-account', authMiddleware, requireRole('vendor'), async (req, res) => {
  const { accountNumber, ifscCode, accountHolderName } = req.body ?? {};

  if (!accountNumber || !ifscCode || !accountHolderName) {
    return res.status(400).json({ error: 'accountNumber, ifscCode, and accountHolderName are required' });
  }
  if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
    return res.status(400).json({ error: 'accountNumber must be 9-18 digits' });
  }
  const normalizedIfsc = String(ifscCode).toUpperCase();
  if (!IFSC_PATTERN.test(normalizedIfsc)) {
    return res.status(400).json({ error: 'ifscCode must be a valid IFSC (e.g. HDFC0001234)' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO vendor_bank_accounts (vendor_id, account_number, ifsc_code, account_holder_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (vendor_id) DO UPDATE SET
         account_number = EXCLUDED.account_number,
         ifsc_code = EXCLUDED.ifsc_code,
         account_holder_name = EXCLUDED.account_holder_name
       RETURNING *`,
      [req.user!.userId, accountNumber, normalizedIfsc, accountHolderName]
    );
    const row = result.rows[0];
    res.status(201).json({
      bankAccount: {
        accountNumber: row.account_number,
        ifscCode: row.ifsc_code,
        accountHolderName: row.account_holder_name,
      },
    });
  } catch (err) {
    console.error('save bank account error:', err);
    res.status(500).json({ error: 'Failed to save bank account' });
  }
});

// GET /api/vendor/bank-account — vendor — {bankAccount} | {bankAccount: null}
router.get('/bank-account', authMiddleware, requireRole('vendor'), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM vendor_bank_accounts WHERE vendor_id = $1`, [req.user!.userId]);
    const row = result.rows[0];
    res.json({
      bankAccount: row
        ? { accountNumber: row.account_number, ifscCode: row.ifsc_code, accountHolderName: row.account_holder_name }
        : null,
    });
  } catch (err) {
    console.error('load bank account error:', err);
    res.status(500).json({ error: 'Failed to load bank account' });
  }
});

// GET /api/vendor/disbursements — vendor — disbursements assigned to this vendor
router.get('/disbursements', authMiddleware, requireRole('vendor'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, n.name AS ngo_name
       FROM disbursements d
       JOIN ngos n ON n.id = d.ngo_id
       WHERE d.vendor_id = $1
       ORDER BY d.created_at DESC`,
      [req.user!.userId]
    );

    res.json(
      result.rows.map((r) => ({
        id: r.id,
        ngoName: r.ngo_name,
        amount: r.amount,
        purpose: r.purpose,
        category: r.category,
        status: r.status,
        verificationCode: r.verification_code,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    console.error('vendor disbursements error:', err);
    res.status(500).json({ error: 'Failed to load assigned disbursements' });
  }
});

export default router;
