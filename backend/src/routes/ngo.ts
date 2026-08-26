import { Router } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

router.use(authMiddleware, requireRole('ngo_admin'));

// GET /api/ngo/disbursements -> [{disbursement, flagStatus}]
router.get('/disbursements', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name AS vendor_name,
              af.id AS flag_id, af.is_anomalous, af.reason AS flag_reason, af.review_status,
              p.status AS payout_status, p.failure_reason AS payout_failure_reason,
              vba.id AS vendor_has_bank_account
       FROM disbursements d
       LEFT JOIN users u ON u.id = d.vendor_id
       LEFT JOIN LATERAL (
         SELECT * FROM anomaly_flags WHERE disbursement_id = d.id ORDER BY flagged_at DESC LIMIT 1
       ) af ON true
       LEFT JOIN payouts p ON p.disbursement_id = d.id
       LEFT JOIN vendor_bank_accounts vba ON vba.vendor_id = d.vendor_id
       WHERE d.ngo_id = $1
       ORDER BY d.created_at DESC`,
      [req.user!.ngoId]
    );

    res.json(
      result.rows.map((r) => ({
        disbursement: {
          id: r.id,
          amount: r.amount,
          purpose: r.purpose,
          category: r.category,
          status: r.status,
          underfunded: r.underfunded,
          verificationCode: r.verification_code,
          vendorId: r.vendor_id,
          vendorName: r.vendor_name,
          createdAt: r.created_at,
        },
        flagStatus: r.flag_id
          ? { isAnomalous: r.is_anomalous, reason: r.flag_reason, reviewStatus: r.review_status }
          : null,
        payoutStatus: r.payout_status ?? null,
        payoutFailureReason: r.payout_failure_reason ?? null,
        vendorHasBankAccount: Boolean(r.vendor_has_bank_account),
      }))
    );
  } catch (err) {
    console.error('ngo disbursements error:', err);
    res.status(500).json({ error: 'Failed to load disbursements' });
  }
});

// GET /api/ngo/dashboard -> {totalDonations, totalDisbursed, verifiedPct, avgVerificationTime, pendingCount}
router.get('/dashboard', async (req, res) => {
  try {
    const ngoId = req.user!.ngoId;

    const donationsRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM donations WHERE ngo_id = $1`,
      [ngoId]
    );
    const disbursedRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM disbursements WHERE ngo_id = $1`,
      [ngoId]
    );
    const statusRes = await pool.query(
      `SELECT status, COUNT(*) AS count FROM disbursements WHERE ngo_id = $1 GROUP BY status`,
      [ngoId]
    );
    const avgRes = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (b.uploaded_at - d.created_at)) / 3600.0) AS avg_hours
       FROM disbursements d JOIN bills b ON b.disbursement_id = d.id
       WHERE d.ngo_id = $1`,
      [ngoId]
    );

    const statusCounts: Record<string, number> = {};
    let totalDisbursements = 0;
    for (const row of statusRes.rows) {
      statusCounts[row.status] = Number(row.count);
      totalDisbursements += Number(row.count);
    }
    const verifiedCount = statusCounts['verified'] ?? 0;
    const pendingCount = (statusCounts['pending_bill'] ?? 0) + (statusCounts['pending_review'] ?? 0);

    res.json({
      totalDonations: Number(donationsRes.rows[0].total),
      totalDisbursed: Number(disbursedRes.rows[0].total),
      verifiedPct: totalDisbursements > 0 ? Math.round((verifiedCount / totalDisbursements) * 1000) / 10 : 0,
      avgVerificationTime: avgRes.rows[0]?.avg_hours ? Math.round(Number(avgRes.rows[0].avg_hours) * 10) / 10 : null,
      pendingCount,
    });
  } catch (err) {
    console.error('ngo dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/ngo/vendors -> [{id, name, email}]
// Not in the original API table, but needed so the NGO Admin console can
// actually populate the "assign vendor" dropdown when logging a disbursement.
router.get('/vendors', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email FROM users WHERE role = 'vendor' AND ngo_id = $1 ORDER BY name ASC`,
      [req.user!.ngoId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('ngo vendors error:', err);
    res.status(500).json({ error: 'Failed to load vendors' });
  }
});

export default router;
