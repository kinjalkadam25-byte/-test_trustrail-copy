import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

redisClient.on('error', (err) => console.error('Redis client error:', err));

let connecting: Promise<void> | null = null;

// Lazily connect on first use rather than blocking server startup on Redis
// being reachable — keeps `npm run dev` usable even if redis isn't up yet.
export async function getRedis() {
  if (!redisClient.isOpen) {
    if (!connecting) connecting = redisClient.connect().then(() => undefined);
    await connecting;
  }
  return redisClient;
}
