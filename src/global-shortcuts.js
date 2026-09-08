'use strict';

const { defaultKeyboardShortcuts, normalizeKeyboardShortcuts, backgroundShortcut, shortcutAccelerator } = require('./keyboard-shortcuts');

function createGlobalShortcutManager({ globalShortcut, isForeground, onAction, onStatus }) {
  let shortcuts = defaultKeyboardShortcuts();
  const owned = new Set();

  function release() {
    for (const accelerator of owned) globalShortcut.unregister(accelerator);
    owned.clear();
  }

  function refresh() {
    release();
    const status = {};
    const seen = new Set();
    for (const [action, shortcut] of Object.entries(shortcuts)) {
      const background = backgroundShortcut(shortcut);
      const accelerator = shortcutAccelerator(background);
      let error = '';
      if (!accelerator) error = '此按键不支持后台使用，请换一个组合键';
      else if (seen.has(accelerator)) error = '后台组合键与其他操作重复';
      else {
        seen.add(accelerator);
        try {
          if (globalShortcut.register(accelerator, () => {
            if (!isForeground()) onAction(action);
          })) owned.add(accelerator);
          else error = '后台注册失败，可能已被其他软件占用';
        } catch { error = '后台注册失败，请换一个组合键'; }
      }
      status[action] = { background, accelerator, error };
    }
    // Foreground keys use DOM handling, preserving typing, recording and repeat guards.
    if (isForeground()) release();
    onStatus(status);
    return status;
  }

  return {
    refresh,
    release,
    update(value) { shortcuts = normalizeKeyboardShortcuts(value); return refresh(); }
  };
}

module.exports = { createGlobalShortcutManager };
