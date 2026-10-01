import IORedis from "ioredis";

const redis = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

const MAX_EMAILS_PER_HOUR =
  Number(process.env.MAX_EMAILS_PER_HOUR) || 100;

interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Redis-backed per-sender hourly rate limiter.
 *
 * Each sender gets a separate counter for each UTC hour.
 *
 * Example Redis key:
 * email-rate:30f68a31-...:2026-09-29T15
 */
export async function checkEmailRateLimit(
  senderId: string
): Promise<RateLimitResult> {
  const now = new Date();

  const hourWindow = now.toISOString().slice(0, 13);

  const key = `email-rate:${senderId}:${hourWindow}`;

  const count = await redis.incr(key);

  // Keep the counter for slightly longer than the hour.
  if (count === 1) {
    await redis.expire(key, 3700);
  }

  const nextHour =
    new Date(
      now.getTime() +
        (60 - now.getMinutes()) * 60 * 1000 -
        now.getSeconds() * 1000 -
        now.getMilliseconds()
    );

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((nextHour.getTime() - now.getTime()) / 1000)
  );

  if (count > MAX_EMAILS_PER_HOUR) {
    return {
      allowed: false,
      count,
      limit: MAX_EMAILS_PER_HOUR,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    count,
    limit: MAX_EMAILS_PER_HOUR,
    retryAfterSeconds,
  };
}
