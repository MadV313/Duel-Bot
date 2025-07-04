// utils/cacheUtils.js

const cache = {};

/**
 * Set a value in cache with optional expiration in milliseconds
 * @param {string} key
 * @param {*} value
 * @param {number} [ttl] Optional time-to-live in ms
 */
export function setCache(key, value, ttl = null) {
  const entry = { value };

  if (ttl && typeof ttl === 'number') {
    entry.expiresAt = Date.now() + ttl;
  }

  cache[key] = entry;
  console.log(`🗃️ Cache set: ${key}${ttl ? ` (expires in ${ttl}ms)` : ''}`);
}

/**
 * Get a cached value if it exists and hasn’t expired
 * @param {string} key
 * @returns {*} value or null
 */
export function getCache(key) {
  const entry = cache[key];
  if (!entry) return null;

  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    delete cache[key];
    console.log(`⏰ Cache expired: ${key}`);
    return null;
  }

  return entry.value;
}

/**
 * Clear a specific cache entry
 * @param {string} key
 */
export function clearCache(key) {
  if (key in cache) {
    delete cache[key];
    console.log(`🧹 Cache cleared: ${key}`);
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache() {
  Object.keys(cache).forEach(key => delete cache[key]);
  console.log('🧼 All cache cleared');
}
