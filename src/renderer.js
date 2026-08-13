const $ = (selector) => document.querySelector(selector);
const audio = $('#audio');

const APPEARANCE_THEMES = {
  crimson: { color: '#cf0a2c', bright: '#e11436', soft: '#fff0f2', rgb: '207, 10, 44' },
  indigo: { color: '#5b55c7', bright: '#7068db', soft: '#f0efff', rgb: '91, 85, 199' },
  ocean: { color: '#147d92', bright: '#1795ad', soft: '#eaf8fa', rgb: '20, 125, 146' },
  jade: { color: '#27805f', bright: '#319d76', soft: '#eaf8f1', rgb: '39, 128, 95' },
  amber: { color: '#b56a14', bright: '#d17c19', soft: '#fff6e8', rgb: '181, 106, 20' },
  rose: { color: '#bd3f70', bright: '#d44d83', soft: '#fff0f6', rgb: '189, 63, 112' }
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

const savedAppSettings = readStorage('appSettings', {});
const savedDesktopLyricsSettings = savedAppSettings.desktopLyrics || readStorage('desktopLyricsSettings', {});
const savedAppearanceSettings = savedAppSettings.appearance || {};
const savedVolume = Number(savedAppSettings.volume ?? .8);

const state = {
  library: [],
  queue: [],
  currentId: null,
  favorites: new Set(readStorage('favorites', [])),
  history: readStorage('history', []),
  playlists: readStorage('playlists', []),
  lyricFiles: readStorage('lyricFiles', {}),
  lyricOffsets: readStorage('lyricOffsets', {}),
  currentLyrics: null,
  activeLyricIndex: -1,
  lyricAnimationFrame: null,
  lyricsDragging: false,
  lyricManualScrollUntil: 0,
  volume: Number.isFinite(savedVolume) ? Math.max(0, Math.min(1, savedVolume)) : .8,
  muted: Boolean(savedAppSettings.muted),
  desktopLyricsSettings: {
    enabled: Boolean(savedDesktopLyricsSettings.enabled),
    dualLine: savedDesktopLyricsSettings.dualLine !== false,
    locked: Boolean(savedDesktopLyricsSettings.locked),
    style: ['plain', 'classic', 'outline', 'soft'].includes(savedDesktopLyricsSettings.style) ? savedDesktopLyricsSettings.style : 'classic',
    primaryColor: /^#[0-9a-f]{6}$/i.test(savedDesktopLyricsSettings.primaryColor) ? savedDesktopLyricsSettings.primaryColor : '#ff3156',
    secondaryColor: /^#[0-9a-f]{6}$/i.test(savedDesktopLyricsSettings.secondaryColor) ? savedDesktopLyricsSettings.secondaryColor : '#ffffff'
  },
  appearanceSettings: {
    theme: Object.hasOwn(APPEARANCE_THEMES, savedAppearanceSettings.theme) ? savedAppearanceSettings.theme : 'crimson'
  },
  playerOpen: false,
  playerCloseTimer: null,
  activePlaylistId: null,
  pendingTrackId: null,
  view: 'library',
  search: '',
  sortAscending: true,
  shuffle: Boolean(savedAppSettings.shuffle),
  repeat: ['off', 'all', 'one'].includes(savedAppSettings.repeat) ? savedAppSettings.repeat : 'off',
  settingsSection: 'playback',
  listeningSeconds: Number(localStorage.getItem('listeningSeconds') || 0),
  listeningStats: readStorage('listeningStats', { days: {} }),
  listeningSession: null,
  listeningPersistTicks: 0
};

const viewNames = {
  library: ['你的私人音乐空间', '音乐库', '全部音乐'],
  favorite: ['珍藏每一次心动', '我的喜欢', '喜欢的音乐'],
  recent: ['让熟悉的旋律再次响起', '最近播放', '播放记录'],
  stats: ['听见你的音乐轨迹', '统计数据', '音乐概览']
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes) return '0 MB';
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes > 100 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(seconds) {
  const totalMinutes = Math.floor((Number(seconds) || 0) / 60);
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
}

function formatListeningDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes < 60) return minutes ? `${minutes} 分 ${remainingSeconds} 秒` : `${remainingSeconds} 秒`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} 小时 ${remainingMinutes} 分` : `${hours} 小时`;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function periodStart(period, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  } else if (period === 'month') {
    start.setDate(1);
  } else if (period === 'year') {
    start.setMonth(0, 1);
  }
  return start;
}

function aggregateListeningPeriod(period) {
  const startKey = localDateKey(periodStart(period));
  const endKey = localDateKey();
  const result = { seconds: 0, plays: 0, tracks: new Set() };
  Object.entries(state.listeningStats?.days || {}).forEach(([dateKey, day]) => {
    if (dateKey < startKey || dateKey > endKey) return;
    result.seconds += Number(day.seconds) || 0;
    result.plays += Number(day.plays) || 0;
    Object.entries(day.tracks || {}).forEach(([trackKey, track]) => {
      if (track.valid || (Number(track.seconds) || 0) >= 60 || (Number(track.plays) || 0) > 0) result.tracks.add(trackKey);
    });
  });
  return { seconds: result.seconds, plays: result.plays, trackCount: result.tracks.size };
}

function totalListeningSeconds() {
  return Object.values(state.listeningStats?.days || {}).reduce((sum, day) => sum + (Number(day.seconds) || 0), 0);
}

function beginListeningSession(track) {
  state.listeningSession = track ? {
    trackId: track.id,
    trackKey: track.path || track.id,
    title: track.title || '未知歌曲',
    seconds: 0,
    valid: false
  } : null;
}

function currentListeningDay() {
  const session = state.listeningSession;
  if (!session) return null;
  if (!state.listeningStats || typeof state.listeningStats !== 'object') state.listeningStats = { days: {} };
  if (!state.listeningStats.days || typeof state.listeningStats.days !== 'object') state.listeningStats.days = {};
  const dateKey = localDateKey();
  const day = state.listeningStats.days[dateKey] || { seconds: 0, plays: 0, tracks: {} };
  if (!day.tracks || typeof day.tracks !== 'object') day.tracks = {};
  state.listeningStats.days[dateKey] = day;
  return day;
}

function persistListeningStats(force = false) {
  state.listeningPersistTicks += 1;
  if (force || state.listeningPersistTicks >= 5) {
    localStorage.setItem('listeningStats', JSON.stringify(state.listeningStats));
    state.listeningPersistTicks = 0;
  }
}

function recordListeningSecond() {
  const session = state.listeningSession;
  const day = currentListeningDay();
  if (!session || !day) return;
  day.seconds += 1;
  if (session.valid) {
    const track = day.tracks[session.trackKey] || { title: session.title, seconds: 0, plays: 0, valid: true };
    track.title = session.title;
    track.valid = true;
    track.seconds += 1;
    day.tracks[session.trackKey] = track;
  }
  persistListeningStats();
}

function markListeningSessionValid() {
  const session = state.listeningSession;
  const day = currentListeningDay();
  if (!session || !day) return;
  const track = day.tracks[session.trackKey] || { title: session.title, seconds: 0, plays: 0, valid: true };
  track.title = session.title;
  track.valid = true;
  track.seconds = Math.max(Number(track.seconds) || 0, session.seconds);
  track.plays += 1;
  day.plays += 1;
  day.tracks[session.trackKey] = track;
  persistListeningStats(true);
}

function tickListeningStatistics() {
  if (audio.paused || !state.currentId) return;
  const track = currentTrack();
  if (!track) return;
  if (!state.listeningSession || state.listeningSession.trackId !== track.id) beginListeningSession(track);
  const session = state.listeningSession;
  session.seconds += 1;
  recordListeningSecond();
  if (!session.valid && session.seconds >= 60) {
    session.valid = true;
    markListeningSessionValid();
  }
  updateStats();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function coverStyle(track) {
  return track?.cover ? `data-cover-id="${escapeHtml(track.id)}"` : '';
}

function applyCoverImages(root = document) {
  root.querySelectorAll('[data-cover-id]').forEach((element) => {
    const track = state.library.find((item) => item.id === element.dataset.coverId);
    if (track?.cover) element.style.backgroundImage = `url("${track.cover}")`;
  });
}

function persistLibrary() {
  localStorage.setItem('libraryPaths', JSON.stringify(state.library.map((track) => track.path)));
}

function persistPlaylists() {
  localStorage.setItem('playlists', JSON.stringify(state.playlists));
}

function persistLyricFiles() {
  localStorage.setItem('lyricFiles', JSON.stringify(state.lyricFiles));
}

function persistLyricOffsets() {
  localStorage.setItem('lyricOffsets', JSON.stringify(state.lyricOffsets));
}

function currentLyricOffset() {
  const track = currentTrack();
  const value = Number(track ? state.lyricOffsets[track.path] : 0);
  return Number.isFinite(value) ? Math.max(-10, Math.min(10, value)) : 0;
}

function updateLyricsOffsetUI() {
  const track = currentTrack();
  const offset = currentLyricOffset();
  $('#lyricsOffsetControl').classList.toggle('disabled', !track);
  $('#lyricsOffsetValue').textContent = `${offset > 0 ? '+' : offset < 0 ? '−' : ''}${Math.abs(offset).toFixed(1)}s`;
  $('#lyricsOffsetValue').title = offset === 0 ? '当前没有微调' : `${offset < 0 ? '提前' : '延后'} ${Math.abs(offset).toFixed(1)} 秒，点击重置`;
}

function adjustLyricsOffset(delta, reset = false) {
  const track = currentTrack();
  if (!track) return showToast('请先播放一首音乐');
  const nextOffset = reset ? 0 : Math.max(-10, Math.min(10, Math.round((currentLyricOffset() + delta) * 10) / 10));
  if (nextOffset === 0) delete state.lyricOffsets[track.path];
  else state.lyricOffsets[track.path] = nextOffset;
  persistLyricOffsets();
  updateLyricsOffsetUI();
  state.activeLyricIndex = -1;
  updateLyricPosition(audio.currentTime, true);
  showToast(nextOffset === 0 ? '歌词微调已重置' : `歌词已${nextOffset < 0 ? '提前' : '延后'} ${Math.abs(nextOffset).toFixed(1)} 秒`);
}

function splitLyricText(value) {
  const parts = String(value || '').split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return { text: parts[0], translation: parts.slice(1).join(' · ') };
  const inlineParts = (parts[0] || '').split(/\s*(?:\|\||｜)\s*/).filter(Boolean);
  return { text: inlineParts[0] || '♪', translation: inlineParts.slice(1).join(' · ') };
}

function consolidateTimedLyrics(lines) {
  const grouped = [];
  [...lines].sort((a, b) => a.time - b.time).forEach((line) => {
    const split = splitLyricText(line.text);
    const previous = grouped[grouped.length - 1];
    if (previous && Math.abs(previous.time - line.time) < .05) {
      if (!previous.translation && split.text !== previous.text) previous.translation = split.text;
      if (!previous.translation && split.translation) previous.translation = split.translation;
      return;
    }
    grouped.push({ time: line.time, text: split.text, translation: split.translation || '' });
  });
  return grouped;
}

function parseLyrics(lyrics) {
  if (!lyrics) return null;
  if (Array.isArray(lyrics.syncedLines) && lyrics.syncedLines.length) {
    return {
      source: lyrics.source,
      path: lyrics.path,
      synced: true,
      lines: consolidateTimedLyrics(lyrics.syncedLines
        .filter((line) => Number.isFinite(line.time))
        .map((line) => ({ time: line.time, text: line.text?.trim() || '♪' }))
      )
    };
  }

  const text = String(lyrics.text || '').replace(/\r/g, '');
  if (!text.trim()) return null;
  const offsetMatch = text.match(/^\[offset:([+-]?\d+)]/im);
  const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const timedLines = [];
  for (const rawLine of text.split('\n')) {
    const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g)];
    if (!timestamps.length) continue;
    const lyricText = rawLine.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g, '').trim() || '♪';
    for (const match of timestamps) {
      const fraction = match[3] ? Number(match[3]) / (match[3].length === 3 ? 1000 : match[3].length === 2 ? 100 : 10) : 0;
      timedLines.push({ time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + fraction + offset), text: lyricText });
    }
  }
  if (timedLines.length) {
    return { source: lyrics.source, path: lyrics.path, synced: true, lines: consolidateTimedLyrics(timedLines) };
  }
  const lines = text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\[(ar|ti|al|by|offset):/i.test(line))
    .map((line) => ({ time: null, ...splitLyricText(line) }));
  return lines.length ? { source: lyrics.source, path: lyrics.path, synced: false, lines } : null;
}

function lyricSourceLabel(lyrics) {
  if (!lyrics) return '暂无歌词';
  if (lyrics.source === 'file') return `指定文件 · ${lyrics.path?.split(/[\\/]/).pop() || '歌词'}`;
  if (lyrics.source === 'sidecar') return '同名歌词文件';
  return lyrics.synced ? '内嵌同步歌词' : '内嵌歌词';
}

function persistAppSettings() {
  localStorage.setItem('appSettings', JSON.stringify({
    volume: state.volume,
    muted: state.muted,
    shuffle: state.shuffle,
    repeat: state.repeat,
    desktopLyrics: state.desktopLyricsSettings,
    appearance: {
      theme: state.appearanceSettings.theme
    }
  }));
}

function renderAppearanceSettings() {
  const settings = state.appearanceSettings;
  $('#appearanceThemeOptions').querySelectorAll('[data-theme]').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === settings.theme);
  });
}

function applyAppearanceSettings({ persist = true } = {}) {
  const settings = state.appearanceSettings;
  const theme = APPEARANCE_THEMES[settings.theme] || APPEARANCE_THEMES.crimson;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--accent', theme.color);
  rootStyle.setProperty('--accent-bright', theme.bright);
  rootStyle.setProperty('--accent-soft', theme.soft);
  rootStyle.setProperty('--accent-rgb', theme.rgb);
  if (persist) persistAppSettings();
  renderAppearanceSettings();
}

function desktopLyricsPayload(index = state.activeLyricIndex) {
  const track = currentTrack();
  const lyrics = state.currentLyrics;
  const lineIndex = index >= 0 ? index : 0;
  const line = lyrics?.lines[lineIndex];
  const nextLine = lyrics?.lines[lineIndex + 1];
  return {
    title: track?.title || 'Yuvis音乐',
    artist: track?.artist || '桌面歌词',
    primary: line?.text || (track ? track.title : '播放音乐后将在这里显示歌词'),
    secondary: line?.translation || nextLine?.text || (track && !lyrics ? '暂无同步歌词' : '')
  };
}

function updateDesktopLyrics(index = state.activeLyricIndex) {
  window.desktop.updateDesktopLyrics(desktopLyricsPayload(index));
}

function renderDesktopLyricsSettings() {
  const settings = state.desktopLyricsSettings;
  $('#desktopLyricsBtn').classList.toggle('active', settings.enabled);
  $('#desktopLyricsBtn').setAttribute('aria-pressed', String(settings.enabled));
  $('#desktopLyricsBtn').setAttribute('aria-label', settings.enabled ? '关闭桌面歌词' : '开启桌面歌词');
  $('#desktopLyricsEnabledInput').checked = settings.enabled;
  $('#desktopLyricsDualInput').checked = settings.dualLine;
  $('#desktopLyricsLockedInput').checked = settings.locked;
  $('#desktopLyricsPrimaryColor').value = settings.primaryColor;
  $('#desktopLyricsSecondaryColor').value = settings.secondaryColor;
  $('#desktopLyricsPanel').style.setProperty('--desktop-primary-color', settings.primaryColor);
  $('#desktopLyricsPanel').style.setProperty('--desktop-secondary-color', settings.secondaryColor);
  $('#desktopLyricsStyleOptions').querySelectorAll('[data-lyric-style]').forEach((button) => {
    button.classList.toggle('active', button.dataset.lyricStyle === settings.style);
  });
}

function applyDesktopLyricsSettings({ updateVisibility = true, notify = false } = {}) {
  persistAppSettings();
  renderDesktopLyricsSettings();
  window.desktop.setDesktopLyricsSettings({
    dualLine: state.desktopLyricsSettings.dualLine,
    locked: state.desktopLyricsSettings.locked,
    style: state.desktopLyricsSettings.style,
    primaryColor: state.desktopLyricsSettings.primaryColor,
    secondaryColor: state.desktopLyricsSettings.secondaryColor
  });
  if (updateVisibility) window.desktop.setDesktopLyricsVisible(state.desktopLyricsSettings.enabled);
  updateDesktopLyrics();
  if (notify) showToast(state.desktopLyricsSettings.enabled ? '已开启桌面歌词' : '已关闭桌面歌词');
}

function toggleDesktopLyrics() {
  state.desktopLyricsSettings.enabled = !state.desktopLyricsSettings.enabled;
  applyDesktopLyricsSettings({ notify: true });
}

function renderPlaybackSettings() {
  audio.volume = state.volume;
  audio.muted = state.muted;
  $('#volumeBar').value = state.volume;
  updateRange($('#volumeBar'), state.muted ? 0 : state.volume);
  $('#muteBtn').classList.toggle('active', state.muted);
  $('#shuffleBtn').classList.toggle('active', state.shuffle);
  $('#repeatBtn').classList.toggle('active', state.repeat !== 'off');
  $('#repeatBtn').classList.toggle('repeat-one', state.repeat === 'one');
  $('#settingsVolumeBar').value = state.volume;
  updateRange($('#settingsVolumeBar'), state.volume);
  $('#settingsVolumeValue').textContent = `${Math.round(state.volume * 100)}%`;
  $('#settingsMutedInput').checked = state.muted;
  $('#settingsShuffleInput').checked = state.shuffle;
  $('#settingsRepeatOptions').querySelectorAll('[data-repeat-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.repeatMode === state.repeat);
  });
}

function applyPlaybackSettings() {
  persistAppSettings();
  renderPlaybackSettings();
}

function showSettingsSection(section) {
  const names = {
    playback: ['播放设置', '控制音量与默认播放行为'],
    desktopLyrics: ['桌面歌词', '调整桌面悬浮歌词的显示与外观'],
    appearance: ['外观设置', '选择应用界面的主题主色'],
    shortcuts: ['快捷键', '查看现有快捷键并预留自定义入口'],
    about: ['关于 Yuvis音乐', '本地、纯粹、专注于你的音乐']
  };
  state.settingsSection = names[section] ? section : 'playback';
  $('#settingsTitle').textContent = names[state.settingsSection][0];
  $('#settingsDescription').textContent = names[state.settingsSection][1];
  document.querySelectorAll('[data-settings-section]').forEach((button) => {
    button.classList.toggle('active', button.dataset.settingsSection === state.settingsSection);
  });
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== state.settingsSection;
  });
}

function openSettings(section = 'playback') {
  renderPlaybackSettings();
  renderDesktopLyricsSettings();
  renderAppearanceSettings();
  showSettingsSection(section);
  openModal($('#settingsModal'));
}

function renderLyrics(track) {
  const parsed = parseLyrics(track?.manualLyrics || track?.lyrics);
  state.currentLyrics = parsed;
  state.activeLyricIndex = -1;
  const container = $('#detailLyrics');
  const source = $('#lyricsSource');
  source.innerHTML = `<i></i>${escapeHtml(lyricSourceLabel(parsed))}`;
  source.classList.toggle('available', Boolean(parsed));
  updateLyricsOffsetUI();
  container.classList.toggle('synced', Boolean(parsed?.synced));
  if (!parsed) {
    container.innerHTML = `
      <div class="lyrics-empty">
        <svg viewBox="0 0 32 32"><path d="M8 6h16v20H8zM12 11h8M12 16h8M12 21h5"/></svg>
        <strong>这首歌还没有歌词</strong>
        <span>可读取内嵌歌词，也可以指定 LRC 或 TXT 文件</span>
      </div>`;
    updateDesktopLyrics(-1);
    return;
  }
  container.innerHTML = parsed.lines.map((line, index) => `
    <p data-lyric-index="${index}"${Number.isFinite(line.time) ? ` data-lyric-time="${line.time}"` : ''}>${escapeHtml(line.text)}${line.translation ? `<span class="lyric-translation">${escapeHtml(line.translation)}</span>` : ''}</p>
  `).join('');
  container.scrollTop = 0;
  updateDesktopLyrics(-1);
}

function updateLyricPosition(seconds, forceCenter = false) {
  const lyrics = state.currentLyrics;
  if (!lyrics?.synced || !lyrics.lines.length) return;
  const adjustedSeconds = seconds - currentLyricOffset();
  let low = 0;
  let high = lyrics.lines.length - 1;
  let activeIndex = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lyrics.lines[middle].time <= adjustedSeconds + 0.001) {
      activeIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (activeIndex === state.activeLyricIndex && !forceCenter) return;
  state.activeLyricIndex = activeIndex;
  updateDesktopLyrics(activeIndex);
  const container = $('#detailLyrics');
  container.querySelectorAll('[data-lyric-index]').forEach((line, index) => {
    line.classList.toggle('active', index === activeIndex);
    line.classList.toggle('past', index < activeIndex);
    if (index === activeIndex) line.setAttribute('aria-current', 'true');
    else line.removeAttribute('aria-current');
  });
  if (state.lyricsDragging || (!forceCenter && Date.now() < state.lyricManualScrollUntil)) return;
  const activeLine = container.querySelector(`[data-lyric-index="${activeIndex}"]`);
  if (activeLine) {
    const containerRect = container.getBoundingClientRect();
    const lineRect = activeLine.getBoundingClientRect();
    const lineCenterInContent = lineRect.top - containerRect.top + container.scrollTop + lineRect.height / 2;
    const targetTop = lineCenterInContent - container.clientHeight * .36;
    container.scrollTop = Math.max(0, targetTop);
  }
}

function stopLyricClock() {
  if (state.lyricAnimationFrame !== null) cancelAnimationFrame(state.lyricAnimationFrame);
  state.lyricAnimationFrame = null;
}

function runLyricClock() {
  stopLyricClock();
  const tick = () => {
    updateLyricPosition(audio.currentTime);
    if (!audio.paused && !audio.ended) state.lyricAnimationFrame = requestAnimationFrame(tick);
    else state.lyricAnimationFrame = null;
  };
  tick();
}

async function loadAssignedLyrics(track) {
  const lyricsPath = state.lyricFiles[track.path];
  if (!lyricsPath) {
    renderLyrics(track);
    updateLyricPosition(audio.currentTime);
    return;
  }
  const result = await window.desktop.readLyricsFile(lyricsPath);
  if (!result) {
    delete state.lyricFiles[track.path];
    persistLyricFiles();
    if (track.id === state.currentId) renderLyrics(track);
    return;
  }
  track.manualLyrics = { source: 'file', path: result.path, text: result.text, syncedLines: [] };
  if (track.id === state.currentId) {
    renderLyrics(track);
    updateLyricPosition(audio.currentTime);
  }
}

async function chooseLyricsForCurrentTrack() {
  const track = currentTrack();
  if (!track) return showToast('请先播放一首音乐');
  const result = await window.desktop.chooseLyricsFile();
  if (!result) return;
  state.lyricFiles[track.path] = result.path;
  persistLyricFiles();
  track.manualLyrics = { source: 'file', path: result.path, text: result.text, syncedLines: [] };
  renderLyrics(track);
  updateLyricPosition(audio.currentTime);
  showToast(`已使用歌词「${result.name}」`);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function activePlaylist() {
  return state.playlists.find((playlist) => playlist.id === state.activePlaylistId);
}

function currentTrack() {
  return state.library.find((track) => track.id === state.currentId);
}

function getVisibleTracks() {
  let tracks = [...state.library];
  if (state.view === 'favorite') tracks = tracks.filter((track) => state.favorites.has(track.id));
  if (state.view === 'recent') {
    const order = new Map(state.history.map((id, index) => [id, index]));
    tracks = tracks.filter((track) => order.has(track.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
  }
  if (state.view === 'playlist') {
    const paths = new Set(activePlaylist()?.trackPaths || []);
    tracks = tracks.filter((track) => paths.has(track.path));
  }
  const query = state.search.trim().toLocaleLowerCase('zh-CN');
  if (query) {
    tracks = tracks.filter((track) => [track.title, track.artist, track.album]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(query)));
  }
  if (state.view !== 'recent') {
    tracks.sort((a, b) => state.sortAscending
      ? a.title.localeCompare(b.title, 'zh-CN')
      : b.title.localeCompare(a.title, 'zh-CN'));
  }
  return tracks;
}

function playlistTracks(playlist) {
  const paths = new Set(playlist.trackPaths || []);
  return state.library.filter((track) => paths.has(track.path));
}

function playlistArtwork(playlist, size = 'small') {
  const covers = playlistTracks(playlist).filter((track) => track.cover).slice(0, 4);
  const theme = Math.abs([...playlist.name].reduce((sum, character) => sum + character.codePointAt(0), 0)) % 4;
  if (!covers.length) {
    return `<span class="playlist-artwork ${size} artwork-theme-${theme}">
      <svg viewBox="0 0 24 24"><path d="M8 17V6l10-2v10"/><circle cx="5" cy="17" r="3"/><circle cx="15" cy="14" r="3"/></svg>
    </span>`;
  }
  return `<span class="playlist-artwork ${size} cover-count-${covers.length}">
    ${covers.map((track) => `<i data-cover-id="${escapeHtml(track.id)}"></i>`).join('')}
  </span>`;
}

function renderPlaylistNav() {
  $('#playlistNav').innerHTML = state.playlists.map((playlist) => `
    <button class="nav-item ${state.view === 'playlist' && state.activePlaylistId === playlist.id ? 'active' : ''}" data-playlist-id="${escapeHtml(playlist.id)}">
      ${playlistArtwork(playlist, 'small')}
      <span>${escapeHtml(playlist.name)}</span><em>${playlist.trackPaths.length}</em>
    </button>`).join('');
  applyCoverImages($('#playlistNav'));
}

function renderLibrary() {
  const tracks = getVisibleTracks();
  const list = $('#trackList');
  $('#trackSummary').textContent = `${tracks.length} 首歌曲`;
  $('#libraryBadge').textContent = state.library.length;
  $('#favoriteBadge').textContent = state.favorites.size;
  $('#emptyState').style.display = tracks.length ? 'none' : 'flex';
  const emptyTitle = $('#emptyState h4');
  const emptyText = $('#emptyState p');
  const emptyButton = $('#emptyAddBtn');
  if (state.view === 'playlist') {
    emptyTitle.textContent = '这个歌单还是空的';
    emptyText.textContent = '前往音乐库，点击歌曲右侧的加号添加音乐';
    emptyButton.textContent = '前往音乐库';
  } else {
    emptyTitle.textContent = state.library.length ? '没有找到匹配的音乐' : '音乐库还是空的';
    emptyText.textContent = state.library.length ? '换一个关键词试试看' : '添加本地音频文件，开启你的聆听旅程';
    emptyButton.textContent = state.library.length ? '清除搜索' : '选择音乐文件';
  }
  list.innerHTML = tracks.map((track, index) => `
    <div class="track-row ${track.id === state.currentId ? 'current' : ''}" data-track-id="${escapeHtml(track.id)}">
      <span class="track-index">${track.id === state.currentId && !audio.paused ? '▮▮' : String(index + 1).padStart(2, '0')}</span>
      <span class="track-main"><span class="track-identity">
        <span class="track-cover" ${coverStyle(track)}>${track.cover ? '' : '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v11"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="15" r="3"/></svg>'}</span>
        <span class="track-text"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span>
      </span></span>
      <span class="track-album">${escapeHtml(track.album)}</span>
      <span class="track-date">${new Date(track.modifiedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
      <span class="track-time">${formatTime(track.duration)}</span>
      <span class="track-actions">
        <button class="add-playlist-track" data-add-playlist-id="${escapeHtml(track.id)}" aria-label="添加到歌单"><svg viewBox="0 0 24 24"><path d="M4 6h10M4 11h10M4 16h7M18 13v7M14.5 16.5h7"/></svg></button>
        <button class="favorite-track ${state.favorites.has(track.id) ? 'active' : ''}" data-favorite-id="${escapeHtml(track.id)}" aria-label="喜欢"><svg viewBox="0 0 24 24"><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.7 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" /></svg></button>
      </span>
    </div>`).join('');
  applyCoverImages(list);
}

function renderQueue() {
  const list = $('#queueList');
  if (!state.queue.length) {
    list.innerHTML = '<div class="queue-empty"><div class="sound-wave"><i></i><i></i><i></i><i></i><i></i></div><span>队列中暂无歌曲</span></div>';
    return;
  }
  list.innerHTML = state.queue.map((track) => `
    <div class="queue-item ${track.id === state.currentId ? 'current' : ''}" data-queue-id="${escapeHtml(track.id)}">
      <span class="queue-cover" ${coverStyle(track)}>${track.cover ? '' : '♪'}</span>
      <span class="queue-text"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span>
      <button class="remove-queue" data-remove-id="${escapeHtml(track.id)}" aria-label="移出队列"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>`).join('');
  applyCoverImages(list);
}

function renderNowPlaying() {
  const track = currentTrack();
  $('#detailTitle').textContent = track?.title || '尚未播放';
  $('#detailArtist').textContent = track?.artist || '选择一首本地音乐，开始聆听';
  $('#detailAlbum').textContent = track ? `${track.album}${track.year ? ` · ${track.year}` : ''}` : 'Yuvis音乐 · 本地播放器';
  $('#detailCover').style.backgroundImage = track?.cover ? `url('${track.cover}')` : '';
  $('#detailCover span').style.display = track?.cover ? 'none' : 'block';
  updateLyricsOffsetUI();
}

function countBy(items, getLabel) {
  const counts = new Map();
  items.forEach((item) => {
    const label = getLabel(item) || '未知';
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
}

function renderRanking(items, emptyText) {
  if (!items.length) return `<div class="stats-empty">${emptyText}</div>`;
  const max = Math.max(...items.map(([, value]) => value), 1);
  return items.slice(0, 6).map(([label, value], index) => `
    <div class="stats-rank-row">
      <span class="stats-rank-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="stats-rank-main"><strong>${escapeHtml(label)}</strong><i><b style="width:${value / max * 100}%"></b></i></span>
      <em>${value} 首</em>
    </div>`).join('');
}

function renderStatistics() {
  const tracks = state.library;
  const totalDuration = tracks.reduce((sum, track) => sum + (Number(track.duration) || 0), 0);
  const totalBytes = tracks.reduce((sum, track) => sum + (Number(track.size) || 0), 0);
  const favoriteCount = tracks.filter((track) => state.favorites.has(track.id)).length;
  const historyIds = new Set(state.history);
  const recentCount = tracks.filter((track) => historyIds.has(track.id)).length;
  const artists = countBy(tracks, (track) => track.artist || '未知艺术家');
  const albums = countBy(tracks, (track) => track.album || '未知专辑');
  const durationGroups = [
    ['3 分钟以内', tracks.filter((track) => (Number(track.duration) || 0) < 180).length],
    ['3–5 分钟', tracks.filter((track) => Number(track.duration) >= 180 && Number(track.duration) <= 300).length],
    ['5 分钟以上', tracks.filter((track) => Number(track.duration) > 300).length]
  ];
  const maxDurationGroup = Math.max(...durationGroups.map(([, value]) => value), 1);
  const listeningPeriods = [
    ['本日', 'today'],
    ['本周', 'week'],
    ['本月', 'month'],
    ['年度', 'year']
  ].map(([label, period]) => [label, aggregateListeningPeriod(period)]);

  $('#statsSection').innerHTML = `
    <div class="stats-summary-grid">
      <article class="stats-summary-card primary"><span>音乐总数</span><strong>${tracks.length}</strong><small>首本地歌曲</small></article>
      <article class="stats-summary-card"><span>乐库总时长</span><strong>${formatDuration(totalDuration)}</strong><small>完整播放一遍</small></article>
      <article class="stats-summary-card"><span>累计聆听</span><strong>${formatListeningDuration(totalListeningSeconds())}</strong><small>从播放第一秒开始累计</small></article>
      <article class="stats-summary-card"><span>存储占用</span><strong>${formatSize(totalBytes)}</strong><small>本地音乐文件</small></article>
    </div>
    <div class="listening-period-section">
      <div class="listening-period-heading"><div><span>LISTENING</span><h3>听歌时间统计</h3></div><small>时长实时累计 · 歌曲数需听满 1 分钟</small></div>
      <div class="listening-period-grid">
        ${listeningPeriods.map(([label, period]) => `
          <article class="listening-period-card">
            <span>${label}</span>
            <strong>${formatListeningDuration(period.seconds)}</strong>
            <div><em>${period.trackCount} 首歌曲</em><i>${period.plays} 次有效播放</i></div>
          </article>`).join('')}
      </div>
    </div>
    <div class="stats-facts">
      <div><span>喜欢的音乐</span><strong>${favoriteCount}</strong></div>
      <div><span>我的歌单</span><strong>${state.playlists.length}</strong></div>
      <div><span>播放记录</span><strong>${recentCount}</strong></div>
      <div><span>艺术家</span><strong>${artists.length}</strong></div>
      <div><span>专辑</span><strong>${albums.length}</strong></div>
    </div>
    <div class="stats-panel-grid">
      <article class="stats-panel">
        <header><div><span>ARTISTS</span><h3>艺术家分布</h3></div><small>按歌曲数量</small></header>
        <div class="stats-ranking">${renderRanking(artists, '添加音乐后，这里会展示艺术家分布')}</div>
      </article>
      <article class="stats-panel">
        <header><div><span>DURATION</span><h3>歌曲时长分布</h3></div><small>${formatDuration(totalDuration)}</small></header>
        <div class="duration-distribution">
          ${durationGroups.map(([label, value]) => `<div class="duration-row"><div><span>${label}</span><em>${value} 首</em></div><i><b style="width:${value / maxDurationGroup * 100}%"></b></i></div>`).join('')}
        </div>
        <div class="stats-album-note"><span>收录最多的专辑</span><strong>${albums.length ? escapeHtml(albums[0][0]) : '暂无数据'}</strong><em>${albums.length ? `${albums[0][1]} 首歌曲` : '添加音乐后显示'}</em></div>
      </article>
    </div>`;
}

function updateStats() {
  const bytes = state.library.reduce((sum, track) => sum + (track.size || 0), 0);
  $('#storageSize').textContent = formatSize(bytes);
  $('#storageProgress').style.width = `${Math.min(100, Math.max(2, bytes / (10 * 1024 ** 3) * 100))}%`;
  if (state.view === 'stats') renderStatistics();
}

function renderView() {
  const playlist = activePlaylist();
  const names = state.view === 'playlist'
    ? ['你亲手整理的声音', playlist?.name || '我的歌单', '歌单歌曲']
    : viewNames[state.view] || viewNames.library;
  $('#viewEyebrow').textContent = names[0];
  $('#viewTitle').textContent = names[1];
  $('#sectionTitle').textContent = names[2];
  $('.main-header').hidden = false;
  $('.header-actions').hidden = state.view === 'stats';
  $('.library-section').hidden = state.view === 'stats';
  $('#statsSection').hidden = state.view !== 'stats';
  $('#deletePlaylistBtn').hidden = state.view !== 'playlist';
  updateNavigationState();
  renderPlaylistNav();
  renderLibrary();
  if (state.view === 'stats') renderStatistics();
  renderNowPlaying();
}

function updateNavigationState() {
  document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
    const active = !state.playerOpen && item.dataset.view === state.view;
    item.classList.toggle('active', active);
  });
}

function openNowPlayingPage() {
  const page = $('#nowPlayingPage');
  clearTimeout(state.playerCloseTimer);
  closeQueueMenu();
  state.playerOpen = true;
  page.hidden = false;
  renderNowPlaying();
  const track = currentTrack();
  if (track) renderLyrics(track);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    page.classList.add('open');
    document.body.classList.add('player-page-open');
    updateNavigationState();
    updateLyricPosition(audio.currentTime, true);
  }));
}

function closeNowPlayingPage() {
  if (!state.playerOpen && $('#nowPlayingPage').hidden) return;
  state.playerOpen = false;
  $('#nowPlayingPage').classList.remove('open');
  document.body.classList.remove('player-page-open');
  updateNavigationState();
  clearTimeout(state.playerCloseTimer);
  state.playerCloseTimer = setTimeout(() => {
    if (!state.playerOpen) $('#nowPlayingPage').hidden = true;
  }, 390);
}

function openQueueMenu() {
  document.body.classList.add('queue-open');
  $('#queueToggleBtn').classList.add('active');
  $('#queueToggleBtn').setAttribute('aria-expanded', 'true');
}

function closeQueueMenu() {
  document.body.classList.remove('queue-open');
  $('#queueToggleBtn').classList.remove('active');
  $('#queueToggleBtn').setAttribute('aria-expanded', 'false');
}

function toggleQueueMenu() {
  document.body.classList.contains('queue-open') ? closeQueueMenu() : openQueueMenu();
}

function mergeTracks(newTracks) {
  const existing = new Set(state.library.map((track) => track.path));
  const additions = newTracks.filter((track) => !existing.has(track.path));
  state.library.push(...additions);
  persistLibrary();
  renderLibrary();
  updateStats();
  showToast(additions.length ? `已添加 ${additions.length} 首音乐` : '没有发现新的音乐');
}

async function importFiles() {
  const tracks = await window.desktop.chooseFiles();
  if (tracks.length) mergeTracks(tracks);
}

async function importFolder() {
  showToast('正在导入本地音乐…');
  const tracks = await window.desktop.chooseFolder();
  if (tracks.length) mergeTracks(tracks); else showToast('未找到可播放的音频文件');
}

function addToHistory(id) {
  state.history = [id, ...state.history.filter((item) => item !== id)].slice(0, 100);
  localStorage.setItem('history', JSON.stringify(state.history));
}

function loadTrack(track, autoplay = true) {
  if (!track) return;
  beginListeningSession(track);
  state.currentId = track.id;
  if (!state.queue.some((item) => item.id === track.id)) state.queue.push(track);
  audio.src = track.url;
  $('#playerTitle').textContent = track.title;
  $('#playerArtist').textContent = track.artist;
  $('#playerCover').style.backgroundImage = track.cover ? `url('${track.cover}')` : '';
  $('.cover-note').style.display = track.cover ? 'none' : 'block';
  $('#playerFavoriteBtn').classList.toggle('active', state.favorites.has(track.id));
  addToHistory(track.id);
  renderLibrary();
  renderQueue();
  renderNowPlaying();
  renderLyrics(track);
  loadAssignedLyrics(track);
  updateStats();
  if (autoplay) audio.play().catch(() => showToast('无法播放此音频文件'));
}

function togglePlay() {
  if (!state.currentId) {
    const first = state.queue[0] || getVisibleTracks()[0] || state.library[0];
    if (first) loadTrack(first); else showToast('请先添加音乐');
    return;
  }
  audio.paused ? audio.play() : audio.pause();
}

function nextTrack(direction = 1) {
  const source = state.queue.length ? state.queue : state.library;
  if (!source.length) return;
  if (state.shuffle && source.length > 1) {
    const candidates = source.filter((track) => track.id !== state.currentId);
    loadTrack(candidates[Math.floor(Math.random() * candidates.length)]);
    return;
  }
  const currentIndex = source.findIndex((track) => track.id === state.currentId);
  const nextIndex = (currentIndex + direction + source.length) % source.length;
  loadTrack(source[nextIndex]);
}

function toggleFavorite(id) {
  if (!id) return showToast('当前没有正在播放的音乐');
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
  $('#favoriteBadge').textContent = state.favorites.size;
  $('#playerFavoriteBtn').classList.toggle('active', state.favorites.has(state.currentId));
  renderLibrary();
  renderNowPlaying();
  updateStats();
}

function updateRange(range, ratio) {
  range.style.setProperty('--range-progress', `${Math.max(0, Math.min(100, ratio * 100))}%`);
}

function openModal(modal) {
  modal.hidden = false;
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach((modal) => { modal.hidden = true; });
}

function openCreatePlaylist() {
  closeModals();
  $('#playlistNameInput').value = '';
  openModal($('#playlistModal'));
  setTimeout(() => $('#playlistNameInput').focus(), 30);
}

function createPlaylist(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const playlist = {
    id: `playlist-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: trimmed,
    trackPaths: [],
    createdAt: Date.now()
  };
  state.playlists.push(playlist);
  if (state.pendingTrackId) {
    const track = state.library.find((item) => item.id === state.pendingTrackId);
    if (track) playlist.trackPaths.push(track.path);
    state.pendingTrackId = null;
  }
  persistPlaylists();
  renderPlaylistNav();
  updateStats();
  closeModals();
  showToast(`已创建歌单「${trimmed}」`);
  return true;
}

function openPlaylistPicker(trackId) {
  if (!trackId) return showToast('请先选择一首音乐');
  state.pendingTrackId = trackId;
  const track = state.library.find((item) => item.id === trackId);
  $('#addTrackHint').textContent = track ? `将「${track.title}」添加到` : '选择一个歌单';
  $('#playlistPickerList').innerHTML = state.playlists.length
    ? state.playlists.map((playlist) => `
      <button class="playlist-picker-item" data-picker-playlist-id="${escapeHtml(playlist.id)}">
        ${playlistArtwork(playlist, 'medium')}
        <span class="playlist-picker-text"><strong>${escapeHtml(playlist.name)}</strong><span>${playlist.trackPaths.length} 首歌曲</span></span>
        <svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>
      </button>`).join('')
    : '<div class="playlist-picker-empty">还没有歌单，先创建一个吧</div>';
  applyCoverImages($('#playlistPickerList'));
  openModal($('#addToPlaylistModal'));
}

function addTrackToPlaylist(playlistId) {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  const track = state.library.find((item) => item.id === state.pendingTrackId);
  if (!playlist || !track) return;
  if (playlist.trackPaths.includes(track.path)) {
    showToast('这首歌已经在歌单里了');
  } else {
    playlist.trackPaths.push(track.path);
    persistPlaylists();
    renderPlaylistNav();
    showToast(`已添加到「${playlist.name}」`);
  }
  state.pendingTrackId = null;
  closeModals();
  if (state.view === 'playlist') renderLibrary();
}

$('#trackList').addEventListener('dblclick', (event) => {
  if (event.target.closest('button')) return;
  const row = event.target.closest('[data-track-id]');
  if (!row) return;
  state.queue = getVisibleTracks();
  loadTrack(state.library.find((track) => track.id === row.dataset.trackId));
});
$('#trackList').addEventListener('click', (event) => {
  const favorite = event.target.closest('[data-favorite-id]');
  if (favorite) return toggleFavorite(favorite.dataset.favoriteId);
  const addButton = event.target.closest('[data-add-playlist-id]');
  if (addButton) openPlaylistPicker(addButton.dataset.addPlaylistId);
});
$('#playlistNav').addEventListener('click', (event) => {
  const item = event.target.closest('[data-playlist-id]');
  if (!item) return;
  state.activePlaylistId = item.dataset.playlistId;
  state.view = 'playlist';
  renderView();
});
$('#queueList').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-id]');
  if (remove) {
    state.queue = state.queue.filter((track) => track.id !== remove.dataset.removeId);
    renderQueue();
    return;
  }
  const item = event.target.closest('[data-queue-id]');
  if (item) loadTrack(state.library.find((track) => track.id === item.dataset.queueId));
});
$('#playlistPickerList').addEventListener('click', (event) => {
  const item = event.target.closest('[data-picker-playlist-id]');
  if (item) addTrackToPlaylist(item.dataset.pickerPlaylistId);
});

$('#folderNavBtn').addEventListener('click', importFolder);
$('#emptyAddBtn').addEventListener('click', () => {
  if (state.view === 'playlist') {
    state.view = 'library';
    renderView();
    showToast('点击歌曲右侧的歌单按钮即可添加');
  } else if (state.library.length) {
    state.search = '';
    $('#searchInput').value = '';
    renderLibrary();
  } else importFiles();
});
$('#playPauseBtn').addEventListener('click', togglePlay);
$('#previousBtn').addEventListener('click', () => audio.currentTime > 3 ? audio.currentTime = 0 : nextTrack(-1));
$('#nextBtn').addEventListener('click', () => nextTrack(1));
$('#playerFavoriteBtn').addEventListener('click', (event) => { event.stopPropagation(); toggleFavorite(state.currentId); });
$('#chooseLyricsBtn').addEventListener('click', chooseLyricsForCurrentTrack);
$('#desktopLyricsBtn').addEventListener('click', toggleDesktopLyrics);
$('#sidebarSettingsBtn').addEventListener('click', () => openSettings('playback'));
$('.settings-sidebar nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-settings-section]');
  if (button) showSettingsSection(button.dataset.settingsSection);
});
$('#settingsVolumeBar').addEventListener('input', (event) => {
  state.volume = Number(event.target.value);
  state.muted = false;
  applyPlaybackSettings();
});
$('#settingsMutedInput').addEventListener('change', (event) => {
  state.muted = event.target.checked;
  applyPlaybackSettings();
});
$('#settingsShuffleInput').addEventListener('change', (event) => {
  state.shuffle = event.target.checked;
  applyPlaybackSettings();
});
$('#settingsRepeatOptions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-repeat-mode]');
  if (!button) return;
  state.repeat = button.dataset.repeatMode;
  applyPlaybackSettings();
});
$('#appearanceThemeOptions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-theme]');
  if (!button || !Object.hasOwn(APPEARANCE_THEMES, button.dataset.theme)) return;
  state.appearanceSettings.theme = button.dataset.theme;
  applyAppearanceSettings();
  showToast('主题主色已更新');
});
$('#desktopLyricsEnabledInput').addEventListener('change', (event) => {
  state.desktopLyricsSettings.enabled = event.target.checked;
  applyDesktopLyricsSettings({ notify: true });
});
$('#desktopLyricsDualInput').addEventListener('change', (event) => {
  state.desktopLyricsSettings.dualLine = event.target.checked;
  applyDesktopLyricsSettings();
});
$('#desktopLyricsLockedInput').addEventListener('change', (event) => {
  state.desktopLyricsSettings.locked = event.target.checked;
  applyDesktopLyricsSettings({ updateVisibility: false });
});
$('#desktopLyricsPrimaryColor').addEventListener('input', (event) => {
  state.desktopLyricsSettings.primaryColor = event.target.value;
  applyDesktopLyricsSettings({ updateVisibility: false });
});
$('#desktopLyricsSecondaryColor').addEventListener('input', (event) => {
  state.desktopLyricsSettings.secondaryColor = event.target.value;
  applyDesktopLyricsSettings({ updateVisibility: false });
});
$('#desktopLyricsStyleOptions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-lyric-style]');
  if (!button) return;
  state.desktopLyricsSettings.style = button.dataset.lyricStyle;
  applyDesktopLyricsSettings({ updateVisibility: false });
});
$('#desktopLyricsColorPresets').addEventListener('click', (event) => {
  const button = event.target.closest('[data-color]');
  if (!button) return;
  state.desktopLyricsSettings.primaryColor = button.dataset.color;
  applyDesktopLyricsSettings({ updateVisibility: false });
});
$('#lyricsOffsetControl').addEventListener('click', (event) => {
  const stepButton = event.target.closest('[data-lyrics-offset-step]');
  if (stepButton) return adjustLyricsOffset(Number(stepButton.dataset.lyricsOffsetStep));
  if (event.target.closest('[data-lyrics-offset-reset]')) adjustLyricsOffset(0, true);
});
const lyricDrag = {
  pointerId: null,
  startY: 0,
  startScrollTop: 0,
  startLine: null,
  moved: false,
  lastClickAt: 0,
  lastLineIndex: null
};

function playFromLyricLine(line) {
  if (!line || !state.currentId) return;
  const requestedTime = Math.max(0, Number(line.dataset.lyricTime) + currentLyricOffset());
  if (!Number.isFinite(requestedTime)) return;
  const seekAndPlay = () => {
    const targetTime = Number.isFinite(audio.duration) ? Math.min(requestedTime, Math.max(0, audio.duration - .01)) : requestedTime;
    try {
      audio.currentTime = targetTime;
      state.lyricManualScrollUntil = 0;
      updatePlaybackProgress();
      updateLyricPosition(targetTime, true);
      audio.play()
        .then(() => showToast(`已从 ${formatTime(targetTime)} 开始播放`))
        .catch(() => showToast('无法从这句歌词开始播放'));
    } catch {
      showToast('歌词跳转失败，请稍后重试');
    }
  };
  if (audio.readyState === 0) audio.addEventListener('loadedmetadata', seekAndPlay, { once: true });
  else seekAndPlay();
}

$('#detailLyrics').addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const container = event.currentTarget;
  lyricDrag.pointerId = event.pointerId;
  lyricDrag.startY = event.clientY;
  lyricDrag.startScrollTop = container.scrollTop;
  lyricDrag.startLine = event.target.closest('[data-lyric-time]');
  lyricDrag.moved = false;
  state.lyricsDragging = true;
  container.classList.add('dragging');
  container.setPointerCapture(event.pointerId);
});
$('#detailLyrics').addEventListener('pointermove', (event) => {
  if (lyricDrag.pointerId !== event.pointerId) return;
  const distance = event.clientY - lyricDrag.startY;
  if (Math.abs(distance) > 4) lyricDrag.moved = true;
  event.currentTarget.scrollTop = lyricDrag.startScrollTop - distance;
});
function finishLyricDrag(event, allowDoubleClick = false) {
  if (lyricDrag.pointerId !== event.pointerId) return;
  const container = event.currentTarget;
  const clickedLine = lyricDrag.startLine;
  const wasMoved = lyricDrag.moved;
  if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
  lyricDrag.pointerId = null;
  lyricDrag.startLine = null;
  state.lyricsDragging = false;
  state.lyricManualScrollUntil = Date.now() + 4000;
  container.classList.remove('dragging');
  if (!allowDoubleClick || wasMoved || !clickedLine) {
    if (wasMoved) {
      lyricDrag.lastClickAt = 0;
      lyricDrag.lastLineIndex = null;
    }
    return;
  }
  const now = Date.now();
  const lineIndex = clickedLine.dataset.lyricIndex;
  if (lyricDrag.lastLineIndex === lineIndex && now - lyricDrag.lastClickAt <= 500) {
    lyricDrag.lastClickAt = 0;
    lyricDrag.lastLineIndex = null;
    playFromLyricLine(clickedLine);
  } else {
    lyricDrag.lastClickAt = now;
    lyricDrag.lastLineIndex = lineIndex;
  }
}
$('#detailLyrics').addEventListener('pointerup', (event) => finishLyricDrag(event, true));
$('#detailLyrics').addEventListener('pointercancel', (event) => finishLyricDrag(event, false));
$('#openNowPlaying').addEventListener('click', openNowPlayingPage);
$('#closeNowPlayingBtn').addEventListener('click', closeNowPlayingPage);
$('#playAllBtn').addEventListener('click', () => {
  state.queue = getVisibleTracks();
  if (state.queue.length) loadTrack(state.queue[0]); else showToast('当前列表没有音乐');
});
$('#clearQueueBtn').addEventListener('click', () => { state.queue = []; renderQueue(); });
$('#sortBtn').addEventListener('click', () => {
  state.sortAscending = !state.sortAscending;
  renderLibrary();
  showToast(state.sortAscending ? '已按标题升序排列' : '已按标题降序排列');
});
$('#queueToggleBtn').addEventListener('click', toggleQueueMenu);
$('#shuffleBtn').addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  applyPlaybackSettings();
  showToast(state.shuffle ? '已开启随机播放' : '已关闭随机播放');
});
$('#repeatBtn').addEventListener('click', () => {
  state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
  applyPlaybackSettings();
  showToast({ off: '已关闭循环', all: '列表循环', one: '单曲循环' }[state.repeat]);
});
document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => {
  state.view = item.dataset.view;
  renderView();
}));
$('#searchInput').addEventListener('input', (event) => { state.search = event.target.value; renderLibrary(); });

$('#createPlaylistBtn').addEventListener('click', openCreatePlaylist);
$('#pickerCreatePlaylistBtn').addEventListener('click', openCreatePlaylist);
$('#playlistForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!createPlaylist($('#playlistNameInput').value)) showToast('请输入歌单名称');
});
$('#deletePlaylistBtn').addEventListener('click', () => {
  const playlist = activePlaylist();
  if (!playlist || !window.confirm(`确定删除歌单「${playlist.name}」吗？\n音乐文件不会被删除。`)) return;
  state.playlists = state.playlists.filter((item) => item.id !== playlist.id);
  persistPlaylists();
  state.activePlaylistId = null;
  state.view = 'library';
  renderView();
  showToast('歌单已删除');
});
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModals));
document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModals();
}));

document.addEventListener('pointerdown', (event) => {
  if (document.body.classList.contains('queue-open') && !event.target.closest('#queuePanel') && !event.target.closest('#queueToggleBtn')) {
    closeQueueMenu();
  }
  const actionable = event.target.closest('button, input, select, textarea, label, a, [role="button"], [data-track-id], [data-queue-id], [data-playlist-id]');
  if (state.playerOpen && actionable && !actionable.closest('.now-playing-sheet') && !actionable.closest('.player-bar') && !actionable.closest('.queue-panel')) {
    closeNowPlayingPage();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const openModalElement = [...document.querySelectorAll('.modal-backdrop')].find((modal) => !modal.hidden);
    if (openModalElement) closeModals();
    else if (document.body.classList.contains('queue-open')) closeQueueMenu();
    else if (state.playerOpen) closeNowPlayingPage();
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#searchInput').focus(); }
  if (event.code === 'Space' && !document.activeElement.matches('input, button, select, textarea')) { event.preventDefault(); togglePlay(); }
});

function seekFromRange(range) {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = range.value / 100 * audio.duration;
    updateLyricPosition(audio.currentTime, true);
    updatePlaybackProgress();
  }
}
$('#progressBar').addEventListener('input', (event) => seekFromRange(event.target));
$('#volumeBar').addEventListener('input', (event) => {
  state.volume = Number(event.target.value);
  state.muted = false;
  applyPlaybackSettings();
});
$('#muteBtn').addEventListener('click', () => {
  state.muted = !state.muted;
  applyPlaybackSettings();
});
audio.addEventListener('play', () => { document.body.classList.add('is-playing'); renderLibrary(); runLyricClock(); });
audio.addEventListener('pause', () => { document.body.classList.remove('is-playing'); renderLibrary(); stopLyricClock(); updateLyricPosition(audio.currentTime); });
audio.addEventListener('loadedmetadata', () => {
  $('#totalTime').textContent = formatTime(audio.duration);
});
function updatePlaybackProgress() {
  const ratio = audio.duration ? audio.currentTime / audio.duration : 0;
  $('#currentTime').textContent = formatTime(audio.currentTime);
  $('#totalTime').textContent = formatTime(audio.duration);
  $('#progressBar').value = ratio * 100;
  updateRange($('#progressBar'), ratio);
}
audio.addEventListener('timeupdate', () => { updatePlaybackProgress(); updateLyricPosition(audio.currentTime); });
audio.addEventListener('seeking', () => { updatePlaybackProgress(); updateLyricPosition(audio.currentTime, true); });
audio.addEventListener('seeked', () => { updatePlaybackProgress(); updateLyricPosition(audio.currentTime, true); });
audio.addEventListener('ratechange', () => { if (!audio.paused) runLyricClock(); });
audio.addEventListener('ended', () => {
  if (state.repeat === 'one') { beginListeningSession(currentTrack()); audio.currentTime = 0; audio.play(); }
  else if (state.repeat === 'all' || state.queue.findIndex((track) => track.id === state.currentId) < state.queue.length - 1) nextTrack(1);
});
setInterval(tickListeningStatistics, 1000);
window.addEventListener('beforeunload', () => {
  localStorage.setItem('listeningStats', JSON.stringify(state.listeningStats));
});

$('#minimizeBtn').addEventListener('click', window.desktop.minimize);
$('#maximizeBtn').addEventListener('click', window.desktop.toggleMaximize);
$('#closeBtn').addEventListener('click', window.desktop.close);
window.desktop.onMaximized((maximized) => {
  $('#maximizeBtn').classList.toggle('maximized', maximized);
  $('#maximizeBtn').setAttribute('aria-label', maximized ? '还原窗口' : '最大化');
  $('#maximizeBtn').title = maximized ? '还原窗口' : '最大化';
});
window.desktop.onDesktopLyricsVisibility((visible) => {
  if (state.desktopLyricsSettings.enabled === visible) return;
  state.desktopLyricsSettings.enabled = visible;
  applyDesktopLyricsSettings({ updateVisibility: false });
});
window.desktop.onDesktopLyricsLock((locked) => {
  if (state.desktopLyricsSettings.locked === locked) return;
  state.desktopLyricsSettings.locked = locked;
  applyDesktopLyricsSettings({ updateVisibility: false });
  showToast(locked ? '桌面歌词已锁定' : '桌面歌词已解锁');
});
window.desktop.onDesktopLyricsSettings((settings) => {
  if (!settings || typeof settings !== 'object') return;
  state.desktopLyricsSettings = { ...state.desktopLyricsSettings, ...settings };
  persistAppSettings();
  renderDesktopLyricsSettings();
  updateDesktopLyrics();
  showToast('桌面歌词外观已更新');
});

async function init() {
  applyAppearanceSettings({ persist: false });
  applyPlaybackSettings();
  applyDesktopLyricsSettings();
  renderView();
  renderQueue();
  updateStats();
  const savedPaths = readStorage('libraryPaths', []);
  if (savedPaths.length) {
    const restored = await window.desktop.restoreTracks(savedPaths);
    state.library = restored;
    renderView();
    updateStats();
  }
}

init();
