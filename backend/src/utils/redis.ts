import { Redis } from '@upstash/redis';

// REST-based client (Upstash's Marketplace integration) — no persistent
// connection to establish or lose, so there's no reconnect/retry state to
// get stuck the way the old TCP `redis` client's getRedis() could.
const redisClient = Redis.fromEnv();

export async function getRedis() {
  return redisClient;
}
