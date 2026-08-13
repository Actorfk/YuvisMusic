const primaryLine = document.querySelector('#primaryLine');
const secondaryLine = document.querySelector('#secondaryLine');
const songTitle = document.querySelector('#songTitle');
const songArtist = document.querySelector('#songArtist');
const lyricsShell = document.querySelector('.lyrics-shell');
const lockLyricsBtn = document.querySelector('#lockLyricsBtn');
const dragHint = document.querySelector('#dragHint');
const contextMenu = document.querySelector('#lyricsContextMenu');
const contextLockBtn = document.querySelector('#contextLockBtn');

let settings = { dualLine: true, locked: false, style: 'classic', primaryColor: '#ff3156', secondaryColor: '#ffffff' };
let currentPayload = null;
let boundsTimer = null;

function applyVisualSettings() {
  document.documentElement.style.setProperty('--primary-color', settings.primaryColor);
  document.documentElement.style.setProperty('--secondary-color', settings.secondaryColor);
  document.body.dataset.lyricStyle = settings.style;
}

function refreshContextMenu() {
  contextMenu.classList.toggle('locked-menu', settings.locked);
  contextLockBtn.querySelector('span').textContent = settings.locked ? '解锁桌面歌词' : '锁定桌面歌词';
  contextLockBtn.querySelector('kbd').textContent = settings.locked ? '解' : '锁';
  contextMenu.querySelectorAll('[data-context-style]').forEach((button) => {
    button.classList.toggle('active', button.dataset.contextStyle === settings.style);
  });
  contextMenu.querySelectorAll('[data-context-colors]').forEach((button) => {
    const [primaryColor, secondaryColor] = button.dataset.contextColors.split(',');
    button.classList.toggle('active', primaryColor === settings.primaryColor && secondaryColor === settings.secondaryColor);
  });
}

function closeContextMenu() {
  contextMenu.hidden = true;
}

function openContextMenu(event) {
  refreshContextMenu();
  contextMenu.hidden = false;
  contextMenu.classList.toggle('open-left', event.clientX > window.innerWidth - 330);
  contextMenu.style.left = '0px';
  contextMenu.style.top = '0px';
  const menuBounds = contextMenu.getBoundingClientRect();
  const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuBounds.width - 8));
  const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuBounds.height - 8));
  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
  contextMenu.classList.toggle('lower-submenus', top > 26);
}

function showBounds() {
  lyricsShell.classList.add('show-bounds');
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => lyricsShell.classList.remove('show-bounds'), 2800);
}

function renderLockState() {
  document.body.dataset.locked = String(settings.locked);
  lockLyricsBtn.classList.toggle('active', settings.locked);
  lockLyricsBtn.setAttribute('aria-label', settings.locked ? '解锁桌面歌词' : '锁定桌面歌词');
  lockLyricsBtn.title = settings.locked ? '解锁桌面歌词' : '锁定桌面歌词';
  document.querySelector('#lockLyricsIcon').textContent = settings.locked ? '解' : '锁';
  dragHint.textContent = settings.locked ? '桌面歌词已锁定 · 右击歌词可解锁' : 'Yuvis音乐 · 拖动调整位置';
  refreshContextMenu();
}

function setLocked(locked) {
  settings.locked = Boolean(locked);
  renderLockState();
  showBounds();
  window.desktopLyrics.setLocked(settings.locked);
}

function render() {
  const payload = currentPayload || {};
  primaryLine.textContent = payload.primary || '播放音乐后将在这里显示歌词';
  secondaryLine.textContent = payload.secondary || '支持双层歌词显示';
  secondaryLine.hidden = !settings.dualLine || !payload.secondary;
  songTitle.textContent = payload.title || 'Yuvis音乐';
  songArtist.textContent = payload.artist || '桌面歌词';
}

window.desktopLyrics.onUpdate((payload) => {
  currentPayload = payload;
  render();
});

window.desktopLyrics.onSettings((nextSettings) => {
  settings = { ...settings, ...nextSettings };
  applyVisualSettings();
  renderLockState();
  render();
});

lyricsShell.addEventListener('pointerdown', showBounds);
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  showBounds();
  openContextMenu(event);
});
contextMenu.addEventListener('pointerdown', (event) => event.stopPropagation());
contextMenu.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  event.stopPropagation();
});
contextLockBtn.addEventListener('click', () => {
  setLocked(!settings.locked);
  closeContextMenu();
});
contextMenu.addEventListener('click', (event) => {
  const styleButton = event.target.closest('[data-context-style]');
  if (styleButton) {
    settings.style = styleButton.dataset.contextStyle;
    applyVisualSettings();
    refreshContextMenu();
    window.desktopLyrics.setSettings({ style: settings.style });
    closeContextMenu();
    return;
  }
  const colorButton = event.target.closest('[data-context-colors]');
  if (!colorButton) return;
  [settings.primaryColor, settings.secondaryColor] = colorButton.dataset.contextColors.split(',');
  applyVisualSettings();
  refreshContextMenu();
  window.desktopLyrics.setSettings({
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor
  });
  closeContextMenu();
});
document.addEventListener('pointerdown', (event) => {
  if (!contextMenu.hidden && !contextMenu.contains(event.target)) closeContextMenu();
});
window.addEventListener('blur', closeContextMenu);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeContextMenu();
});
lockLyricsBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  setLocked(!settings.locked);
});
document.querySelector('#closeLyricsBtn').addEventListener('click', (event) => {
  event.stopPropagation();
  window.desktopLyrics.hide();
});
applyVisualSettings();
renderLockState();
render();
