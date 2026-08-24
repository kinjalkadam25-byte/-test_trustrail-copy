import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import type { Role } from '../types';

const router = Router();

const VALID_ROLES: Role[] = ['donor', 'ngo_admin', 'vendor', 'platform_admin'];

function signToken(user: { id: string; role: Role; ngo_id: string | null }) {
  return jwt.sign(
    { userId: user.id, role: user.role, ngoId: user.ngo_id },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any }
  );
}

function publicUser(row: any) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, ngoId: row.ngo_id };
}

// POST /api/auth/register — {name, email, password, role, ngoId?} -> {token, user}
router.post('/register', async (req, res) => {
  const { name, email, password, role, ngoId } = req.body ?? {};

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, and role are required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${VALID_ROLES.join(', ')}` });
  }
  if ((role === 'ngo_admin' || role === 'vendor') && !ngoId) {
    return res.status(400).json({ error: 'ngoId is required for ngo_admin and vendor roles' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, ngo_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, email, passwordHash, role, ngoId ?? null]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' });
    console.error('register error:', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/login — {email, password} -> {token, user}
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  try {
    const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// GET /api/auth/me — returns the logged-in user's profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user!.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;
