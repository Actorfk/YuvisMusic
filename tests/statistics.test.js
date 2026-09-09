const test = require('node:test');
const assert = require('node:assert/strict');
const { listeningRange, listeningReport, libraryReport } = require('../src/statistics');
const now = new Date(2026, 8, 9, 18);

test('rolling ranges include today, cross month/year boundaries, and compare equal periods', () => {
  const range = listeningRange('week', {}, new Date(2026, 0, 3));
  assert.equal(range.startKey, '2025-12-28');
  assert.equal(range.endKey, '2026-01-03');
  assert.equal(range.previousStart, '2025-12-21');
  assert.equal(range.previousEnd, '2025-12-27');
  assert.equal(range.length, 7);
  assert.equal(listeningRange('year', {}, new Date(2024, 2, 1)).length, 365);
});

test('listening totals include short listens but song ranking includes only qualified records', () => {
  const result = listeningReport({ days: {
    '2026-09-02': { seconds: 300, plays: 1, tracks: {} },
    '2026-09-03': { seconds: 100, plays: 1, tracks: { 'C:/Music/A.mp3': { title: 'A', seconds: 80, plays: 1, valid: true } } },
    '2026-09-09': { seconds: 140, plays: 2, tracks: {
      'c:\\music\\a.mp3': { title: 'A', seconds: 60, plays: 1, valid: true },
      'C:/Music/B.mp3': { title: 'B', seconds: 60, plays: 1, valid: true },
      short: { title: 'Short', seconds: 20, plays: 0, valid: false }
    } },
    '2026-09-10': { seconds: 999, plays: 99 }
  } }, 'week', now);
  assert.equal(result.seconds, 240);
  assert.equal(result.plays, 3);
  assert.equal(result.trackCount, 2);
  assert.equal(result.activeDays, 2);
  assert.equal(result.topTracks[0].seconds, 140);
  assert.equal(result.topTracks[0].plays, 2);
  assert.equal(result.previous.seconds, 300);
  assert.equal(result.trend.length, 7);
  assert.equal(result.trend[1].seconds, 0);
  assert.equal(result.trend.reduce((sum, item) => sum + item.seconds, 0), 240);
  assert.equal(result.peak.key, '2026-09-09');
  assert.equal(result.averageSeconds, 240 / 7);
});

test('empty, invalid and long histories produce finite values and bounded accurate charts', () => {
  const empty = listeningReport({}, 'all', now);
  assert.equal(empty.range.length, 1);
  assert.equal(empty.seconds, 0);
  assert.equal(empty.previous, null);
  const stats = { days: {
    '2020-01-01': { seconds: 50, plays: 0 },
    '2026-09-09': { seconds: 100, plays: 1 },
    '2026-02-30': { seconds: 9999 },
    broken: { seconds: 9999 },
    '2026-09-08': { seconds: Infinity, plays: -5 }
  } };
  const all = listeningReport(stats, 'all', now);
  assert.equal(all.seconds, 150);
  assert.equal(all.plays, 1);
  assert.ok(all.trend.length <= 12);
  assert.equal(all.trend.reduce((sum, bucket) => sum + bucket.seconds, 0), all.seconds);
});

test('library distributions and playlist coverage separate unknown metadata and repeated entries', () => {
  const tracks = [
    { id: 'a', path: 'C:/Music/A.MP3', artist: 'Artist A', album: 'Same title', duration: 180, size: 100 },
    { id: 'b', path: 'C:/Music/B.flac', artist: 'Artist B', album: 'Same title', duration: 301, size: 300 },
    { id: 'c', path: 'C:/Music/C.wav', duration: 0, size: 50 }
  ];
  const report = libraryReport(tracks, new Set(['a', 'removed']), [
    { id: 'one', name: 'One', trackPaths: ['c:\\music\\a.mp3', 'C:/Music/A.MP3', 'C:/missing.mp3'] },
    { id: 'two', name: 'Two', trackPaths: ['C:/Music/A.MP3', 'C:/Music/B.flac'] },
    { id: 'empty', name: 'Empty', trackPaths: [] }
  ]);
  assert.equal(report.count, 3);
  assert.equal(report.seconds, 481);
  assert.equal(report.bytes, 450);
  assert.equal(report.favoriteCount, 1);
  assert.equal(report.albums.length, 3);
  assert.deepEqual(report.durationGroups.map((item) => item[1]), [0, 1, 1, 1]);
  assert.equal(report.averageDuration, 240.5);
  assert.equal(report.formats.length, 3);
  assert.equal(report.coveredCount, 2);
  assert.equal(report.playlistEntries, 4);
  assert.equal(report.emptyPlaylists, 1);
  assert.equal(report.playlistRows.find((row) => row.id === 'one').missing, 1);
});
