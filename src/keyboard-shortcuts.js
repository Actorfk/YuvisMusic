(function exposeKeyboardShortcuts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YuvisKeyboardShortcuts = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const SHORTCUT_ACTIONS = {
    previous: { label: '上一曲', defaultShortcut: { code: 'ArrowLeft', ctrl: true, alt: false, shift: false, meta: false } },
    togglePlayback: { label: '播放 / 暂停', defaultShortcut: { code: 'Space', ctrl: false, alt: false, shift: false, meta: false } },
    next: { label: '下一曲', defaultShortcut: { code: 'ArrowRight', ctrl: true, alt: false, shift: false, meta: false } },
    search: { label: '聚焦搜索', defaultShortcut: { code: 'KeyK', ctrl: true, alt: false, shift: false, meta: false } },
    // Retain the saved action ID so existing custom bindings continue to work.
    closeGameLyrics: { label: '开启 / 关闭游戏歌词', defaultShortcut: { code: 'KeyL', ctrl: true, alt: true, shift: true, meta: false } }
  };

  function shortcutSignature(shortcut) {
    return [shortcut.ctrl ? '1' : '0', shortcut.alt ? '1' : '0', shortcut.shift ? '1' : '0', shortcut.meta ? '1' : '0', shortcut.code].join(':');
  }

  function normalizeShortcut(value, fallback) {
    if (typeof value?.code !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(value.code)) return { ...fallback };
    return { code: value.code, ctrl: Boolean(value.ctrl), alt: Boolean(value.alt), shift: Boolean(value.shift), meta: Boolean(value.meta) };
  }

  function defaultKeyboardShortcuts() {
    return Object.fromEntries(Object.entries(SHORTCUT_ACTIONS).map(([action, config]) => [action, { ...config.defaultShortcut }]));
  }

  function normalizeKeyboardShortcuts(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const shortcuts = Object.fromEntries(Object.entries(SHORTCUT_ACTIONS).map(([action, config]) => [action, normalizeShortcut(source[action], config.defaultShortcut)]));
    // Adding an action must not reset shortcuts saved by earlier versions.
    if (!source.closeGameLyrics) {
      const used = new Set(Object.entries(shortcuts).filter(([action]) => action !== 'closeGameLyrics').map(([, shortcut]) => shortcutAccelerator(backgroundShortcut(shortcut))));
      const candidates = [shortcuts.closeGameLyrics, { ...shortcuts.closeGameLyrics, shift: !shortcuts.closeGameLyrics.shift }, ...Array.from({ length: 12 }, (_, index) => ({ ...shortcuts.closeGameLyrics, code: `F${index + 1}` }))];
      shortcuts.closeGameLyrics = candidates.find((shortcut) => !used.has(shortcutAccelerator(backgroundShortcut(shortcut))));
    }
    const signatures = Object.values(shortcuts).map(shortcutSignature);
    return new Set(signatures).size === signatures.length ? shortcuts : defaultKeyboardShortcuts();
  }

  function backgroundShortcut(shortcut) {
    // Bare typing/navigation keys remain local; add modifiers for background use.
    if (!shortcut.ctrl && !shortcut.alt && !shortcut.meta && !/^F([1-9]|1\d|2[0-4])$/.test(shortcut.code)) {
      return { ...shortcut, ctrl: true, alt: true };
    }
    return { ...shortcut };
  }

  function shortcutAccelerator(shortcut) {
    const keys = {
      Space: 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
      Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
      Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Escape: 'Escape',
      Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
      Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
      NumpadDecimal: 'numdec', NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv'
    };
    let key = keys[shortcut.code];
    if (/^Key[A-Z]$/.test(shortcut.code)) key = shortcut.code.slice(3);
    else if (/^Digit[0-9]$/.test(shortcut.code)) key = shortcut.code.slice(5);
    else if (/^Numpad[0-9]$/.test(shortcut.code)) key = `num${shortcut.code.slice(6)}`;
    else if (/^F([1-9]|1\d|2[0-4])$/.test(shortcut.code)) key = shortcut.code;
    if (!key) return null;
    return [shortcut.ctrl && 'Control', shortcut.alt && 'Alt', shortcut.shift && 'Shift', shortcut.meta && 'Super', key].filter(Boolean).join('+');
  }

  return { SHORTCUT_ACTIONS, shortcutSignature, defaultKeyboardShortcuts, normalizeKeyboardShortcuts, backgroundShortcut, shortcutAccelerator };
}));
