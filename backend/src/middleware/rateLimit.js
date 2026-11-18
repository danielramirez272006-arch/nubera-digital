import { AppError } from './errorHandler.js';

// Map<fullKey, { timestamps: number[], expiresAt: number }>
const buckets = new Map();

function purgeExpiredBuckets(now = Date.now()) {
  for (const [key, entry] of buckets.entries()) {
    if (entry.expiresAt <= now) {
      buckets.delete(key);
    }
  }
}

setInterval(() => purgeExpiredBuckets(), 10 * 60 * 1000).unref();

export function checkRateLimit(namespace, key, maxCalls, windowMs, detail) {
  const fullKey = `${namespace}:${key}`;
  const now = Date.now();
  const prev = buckets.get(fullKey);
  const list = (prev ? prev.timestamps : []).filter((t) => now - t < windowMs);
  if (list.length >= maxCalls) {
    throw new AppError(429, detail);
  }
  list.push(now);
  if (buckets.size >= 5000) {
    purgeExpiredBuckets(now);
  }
  buckets.set(fullKey, { timestamps: list, expiresAt: now + windowMs });
}
