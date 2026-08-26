import 'dotenv/config';
import cors from 'cors';
import express from 'express';

import authRoutes from './routes/auth';
import donationRoutes from './routes/donations';
import disbursementRoutes from './routes/disbursements';
import ngoRoutes from './routes/ngo';
import vendorRoutes from './routes/vendor';
import billRoutes from './routes/bills';
import verifyRoutes from './routes/verify';
import adminRoutes from './routes/admin';
import publicRoutes from './routes/public';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Set it in backend/.env (see .env.example). Exiting.');
  process.exit(1);
}

const app = express();

// Required for req.ip to reflect the real visitor (via X-Forwarded-For) when
// running behind Vercel's edge proxy -- without this every request resolves
// to the same internal proxy address, which would make IP-based rate
// limiting (see middleware/rateLimiter.ts) apply globally across all
// visitors combined instead of per-visitor.
app.set('trust proxy', true);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '15mb' })); // bills arrive as base64 JSON, so the default 100kb limit is too small

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/disbursements', disbursementRoutes);
app.use('/api/ngo', ngoRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);

// Catch-all error handler — anything that throws synchronously or calls next(err)
// lands here instead of crashing the process or hanging the request.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err?.httpStatus || 500).json({ error: err?.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`TrustTrail backend listening on :${PORT}`);
});
