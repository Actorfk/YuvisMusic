'use strict';

const METADATA_CACHE_VERSION = 1;

function createLibraryMetadataCache() {
  return { version: METADATA_CACHE_VERSION, entries: {} };
}

function normalizeLibraryMetadataCache(value) {
  if (!value || value.version !== METADATA_CACHE_VERSION || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    return createLibraryMetadataCache();
  }
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

module.exports = {
  METADATA_CACHE_VERSION,
  createLibraryMetadataCache,
  normalizeLibraryMetadataCache,
  readCachedMetadata,
  trackFileSignature,
  writeCachedMetadata
};
