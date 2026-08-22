const primaryLine = document.querySelector('#primaryLine');
const secondaryLine = document.querySelector('#secondaryLine');
const songTitle = document.querySelector('#songTitle');
const songArtist = document.querySelector('#songArtist');

let settings = { dualLine: true, fontSize: 'standard' };
let currentPayload = null;

function applySettings() {
  document.body.dataset.fontSize = settings.fontSize;
}

function render() {
  const payload = currentPayload || {};
  primaryLine.textContent = payload.primary || '播放音乐后将在这里显示歌词';
  secondaryLine.textContent = payload.secondary || '透明置顶 · 鼠标穿透';
  secondaryLine.hidden = !settings.dualLine || !payload.secondary;
  songTitle.textContent = payload.title || 'Yuvis音乐';
  songArtist.textContent = payload.artist || '游戏歌词';
}

window.gameLyrics.onUpdate((payload) => {
  currentPayload = payload;
  render();
});

window.gameLyrics.onSettings((nextSettings) => {
  settings = { ...settings, ...nextSettings };
  applySettings();
  render();
});

applySettings();
render();
