const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the renderer's actual statistics flow without audio playback or user data.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const start = renderer.indexOf('function beginListeningSession(');
const end = renderer.indexOf('function escapeHtml(', start);
assert.ok(start >= 0 && end > start, 'Listening statistics functions must be present');

function createPlayer(savedDays = {}) {
  const track = { id: 'song-a', path: 'C:\\Music\\a.mp3', title: 'Song A' };
  const stored = new Map();
  const context = vm.createContext({
    state: {
      currentId: track.id,
      listeningStats: { days: savedDays },
      listeningPersistTicks: 0,
      listeningSession: null
    },
    audio: { paused: false },
    currentTrack: () => track,
    localDateKey: () => '2026-09-07',
    localStorage: { setItem: (key, value) => stored.set(key, value) },
    updateStats: () => {}
  });
  vm.runInContext(renderer.slice(start, end), context);
  return {
    context,
    startSession: () => context.beginListeningSession(track),
    tick: (seconds) => {
      for (let i = 0; i < seconds; i += 1) context.tickListeningStatistics();
    },
    day: () => context.state.listeningStats.days['2026-09-07'],
    trackStats: () => context.state.listeningStats.days['2026-09-07']?.tracks[track.path],
    saved: () => JSON.parse(stored.get('listeningStats')).days['2026-09-07']
  };
}

test('two 60-second plays accumulate 120 seconds and two plays for the same track', () => {
  const player = createPlayer();
  for (let i = 0; i < 2; i += 1) {
    player.startSession();
    player.tick(60);
  }
  assert.equal(player.day().seconds, 120);
  assert.equal(player.trackStats().seconds, 120);
  assert.equal(player.trackStats().plays, 2);
  assert.equal(player.saved().tracks['C:\\Music\\a.mp3'].seconds, 120);
});

test('seconds after qualification are counted once across repeated sessions', () => {
  const player = createPlayer();
  player.startSession();
  player.tick(75);
  player.startSession();
  player.tick(90);
  assert.equal(player.day().seconds, 165);
  assert.equal(player.trackStats().seconds, 165);
  assert.equal(player.trackStats().plays, 2);
});

test('a qualified session adds to previously saved track statistics', () => {
  const player = createPlayer({
    '2026-09-07': {
      seconds: 180, plays: 1,
      tracks: { 'C:\\Music\\a.mp3': { title: 'Song A', seconds: 180, plays: 1, valid: true } }
    }
  });
  player.startSession();
  player.tick(60);
  assert.equal(player.day().seconds, 240);
  assert.equal(player.trackStats().seconds, 240);
  assert.equal(player.trackStats().plays, 2);
});

test('short sessions stay unqualified and pausing does not advance the threshold', () => {
  const player = createPlayer();
  player.startSession();
  player.tick(30);
  player.startSession();
  player.tick(59);
  assert.equal(player.trackStats(), undefined);
  player.context.audio.paused = true;
  player.tick(20);
  assert.equal(player.day().seconds, 89);
  assert.equal(player.trackStats(), undefined);
  player.context.audio.paused = false;
  player.tick(1);
  assert.equal(player.day().seconds, 90);
  assert.equal(player.trackStats().seconds, 60);
  assert.equal(player.trackStats().plays, 1);
});
