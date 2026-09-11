const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizePlaybackSession, resolvePlaybackSession, restoredPlaybackPosition } = require('../src/playback-session');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const a = { id: 'a', path: 'C:\\Music\\A.wav' };
const b = { id: 'b', path: 'C:\\Music\\B.wav' };

test('invalid saved sessions are ignored and duplicate paths retain their first queue position', () => {
  for (const value of [null, {}, [], { version: 2 }]) assert.equal(normalizePlaybackSession(value), null);
  const saved = normalizePlaybackSession({ version: 1, queuePaths: [b.path, null, ' ', a.path, 'c:/music/b.wav'], currentPath: 7, position: Infinity });
  assert.deepEqual(saved, { version: 1, queuePaths: [b.path, a.path], currentPath: null, position: 0 });
});

test('restore preserves order and an empty queue, skips missing files, and keeps current song independent', () => {
  const saved = { version: 1, queuePaths: [b.path, 'C:/missing.wav', a.path], currentPath: 'c:/music/a.wav', position: 12.5 };
  assert.deepEqual(resolvePlaybackSession(saved, [a, b]), { queue: [b, a], currentTrack: a, position: 12.5 });
  assert.deepEqual(resolvePlaybackSession({ ...saved, queuePaths: [] }, [a, b]).queue, []);
  assert.equal(resolvePlaybackSession({ ...saved, currentPath: 'C:/missing.wav' }, [a, b]).currentTrack, null);
});

test('resume positions retain fractions and completed or invalid positions restart safely', () => {
  assert.equal(restoredPlaybackPosition(12.75, 60), 12.75);
  for (const position of [-1, NaN, Infinity, 60, 1000]) assert.equal(restoredPlaybackPosition(position, 60), 0);
  assert.equal(restoredPlaybackPosition(10, NaN), 0);
});

function persistenceContext() {
  const stored = new Map();
  let now = 10000;
  const context = vm.createContext({
    state: { queue: [b, a] }, audio: { currentTime: 2 },
    currentTrack: () => a,
    playbackSessionReady: false, playbackSessionChanged: false,
    pendingPlaybackSeek: null, lastPlaybackPersistAt: 0, lastPlaybackSnapshot: '',
    Date: { now: () => now }, console,
    localStorage: { setItem: (key, value) => stored.set(key, value) }
  });
  vm.runInContext(renderer.slice(renderer.indexOf('function persistPlaybackSession('), renderer.indexOf('function commitPlaybackQueue(')), context);
  return { context, stored, advance: (ms) => { now += ms; }, saved: () => JSON.parse(stored.get('playbackSession')) };
}

test('startup saves cannot erase the old session; pending seeks survive quick close and periodic writes are throttled', () => {
  const player = persistenceContext();
  player.context.persistPlaybackSession();
  assert.equal(player.stored.size, 0);
  player.context.playbackSessionReady = true;
  player.context.pendingPlaybackSeek = { trackId: a.id, position: 42 };
  player.context.persistPlaybackSession();
  assert.equal(player.saved().position, 42);
  player.context.pendingPlaybackSeek = null;
  player.context.audio.currentTime = 43;
  player.advance(1000);
  player.context.persistPlaybackSession({ force: false });
  assert.equal(player.saved().position, 42);
  player.advance(4000);
  player.context.persistPlaybackSession({ force: false });
  assert.equal(player.saved().position, 43);
  player.context.audio.currentTime = 44;
  player.context.persistPlaybackSession();
  assert.equal(player.saved().position, 44);
  player.context.currentTrack = () => null;
  player.context.state.queue = [];
  player.context.persistPlaybackSession({ userAction: true });
  assert.equal(player.saved().currentPath, null);
  assert.deepEqual(player.saved().queuePaths, []);
});

test('imports and user playback during startup survive a late library restore', async () => {
  let finishRestore;
  let restoredPlayback = false;
  const stored = new Map();
  const context = vm.createContext({
    state: { library: [], queue: [] }, startupLibraryPaths: [a.path],
    savedPlaybackSession: { version: 1, queuePaths: [a.path], currentPath: a.path, position: 10 },
    libraryRestoring: true, playbackSessionReady: false, playbackSessionChanged: false,
    window: { desktop: { restoreTracks: () => new Promise((resolve) => { finishRestore = resolve; }) } },
    loadAssistantConfig: async () => {}, console, resolvePlaybackSession,
    trackPathKey: (value) => value.toLowerCase(),
    setLibrary: (tracks) => { context.state.library = tracks; },
    loadTrack: () => { restoredPlayback = true; },
    localStorage: { setItem: (key, value) => stored.set(key, value) }
  });
  for (const name of ['syncKeyboardShortcuts', 'applyAppearanceSettings', 'applyFullscreenLyricsSettings', 'applyNowPlayingStyle', 'applyPlaybackSettings', 'applyEqualizerSettings', 'applyDesktopLyricsSettings', 'applyGameLyricsSettings', 'renderView', 'renderQueue', 'updateStats']) context[name] = () => {};
  vm.runInContext(renderer.slice(renderer.indexOf('function persistLibrary('), renderer.indexOf('function persistPlaybackSession(')), context);
  vm.runInContext(renderer.slice(renderer.indexOf('async function init()'), renderer.lastIndexOf('\ninit();')), context);
  const initializing = context.init();
  context.state.library = [b];
  context.state.queue = [b];
  context.playbackSessionChanged = true;
  context.persistLibrary();
  assert.deepEqual(JSON.parse(stored.get('libraryPaths')), [a.path, b.path]);
  finishRestore([a]);
  await initializing;
  assert.deepEqual(Array.from(context.state.library), [a, b]);
  assert.deepEqual(context.state.queue, [b]);
  assert.equal(restoredPlayback, false);
  assert.equal(context.playbackSessionReady, true);
});
