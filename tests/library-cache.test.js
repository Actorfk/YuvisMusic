const test = require('node:test');
const assert = require('node:assert/strict');
const {
  METADATA_CACHE_VERSION,
  createLibraryMetadataCache,
  normalizeLibraryMetadataCache,
  readCachedMetadata,
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
