import { Redis } from '@upstash/redis';

// REST-based client (Upstash's Marketplace integration) — no persistent
// connection to establish or lose, so there's no reconnect/retry state to
// get permanently stuck the way the old TCP `redis` client's getRedis() could.
//
// Built explicitly from KV_REST_API_URL/TOKEN rather than Redis.fromEnv()
// (which looks for UPSTASH_REDIS_REST_URL/TOKEN) -- Vercel's Upstash
// Marketplace integration injects the former, for @vercel/kv-compat naming.
const redisClient = new Redis({
  url: process.env.KV_REST_API_URL as string,
  token: process.env.KV_REST_API_TOKEN as string,
});

export async function getRedis() {
  return redisClient;
}
