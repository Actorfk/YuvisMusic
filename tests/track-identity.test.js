const test = require('node:test');
const assert = require('node:assert/strict');
const { stableTrackId, migrateLegacyTrackId, migrateStoredTrackIds } = require('../src/track-identity');

test('stableTrackId normalizes Windows separators and case', () => {
  assert.equal(stableTrackId('C:/Music/Artist/Song.MP3'), 'c:\\music\\artist\\song.mp3');
});

test('migrateLegacyTrackId removes integer and fractional mtime suffixes', () => {
  assert.equal(migrateLegacyTrackId('C:\\Music\\Song.mp3:1787654321000'), 'c:\\music\\song.mp3');
  assert.equal(migrateLegacyTrackId('D:\\Music\\Song.flac:1787654321000.125'), 'd:\\music\\song.flac');
});

test('migrateStoredTrackIds preserves order and merges legacy duplicates', () => {
  assert.deepEqual(migrateStoredTrackIds([
    'C:\\Music\\Song.mp3:1787654321000',
    'D:\\Music\\Other.flac:1787654322000',
    'c:\\music\\song.mp3',
    null
  ]), [
    'c:\\music\\song.mp3',
    'd:\\music\\other.flac'
  ]);
});

test('migrateLegacyTrackId leaves unknown future identifiers intact', () => {
  assert.equal(migrateLegacyTrackId('track-v2:sha256-value'), 'track-v2:sha256-value');
  assert.equal(migrateLegacyTrackId('track-v2:12345'), 'track-v2:12345');
});
