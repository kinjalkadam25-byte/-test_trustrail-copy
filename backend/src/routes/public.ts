import { Router } from 'express';
import { pool } from '../db/pool';
import { getRedis } from '../utils/redis';

const router = Router();

const TRUST_SCORE_TTL_SECONDS = 5;

interface TrustScorePayload {
  trustScore: number;
  verifiedPct: number;
  avgVerificationTime: number | null;
}

async function computeTrustScore(ngoId: string): Promise<TrustScorePayload | null> {
  const ngoRes = await pool.query(`SELECT id FROM ngos WHERE id = $1`, [ngoId]);
  if (ngoRes.rowCount === 0) return null;

  const statusRes = await pool.query(
    `SELECT status, COUNT(*) AS count FROM disbursements WHERE ngo_id = $1 GROUP BY status`,
    [ngoId]
  );
  let total = 0;
  let verified = 0;
  for (const row of statusRes.rows) {
    total += Number(row.count);
    if (row.status === 'verified') verified += Number(row.count);
  }
  const verifiedPct = total > 0 ? Math.round((verified / total) * 1000) / 10 : 0;

  const issuesRes = await pool.query(
    `SELECT COUNT(*) AS count FROM anomaly_flags af
     JOIN disbursements d ON d.id = af.disbursement_id
     WHERE d.ngo_id = $1 AND af.review_status = 'confirmed_issue'`,
    [ngoId]
  );
  const confirmedIssues = Number(issuesRes.rows[0].count);

  const avgRes = await pool.query(
    `SELECT AVG(EXTRACT(EPOCH FROM (b.uploaded_at - d.created_at)) / 3600.0) AS avg_hours
     FROM disbursements d JOIN bills b ON b.disbursement_id = d.id
     WHERE d.ngo_id = $1`,
    [ngoId]
  );
  const avgVerificationTime = avgRes.rows[0]?.avg_hours ? Math.round(Number(avgRes.rows[0].avg_hours) * 10) / 10 : null;

  const trustScore = Math.max(0, Math.min(100, Math.round(verifiedPct - confirmedIssues * 10)));

  return { trustScore, verifiedPct, avgVerificationTime };
}

// GET /api/public/ngo/:ngoId/trust-score — Redis-cached, 5s TTL (see Technical Architecture §5.7)
router.get('/ngo/:ngoId/trust-score', async (req, res) => {
  const cacheKey = `trust-score:${req.params.ngoId}`;
  try {
    const redis = await getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ ...JSON.parse(cached), cached: true });
    }

    const payload = await computeTrustScore(req.params.ngoId);
    if (!payload) return res.status(404).json({ error: 'NGO not found' });

    await redis.set(cacheKey, JSON.stringify(payload), { EX: TRUST_SCORE_TTL_SECONDS });
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('trust score error:', err);
    // Redis being unreachable shouldn't take the public dashboard down —
    // fall back to a direct (uncached) computation.
    try {
      const payload = await computeTrustScore(req.params.ngoId);
      if (!payload) return res.status(404).json({ error: 'NGO not found' });
      res.json({ ...payload, cached: false });
    } catch (fallbackErr) {
      console.error('trust score fallback error:', fallbackErr);
      res.status(500).json({ error: 'Failed to compute trust score' });
    }
  }
});

// GET /api/public/ngos -> [{ngo, trustScore}]
router.get('/ngos', async (_req, res) => {
  try {
    const ngosRes = await pool.query(`SELECT id, name, registration_number, description FROM ngos ORDER BY name ASC`);
    const results = await Promise.all(
      ngosRes.rows.map(async (ngo) => ({
        ngo: { id: ngo.id, name: ngo.name, registrationNumber: ngo.registration_number, description: ngo.description },
        trustScore: (await computeTrustScore(ngo.id))?.trustScore ?? 0,
      }))
    );
    res.json(results);
  } catch (err) {
    console.error('ngos list error:', err);
    res.status(500).json({ error: 'Failed to load NGOs' });
  }
});
// GET /api/public/ledger — the live public dashboard: aggregate totals, verification
// stats, and a searchable/filterable recent-transactions feed. Redis-cached for 5s,
// same pattern as the trust-score endpoint above, so rapid polling from the frontend
// doesn't hammer Postgres.
const LEDGER_TTL_SECONDS = 5;

interface LedgerSummary {
  totalDonated: number;
  totalDisbursed: number;
  verifiedPct: number; // % of disbursements (by count) with status = 'verified'
  avgVerificationHours: number | null;
  disbursementStatus: { verifiedAmount: number; pendingAmount: number };
  transactions: {
    verificationCode: string;
    amount: number;
    ngoName: string;
    vendorName: string | null;
    date: string;
    status: string;
  }[];
}

async function computeLedgerSummary(search: string, status: string, limit: number): Promise<LedgerSummary> {
  const totalsRes = await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM donations) AS total_donated,
      (SELECT COALESCE(SUM(amount), 0) FROM disbursements) AS total_disbursed,
      (SELECT COUNT(*) FROM disbursements) AS disbursement_count,
      (SELECT COUNT(*) FROM disbursements WHERE status = 'verified') AS verified_count,
      (SELECT COALESCE(SUM(amount), 0) FROM disbursements WHERE status = 'verified') AS verified_amount,
      (SELECT COALESCE(SUM(amount), 0) FROM disbursements WHERE status != 'verified') AS pending_amount
  `);
  const t = totalsRes.rows[0];

  const avgRes = await pool.query(`
    SELECT AVG(EXTRACT(EPOCH FROM (b.uploaded_at - d.created_at)) / 3600.0) AS avg_hours
    FROM disbursements d JOIN bills b ON b.disbursement_id = d.id
  `);
  const avgVerificationHours = avgRes.rows[0]?.avg_hours
    ? Math.round(Number(avgRes.rows[0].avg_hours) * 10) / 10
    : null;

  const disbursementCount = Number(t.disbursement_count);
  const verifiedCount = Number(t.verified_count);
  const verifiedPct = disbursementCount > 0 ? Math.round((verifiedCount / disbursementCount) * 1000) / 10 : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(d.verification_code ILIKE $${params.length} OR n.name ILIKE $${params.length} OR u.name ILIKE $${params.length})`
    );
  }
  if (status === 'verified' || status === 'pending') {
    if (status === 'verified') {
      conditions.push(`d.status = 'verified'`);
    } else {
      conditions.push(`d.status != 'verified'`);
    }
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const txRes = await pool.query(
    `SELECT d.verification_code, d.amount, d.status, d.created_at, n.name AS ngo_name, u.name AS vendor_name
     FROM disbursements d
     JOIN ngos n ON n.id = d.ngo_id
     LEFT JOIN users u ON u.id = d.vendor_id
     ${whereClause}
     ORDER BY d.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return {
    totalDonated: Number(t.total_donated),
    totalDisbursed: Number(t.total_disbursed),
    verifiedPct,
    avgVerificationHours,
    disbursementStatus: {
      verifiedAmount: Number(t.verified_amount),
      pendingAmount: Number(t.pending_amount),
    },
    transactions: txRes.rows.map((r) => ({
      verificationCode: r.verification_code,
      amount: Number(r.amount),
      ngoName: r.ngo_name,
      vendorName: r.vendor_name,
      date: r.created_at,
      status: r.status,
    })),
  };
}

router.get('/ledger', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const limit = Math.min(Number(req.query.limit) || 25, 100);

  // Only cache the common, unfiltered case — filtered/searched views hit Postgres
  // directly since they're cheap and caching every search string isn't worth it.
  const isCacheable = !search && status === 'all' && limit === 25;
  const cacheKey = 'public-ledger-summary';

  try {
    if (isCacheable) {
      const redis = await getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ ...JSON.parse(cached), cached: true });
      }
    }

    const payload = await computeLedgerSummary(search, status, limit);

    if (isCacheable) {
      const redis = await getRedis();
      await redis.set(cacheKey, JSON.stringify(payload), { EX: LEDGER_TTL_SECONDS });
    }

    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('public ledger error:', err);
    res.status(500).json({ error: 'Failed to load public ledger' });
  }
});

export default router;
