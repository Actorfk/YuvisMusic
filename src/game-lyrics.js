const primaryLine = document.querySelector('#primaryLine');
const secondaryLine = document.querySelector('#secondaryLine');
const secondaryViewport = document.querySelector('#secondaryViewport');
const songTitle = document.querySelector('#songTitle');
const songArtist = document.querySelector('#songArtist');
const lyricsShell = document.querySelector('.game-lyrics-shell');
const contextMenu = document.querySelector('#lyricsContextMenu');
const contextLockBtn = document.querySelector('#contextLockBtn');
const contextCloseBtn = document.querySelector('#contextCloseBtn');

let settings = { dualLine: true, fontSize: 'standard', locked: false, side: 'left' };
let currentPayload = null;
let dragPointerId = null;
let pendingDragPoint = null;
let dragFrame = null;

function applySettings() {
  if (settings.locked) {
    closeContextMenu();
    endDrag();
  }
  document.body.dataset.fontSize = settings.fontSize;
  document.body.dataset.locked = String(settings.locked);
  document.body.dataset.side = settings.side;
  document.querySelector('.drag-hint').textContent = settings.locked
    ? '游戏歌词已锁定 · 在设置中解锁'
    : '拖动后自动吸附左右边缘 · 右击锁定';
  contextLockBtn.querySelector('span').textContent = settings.locked ? '解锁游戏歌词' : '锁定游戏歌词';
  contextLockBtn.querySelector('kbd').textContent = settings.locked ? '解' : '锁';
  contextMenu.querySelectorAll('[data-snap-side]').forEach((button) => {
    button.classList.toggle('active', button.dataset.snapSide === settings.side);
  });
}

function rollLine(element, nextText) {
  if (element.textContent === nextText) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = nextText;
    return;
  }
  const viewport = element.parentElement;
  viewport.querySelectorAll('.lyric-ghost').forEach((ghost) => ghost.remove());
  const outgoing = element.cloneNode(true);
  outgoing.removeAttribute('id');
  outgoing.classList.add('lyric-ghost');
  viewport.append(outgoing);
  element.textContent = nextText;
  const outgoingAnimation = outgoing.animate([
    { opacity: 1, transform: 'translateY(0)' },
    { opacity: 0, transform: 'translateY(-72%)' }
  ], { duration: 420, easing: 'cubic-bezier(.22,.72,.2,1)' });
  element.animate([
    { opacity: 0, transform: 'translateY(72%)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 460, easing: 'cubic-bezier(.16,.82,.22,1)' });
  outgoingAnimation.finished.catch(() => {}).finally(() => outgoing.remove());
}

function render({ animate = true } = {}) {
  const payload = currentPayload || {};
  const primaryText = payload.primary || '播放音乐后将在这里显示歌词';
  const secondaryText = payload.secondary || '透明置顶 · 左右吸附';
  if (animate) {
    rollLine(primaryLine, primaryText);
    rollLine(secondaryLine, secondaryText);
  } else {
    primaryLine.textContent = primaryText;
    secondaryLine.textContent = secondaryText;
  }
  secondaryViewport.hidden = !settings.dualLine || !payload.secondary;
  songTitle.textContent = payload.title || 'Yuvis音乐';
  songArtist.textContent = payload.artist || '游戏歌词';
}

function closeContextMenu() {
  contextMenu.hidden = true;
}

function openContextMenu(event) {
  contextMenu.hidden = false;
  contextMenu.style.left = '0px';
  contextMenu.style.top = '0px';
  const bounds = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
  contextMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
}

function endDrag(event) {
  if (event && event.pointerId !== dragPointerId) return;
  if (dragPointerId === null) return;
  if (lyricsShell.hasPointerCapture(dragPointerId)) lyricsShell.releasePointerCapture(dragPointerId);
  dragPointerId = null;
  pendingDragPoint = null;
  document.body.classList.remove('dragging');
  if (dragFrame) cancelAnimationFrame(dragFrame);
  dragFrame = null;
  window.gameLyrics.endDrag();
}

window.gameLyrics.onUpdate((payload) => {
  currentPayload = payload;
  render();
});

window.gameLyrics.onSettings((nextSettings) => {
  settings = { ...settings, ...nextSettings };
  applySettings();
  render({ animate: false });
});

lyricsShell.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || settings.locked || event.target.closest('button')) return;
  closeContextMenu();
  dragPointerId = event.pointerId;
  lyricsShell.setPointerCapture(event.pointerId);
  document.body.classList.add('dragging');
  window.gameLyrics.startDrag({ x: event.screenX, y: event.screenY });
});
lyricsShell.addEventListener('pointermove', (event) => {
  if (event.pointerId !== dragPointerId) return;
  pendingDragPoint = { x: event.screenX, y: event.screenY };
  if (dragFrame) return;
  dragFrame = requestAnimationFrame(() => {
    dragFrame = null;
    if (pendingDragPoint) window.gameLyrics.moveDrag(pendingDragPoint);
    pendingDragPoint = null;
  });
});
lyricsShell.addEventListener('pointerup', endDrag);
lyricsShell.addEventListener('pointercancel', endDrag);

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (settings.locked) return;
  endDrag();
  openContextMenu(event);
});
contextMenu.addEventListener('pointerdown', (event) => event.stopPropagation());
contextMenu.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  event.stopPropagation();
});
contextLockBtn.addEventListener('click', () => {
  settings.locked = !settings.locked;
  applySettings();
  window.gameLyrics.setLocked(settings.locked);
  closeContextMenu();
});
contextMenu.addEventListener('click', (event) => {
  const sideButton = event.target.closest('[data-snap-side]');
  if (!sideButton) return;
  settings.side = sideButton.dataset.snapSide;
  applySettings();
  window.gameLyrics.snapSide(settings.side);
  closeContextMenu();
});
contextCloseBtn.addEventListener('click', () => {
  closeContextMenu();
  window.gameLyrics.hide();
});
document.addEventListener('pointerdown', (event) => {
  if (!contextMenu.hidden && !contextMenu.contains(event.target)) closeContextMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeContextMenu();
});
window.addEventListener('blur', () => {
  closeContextMenu();
  endDrag();
});

applySettings();
render({ animate: false });
