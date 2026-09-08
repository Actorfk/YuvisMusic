const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultKeyboardShortcuts, normalizeKeyboardShortcuts, backgroundShortcut, shortcutAccelerator } = require('../src/keyboard-shortcuts');
const { createGlobalShortcutManager } = require('../src/global-shortcuts');

function fixture() {
  const registered = new Map();
  const blocked = new Set();
  const actions = [];
  let foreground = false;
  let status;
  const manager = createGlobalShortcutManager({
    globalShortcut: {
      register(key, callback) {
        if (key === 'Control+Alt+F24') throw new Error('Unsupported');
        if (blocked.has(key) || registered.has(key)) return false;
        registered.set(key, callback);
        return true;
      },
      unregister(key) { registered.delete(key); }
    },
    isForeground: () => foreground,
    onAction: (action) => actions.push(action),
    onStatus: (value) => { status = value; }
  });
  return { manager, registered, blocked, actions, setForeground(value) { foreground = value; }, get status() { return status; } };
}

test('background shortcuts preserve regular typing and map supported accelerator keys', () => {
  const shortcuts = defaultKeyboardShortcuts();
  assert.equal(shortcutAccelerator(shortcuts.togglePlayback), 'Space');
  assert.equal(shortcutAccelerator(backgroundShortcut(shortcuts.togglePlayback)), 'Control+Alt+Space');
  assert.equal(shortcutAccelerator(backgroundShortcut(shortcuts.previous)), 'Control+Left');
  assert.equal(shortcutAccelerator(shortcuts.closeGameLyrics), 'Control+Alt+Shift+L');
  assert.equal(shortcutAccelerator(backgroundShortcut({ code: 'KeyP' })), 'Control+Alt+P');
  assert.equal(shortcutAccelerator(backgroundShortcut({ code: 'F8' })), 'F8');
  assert.equal(shortcutAccelerator({ code: 'Numpad3', ctrl: true }), 'Control+num3');
  assert.equal(shortcutAccelerator({ code: 'UnknownKey' }), null);
});

test('older saved shortcuts survive addition of close-game-lyrics even when its default is occupied', () => {
  const old = defaultKeyboardShortcuts();
  old.search = { ...old.closeGameLyrics };
  delete old.closeGameLyrics;
  const migrated = normalizeKeyboardShortcuts(old);
  assert.deepEqual(migrated.search, old.search);
  assert.equal(shortcutAccelerator(migrated.closeGameLyrics), 'Control+Alt+L');
  assert.deepEqual(normalizeKeyboardShortcuts(migrated), migrated);
  assert.deepEqual(normalizeKeyboardShortcuts(null), defaultKeyboardShortcuts());
});

test('background actions register once, foreground releases them, stale callbacks cannot double-fire', () => {
  const f = fixture();
  f.manager.refresh();
  assert.equal(f.registered.size, 5);
  const callback = f.registered.get('Control+Alt+Space');
  callback();
  f.registered.get('Control+Alt+Shift+L')();
  assert.deepEqual(f.actions, ['togglePlayback', 'closeGameLyrics']);
  f.setForeground(true);
  f.manager.refresh();
  assert.equal(f.registered.size, 0);
  callback();
  assert.equal(f.actions.length, 2);
  f.setForeground(false);
  f.manager.refresh();
  assert.equal(f.registered.size, 5);
  assert.equal(f.status.togglePlayback.error, '');
});

test('rebind, reset and shutdown release only registrations owned by the player', () => {
  const f = fixture();
  f.registered.set('Control+F12', () => {});
  f.manager.refresh();
  const updated = defaultKeyboardShortcuts();
  updated.closeGameLyrics.code = 'KeyJ';
  f.manager.update(updated);
  assert.equal(f.registered.has('Control+Alt+Shift+L'), false);
  f.registered.get('Control+Alt+Shift+J')();
  assert.deepEqual(f.actions, ['closeGameLyrics']);
  f.manager.update(defaultKeyboardShortcuts());
  assert.equal(f.registered.has('Control+Alt+Shift+J'), false);
  assert.equal(f.registered.has('Control+Alt+Shift+L'), true);
  f.manager.release();
  assert.deepEqual([...f.registered.keys()], ['Control+F12']);
});

test('occupied, unsupported and duplicate background keys report failures without blocking other actions', () => {
  const f = fixture();
  f.blocked.add('Control+Left');
  const shortcuts = defaultKeyboardShortcuts();
  shortcuts.search = { ...shortcuts.togglePlayback, ctrl: true, alt: true };
  shortcuts.closeGameLyrics.code = 'F24';
  shortcuts.closeGameLyrics.shift = false;
  f.manager.update(shortcuts);
  assert.match(f.status.previous.error, /占用/);
  assert.match(f.status.search.error, /重复/);
  assert.match(f.status.closeGameLyrics.error, /注册失败/);
  assert.equal(f.status.next.error, '');
  shortcuts.closeGameLyrics.code = 'UnknownKey';
  f.manager.update(shortcuts);
  assert.match(f.status.closeGameLyrics.error, /不支持/);
  f.blocked.clear();
  f.manager.refresh();
  assert.equal(f.status.previous.error, '');
});
