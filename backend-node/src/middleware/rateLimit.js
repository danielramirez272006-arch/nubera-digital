import { AppError } from './errorHandler.js';

const buckets = new Map();

export function checkRateLimit(namespace, key, maxCalls, windowMs, detail) {
  const fullKey = `${namespace}:${key}`;
  const now = Date.now();
  const list = (buckets.get(fullKey) || []).filter((t) => now - t < windowMs);
  if (list.length >= maxCalls) {
    throw new AppError(429, detail);
  }
  list.push(now);
  buckets.set(fullKey, list);
}
