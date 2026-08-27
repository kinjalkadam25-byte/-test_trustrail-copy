import { Router } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';
import { verifyChain } from '../utils/ledger';

const router = Router();

router.use(authMiddleware, requireRole('platform_admin'));

// GET /api/admin/flags -> [{anomalyFlag, disbursement}] — unreviewed anomaly flags
router.get('/flags', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT af.*, d.amount, d.purpose, d.category, d.verification_code, d.status AS disbursement_status,
              n.name AS ngo_name
       FROM anomaly_flags af
       JOIN disbursements d ON d.id = af.disbursement_id
       JOIN ngos n ON n.id = d.ngo_id
       WHERE af.review_status = 'unreviewed'
       ORDER BY af.flagged_at DESC`
    );

    res.json(
      result.rows.map((r) => ({
        anomalyFlag: {
          id: r.id,
          score: r.score,
          isAnomalous: r.is_anomalous,
          reason: r.reason,
          reviewStatus: r.review_status,
          flaggedAt: r.flagged_at,
        },
        disbursement: {
          id: r.disbursement_id,
          ngoName: r.ngo_name,
          amount: r.amount,
          purpose: r.purpose,
          category: r.category,
          verificationCode: r.verification_code,
          status: r.disbursement_status,
        },
      }))
    );
  } catch (err) {
    console.error('admin flags error:', err);
    res.status(500).json({ error: 'Failed to load flags' });
  }
});

// POST /api/admin/flags/:id/review — {reviewStatus} -> {flag}
router.post('/flags/:id/review', async (req, res) => {
  const { reviewStatus } = req.body ?? {};
  if (!['confirmed_ok', 'confirmed_issue'].includes(reviewStatus)) {
    return res.status(400).json({ error: "reviewStatus must be 'confirmed_ok' or 'confirmed_issue'" });
  }

  try {
    const result = await pool.query(
      `UPDATE anomaly_flags SET review_status = $1, reviewed_by = $2 WHERE id = $3 RETURNING *`,
      [reviewStatus, req.user!.userId, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Flag not found' });

    if (reviewStatus === 'confirmed_issue') {
      await pool.query(`UPDATE disbursements SET status = 'under_review' WHERE id = $1`, [
        result.rows[0].disbursement_id,
      ]);
    }

    res.json({ flag: result.rows[0] });
  } catch (err) {
    console.error('review flag error:', err);
    res.status(500).json({ error: 'Failed to review flag' });
  }
});

// POST /api/admin/ngos — {name, registrationNumber?, description?} -> {ngo}
router.post('/ngos', async (req, res) => {
  const { name, registrationNumber, description } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ngos (name, registration_number, description) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), registrationNumber || null, description || null]
    );
    const row = result.rows[0];
    res.status(201).json({
      ngo: {
        id: row.id,
        name: row.name,
        registrationNumber: row.registration_number,
        description: row.description,
      },
    });
  } catch (err) {
    console.error('create ngo error:', err);
    res.status(500).json({ error: 'Failed to create NGO' });
  }
});

// GET /api/admin/ledger/verify -> {valid, brokenAtEntryId?} — the tamper-detection demo endpoint
router.get('/ledger/verify', async (_req, res) => {
  try {
    const result = await verifyChain();
    res.json(result);
  } catch (err) {
    console.error('ledger verify error:', err);
    res.status(500).json({ error: 'Failed to verify ledger' });
  }
});

export default router;
