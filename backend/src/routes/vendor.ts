import { Router } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

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
