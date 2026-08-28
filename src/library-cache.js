'use strict';

const METADATA_CACHE_VERSION = 1;
const DEFAULT_CACHE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_MAX_ENTRIES = 25000;

function createLibraryMetadataCache() {
  return { version: METADATA_CACHE_VERSION, lastMaintenanceAt: 0, entries: {} };
}

function normalizeLibraryMetadataCache(value) {
  if (!value || value.version !== METADATA_CACHE_VERSION || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    return createLibraryMetadataCache();
  }
  value.lastMaintenanceAt = Number(value.lastMaintenanceAt) || 0;
  return value;
}

function trackFileSignature(stats) {
  return `${Number(stats?.size) || 0}:${Number(stats?.mtimeMs) || 0}`;
}

function readCachedMetadata(cache, key, signature) {
  const entry = cache?.entries?.[key];
  return entry?.signature === signature ? entry : null;
}

function writeCachedMetadata(cache, key, metadata) {
  cache.entries[key] = metadata;
  return metadata;
}

function touchCachedMetadata(entry, now = Date.now(), minimumIntervalMs = 24 * 60 * 60 * 1000) {
  if (!entry || typeof entry !== 'object') return false;
  const lastAccessedAt = Number(entry.lastAccessedAt) || 0;
  if (lastAccessedAt && now - lastAccessedAt < minimumIntervalMs) return false;
  entry.lastAccessedAt = now;
  return true;
}

function pruneLibraryMetadataCache(cache, {
  now = Date.now(),
  maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS,
  maxEntries = DEFAULT_CACHE_MAX_ENTRIES
} = {}) {
  const normalized = normalizeLibraryMetadataCache(cache);
  const entries = Object.entries(normalized.entries);
  const removedKeys = [];
  const retained = [];
  for (const [key, entry] of entries) {
    const lastAccessedAt = Number(entry?.lastAccessedAt) || now;
    if (entry && !Number(entry.lastAccessedAt)) entry.lastAccessedAt = lastAccessedAt;
    if (now - lastAccessedAt > maxAgeMs) removedKeys.push(key);
    else retained.push([key, entry, lastAccessedAt]);
  }
  retained.sort((left, right) => right[2] - left[2]);
  const entryLimit = Math.max(0, Number(maxEntries) || 0);
  retained.slice(entryLimit).forEach(([key]) => removedKeys.push(key));
  removedKeys.forEach((key) => delete normalized.entries[key]);
  return { cache: normalized, removedKeys };
}

module.exports = {
  DEFAULT_CACHE_MAX_AGE_MS,
  DEFAULT_CACHE_MAX_ENTRIES,
  METADATA_CACHE_VERSION,
  createLibraryMetadataCache,
  normalizeLibraryMetadataCache,
  pruneLibraryMetadataCache,
  readCachedMetadata,
  touchCachedMetadata,
  trackFileSignature,
  writeCachedMetadata
};
