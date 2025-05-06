// utils/cacheUtils.js

const cache = {};

// Cache a value with a key
export function setCache(key, value) {
  cache[key] = value;
  console.log(`Cache set: ${key}`);
}

// Retrieve a cached value
export function getCache(key) {
  return cache[key] || null;
}

// Clear a specific cached value
export function clearCache(key) {
  delete cache[key];
  console.log(`Cache cleared: ${key}`);
}

// Clear all cache
export function clearAllCache() {
  Object.keys(cache).forEach(key => delete cache[key]);
  console.log('All cache cleared');
}
