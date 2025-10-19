// utils/cacheUtils.js

const cache = Object.create(null);
const DEBUG = process.env.CACHE_DEBUG === 'true';

/**
 * Set a value in cache with optional expiration in milliseconds
 * @param {string} key
 * @param {*} value
 * @param {number|null} ttl  Time-to-live in ms (optional)
 * @param {string} [namespace] Optional namespace prefix, e.g. "duel"
 */
export function setCache(key, value, ttl = null, namespace = '') {
  const fullKey = namespace ? `${namespace}:${key}` : key;
  const entry = { value };
  if (ttl && typeof ttl === 'number') entry.expiresAt = Date.now() + ttl;
  cache[fullKey] = entry;

  if (DEBUG)
    console.log(`🗃️ [CACHE] set ${fullKey}${ttl ? ` (ttl=${ttl}ms)` : ''}`);
}

/**
 * Get a cached value if it exists and hasn’t expired
 * @param {string} key
 * @param {string} [namespace]
 * @returns {*} value or null
 */
export function getCache(key, namespace = '') {
  const fullKey = namespace ? `${namespace}:${key}` : key;
  const entry = cache[fullKey];
  if (!entry) return null;

  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    delete cache[fullKey];
    if (DEBUG) console.log(`⏰ [CACHE] expired ${fullKey}`);
    return null;
  }
  return entry.value;
}

/**
 * Clear a specific cache entry
 * @param {string} key
 * @param {string} [namespace]
 */
export function clearCache(key, namespace = '') {
  const fullKey = namespace ? `${namespace}:${key}` : key;
  if (cache[fullKey]) {
    delete cache[fullKey];
    if (DEBUG) console.log(`🧹 [CACHE] cleared ${fullKey}`);
  }
}

/** Clear all cache entries */
export function clearAllCache() {
  for (const key of Object.keys(cache)) delete cache[key];
  if (DEBUG) console.log('🧼 [CACHE] all entries cleared');
}

/**
 * Background sweeper for expired keys (optional)
 * @param {number} [intervalMs=60000]
 */
export function startCacheSweeper(intervalMs = 60000) {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [k, v] of Object.entries(cache)) {
      if (v.expiresAt && now > v.expiresAt) {
        delete cache[k];
        cleaned++;
      }
    }
    if (DEBUG && cleaned)
      console.log(`♻️ [CACHE] auto-cleaned ${cleaned} expired keys`);
  }, intervalMs).unref?.();
}
