import type { NextFunction, Request, Response } from 'express';
import { getRedis } from '../utils/redis';

// Fixed-window counter per IP (the standard Redis INCR/EXPIRE pattern). Fails
// open if Redis is unreachable -- same tradeoff the trust-score/ledger
// caching in routes/public.ts makes, since Redis is treated as an optional
// accelerant elsewhere in this app, not a hard dependency an outage should be
// able to lock every visitor out over.
function createRateLimiter(keyPrefix: string, windowSeconds: number, maxRequests: number, message: string) {
  return async function rateLimiter(req: Request, res: Response, next: NextFunction) {
    try {
      const redis = await getRedis();
      const key = `rate-limit:${keyPrefix}:${req.ip}`;

      const attempts = await redis.incr(key);
      if (attempts === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (attempts > maxRequests) {
        const ttl = await redis.ttl(key);
        res.set('Retry-After', String(ttl > 0 ? ttl : windowSeconds));
        return res.status(429).json({ error: message });
      }

      next();
    } catch (err) {
      console.error(`Rate limiter error for ${keyPrefix} (failing open):`, err);
      next();
    }
  };
}

// Applied to the fully public, unauthenticated GET endpoints (verification
// code lookup, donation code lookup, the public ledger/trust-score/NGO
// list) -- these have no login and no per-user identity to key off of, so
// they're the ones scannable/scrapable by an anonymous script. 60/minute per
// IP comfortably covers a real visitor (including the public ledger page's
// own 5s auto-refresh poll, ~12/minute) while still capping bulk enumeration.
export const publicLookupRateLimiter = createRateLimiter(
  'public-lookup',
  60,
  60,
  'Too many requests. Please wait a moment and try again.'
);
