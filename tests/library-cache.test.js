const test = require('node:test');
const assert = require('node:assert/strict');
const {
  METADATA_CACHE_VERSION,
  createLibraryMetadataCache,
  normalizeLibraryMetadataCache,
  pruneLibraryMetadataCache,
  readCachedMetadata,
  touchCachedMetadata,
  trackFileSignature,
  writeCachedMetadata
} = require('../src/library-cache');

test('trackFileSignature changes when file size or modification time changes', () => {
  assert.equal(trackFileSignature({ size: 42, mtimeMs: 123.5 }), '42:123.5');
  assert.notEqual(
    trackFileSignature({ size: 42, mtimeMs: 123.5 }),
    trackFileSignature({ size: 43, mtimeMs: 123.5 })
  );
});

test('metadata cache returns only entries matching the current file signature', () => {
  const cache = createLibraryMetadataCache();
  const entry = writeCachedMetadata(cache, 'c:\\music\\song.mp3', {
    signature: '42:123.5',
    title: 'Song'
  });

  assert.equal(cache.version, METADATA_CACHE_VERSION);
  assert.equal(readCachedMetadata(cache, 'c:\\music\\song.mp3', '42:123.5'), entry);
  assert.equal(readCachedMetadata(cache, 'c:\\music\\song.mp3', '42:124'), null);
});

test('invalid or outdated metadata caches are reset safely', () => {
  assert.deepEqual(normalizeLibraryMetadataCache(null), createLibraryMetadataCache());
  assert.deepEqual(
    normalizeLibraryMetadataCache({ version: METADATA_CACHE_VERSION + 1, entries: { stale: true } }),
    createLibraryMetadataCache()
  );
});

test('cache access timestamps are updated at most once per interval', () => {
  const entry = { signature: '1:1', lastAccessedAt: 1000 };
  assert.equal(touchCachedMetadata(entry, 1500, 1000), false);
  assert.equal(entry.lastAccessedAt, 1000);
  assert.equal(touchCachedMetadata(entry, 2500, 1000), true);
  assert.equal(entry.lastAccessedAt, 2500);
});

test('cache pruning removes expired and least recently used entries', () => {
  const cache = createLibraryMetadataCache();
  cache.entries = {
    expired: { signature: '1:1', lastAccessedAt: 100 },
    newest: { signature: '1:2', lastAccessedAt: 950 },
    middle: { signature: '1:3', lastAccessedAt: 900 },
    oldest: { signature: '1:4', lastAccessedAt: 800 }
  };
  const result = pruneLibraryMetadataCache(cache, { now: 1000, maxAgeMs: 500, maxEntries: 2 });
  assert.deepEqual(Object.keys(result.cache.entries).sort(), ['middle', 'newest']);
  assert.deepEqual(result.removedKeys.sort(), ['expired', 'oldest']);
});
