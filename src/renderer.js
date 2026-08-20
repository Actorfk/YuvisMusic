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

const FONT_SIZE_OPTIONS = {
  small: .9,
  standard: 1,
  large: 1.1,
  extraLarge: 1.2
};

const SHORTCUT_ACTIONS = {
  previous: { label: '上一曲', defaultShortcut: { code: 'ArrowLeft', ctrl: true, alt: false, shift: false, meta: false } },
  togglePlayback: { label: '播放 / 暂停', defaultShortcut: { code: 'Space', ctrl: false, alt: false, shift: false, meta: false } },
  next: { label: '下一曲', defaultShortcut: { code: 'ArrowRight', ctrl: true, alt: false, shift: false, meta: false } },
  search: { label: '聚焦搜索', defaultShortcut: { code: 'KeyK', ctrl: true, alt: false, shift: false, meta: false } }
};
const SHORTCUT_MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight']);

const ASSISTANT_SYSTEM_PROMPT = `你是 Yuvis 音乐播放器里的中文助手。你可以通过工具读取本地音乐状态并控制播放器。
需要操作或查询软件时必须使用工具，不要假装操作成功。工具只影响用户本机的播放器。
回答应自然、简洁；执行操作后说明结果。不要声称能访问工具没有返回的信息。`;

const ASSISTANT_TOOLS = [
  { type: 'function', function: { name: 'get_player_state', description: '读取当前歌曲、播放状态、音量、循环和随机状态', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'control_playback', description: '播放、暂停或切换播放状态', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['play', 'pause', 'toggle'] } }, required: ['action'], additionalProperties: false } } },
  { type: 'function', function: { name: 'next_track', description: '播放下一首歌曲', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'previous_track', description: '播放上一首歌曲', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'play_track', description: '按照歌曲名或艺术家查找并播放本地音乐', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'search_library', description: '搜索本地音乐库并返回匹配歌曲', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_favorite_tracks', description: '读取用户喜欢的歌曲，便于选择并播放', parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 30 } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_recent_tracks', description: '读取最近播放的歌曲', parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 30 } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_library_summary', description: '读取音乐库歌曲数、艺术家数、专辑数、喜欢数和总时长', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_current_lyrics', description: '读取当前歌曲的歌词；没有歌词时会返回明确提示', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'set_volume', description: '设置播放器音量百分比并取消静音', parameters: { type: 'object', properties: { percent: { type: 'number', minimum: 0, maximum: 100 } }, required: ['percent'], additionalProperties: false } } },
  { type: 'function', function: { name: 'seek_to', description: '跳转到当前歌曲的指定秒数', parameters: { type: 'object', properties: { seconds: { type: 'number', minimum: 0 } }, required: ['seconds'], additionalProperties: false } } },
  { type: 'function', function: { name: 'set_repeat', description: '设置循环方式', parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['off', 'all', 'one'] } }, required: ['mode'], additionalProperties: false } } },
  { type: 'function', function: { name: 'set_shuffle', description: '开启或关闭随机播放', parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_queue', description: '读取当前播放队列', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'add_to_queue', description: '按歌曲名或艺术家查找歌曲并加入播放队列', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'remove_from_queue', description: '按歌曲名或艺术家从播放队列移出一首歌曲', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'clear_queue', description: '清空播放队列；不会停止当前正在播放的歌曲', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'set_current_favorite', description: '设置当前歌曲是否为喜欢', parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_playlists', description: '读取用户歌单及歌曲数量', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'create_playlist', description: '创建一个新的空歌单', parameters: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 30 } }, required: ['name'], additionalProperties: false } } },
  { type: 'function', function: { name: 'play_playlist', description: '按名称播放一个歌单', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } },
  { type: 'function', function: { name: 'add_current_to_playlist', description: '把当前歌曲添加到指定歌单', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } } },
  { type: 'function', function: { name: 'get_listening_statistics', description: '读取近一天、近一周、近一个月和近一年的听歌时长、有效歌曲数、播放次数与听得最多的歌曲', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'get_most_played_tracks', description: '按时间范围查询听得最多的歌曲及有效播放次数', parameters: { type: 'object', properties: { period: { type: 'string', enum: ['day', 'week', 'month', 'year'] }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['period'], additionalProperties: false } } },
  { type: 'function', function: { name: 'set_desktop_lyrics', description: '开启或关闭桌面歌词', parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'], additionalProperties: false } } }
];

const AI_TOOL_GROUPS = [
  { name: '播放控制', summary: '播放、切歌、进度与播放模式', tools: ['get_player_state', 'control_playback', 'next_track', 'previous_track', 'play_track', 'set_volume', 'seek_to', 'set_repeat', 'set_shuffle'] },
  { name: '音乐库与内容', summary: '搜索歌曲、读取收藏、记录、概况和歌词', tools: ['search_library', 'get_favorite_tracks', 'get_recent_tracks', 'get_library_summary', 'get_current_lyrics'] },
  { name: '播放队列', summary: '查看、添加、移出或清空队列', tools: ['get_queue', 'add_to_queue', 'remove_from_queue', 'clear_queue'] },
  { name: '收藏与歌单', summary: '管理当前收藏，读取、创建和播放歌单', tools: ['set_current_favorite', 'get_playlists', 'create_playlist', 'play_playlist', 'add_current_to_playlist'] },
  { name: '统计与桌面歌词', summary: '读取听歌统计并控制桌面歌词', tools: ['get_listening_statistics', 'get_most_played_tracks', 'set_desktop_lyrics'] }
];

const EQUALIZER_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const FULLSCREEN_LYRIC_STYLES = ['original', 'immersive', 'minimal', 'aurora', 'cinema', 'sunset', 'glass'];
const BUILTIN_EQUALIZER_PRESETS = {
  flat: { name: '默认 · 平直', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { name: '低音增强', gains: [6, 5, 4, 2, 0, -1, -1, 0, 1, 2] },
  vocal: { name: '人声清晰', gains: [-2, -1, 0, 2, 4, 4, 3, 1, -1, -2] },
  rock: { name: '摇滚现场', gains: [4, 3, 1, -1, -2, 1, 3, 4, 4, 3] },
  classical: { name: '古典宽广', gains: [3, 2, 1, 0, -1, -1, 0, 1, 2, 3] },
  night: { name: '深夜柔和', gains: [-3, -2, 0, 2, 3, 3, 2, 0, -2, -3] }
};

let equalizerAudioContext = null;
let equalizerSourceNode = null;
let equalizerFilterNodes = [];
let recordingShortcutAction = null;
const scalableFontRules = new Map();

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readArrayStorage(key) {
  const value = readStorage(key, []);
  return Array.isArray(value) ? value : [];
}

function readObjectStorage(key, fallback = {}) {
  const value = readStorage(key, fallback);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function shortcutSignature(shortcut) {
  return [shortcut.ctrl ? '1' : '0', shortcut.alt ? '1' : '0', shortcut.shift ? '1' : '0', shortcut.meta ? '1' : '0', shortcut.code].join(':');
}

function normalizeShortcut(value, fallback) {
  if (typeof value?.code !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(value.code)) return { ...fallback };
  return {
    code: value.code,
    ctrl: Boolean(value.ctrl),
    alt: Boolean(value.alt),
    shift: Boolean(value.shift),
    meta: Boolean(value.meta)
  };
}

function defaultKeyboardShortcuts() {
  return Object.fromEntries(Object.entries(SHORTCUT_ACTIONS).map(([action, config]) => [action, { ...config.defaultShortcut }]));
}

function normalizeKeyboardShortcuts(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const shortcuts = Object.fromEntries(Object.entries(SHORTCUT_ACTIONS).map(([action, config]) => [
    action,
    normalizeShortcut(source[action], config.defaultShortcut)
  ]));
  const signatures = Object.values(shortcuts).map(shortcutSignature);
  return new Set(signatures).size === signatures.length ? shortcuts : defaultKeyboardShortcuts();
}

function normalizePlaylists(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.filter((playlist) => playlist && typeof playlist === 'object').map((playlist, index) => {
    const name = String(playlist.name || '').trim().slice(0, 30);
    const fallbackId = `restored-playlist-${index}`;
    let id = String(playlist.id || fallbackId).slice(0, 120);
    if (ids.has(id)) id = `${fallbackId}-${id}`;
    ids.add(id);
    return {
      id,
      name,
      trackPaths: Array.isArray(playlist.trackPaths) ? playlist.trackPaths.filter((item) => typeof item === 'string') : [],
      createdAt: Number.isFinite(Number(playlist.createdAt)) ? Number(playlist.createdAt) : Date.now()
    };
  }).filter((playlist) => playlist.name);
}

function normalizeListeningStats(value) {
  const stats = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const days = stats.days && typeof stats.days === 'object' && !Array.isArray(stats.days) ? stats.days : {};
  return {
    days: Object.fromEntries(Object.entries(days).flatMap(([dateKey, day]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !day || typeof day !== 'object' || Array.isArray(day)) return [];
      const rawTracks = day.tracks && typeof day.tracks === 'object' && !Array.isArray(day.tracks) ? day.tracks : {};
      const tracks = Object.fromEntries(Object.entries(rawTracks).flatMap(([trackKey, track]) => {
        if (!track || typeof track !== 'object' || Array.isArray(track)) return [];
        return [[trackKey, {
          title: String(track.title || '未知歌曲').slice(0, 500),
          seconds: Math.max(0, Number(track.seconds) || 0),
          plays: Math.max(0, Number(track.plays) || 0),
          valid: Boolean(track.valid)
        }]];
      }));
      return [[dateKey, {
        seconds: Math.max(0, Number(day.seconds) || 0),
        plays: Math.max(0, Number(day.plays) || 0),
        tracks
      }]];
    }))
  };
}

const savedAppSettings = readObjectStorage('appSettings');
const savedDesktopLyricsSettings = savedAppSettings.desktopLyrics || readObjectStorage('desktopLyricsSettings');
const savedFullscreenLyricsSettings = savedAppSettings.fullscreenLyrics || {};
const savedAppearanceSettings = savedAppSettings.appearance || {};
const savedEqualizerSettings = savedAppSettings.equalizer || {};
const savedEqualizerPresets = readStorage('equalizerPresets', []);
const savedVolume = Number(savedAppSettings.volume ?? .8);

const state = {
  library: [],
  queue: [],
  currentId: null,
  favorites: new Set(readArrayStorage('favorites').filter((item) => typeof item === 'string')),
  history: readArrayStorage('history').filter((item) => typeof item === 'string'),
  playlists: normalizePlaylists(readStorage('playlists', [])),
  lyricFiles: readObjectStorage('lyricFiles'),
  lyricOffsets: readObjectStorage('lyricOffsets'),
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
  fullscreenLyricsSettings: {
    style: FULLSCREEN_LYRIC_STYLES.includes(savedFullscreenLyricsSettings.style) ? savedFullscreenLyricsSettings.style : 'immersive',
    fontSize: ['compact', 'standard', 'large'].includes(savedFullscreenLyricsSettings.fontSize) ? savedFullscreenLyricsSettings.fontSize : 'standard'
  },
  appearanceSettings: {
    theme: Object.hasOwn(APPEARANCE_THEMES, savedAppearanceSettings.theme) ? savedAppearanceSettings.theme : 'crimson',
    fontSize: Object.hasOwn(FONT_SIZE_OPTIONS, savedAppearanceSettings.fontSize) ? savedAppearanceSettings.fontSize : 'standard'
  },
  keyboardShortcuts: normalizeKeyboardShortcuts(savedAppSettings.keyboardShortcuts),
  equalizerSettings: {
    enabled: Boolean(savedEqualizerSettings.enabled),
    gains: normalizeEqualizerGains(savedEqualizerSettings.gains),
    presetId: typeof savedEqualizerSettings.presetId === 'string' ? savedEqualizerSettings.presetId : 'builtin:flat'
  },
  equalizerPresets: normalizeEqualizerPresets(savedEqualizerPresets),
  assistantConfig: { model: '', baseUrl: 'https://api.openai.com/v1', hasApiKey: false, apiKeyProtected: false, loaded: false },
  assistantMessages: [],
  assistantBusy: false,
  playerOpen: false,
  fullscreenLyrics: false,
  playerCloseTimer: null,
  activePlaylistId: null,
  pendingTrackId: null,
  playbackFailureTrackId: null,
  failedTracks: new Map(),
  historyConfirmedTrackId: null,
  view: 'library',
  search: '',
  sortAscending: true,
  shuffle: Boolean(savedAppSettings.shuffle),
  repeat: ['off', 'all', 'one'].includes(savedAppSettings.repeat) ? savedAppSettings.repeat : 'off',
  settingsSection: 'playback',
  listeningSeconds: Number(localStorage.getItem('listeningSeconds') || 0),
  listeningStats: normalizeListeningStats(readStorage('listeningStats', { days: {} })),
  listeningSession: null,
  listeningPersistTicks: 0
};

const viewNames = {
  library: ['你的私人音乐空间', '音乐库', '全部音乐'],
  favorite: ['珍藏每一次心动', '我的喜欢', '喜欢的音乐'],
  recent: ['让熟悉的旋律再次响起', '最近播放', '播放记录'],
  assistant: ['你的本地音乐搭档', 'Yuvis 助手', '智能控制与音乐问答'],
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
  const offsets = { day: 0, today: 0, week: 6, month: 29, year: 364 };
  start.setDate(start.getDate() - (offsets[period] ?? 0));
  return start;
}

function aggregateListeningPeriod(period) {
  const startKey = localDateKey(periodStart(period));
  const endKey = localDateKey();
  const result = { seconds: 0, plays: 0, tracks: new Map() };
  Object.entries(state.listeningStats?.days || {}).forEach(([dateKey, day]) => {
    if (dateKey < startKey || dateKey > endKey) return;
    result.seconds += Number(day.seconds) || 0;
    result.plays += Number(day.plays) || 0;
    Object.entries(day.tracks || {}).forEach(([trackKey, track]) => {
      const seconds = Number(track.seconds) || 0;
      const plays = Number(track.plays) || 0;
      if (!track.valid && seconds < 60 && plays <= 0) return;
      const aggregated = result.tracks.get(trackKey) || { title: track.title || '未知歌曲', plays: 0, seconds: 0 };
      aggregated.title = track.title || aggregated.title;
      aggregated.plays += plays;
      aggregated.seconds += seconds;
      result.tracks.set(trackKey, aggregated);
    });
  });
  const topTracks = [...result.tracks.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds || a.title.localeCompare(b.title, 'zh-CN'));
  return { seconds: result.seconds, plays: result.plays, trackCount: result.tracks.size, topTrack: topTracks[0] || null, topTracks };
}

function listeningPeriodSummary(period) {
  const { seconds, plays, trackCount, topTrack } = aggregateListeningPeriod(period);
  return { seconds, plays, trackCount, topTrack };
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
  updateStats({ liveOnly: true });
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

function normalizeEqualizerGains(values) {
  return EQUALIZER_BANDS.map((_, index) => {
    const gain = Number(Array.isArray(values) ? values[index] : 0);
    return Number.isFinite(gain) ? Math.max(-12, Math.min(12, Math.round(gain * 2) / 2)) : 0;
  });
}

function normalizeEqualizerPresets(presets) {
  if (!Array.isArray(presets)) return [];
  const names = new Set();
  return presets.filter((preset) => preset && typeof preset === 'object').map((preset, index) => ({
    id: String(preset.id || `saved-${index}`).slice(0, 80),
    name: String(preset.name || '').trim().slice(0, 24),
    gains: normalizeEqualizerGains(preset.gains)
  })).filter((preset) => {
    const key = preset.name.toLocaleLowerCase('zh-CN');
    if (!key || names.has(key)) return false;
    names.add(key);
    return true;
  }).slice(0, 30);
}

function persistEqualizerPresets() {
  localStorage.setItem('equalizerPresets', JSON.stringify(state.equalizerPresets));
}

function ensureEqualizerAudioGraph() {
  if (equalizerAudioContext) return true;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    showToast('当前系统不支持声音均衡器');
    return false;
  }
  try {
    equalizerAudioContext = new AudioContextClass();
    equalizerSourceNode = equalizerAudioContext.createMediaElementSource(audio);
    equalizerFilterNodes = EQUALIZER_BANDS.map((frequency) => {
      const filter = equalizerAudioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1.4;
      return filter;
    });
    let previousNode = equalizerSourceNode;
    equalizerFilterNodes.forEach((filter) => {
      previousNode.connect(filter);
      previousNode = filter;
    });
    previousNode.connect(equalizerAudioContext.destination);
    applyEqualizerAudioValues();
    return true;
  } catch (error) {
    console.warn('Unable to initialize equalizer:', error.message);
    equalizerAudioContext = null;
    equalizerSourceNode = null;
    equalizerFilterNodes = [];
    showToast('无法初始化声音均衡器');
    return false;
  }
}

function resumeEqualizerAudio() {
  if (equalizerAudioContext?.state === 'suspended') equalizerAudioContext.resume().catch(() => {});
}

function applyEqualizerAudioValues() {
  if (!equalizerAudioContext || !equalizerFilterNodes.length) return;
  const currentTime = equalizerAudioContext.currentTime;
  equalizerFilterNodes.forEach((filter, index) => {
    const target = state.equalizerSettings.enabled ? state.equalizerSettings.gains[index] : 0;
    filter.gain.cancelScheduledValues(currentTime);
    filter.gain.setTargetAtTime(target, currentTime, .015);
  });
}

function equalizerPresetName() {
  const presetId = state.equalizerSettings.presetId;
  if (presetId?.startsWith('builtin:')) return BUILTIN_EQUALIZER_PRESETS[presetId.slice(8)]?.name || '';
  if (presetId?.startsWith('custom:')) return state.equalizerPresets.find((preset) => preset.id === presetId.slice(7))?.name || '';
  return '';
}

function renderEqualizerPresetOptions() {
  const select = $('#equalizerPresetSelect');
  select.innerHTML = '<option value="">自定义调整</option>'
    + Object.entries(BUILTIN_EQUALIZER_PRESETS).map(([id, preset]) => `<option value="builtin:${id}">${escapeHtml(preset.name)}</option>`).join('')
    + (state.equalizerPresets.length ? '<optgroup label="我的方案">' + state.equalizerPresets.map((preset) => `<option value="custom:${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`).join('') + '</optgroup>' : '');
  const available = [...select.options].some((option) => option.value === state.equalizerSettings.presetId);
  if (!available) state.equalizerSettings.presetId = '';
  select.value = state.equalizerSettings.presetId;
  $('#deleteEqualizerPresetBtn').hidden = !select.value.startsWith('custom:');
}

function formatEqualizerFrequency(frequency) {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
}

function renderEqualizerBands() {
  $('#equalizerBands').innerHTML = EQUALIZER_BANDS.map((frequency, index) => {
    const gain = state.equalizerSettings.gains[index];
    return `<div class="equalizer-band">
      <output data-eq-output="${index}">${gain > 0 ? '+' : ''}${gain.toFixed(1)}</output>
      <input type="range" min="-12" max="12" step="0.5" value="${gain}" data-eq-band="${index}" aria-label="${formatEqualizerFrequency(frequency)} 赫兹增益" />
      <label>${formatEqualizerFrequency(frequency)} Hz</label>
    </div>`;
  }).join('');
}

function renderEqualizerStatus() {
  const settings = state.equalizerSettings;
  const flat = settings.gains.every((gain) => gain === 0);
  const presetName = equalizerPresetName();
  $('#equalizerEnabledInput').checked = settings.enabled;
  $('#equalizerStatus').textContent = !settings.enabled
    ? '均衡器已关闭，声音保持原始输出'
    : presetName ? `已启用「${presetName}」`
      : flat ? '当前为默认平直音效' : '正在使用自定义音效';
  $('#equalizerBtn').classList.toggle('active', settings.enabled && !flat);
  $('#equalizerBtn').title = settings.enabled ? (presetName || '自定义均衡器') : '声音均衡器';
}

function renderEqualizer() {
  renderEqualizerPresetOptions();
  renderEqualizerBands();
  renderEqualizerStatus();
}

function applyEqualizerSettings({ persist = true, render = true } = {}) {
  state.equalizerSettings.gains = normalizeEqualizerGains(state.equalizerSettings.gains);
  applyEqualizerAudioValues();
  if (persist) persistAppSettings();
  if (render) renderEqualizer(); else renderEqualizerStatus();
}

function openEqualizer() {
  closeModals();
  ensureEqualizerAudioGraph();
  resumeEqualizerAudio();
  renderEqualizer();
  openModal($('#equalizerModal'));
}

function applyEqualizerPreset(presetId) {
  let gains = null;
  if (presetId.startsWith('builtin:')) gains = BUILTIN_EQUALIZER_PRESETS[presetId.slice(8)]?.gains;
  else if (presetId.startsWith('custom:')) gains = state.equalizerPresets.find((preset) => preset.id === presetId.slice(7))?.gains;
  if (!gains) return;
  state.equalizerSettings.enabled = true;
  state.equalizerSettings.gains = [...gains];
  state.equalizerSettings.presetId = presetId;
  applyEqualizerSettings();
}

function resetEqualizer() {
  state.equalizerSettings.enabled = true;
  state.equalizerSettings.gains = [...BUILTIN_EQUALIZER_PRESETS.flat.gains];
  state.equalizerSettings.presetId = 'builtin:flat';
  applyEqualizerSettings();
  showToast('均衡器已恢复默认');
}

function saveEqualizerPreset() {
  const input = $('#equalizerPresetNameInput');
  const name = input.value.trim().slice(0, 24);
  if (!name) return showToast('请先输入方案名称');
  const nameKey = name.toLocaleLowerCase('zh-CN');
  let preset = state.equalizerPresets.find((item) => item.name.toLocaleLowerCase('zh-CN') === nameKey);
  if (preset) {
    preset.name = name;
    preset.gains = [...state.equalizerSettings.gains];
  } else {
    if (state.equalizerPresets.length >= 30) return showToast('最多保存 30 个均衡器方案');
    preset = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, gains: [...state.equalizerSettings.gains] };
    state.equalizerPresets.push(preset);
  }
  state.equalizerSettings.presetId = `custom:${preset.id}`;
  state.equalizerSettings.enabled = true;
  persistEqualizerPresets();
  applyEqualizerSettings();
  input.value = '';
  showToast(`均衡器方案「${name}」已保存`);
}

function deleteEqualizerPreset() {
  const presetId = state.equalizerSettings.presetId;
  if (!presetId.startsWith('custom:')) return;
  const id = presetId.slice(7);
  const preset = state.equalizerPresets.find((item) => item.id === id);
  if (!preset || !window.confirm(`确定删除均衡器方案「${preset.name}」吗？`)) return;
  state.equalizerPresets = state.equalizerPresets.filter((item) => item.id !== id);
  persistEqualizerPresets();
  resetEqualizer();
  showToast('均衡器方案已删除');
}

function playAudio() {
  if (state.equalizerSettings.enabled || equalizerAudioContext) ensureEqualizerAudioGraph();
  resumeEqualizerAudio();
  return audio.play();
}

function persistAppSettings() {
  localStorage.setItem('appSettings', JSON.stringify({
    volume: state.volume,
    muted: state.muted,
    shuffle: state.shuffle,
    repeat: state.repeat,
    desktopLyrics: state.desktopLyricsSettings,
    fullscreenLyrics: state.fullscreenLyricsSettings,
    equalizer: {
      enabled: state.equalizerSettings.enabled,
      gains: state.equalizerSettings.gains,
      presetId: state.equalizerSettings.presetId
    },
    appearance: {
      theme: state.appearanceSettings.theme,
      fontSize: state.appearanceSettings.fontSize
    },
    keyboardShortcuts: state.keyboardShortcuts
  }));
}

function shortcutKeyLabel(code) {
  const labels = {
    Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
    Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`'
  };
  if (labels[code]) return labels[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

function shortcutParts(shortcut) {
  return [
    shortcut.ctrl ? 'Ctrl' : '',
    shortcut.alt ? 'Alt' : '',
    shortcut.shift ? 'Shift' : '',
    shortcut.meta ? 'Win' : '',
    shortcutKeyLabel(shortcut.code)
  ].filter(Boolean);
}

function shortcutText(shortcut) {
  return shortcutParts(shortcut).join(' + ');
}

function shortcutHtml(shortcut) {
  return shortcutParts(shortcut).map((part) => `<kbd>${escapeHtml(part)}</kbd>`).join('<b>+</b>');
}

function renderKeyboardShortcuts() {
  Object.keys(SHORTCUT_ACTIONS).forEach((action) => {
    const shortcut = state.keyboardShortcuts[action];
    const recorder = $(`[data-shortcut-action="${action}"]`);
    if (recorder) {
      const recording = recordingShortcutAction === action;
      recorder.classList.toggle('recording', recording);
      recorder.textContent = recording ? '请按下组合键…' : shortcutText(shortcut);
      recorder.setAttribute('aria-pressed', String(recording));
    }
    const display = $(`[data-shortcut-display="${action}"]`);
    if (display) display.innerHTML = shortcutHtml(shortcut);
  });
}

function resetKeyboardShortcuts() {
  recordingShortcutAction = null;
  state.keyboardShortcuts = defaultKeyboardShortcuts();
  persistAppSettings();
  renderKeyboardShortcuts();
  showToast('快捷键已恢复默认');
}

function renderAppearanceSettings() {
  const settings = state.appearanceSettings;
  $('#appearanceThemeOptions').querySelectorAll('[data-theme]').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === settings.theme);
  });
  $('#fontSizeOptions').querySelectorAll('[data-font-size]').forEach((button) => {
    button.classList.toggle('active', button.dataset.fontSize === settings.fontSize);
  });
}

function collectScalableFontRules(rules) {
  for (const rule of rules) {
    if (rule.style?.fontSize && !scalableFontRules.has(rule.style)) scalableFontRules.set(rule.style, rule.style.fontSize);
    if (rule.cssRules) collectScalableFontRules(rule.cssRules);
  }
}

function scaledFontSize(value, factor) {
  if (factor === 1) return value;
  return value.replace(/(-?\d*\.?\d+)(px|vw|vh|rem|em)/g, (_match, number, unit) => {
    const scaled = Math.round(Number(number) * factor * 1000) / 1000;
    return `${scaled}${unit}`;
  });
}

function applyFontSizeSetting() {
  if (!scalableFontRules.size) {
    for (const stylesheet of document.styleSheets) {
      try { collectScalableFontRules(stylesheet.cssRules); } catch { /* Ignore inaccessible third-party stylesheets. */ }
    }
  }
  const factor = FONT_SIZE_OPTIONS[state.appearanceSettings.fontSize] || 1;
  document.documentElement.classList.add('font-size-changing');
  void document.documentElement.offsetWidth;
  for (const [style, originalFontSize] of scalableFontRules) style.fontSize = scaledFontSize(originalFontSize, factor);
  document.documentElement.dataset.fontSize = state.appearanceSettings.fontSize;
  requestAnimationFrame(() => document.documentElement.classList.remove('font-size-changing'));
}

function applyAppearanceSettings({ persist = true } = {}) {
  const settings = state.appearanceSettings;
  const theme = APPEARANCE_THEMES[settings.theme] || APPEARANCE_THEMES.crimson;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--accent', theme.color);
  rootStyle.setProperty('--accent-bright', theme.bright);
  rootStyle.setProperty('--accent-soft', theme.soft);
  rootStyle.setProperty('--accent-rgb', theme.rgb);
  applyFontSizeSetting();
  if (persist) persistAppSettings();
  renderAppearanceSettings();
}

function renderFullscreenLyricsSettings() {
  const settings = state.fullscreenLyricsSettings;
  $('#fullscreenLyricsStyleOptions').querySelectorAll('[data-fullscreen-lyric-style]').forEach((button) => {
    button.classList.toggle('active', button.dataset.fullscreenLyricStyle === settings.style);
  });
  $('#fullscreenLyricsFontOptions').querySelectorAll('[data-fullscreen-lyric-font]').forEach((button) => {
    button.classList.toggle('active', button.dataset.fullscreenLyricFont === settings.fontSize);
  });
}

function applyFullscreenLyricsSettings({ persist = true } = {}) {
  const settings = state.fullscreenLyricsSettings;
  const scales = { compact: .88, standard: 1, large: 1.16 };
  document.body.dataset.fullscreenLyricsStyle = settings.style;
  document.body.style.setProperty('--fullscreen-lyric-scale', scales[settings.fontSize] || 1);
  if (persist) persistAppSettings();
  renderFullscreenLyricsSettings();
  if (state.fullscreenLyrics) requestAnimationFrame(() => updateLyricPosition(audio.currentTime, true));
}

function syncFullscreenLyricsState(fullscreen) {
  const active = Boolean(fullscreen && state.playerOpen);
  state.fullscreenLyrics = active;
  document.body.classList.toggle('fullscreen-lyrics', active);
  const button = $('#fullscreenLyricsBtn');
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? '退出全屏歌词' : '进入全屏歌词');
  button.title = active ? '退出全屏歌词（Esc）' : '全屏歌词';
  button.querySelector('span').textContent = active ? '退出全屏' : '全屏歌词';
  requestAnimationFrame(() => updateLyricPosition(audio.currentTime, true));
}

async function setFullscreenLyrics(fullscreen) {
  if (fullscreen && !state.playerOpen) openNowPlayingPage();
  try {
    const actual = await window.desktop.setFullscreen(Boolean(fullscreen));
    syncFullscreenLyricsState(actual);
  } catch (error) {
    console.warn('Unable to change fullscreen lyrics state:', error);
    syncFullscreenLyricsState(false);
    showToast('无法切换全屏歌词，请稍后重试');
  }
}

function toggleFullscreenLyrics() {
  setFullscreenLyrics(!state.fullscreenLyrics);
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
    shortcuts: ['快捷键', '自定义播放器的键盘组合键'],
    desktopLyrics: ['桌面歌词', '调整桌面悬浮歌词的显示与外观'],
    fullscreenLyrics: ['全屏歌词', '选择全屏歌词的布局与字号'],
    appearance: ['外观设置', '选择应用界面的主题主色'],
    yuvis: ['Yuvis 配置', '连接支持工具调用的 OpenAI 兼容模型']
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
  closeModals();
  renderPlaybackSettings();
  renderDesktopLyricsSettings();
  renderFullscreenLyricsSettings();
  renderAppearanceSettings();
  renderKeyboardShortcuts();
  renderAssistantConfig();
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
  let activeIndex = -1;
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

function playbackFailureDetails(error, pathStatus) {
  if (pathStatus?.exists === false) {
    return {
      category: 'LOCAL FILE MISSING',
      reason: '找不到本地音频文件，文件可能已被移动、重命名或删除'
    };
  }
  if (pathStatus?.exists === true && pathStatus.accessible === false) {
    return {
      category: 'FILE ACCESS DENIED',
      reason: '本地文件仍在原路径，但播放器当前没有读取权限'
    };
  }
  const mediaErrorCode = Number(audio.error?.code || error?.code);
  const mediaDetails = {
    1: { category: 'PLAYBACK ABORTED', reason: '播放请求被系统或用户中止' },
    2: { category: 'FILE READ FAILED', reason: '文件路径有效，但播放器无法读取音频数据，请检查文件是否被其他程序占用' },
    3: { category: 'DECODING FAILED', reason: '文件路径有效，但音频已损坏或使用了播放器无法解码的编码方式' },
    4: { category: 'UNSUPPORTED AUDIO', reason: '本地文件路径有效，但当前音频格式或编码方式不受支持' }
  };
  if (mediaDetails[mediaErrorCode]) return mediaDetails[mediaErrorCode];
  if (error?.name === 'NotAllowedError') {
    return { category: 'PLAYBACK BLOCKED', reason: '系统阻止了播放请求，请再次点击播放后重试' };
  }
  if (error?.name === 'NotSupportedError') {
    return { category: 'UNSUPPORTED AUDIO', reason: '本地文件路径有效，但当前音频格式或编码方式不受支持' };
  }
  if (error?.name === 'AbortError') {
    return { category: 'PLAYBACK ABORTED', reason: '播放请求在音频加载完成前被中止' };
  }
  const detail = String(error?.message || '').trim();
  return {
    category: 'PLAYBACK ERROR',
    reason: detail ? `播放器返回错误：${detail.slice(0, 180)}` : '文件路径有效，但暂时无法读取或解码这个音频文件'
  };
}

function playbackFailureLabel(failure) {
  const labels = {
    'LOCAL FILE MISSING': '路径失效',
    'FILE ACCESS DENIED': '无权读取',
    'UNSUPPORTED AUDIO': '格式不支持',
    'DECODING FAILED': '解码失败',
    'FILE READ FAILED': '读取失败',
    'PLAYBACK BLOCKED': '播放受阻',
    'PLAYBACK ABORTED': '播放中止'
  };
  return labels[failure?.category] || '播放失败';
}

async function showPlaybackFailure(track, error) {
  if (!track || track.id !== state.currentId) return;
  if (state.playbackFailureTrackId === track.id) return;
  state.playbackFailureTrackId = track.id;
  let pathStatus = null;
  try {
    pathStatus = await window.desktop.getTrackPathStatus(track.path);
  } catch (pathError) {
    console.warn('Unable to inspect failed track path:', pathError);
  }
  if (state.playbackFailureTrackId !== track.id || state.currentId !== track.id) return;
  const failure = playbackFailureDetails(error, pathStatus);
  state.failedTracks.set(track.id, failure);
  document.body.classList.add('has-playback-failure');
  $('#playbackErrorTrack').textContent = track.title;
  $('#playbackErrorCategory').textContent = failure.category;
  $('#playbackErrorReason').textContent = failure.reason;
  renderLibrary();
  renderQueue();
  closeModals();
  openModal($('#playbackErrorModal'));
}

function closePlaybackFailure() {
  $('#playbackErrorModal').hidden = true;
  state.playbackFailureTrackId = null;
}

function removeFailedTrackFromLists() {
  const track = state.library.find((item) => item.id === state.playbackFailureTrackId);
  if (!track) return closePlaybackFailure();
  const pathKey = trackPathKey(track.path);
  const queueBefore = state.queue.length;
  state.queue = state.queue.filter((item) => trackPathKey(item.path) !== pathKey);
  let affectedPlaylists = 0;
  state.playlists.forEach((playlist) => {
    const before = playlist.trackPaths.length;
    playlist.trackPaths = playlist.trackPaths.filter((trackPath) => trackPathKey(trackPath) !== pathKey);
    if (playlist.trackPaths.length !== before) affectedPlaylists += 1;
  });
  if (affectedPlaylists) persistPlaylists();
  closePlaybackFailure();
  renderQueue();
  renderPlaylistNav();
  renderLibrary();
  const removedFromQueue = queueBefore !== state.queue.length;
  if (!removedFromQueue && !affectedPlaylists) return showToast('这首歌不在播放列表或歌单中');
  const targets = [removedFromQueue ? '播放列表' : '', affectedPlaylists ? `${affectedPlaylists} 个歌单` : ''].filter(Boolean).join('和');
  showToast(`已从${targets}移出，本地文件仍保留`);
}

function trackPathKey(trackPath) {
  return String(trackPath || '').replaceAll('/', '\\').toLocaleLowerCase('en-US');
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
    const paths = new Set((activePlaylist()?.trackPaths || []).map(trackPathKey));
    tracks = tracks.filter((track) => paths.has(trackPathKey(track.path)));
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
  const paths = new Set((playlist.trackPaths || []).map(trackPathKey));
  return state.library.filter((track) => paths.has(trackPathKey(track.path)));
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
    emptyText.textContent = '将本地音乐文件拖到左侧歌单，或从音乐库添加';
    emptyButton.textContent = '前往音乐库';
  } else {
    emptyTitle.textContent = state.library.length ? '没有找到匹配的音乐' : '音乐库还是空的';
    emptyText.textContent = state.library.length ? '换一个关键词试试看' : '拖入本地音乐文件，或点击按钮开始导入';
    emptyButton.textContent = state.library.length ? '清除搜索' : '选择音乐文件';
  }
  list.innerHTML = tracks.map((track, index) => {
    const failure = state.failedTracks.get(track.id);
    const failureLabel = playbackFailureLabel(failure);
    return `
    <div class="track-row ${track.id === state.currentId ? 'current' : ''} ${failure ? 'playback-failed' : ''}" data-track-id="${escapeHtml(track.id)}"${failure ? ` title="${escapeHtml(failure.reason)}"` : ''}>
      <span class="track-index">${failure
        ? '<span class="failed-track-indicator" role="img" aria-label="播放异常"><svg viewBox="0 0 24 24"><path d="M12 4v9M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg></span>'
        : track.id === state.currentId
          ? `<span class="playing-indicator" role="img" aria-label="${audio.paused ? '已暂停' : '正在播放'}"><i></i><i></i><i></i></span>`
          : String(index + 1).padStart(2, '0')}</span>
      <span class="track-main"><span class="track-identity">
        <span class="track-cover" ${coverStyle(track)}>${track.cover ? '' : '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v11"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="15" r="3"/></svg>'}</span>
        <span class="track-text"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}${failure ? `<em class="track-failure-badge">${failureLabel}</em>` : ''}</span></span>
      </span></span>
      <span class="track-album">${escapeHtml(track.album)}</span>
      <span class="track-date">${new Date(track.modifiedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
      <span class="track-time">${formatTime(track.duration)}</span>
      <span class="track-actions">
        <button class="add-playlist-track" data-add-playlist-id="${escapeHtml(track.id)}" aria-label="添加到歌单"><svg viewBox="0 0 24 24"><path d="M4 6h10M4 11h10M4 16h7M18 13v7M14.5 16.5h7"/></svg></button>
        <button class="favorite-track ${state.favorites.has(track.id) ? 'active' : ''}" data-favorite-id="${escapeHtml(track.id)}" aria-label="喜欢"><svg viewBox="0 0 24 24"><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.7 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" /></svg></button>
      </span>
    </div>`;
  }).join('');
  applyCoverImages(list);
}

function renderQueue() {
  const list = $('#queueList');
  if (!state.queue.length) {
    list.innerHTML = '<div class="queue-empty"><div class="sound-wave"><i></i><i></i><i></i><i></i><i></i></div><span>队列中暂无歌曲</span></div>';
    return;
  }
  list.innerHTML = state.queue.map((track) => {
    const failure = state.failedTracks.get(track.id);
    return `
    <div class="queue-item ${track.id === state.currentId ? 'current' : ''} ${failure ? 'playback-failed' : ''}" data-queue-id="${escapeHtml(track.id)}"${failure ? ` title="${escapeHtml(failure.reason)}"` : ''}>
      <span class="queue-cover" ${coverStyle(track)}>${track.cover ? '' : '♪'}</span>
      <span class="queue-text"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}${failure ? `<em class="track-failure-badge">${playbackFailureLabel(failure)}</em>` : ''}</span></span>
      <button class="remove-queue" data-remove-id="${escapeHtml(track.id)}" aria-label="移出队列"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>`;
  }).join('');
  applyCoverImages(list);
}

function renderNowPlaying() {
  const track = currentTrack();
  document.body.classList.toggle('has-playback-failure', Boolean(track && state.failedTracks.has(track.id)));
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
  const storagePercent = Math.min(100, Math.max(2, totalBytes / (10 * 1024 ** 3) * 100));
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
    ['近一天', 'day'],
    ['近一周', 'week'],
    ['近一个月', 'month'],
    ['近一年', 'year']
  ].map(([label, key]) => [label, key, aggregateListeningPeriod(key)]);

  $('#statsSection').innerHTML = `
    <div class="stats-summary-grid">
      <article class="stats-summary-card primary"><span>音乐总数</span><strong>${tracks.length}</strong><small>首本地歌曲</small></article>
      <article class="stats-summary-card"><span>乐库总时长</span><strong>${formatDuration(totalDuration)}</strong><small>完整播放一遍</small></article>
      <article class="stats-summary-card"><span>累计聆听</span><strong id="statsTotalListening">${formatListeningDuration(totalListeningSeconds())}</strong><small>从播放第一秒开始累计</small></article>
      <article class="stats-summary-card storage"><span>存储占用</span><strong>${formatSize(totalBytes)}</strong><div class="stats-storage-track"><i style="width:${storagePercent}%"></i></div><small>本地音乐 · 仅保存在你的设备上</small></article>
    </div>
    <div class="listening-period-section">
      <div class="listening-period-heading"><div><span>LISTENING</span><h3>听歌时间统计</h3></div><small>时长实时累计 · 歌曲数需听满 1 分钟</small></div>
      <div class="listening-period-grid">
        ${listeningPeriods.map(([label, key, period]) => `
          <article class="listening-period-card" data-listening-period="${key}">
            <span>${label}</span>
            <strong data-listening-duration>${formatListeningDuration(period.seconds)}</strong>
            <div><em data-listening-tracks>${period.trackCount} 首歌曲</em><i data-listening-plays>${period.plays} 次有效播放</i></div>
            <section class="listening-period-top">
              <small>听得最多</small>
              <b data-listening-top-title title="${escapeHtml(period.topTrack?.title || '暂无数据')}">${escapeHtml(period.topTrack?.title || '暂无数据')}</b>
              <em data-listening-top-plays>${period.topTrack ? `${period.topTrack.plays} 次` : '尚无有效播放'}</em>
            </section>
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

function updateLiveStatistics() {
  const total = $('#statsTotalListening');
  if (!total) return renderStatistics();
  total.textContent = formatListeningDuration(totalListeningSeconds());
  ['day', 'week', 'month', 'year'].forEach((key) => {
    const card = document.querySelector(`[data-listening-period="${key}"]`);
    if (!card) return;
    const period = aggregateListeningPeriod(key);
    card.querySelector('[data-listening-duration]').textContent = formatListeningDuration(period.seconds);
    card.querySelector('[data-listening-tracks]').textContent = `${period.trackCount} 首歌曲`;
    card.querySelector('[data-listening-plays]').textContent = `${period.plays} 次有效播放`;
    const topTitle = card.querySelector('[data-listening-top-title]');
    topTitle.textContent = period.topTrack?.title || '暂无数据';
    topTitle.title = period.topTrack?.title || '暂无数据';
    card.querySelector('[data-listening-top-plays]').textContent = period.topTrack ? `${period.topTrack.plays} 次` : '尚无有效播放';
  });
}

function updateStats({ liveOnly = false } = {}) {
  if (state.view !== 'stats') return;
  if (liveOnly) updateLiveStatistics();
  else renderStatistics();
}

function assistantTrack(track) {
  return track ? {
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationSeconds: Math.round(Number(track.duration) || 0),
    favorite: state.favorites.has(track.id)
  } : null;
}

function findAssistantTracks(query, limit = 10) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('zh-CN');
  if (!normalizedQuery) return [];
  return state.library
    .map((track) => {
      const title = track.title.toLocaleLowerCase('zh-CN');
      const artist = track.artist.toLocaleLowerCase('zh-CN');
      const album = track.album.toLocaleLowerCase('zh-CN');
      const score = title === normalizedQuery ? 0
        : title.startsWith(normalizedQuery) ? 1
          : artist === normalizedQuery ? 2
            : title.includes(normalizedQuery) ? 3
              : artist.includes(normalizedQuery) ? 4
                : album.includes(normalizedQuery) ? 5 : 99;
      return { track, score };
    })
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.track.title.localeCompare(b.track.title, 'zh-CN'))
    .slice(0, Math.max(1, Math.min(20, Number(limit) || 10)))
    .map((item) => item.track);
}

async function executeAssistantTool(name, args = {}) {
  if (name === 'get_player_state') {
    return {
      track: assistantTrack(currentTrack()),
      playing: Boolean(state.currentId && !audio.paused),
      currentSeconds: Math.round(audio.currentTime || 0),
      volumePercent: Math.round(state.volume * 100),
      muted: state.muted,
      repeat: state.repeat,
      shuffle: state.shuffle
    };
  }
  if (name === 'control_playback') {
    if (args.action === 'pause') audio.pause();
    else if (args.action === 'toggle') togglePlay();
    else if (!state.currentId) togglePlay();
    else await playAudio();
    return { ok: true, playing: !audio.paused, track: assistantTrack(currentTrack()) };
  }
  if (name === 'next_track' || name === 'previous_track') {
    nextTrack(name === 'next_track' ? 1 : -1);
    return { ok: true, track: assistantTrack(currentTrack()) };
  }
  if (name === 'play_track') {
    const track = findAssistantTracks(args.query, 1)[0];
    if (!track) return { ok: false, error: '音乐库中没有找到匹配歌曲' };
    if (!state.queue.some((item) => trackPathKey(item.path) === trackPathKey(track.path))) state.queue.push(track);
    loadTrack(track);
    return { ok: true, track: assistantTrack(track) };
  }
  if (name === 'search_library') {
    const tracks = findAssistantTracks(args.query, args.limit);
    return { count: tracks.length, tracks: tracks.map(assistantTrack) };
  }
  if (name === 'get_favorite_tracks') {
    const limit = Math.max(1, Math.min(30, Number(args.limit) || 20));
    const tracks = state.library.filter((track) => state.favorites.has(track.id)).slice(0, limit);
    return { count: tracks.length, tracks: tracks.map(assistantTrack) };
  }
  if (name === 'get_recent_tracks') {
    const limit = Math.max(1, Math.min(30, Number(args.limit) || 20));
    const trackMap = new Map(state.library.map((track) => [track.id, track]));
    const tracks = state.history.map((id) => trackMap.get(id)).filter(Boolean).slice(0, limit);
    return { count: tracks.length, tracks: tracks.map(assistantTrack) };
  }
  if (name === 'get_library_summary') {
    return {
      tracks: state.library.length,
      favorites: state.library.filter((track) => state.favorites.has(track.id)).length,
      artists: new Set(state.library.map((track) => track.artist)).size,
      albums: new Set(state.library.map((track) => track.album)).size,
      totalDurationSeconds: Math.round(state.library.reduce((sum, track) => sum + (Number(track.duration) || 0), 0)),
      playlists: state.playlists.length
    };
  }
  if (name === 'get_current_lyrics') {
    const track = currentTrack();
    if (!track) return { ok: false, error: '当前没有播放歌曲' };
    if (!state.currentLyrics?.lines?.length) return { ok: false, error: '当前歌曲没有歌词', track: assistantTrack(track) };
    const lyrics = state.currentLyrics.lines.slice(0, 200).map((line) => ({
      timeSeconds: Number.isFinite(line.time) ? Math.round(line.time * 10) / 10 : null,
      text: line.translation ? `${line.text} / ${line.translation}` : line.text
    }));
    return { ok: true, track: assistantTrack(track), synced: state.currentLyrics.synced, truncated: state.currentLyrics.lines.length > lyrics.length, lyrics };
  }
  if (name === 'set_volume') {
    state.volume = Math.max(0, Math.min(1, (Number(args.percent) || 0) / 100));
    state.muted = false;
    applyPlaybackSettings();
    return { ok: true, volumePercent: Math.round(state.volume * 100) };
  }
  if (name === 'seek_to') {
    if (!state.currentId) return { ok: false, error: '当前没有播放歌曲' };
    const requested = Math.max(0, Number(args.seconds) || 0);
    audio.currentTime = Number.isFinite(audio.duration) ? Math.min(requested, audio.duration) : requested;
    updatePlaybackProgress();
    return { ok: true, currentSeconds: Math.round(audio.currentTime) };
  }
  if (name === 'set_repeat') {
    if (!['off', 'all', 'one'].includes(args.mode)) return { ok: false, error: '不支持的循环方式' };
    state.repeat = args.mode;
    applyPlaybackSettings();
    return { ok: true, repeat: state.repeat };
  }
  if (name === 'set_shuffle') {
    state.shuffle = Boolean(args.enabled);
    applyPlaybackSettings();
    return { ok: true, shuffle: state.shuffle };
  }
  if (name === 'get_queue') return { count: state.queue.length, tracks: state.queue.slice(0, 50).map(assistantTrack) };
  if (name === 'add_to_queue') {
    const track = findAssistantTracks(args.query, 1)[0];
    if (!track) return { ok: false, error: '音乐库中没有找到匹配歌曲' };
    const exists = state.queue.some((item) => trackPathKey(item.path) === trackPathKey(track.path));
    if (!exists) state.queue.push(track);
    renderQueue();
    return { ok: true, added: !exists, track: assistantTrack(track) };
  }
  if (name === 'remove_from_queue') {
    const normalizedQuery = String(args.query || '').trim().toLocaleLowerCase('zh-CN');
    if (!normalizedQuery) return { ok: false, error: '请提供歌曲名或艺术家' };
    const index = state.queue.findIndex((track) => [track.title, track.artist, track.album]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery)));
    if (index < 0) return { ok: false, error: '播放队列中没有找到匹配歌曲' };
    const [track] = state.queue.splice(index, 1);
    renderQueue();
    return { ok: true, track: assistantTrack(track), remaining: state.queue.length };
  }
  if (name === 'clear_queue') {
    const removed = state.queue.length;
    state.queue = [];
    renderQueue();
    return { ok: true, removed };
  }
  if (name === 'set_current_favorite') {
    const track = currentTrack();
    if (!track) return { ok: false, error: '当前没有播放歌曲' };
    const enabled = Boolean(args.enabled);
    if (enabled) state.favorites.add(track.id); else state.favorites.delete(track.id);
    localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
    $('#playerFavoriteBtn').classList.toggle('active', enabled);
    renderLibrary();
    renderNowPlaying();
    updateStats();
    return { ok: true, favorite: enabled, track: assistantTrack(track) };
  }
  if (name === 'get_playlists') {
    return { playlists: state.playlists.map((playlist) => ({ name: playlist.name, tracks: playlistTracks(playlist).length })) };
  }
  if (name === 'create_playlist') {
    const playlistName = String(args.name || '').trim().slice(0, 30);
    if (!playlistName) return { ok: false, error: '歌单名称不能为空' };
    if (state.playlists.some((playlist) => playlist.name.toLocaleLowerCase('zh-CN') === playlistName.toLocaleLowerCase('zh-CN'))) {
      return { ok: false, error: '已经存在同名歌单' };
    }
    state.playlists.push({
      id: `playlist-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: playlistName,
      trackPaths: [],
      createdAt: Date.now()
    });
    persistPlaylists();
    renderPlaylistNav();
    updateStats();
    return { ok: true, playlist: playlistName };
  }
  if (name === 'play_playlist') {
    const query = String(args.name || '').trim().toLocaleLowerCase('zh-CN');
    const playlist = state.playlists.find((item) => item.name.toLocaleLowerCase('zh-CN') === query)
      || state.playlists.find((item) => item.name.toLocaleLowerCase('zh-CN').includes(query));
    if (!playlist) return { ok: false, error: '没有找到该歌单' };
    const tracks = playlistTracks(playlist);
    if (!tracks.length) return { ok: false, error: '该歌单没有歌曲' };
    state.queue = [...tracks];
    renderQueue();
    loadTrack(tracks[0]);
    return { ok: true, playlist: playlist.name, tracks: tracks.length, playing: assistantTrack(tracks[0]) };
  }
  if (name === 'add_current_to_playlist') {
    const track = currentTrack();
    if (!track) return { ok: false, error: '当前没有播放歌曲' };
    const query = String(args.name || '').trim().toLocaleLowerCase('zh-CN');
    const playlist = state.playlists.find((item) => item.name.toLocaleLowerCase('zh-CN') === query)
      || state.playlists.find((item) => item.name.toLocaleLowerCase('zh-CN').includes(query));
    if (!playlist) return { ok: false, error: '没有找到该歌单' };
    const exists = playlist.trackPaths.some((trackPath) => trackPathKey(trackPath) === trackPathKey(track.path));
    if (!exists) {
      playlist.trackPaths.push(track.path);
      persistPlaylists();
      renderPlaylistNav();
    }
    return { ok: true, added: !exists, playlist: playlist.name, track: assistantTrack(track) };
  }
  if (name === 'get_listening_statistics') {
    return Object.fromEntries(['day', 'week', 'month', 'year'].map((period) => [period, listeningPeriodSummary(period)]));
  }
  if (name === 'get_most_played_tracks') {
    const period = ['day', 'week', 'month', 'year'].includes(args.period) ? args.period : 'day';
    const limit = Math.max(1, Math.min(10, Number(args.limit) || 5));
    const stats = aggregateListeningPeriod(period);
    return { period, ...listeningPeriodSummary(period), tracks: stats.topTracks.slice(0, limit) };
  }
  if (name === 'set_desktop_lyrics') {
    state.desktopLyricsSettings.enabled = Boolean(args.enabled);
    applyDesktopLyricsSettings({ notify: true });
    return { ok: true, enabled: state.desktopLyricsSettings.enabled };
  }
  return { ok: false, error: `未知工具：${name}` };
}

function assistantConfigured() {
  return Boolean(state.assistantConfig.model && state.assistantConfig.baseUrl);
}

function recentAssistantMessages(limit = 36) {
  if (state.assistantMessages.length <= limit) return [...state.assistantMessages];
  let start = state.assistantMessages.length - limit;
  while (start > 0 && state.assistantMessages[start].role !== 'user') start -= 1;
  return state.assistantMessages.slice(start);
}

function renderAssistantConfig() {
  const config = state.assistantConfig;
  $('#assistantModelInput').value = config.model || '';
  $('#assistantBaseUrlInput').value = config.baseUrl || 'https://api.openai.com/v1';
  $('#assistantApiKeyInput').value = '';
  $('#assistantApiKeyInput').placeholder = config.hasApiKey ? '已保存，留空保持不变' : '输入 API Key（本地模型可留空）';
  $('#assistantKeyStatus').textContent = config.hasApiKey
    ? (config.apiKeyProtected ? 'API Key 已使用系统加密保存' : 'API Key 已保存在本机')
    : '尚未保存 API Key（本地模型可不填）';
  $('#clearAssistantKeyBtn').hidden = !config.hasApiKey;
}

function assistantParameterType(schema = {}) {
  if (Array.isArray(schema.enum)) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  const range = Number.isFinite(schema.minimum) || Number.isFinite(schema.maximum)
    ? ` ${Number.isFinite(schema.minimum) ? `≥ ${schema.minimum}` : ''}${Number.isFinite(schema.minimum) && Number.isFinite(schema.maximum) ? '，' : ''}${Number.isFinite(schema.maximum) ? `≤ ${schema.maximum}` : ''}`
    : '';
  const length = Number.isFinite(schema.minLength) || Number.isFinite(schema.maxLength)
    ? ` ${Number.isFinite(schema.minLength) ? `长度 ≥ ${schema.minLength}` : ''}${Number.isFinite(schema.minLength) && Number.isFinite(schema.maxLength) ? '，' : ''}${Number.isFinite(schema.maxLength) ? `长度 ≤ ${schema.maxLength}` : ''}`
    : '';
  return `${schema.type || 'any'}${range}${length}`;
}

function renderAIDocumentation() {
  const list = $('#aiToolList');
  if (!list) return;
  $('#aiToolCount').textContent = `${ASSISTANT_TOOLS.length} 个接口`;
  $('#aiCapabilityGrid').innerHTML = AI_TOOL_GROUPS.map((group) => `
    <article class="ai-capability-card">
      <strong>${escapeHtml(group.name)} · ${group.tools.length}</strong>
      <span>${escapeHtml(group.summary)}</span>
    </article>`).join('');

  const toolsByName = new Map(ASSISTANT_TOOLS.map((tool) => [tool.function.name, tool.function]));
  const documented = new Set(AI_TOOL_GROUPS.flatMap((group) => group.tools));
  const groups = [...AI_TOOL_GROUPS];
  const uncategorized = ASSISTANT_TOOLS.map((tool) => tool.function.name).filter((name) => !documented.has(name));
  if (uncategorized.length) groups.push({ name: '其他接口', summary: '', tools: uncategorized });

  list.innerHTML = groups.map((group) => {
    const entries = group.tools.map((name) => toolsByName.get(name)).filter(Boolean).map((tool) => {
      const properties = tool.parameters?.properties || {};
      const required = new Set(tool.parameters?.required || []);
      const signature = Object.entries(properties)
        .map(([parameter, schema]) => `${parameter}${required.has(parameter) ? '*' : '?'}: ${schema.type || 'any'}`)
        .join(', ');
      const parameterRows = Object.entries(properties).length
        ? Object.entries(properties).map(([parameter, schema]) => `<p><code>${escapeHtml(parameter)}</code>${required.has(parameter) ? '<b> *</b>' : ''} — <code>${escapeHtml(assistantParameterType(schema))}</code></p>`).join('')
        : '<p>无需参数，调用时传入空对象 <code>{}</code>。</p>';
      return `<details class="ai-tool-item">
        <summary><code>${escapeHtml(tool.name)}(${escapeHtml(signature)})</code><span>${escapeHtml(tool.description)}</span></summary>
        <div class="ai-tool-parameters">${parameterRows}</div>
      </details>`;
    }).join('');
    return `<div class="ai-tool-group"><h5 class="ai-tool-group-title">${escapeHtml(group.name)} · ${group.tools.length}</h5>${entries}</div>`;
  }).join('');
}

function renderAssistant() {
  const visibleMessages = state.assistantMessages.filter((message) => ['user', 'assistant'].includes(message.role) && message.content);
  $('#assistantWelcome').hidden = visibleMessages.length > 0;
  $('#assistantMessages').innerHTML = visibleMessages.map((message) => `
    <article class="assistant-message ${message.role}">
      <span>${message.role === 'assistant' ? 'Y' : '你'}</span>
      <p>${escapeHtml(message.content)}</p>
    </article>`).join('') + (state.assistantBusy ? '<article class="assistant-message assistant thinking"><span>Y</span><p><i></i><i></i><i></i></p></article>' : '');
  $('#assistantConfigHint').hidden = assistantConfigured();
  $('#assistantInput').disabled = state.assistantBusy || !assistantConfigured();
  $('#assistantSendBtn').disabled = state.assistantBusy || !assistantConfigured();
  $('#newAssistantChatBtn').disabled = state.assistantBusy || state.assistantMessages.length === 0;
  requestAnimationFrame(() => { $('#assistantMessages').scrollTop = $('#assistantMessages').scrollHeight; });
}

function startNewAssistantChat() {
  if (state.assistantBusy || state.assistantMessages.length === 0) return;
  state.assistantMessages = [];
  const input = $('#assistantInput');
  input.value = '';
  input.style.height = '';
  renderAssistant();
  if (assistantConfigured()) input.focus();
  showToast('已创建新对话');
}

async function loadAssistantConfig() {
  try {
    state.assistantConfig = { ...state.assistantConfig, ...await window.desktop.getAssistantConfig(), loaded: true };
  } catch {
    state.assistantConfig.loaded = true;
  }
  renderAssistantConfig();
  renderAssistant();
}

async function saveAssistantConfiguration(clearApiKey = false) {
  const button = $('#saveAssistantConfigBtn');
  button.disabled = true;
  try {
    const saved = await window.desktop.saveAssistantConfig({
      model: $('#assistantModelInput').value,
      baseUrl: $('#assistantBaseUrlInput').value,
      apiKey: clearApiKey ? '' : $('#assistantApiKeyInput').value,
      clearApiKey
    });
    state.assistantConfig = { ...state.assistantConfig, ...saved, loaded: true };
    renderAssistantConfig();
    renderAssistant();
    showToast(clearApiKey ? 'API Key 已清除' : 'Yuvis 配置已保存');
  } catch (error) {
    showToast(error.message || '无法保存 Yuvis 配置');
  } finally {
    button.disabled = false;
  }
}

async function sendAssistantMessage(prompt) {
  const content = String(prompt || '').trim();
  if (!content || state.assistantBusy) return;
  if (!assistantConfigured()) return openSettings('yuvis');
  state.assistantMessages.push({ role: 'user', content });
  state.assistantBusy = true;
  renderAssistant();
  try {
    for (let round = 0; round < 6; round += 1) {
      const response = await window.desktop.completeAssistant({
        messages: [{ role: 'system', content: ASSISTANT_SYSTEM_PROMPT }, ...recentAssistantMessages()],
        tools: ASSISTANT_TOOLS
      });
      state.assistantMessages.push(response);
      if (!response.tool_calls?.length) break;
      for (const toolCall of response.tool_calls) {
        let args = {};
        try { args = JSON.parse(toolCall.function?.arguments || '{}'); } catch { args = {}; }
        let result;
        try {
          result = await executeAssistantTool(toolCall.function?.name, args);
        } catch (error) {
          result = { ok: false, error: error.message || '工具执行失败' };
        }
        state.assistantMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
      if (round === 5) state.assistantMessages.push({ role: 'assistant', content: '这次操作步骤较多，我已经执行了能够完成的部分。' });
    }
  } catch (error) {
    state.assistantMessages.push({ role: 'assistant', content: error.message || 'Yuvis 助手暂时无法连接模型，请检查配置。' });
  } finally {
    if (state.assistantMessages.length > 60) {
      let start = state.assistantMessages.length - 60;
      while (start < state.assistantMessages.length && state.assistantMessages[start].role !== 'user') start += 1;
      if (start < state.assistantMessages.length) state.assistantMessages.splice(0, start);
    }
    state.assistantBusy = false;
    renderAssistant();
  }
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
  $('.header-actions').hidden = ['stats', 'assistant'].includes(state.view);
  $('.library-section').hidden = ['stats', 'assistant'].includes(state.view);
  $('#statsSection').hidden = state.view !== 'stats';
  $('#assistantSection').hidden = state.view !== 'assistant';
  $('#deletePlaylistBtn').hidden = state.view !== 'playlist';
  updateNavigationState();
  renderPlaylistNav();
  renderLibrary();
  if (state.view === 'stats') renderStatistics();
  if (state.view === 'assistant') renderAssistant();
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
  if (state.fullscreenLyrics) setFullscreenLyrics(false);
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

function mergeTracks(newTracks, { notify = true } = {}) {
  const existing = new Set(state.library.map((track) => trackPathKey(track.path)));
  const additions = [];
  newTracks.forEach((track) => {
    const key = trackPathKey(track.path);
    if (!key || existing.has(key)) return;
    existing.add(key);
    additions.push(track);
  });
  state.library.push(...additions);
  persistLibrary();
  renderLibrary();
  updateStats();
  if (notify) showToast(additions.length ? `已添加 ${additions.length} 首音乐` : '没有发现新的音乐');
  return additions;
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

function isFileDrag(dataTransfer) {
  return [...(dataTransfer?.types || [])].includes('Files');
}

function droppedFilePaths(dataTransfer) {
  return [...(dataTransfer?.files || [])].map((file) => {
    try {
      return window.desktop.getDroppedFilePath(file);
    } catch {
      return '';
    }
  }).filter(Boolean);
}

function clearFileDropTarget() {
  document.body.classList.remove('library-file-drop', 'playlist-file-drop');
  document.querySelectorAll('#playlistNav .file-drop-target').forEach((item) => item.classList.remove('file-drop-target'));
}

function updateFileDropTarget(target) {
  clearFileDropTarget();
  const element = target instanceof Element ? target : null;
  const playlistItem = element?.closest('#playlistNav [data-playlist-id]');
  if (playlistItem) {
    playlistItem.classList.add('file-drop-target');
    return;
  }
  if (element?.closest('.main-content') && state.view === 'playlist' && activePlaylist()) {
    document.body.classList.add('playlist-file-drop');
  } else if (element?.closest('.main-content, [data-view="library"]')) {
    document.body.classList.add('library-file-drop');
  }
}

async function importDroppedMusic(paths, playlistId = null) {
  if (!paths.length) return showToast('没有读取到可导入的文件');
  showToast('正在读取拖入的音乐…');
  const tracks = await window.desktop.loadDroppedTracks(paths);
  if (!tracks.length) return showToast('拖入的文件中没有支持的音乐');
  const libraryAdditions = mergeTracks(tracks, { notify: false });
  if (!playlistId) {
    showToast(libraryAdditions.length ? `已添加 ${libraryAdditions.length} 首音乐` : '这些歌曲已在音乐库中');
    return;
  }
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist) return showToast('目标歌单已不存在');
  const playlistPaths = new Set((playlist.trackPaths || []).map(trackPathKey));
  let playlistAdditions = 0;
  tracks.forEach((droppedTrack) => {
    const libraryTrack = state.library.find((track) => trackPathKey(track.path) === trackPathKey(droppedTrack.path));
    const key = trackPathKey(libraryTrack?.path);
    if (!libraryTrack || playlistPaths.has(key)) return;
    playlistPaths.add(key);
    playlist.trackPaths.push(libraryTrack.path);
    playlistAdditions += 1;
  });
  if (playlistAdditions) persistPlaylists();
  renderPlaylistNav();
  if (state.view === 'playlist' && state.activePlaylistId === playlistId) renderLibrary();
  showToast(playlistAdditions
    ? `已向「${playlist.name}」添加 ${playlistAdditions} 首音乐`
    : `这些歌曲已在「${playlist.name}」中`);
}

function addToHistory(id) {
  state.history = [id, ...state.history.filter((item) => item !== id)].slice(0, 100);
  localStorage.setItem('history', JSON.stringify(state.history));
}

function loadTrack(track, autoplay = true) {
  if (!track) return;
  beginListeningSession(track);
  state.currentId = track.id;
  state.playbackFailureTrackId = null;
  state.historyConfirmedTrackId = null;
  if (!state.queue.some((item) => item.id === track.id)) state.queue.push(track);
  audio.src = track.url;
  $('#playerTitle').textContent = track.title;
  $('#playerArtist').textContent = track.artist;
  $('#playerCover').style.backgroundImage = track.cover ? `url('${track.cover}')` : '';
  $('.cover-note').style.display = track.cover ? 'none' : 'block';
  $('#playerFavoriteBtn').classList.toggle('active', state.favorites.has(track.id));
  renderLibrary();
  renderQueue();
  renderNowPlaying();
  renderLyrics(track);
  loadAssignedLyrics(track);
  updateStats();
  if (autoplay) attemptPlayback(track);
}

async function attemptPlayback(track = currentTrack()) {
  if (!track) return false;
  try {
    await playAudio();
    return true;
  } catch (error) {
    await showPlaybackFailure(track, error);
    return false;
  }
}

function togglePlay() {
  if (!state.currentId) {
    const first = state.queue[0] || getVisibleTracks()[0] || state.library[0];
    if (first) loadTrack(first); else showToast('请先添加音乐');
    return;
  }
  audio.paused ? attemptPlayback() : audio.pause();
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
  if (playlist.trackPaths.some((trackPath) => trackPathKey(trackPath) === trackPathKey(track.path))) {
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
$('#fullscreenLyricsBtn').addEventListener('click', toggleFullscreenLyrics);
$('#desktopLyricsBtn').addEventListener('click', toggleDesktopLyrics);
$('#sidebarSettingsBtn').addEventListener('click', () => openSettings('playback'));
$('.settings-sidebar nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-settings-section]');
  if (button) showSettingsSection(button.dataset.settingsSection);
});
$('.shortcut-setting-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-shortcut-action]');
  if (!button) return;
  recordingShortcutAction = button.dataset.shortcutAction;
  renderKeyboardShortcuts();
  button.focus();
});
$('.shortcut-setting-list').addEventListener('keydown', (event) => {
  const button = event.target.closest('[data-shortcut-action]');
  if (!button || recordingShortcutAction !== button.dataset.shortcutAction) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    recordingShortcutAction = null;
    renderKeyboardShortcuts();
    return;
  }
  if (event.repeat || SHORTCUT_MODIFIER_CODES.has(event.code)) return;
  if (!event.code || event.code === 'Unidentified' || event.code.startsWith('Media')) {
    showToast('媒体控制键已固定启用，请按其他组合键');
    return;
  }
  const shortcut = {
    code: event.code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
  const duplicate = Object.entries(state.keyboardShortcuts).find(([action, current]) => (
    action !== recordingShortcutAction && shortcutSignature(current) === shortcutSignature(shortcut)
  ));
  if (duplicate) {
    showToast(`该组合键已用于“${SHORTCUT_ACTIONS[duplicate[0]].label}”`);
    return;
  }
  state.keyboardShortcuts[recordingShortcutAction] = shortcut;
  recordingShortcutAction = null;
  persistAppSettings();
  renderKeyboardShortcuts();
  showToast('快捷键已更新');
});
$('.shortcut-setting-list').addEventListener('focusout', (event) => {
  if (!event.target.closest('[data-shortcut-action]') || !recordingShortcutAction) return;
  recordingShortcutAction = null;
  renderKeyboardShortcuts();
});
$('#resetShortcutsBtn').addEventListener('click', resetKeyboardShortcuts);
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
$('#fontSizeOptions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-font-size]');
  if (!button || !Object.hasOwn(FONT_SIZE_OPTIONS, button.dataset.fontSize)) return;
  state.appearanceSettings.fontSize = button.dataset.fontSize;
  applyAppearanceSettings();
  showToast(`字体大小已切换为「${button.querySelector('span').textContent}」`);
});
$('#fullscreenLyricsStyleOptions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-fullscreen-lyric-style]');
  if (!button || !FULLSCREEN_LYRIC_STYLES.includes(button.dataset.fullscreenLyricStyle)) return;
  state.fullscreenLyricsSettings.style = button.dataset.fullscreenLyricStyle;
  applyFullscreenLyricsSettings();
  showToast(`全屏歌词已切换为「${button.querySelector('strong').textContent}」`);
});
$('#fullscreenLyricsFontOptions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-fullscreen-lyric-font]');
  if (!button || !['compact', 'standard', 'large'].includes(button.dataset.fullscreenLyricFont)) return;
  state.fullscreenLyricsSettings.fontSize = button.dataset.fullscreenLyricFont;
  applyFullscreenLyricsSettings();
  showToast(`全屏歌词字号已切换为「${button.textContent}」`);
});
$('#equalizerBtn').addEventListener('click', openEqualizer);
$('#aiDocsTitleBtn').addEventListener('click', () => {
  closeModals();
  renderAIDocumentation();
  openModal($('#aiDocsModal'));
});
$('#shortcutsTitleBtn').addEventListener('click', () => {
  closeModals();
  renderKeyboardShortcuts();
  openModal($('#shortcutsModal'));
});
$('#openShortcutSettingsBtn').addEventListener('click', () => openSettings('shortcuts'));
$('#aboutTitleBtn').addEventListener('click', () => {
  closeModals();
  openModal($('#aboutModal'));
});
$('#equalizerEnabledInput').addEventListener('change', (event) => {
  state.equalizerSettings.enabled = event.target.checked;
  applyEqualizerSettings({ render: false });
  showToast(event.target.checked ? '均衡器已启用' : '均衡器已关闭');
});
$('#equalizerPresetSelect').addEventListener('change', (event) => {
  if (event.target.value) applyEqualizerPreset(event.target.value);
  else {
    state.equalizerSettings.presetId = '';
    applyEqualizerSettings({ render: false });
  }
});
$('#equalizerBands').addEventListener('input', (event) => {
  const range = event.target.closest('[data-eq-band]');
  if (!range) return;
  const index = Number(range.dataset.eqBand);
  const gain = Math.max(-12, Math.min(12, Number(range.value) || 0));
  state.equalizerSettings.gains[index] = gain;
  state.equalizerSettings.enabled = true;
  state.equalizerSettings.presetId = '';
  const output = $(`[data-eq-output="${index}"]`);
  output.textContent = `${gain > 0 ? '+' : ''}${gain.toFixed(1)}`;
  $('#equalizerPresetSelect').value = '';
  $('#deleteEqualizerPresetBtn').hidden = true;
  applyEqualizerSettings({ persist: false, render: false });
});
$('#equalizerBands').addEventListener('change', () => persistAppSettings());
$('#resetEqualizerBtn').addEventListener('click', resetEqualizer);
$('#saveEqualizerPresetBtn').addEventListener('click', saveEqualizerPreset);
$('#deleteEqualizerPresetBtn').addEventListener('click', deleteEqualizerPreset);
$('#equalizerPresetNameInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveEqualizerPreset();
  }
});
$('#saveAssistantConfigBtn').addEventListener('click', () => saveAssistantConfiguration(false));
$('#clearAssistantKeyBtn').addEventListener('click', () => saveAssistantConfiguration(true));
$('#openAssistantConfigBtn').addEventListener('click', () => openSettings('yuvis'));
$('#newAssistantChatBtn').addEventListener('click', startNewAssistantChat);
$('#assistantForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#assistantInput');
  const message = input.value;
  input.value = '';
  input.style.height = '';
  sendAssistantMessage(message);
});
$('#assistantInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('#assistantForm').requestSubmit();
  }
});
$('#assistantInput').addEventListener('input', (event) => {
  event.target.style.height = 'auto';
  event.target.style.height = `${Math.min(110, event.target.scrollHeight)}px`;
});
$('.assistant-suggestions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-assistant-prompt]');
  if (button) sendAssistantMessage(button.dataset.assistantPrompt);
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
      attemptPlayback().then((played) => {
        if (played) showToast(`已从 ${formatTime(targetTime)} 开始播放`);
      });
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
  if (!playlist) return;
  $('#deletePlaylistName').textContent = playlist.name;
  $('#deletePlaylistModal').dataset.playlistId = playlist.id;
  openModal($('#deletePlaylistModal'));
  setTimeout(() => $('#confirmDeletePlaylistBtn').focus(), 30);
});
$('#confirmDeletePlaylistBtn').addEventListener('click', () => {
  const playlistId = $('#deletePlaylistModal').dataset.playlistId;
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist) return closeModals();
  state.playlists = state.playlists.filter((item) => item.id !== playlist.id);
  persistPlaylists();
  state.activePlaylistId = null;
  state.view = 'library';
  closeModals();
  renderView();
  showToast('歌单已删除');
});
$('#keepFailedTrackBtn').addEventListener('click', closePlaybackFailure);
$('#removeFailedTrackBtn').addEventListener('click', removeFailedTrackFromLists);
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModals));
document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.addEventListener('click', (event) => {
  if (event.target === modal && modal.id !== 'playbackErrorModal') closeModals();
}));

document.addEventListener('dragover', (event) => {
  if (!isFileDrag(event.dataTransfer)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  updateFileDropTarget(event.target);
});
document.addEventListener('drop', (event) => {
  if (!isFileDrag(event.dataTransfer)) return;
  event.preventDefault();
  const element = event.target instanceof Element ? event.target : null;
  const sidebarPlaylistId = element?.closest('#playlistNav [data-playlist-id]')?.dataset.playlistId || null;
  const pagePlaylistId = element?.closest('.main-content') && state.view === 'playlist' ? activePlaylist()?.id : null;
  const playlistId = sidebarPlaylistId || pagePlaylistId || null;
  const libraryTarget = Boolean(element?.closest('.main-content, [data-view="library"]'));
  const paths = droppedFilePaths(event.dataTransfer);
  clearFileDropTarget();
  if (!playlistId && !libraryTarget) return showToast('请将音乐拖到音乐库或左侧歌单');
  importDroppedMusic(paths, playlistId).catch(() => showToast('导入音乐失败，请检查文件是否仍然存在'));
});
document.addEventListener('dragleave', (event) => {
  if (event.relatedTarget === null) clearFileDropTarget();
});
window.addEventListener('blur', clearFileDropTarget);

document.addEventListener('pointerdown', (event) => {
  if (document.body.classList.contains('queue-open') && !event.target.closest('#queuePanel') && !event.target.closest('#queueToggleBtn')) {
    closeQueueMenu();
  }
  const actionable = event.target.closest('button, input, select, textarea, label, a, [role="button"], [data-track-id], [data-queue-id], [data-playlist-id]');
  if (state.playerOpen && actionable && !actionable.closest('.now-playing-sheet') && !actionable.closest('.player-bar') && !actionable.closest('.queue-panel')) {
    closeNowPlayingPage();
  }
});

function eventMatchesShortcut(event, shortcut) {
  return event.code === shortcut.code
    && event.ctrlKey === shortcut.ctrl
    && event.altKey === shortcut.alt
    && event.shiftKey === shortcut.shift
    && event.metaKey === shortcut.meta;
}

function executeKeyboardShortcut(action) {
  if (action === 'previous') nextTrack(-1);
  else if (action === 'togglePlayback') togglePlay();
  else if (action === 'next') nextTrack(1);
  else if (action === 'search') $('#searchInput').focus();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const openModalElement = [...document.querySelectorAll('.modal-backdrop')].find((modal) => !modal.hidden);
    if (openModalElement?.id === 'playbackErrorModal') closePlaybackFailure();
    else if (openModalElement) closeModals();
    else if (document.body.classList.contains('queue-open')) closeQueueMenu();
    else if (state.fullscreenLyrics) setFullscreenLyrics(false);
    else if (state.playerOpen) closeNowPlayingPage();
  }
  const isInteractive = document.activeElement.matches('input, button, select, textarea, [contenteditable="true"]');
  if (event.repeat) return;
  if (event.code === 'MediaPlayPause') {
    event.preventDefault();
    togglePlay();
    return;
  }
  if (event.code === 'MediaTrackPrevious') {
    event.preventDefault();
    nextTrack(-1);
    return;
  }
  if (event.code === 'MediaTrackNext') {
    event.preventDefault();
    nextTrack(1);
    return;
  }
  if (isInteractive) return;
  const action = Object.keys(SHORTCUT_ACTIONS).find((shortcutAction) => eventMatchesShortcut(event, state.keyboardShortcuts[shortcutAction]));
  if (!action) return;
  event.preventDefault();
  executeKeyboardShortcut(action);
});

if ('mediaSession' in navigator) {
  const mediaActions = {
    play: () => state.currentId ? attemptPlayback() : togglePlay(),
    pause: () => audio.pause(),
    previoustrack: () => nextTrack(-1),
    nexttrack: () => nextTrack(1)
  };
  Object.entries(mediaActions).forEach(([action, handler]) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported media action. */ }
  });
}

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
audio.addEventListener('play', () => {
  document.body.classList.add('is-playing');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  const track = currentTrack();
  if (track) {
    const clearedFailure = state.failedTracks.delete(track.id);
    state.playbackFailureTrackId = null;
    document.body.classList.remove('has-playback-failure');
    if (clearedFailure) {
      renderQueue();
      renderNowPlaying();
    }
  }
  if (track && state.historyConfirmedTrackId !== track.id) {
    addToHistory(track.id);
    state.historyConfirmedTrackId = track.id;
    updateStats();
  }
  renderLibrary();
  runLyricClock();
});
audio.addEventListener('pause', () => {
  document.body.classList.remove('is-playing');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  renderLibrary();
  stopLyricClock();
  updateLyricPosition(audio.currentTime);
});
audio.addEventListener('error', () => showPlaybackFailure(currentTrack(), audio.error));
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
  if (state.repeat === 'one') { beginListeningSession(currentTrack()); audio.currentTime = 0; attemptPlayback(); }
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
window.desktop.onFullscreen((fullscreen) => syncFullscreenLyricsState(fullscreen));
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
  applyFullscreenLyricsSettings({ persist: false });
  applyPlaybackSettings();
  applyEqualizerSettings({ persist: false });
  applyDesktopLyricsSettings();
  await loadAssistantConfig();
  renderView();
  renderQueue();
  updateStats();
  const savedPaths = readArrayStorage('libraryPaths').filter((item) => typeof item === 'string');
  if (savedPaths.length) {
    const restored = await window.desktop.restoreTracks(savedPaths);
    state.library = restored;
    renderView();
    updateStats();
  }
}

init();
