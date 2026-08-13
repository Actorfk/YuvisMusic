const primaryLine = document.querySelector('#primaryLine');
const secondaryLine = document.querySelector('#secondaryLine');
const songTitle = document.querySelector('#songTitle');
const songArtist = document.querySelector('#songArtist');
const lyricsShell = document.querySelector('.lyrics-shell');
const lockLyricsBtn = document.querySelector('#lockLyricsBtn');
const dragHint = document.querySelector('#dragHint');

let settings = { dualLine: true, locked: false, style: 'classic', primaryColor: '#ff3156', secondaryColor: '#ffffff' };
let currentPayload = null;
let boundsTimer = null;

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
  document.documentElement.style.setProperty('--primary-color', settings.primaryColor);
  document.documentElement.style.setProperty('--secondary-color', settings.secondaryColor);
  document.body.dataset.lyricStyle = settings.style;
  renderLockState();
  render();
});

lyricsShell.addEventListener('pointerdown', showBounds);
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  showBounds();
  if (settings.locked) setLocked(false);
});
lockLyricsBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  setLocked(!settings.locked);
});
document.querySelector('#closeLyricsBtn').addEventListener('click', (event) => {
  event.stopPropagation();
  window.desktopLyrics.hide();
});
document.body.dataset.lyricStyle = settings.style;
renderLockState();
render();
