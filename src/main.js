const { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { pathToFileURL } = require('url');

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma'
]);
const METADATA_CONCURRENCY = 6;

let mainWindow;
let desktopLyricsWindow;
let desktopLyricsVisible = false;
let desktopLyricsPayload = null;
let desktopLyricsDragState = null;
let gameLyricsWindow;
let gameLyricsVisible = false;
let gameLyricsPayload = null;
let gameLyricsDragState = null;
let gameLyricsDisplayId = null;
let assistantConfigCache = null;
let desktopLyricsSettings = {
  dualLine: true,
  locked: false,
  style: 'classic',
  primaryColor: '#ff3156',
  secondaryColor: '#ffffff'
};
let gameLyricsSettings = {
  dualLine: true,
  fontSize: 'standard',
  locked: false,
  side: 'left',
  verticalRatio: .5
};

function assistantConfigPath() {
  return path.join(app.getPath('userData'), 'yuvis-assistant.json');
}

async function readAssistantConfig() {
  if (assistantConfigCache) return assistantConfigCache;
  try {
    const saved = JSON.parse(await fs.readFile(assistantConfigPath(), 'utf8'));
    assistantConfigCache = saved && typeof saved === 'object' ? saved : {};
  } catch {
    assistantConfigCache = {};
  }
  return assistantConfigCache;
}

function assistantApiKey(config) {
  try {
    if (config.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(config.encryptedApiKey, 'base64'));
    }
  } catch (error) {
    console.warn('Unable to decrypt Yuvis assistant API key:', error.message);
  }
  return typeof config.apiKey === 'string' ? config.apiKey : '';
}

function publicAssistantConfig(config) {
  const apiKey = assistantApiKey(config);
  return {
    model: typeof config.model === 'string' ? config.model : '',
    baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : 'https://api.openai.com/v1',
    hasApiKey: Boolean(apiKey),
    apiKeyProtected: Boolean(config.encryptedApiKey)
  };
}

function assistantChatEndpoint(baseUrl) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('模型地址必须使用 HTTP 或 HTTPS');
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/chat/completions') ? pathname : `${pathname}/chat/completions`;
  return url.toString();
}

function normalizedAssistantToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.filter((toolCall) => toolCall && typeof toolCall === 'object' && toolCall.function?.name).map((toolCall, index) => {
    const argumentsValue = toolCall.function.arguments;
    return {
      id: String(toolCall.id || `yuvis-tool-${Date.now()}-${index}`),
      type: 'function',
      function: {
        name: String(toolCall.function.name),
        arguments: typeof argumentsValue === 'string' ? argumentsValue : JSON.stringify(argumentsValue || {})
      }
    };
  });
}

function normalizedAssistantMessages(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(-40).map((message) => {
    if (!message || !['system', 'user', 'assistant', 'tool'].includes(message.role)) return null;
    const normalized = { role: message.role, content: typeof message.content === 'string' ? message.content : '' };
    if (message.role === 'assistant') {
      const toolCalls = normalizedAssistantToolCalls(message.tool_calls);
      if (toolCalls.length) normalized.tool_calls = toolCalls;
    }
    if (message.role === 'tool') {
      if (typeof message.tool_call_id !== 'string' || !message.tool_call_id) return null;
      normalized.tool_call_id = message.tool_call_id;
    }
    return normalized;
  }).filter(Boolean);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function migrateLegacyUserData() {
  const currentUserData = app.getPath('userData');
  const appData = app.getPath('appData');
  const targetStorage = path.join(currentUserData, 'Local Storage');
  if (await pathExists(targetStorage)) return;

  for (const legacyName of ['一点音乐', 'yidian-music']) {
    const legacyStorage = path.join(appData, legacyName, 'Local Storage');
    if (legacyStorage === targetStorage || !(await pathExists(legacyStorage))) continue;
    await fs.mkdir(currentUserData, { recursive: true });
    await fs.cp(legacyStorage, targetStorage, { recursive: true, errorOnExist: true });
    console.log(`Migrated local library data from ${legacyName} to Yuvis音乐`);
    break;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    frame: false,
    backgroundColor: '#f7f7f5',
    icon: path.join(__dirname, 'app-icon.png'),
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  const showMainWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  };
  mainWindow.once('ready-to-show', showMainWindow);
  mainWindow.webContents.once('did-finish-load', showMainWindow);
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window:fullscreen', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('window:fullscreen', false));
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) desktopLyricsWindow.destroy();
    if (gameLyricsWindow && !gameLyricsWindow.isDestroyed()) gameLyricsWindow.destroy();
  });
}

function createDesktopLyricsWindow() {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) return desktopLyricsWindow;
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1000, Math.max(560, workArea.width - 120));
  const height = 170;
  desktopLyricsWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height - height - 110),
    minWidth: 480,
    minHeight: 120,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: !desktopLyricsSettings.locked,
    movable: !desktopLyricsSettings.locked,
    show: false,
    title: 'Yuvis音乐 · 桌面歌词',
    webPreferences: {
      preload: path.join(__dirname, 'desktop-lyrics-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  desktopLyricsWindow.setAlwaysOnTop(true, 'screen-saver');
  applyDesktopLyricsWindowLock();
  desktopLyricsWindow.loadFile(path.join(__dirname, 'desktop-lyrics.html'));
  desktopLyricsWindow.webContents.on('did-finish-load', () => {
    desktopLyricsWindow?.webContents.send('desktop-lyrics:settings', desktopLyricsSettings);
    desktopLyricsWindow?.webContents.send('desktop-lyrics:update', desktopLyricsPayload);
    if (desktopLyricsVisible) desktopLyricsWindow?.showInactive();
  });
  desktopLyricsWindow.on('closed', () => {
    desktopLyricsDragState = null;
    desktopLyricsWindow = null;
  });
  return desktopLyricsWindow;
}

function applyDesktopLyricsWindowLock() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const movable = !desktopLyricsSettings.locked;
  desktopLyricsWindow.setResizable(movable);
  if (typeof desktopLyricsWindow.setMovable === 'function') desktopLyricsWindow.setMovable(movable);
}

function setDesktopLyricsLocked(locked, notifyMain = true) {
  desktopLyricsSettings.locked = Boolean(locked);
  if (desktopLyricsSettings.locked) desktopLyricsDragState = null;
  applyDesktopLyricsWindowLock();
  desktopLyricsWindow?.webContents.send('desktop-lyrics:settings', desktopLyricsSettings);
  if (notifyMain && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-lyrics:lock', desktopLyricsSettings.locked);
  }
}

function setDesktopLyricsVisible(visible) {
  desktopLyricsVisible = Boolean(visible);
  if (desktopLyricsVisible) createDesktopLyricsWindow().showInactive();
  else desktopLyricsWindow?.hide();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-lyrics:visibility', desktopLyricsVisible);
  }
}

function gameLyricsBounds(display = screen.getPrimaryDisplay()) {
  const displayBounds = display.bounds;
  const width = Math.min(520, Math.max(380, Math.round(displayBounds.width * .3)));
  const height = 188;
  const verticalTravel = Math.max(0, displayBounds.height - height);
  const verticalRatio = Number.isFinite(gameLyricsSettings.verticalRatio) ? gameLyricsSettings.verticalRatio : .5;
  return {
    x: gameLyricsSettings.side === 'right' ? displayBounds.x + displayBounds.width - width : displayBounds.x,
    y: Math.round(displayBounds.y + verticalTravel * Math.max(0, Math.min(1, verticalRatio))),
    width,
    height
  };
}

function positionGameLyricsWindow() {
  if (!gameLyricsWindow || gameLyricsWindow.isDestroyed()) return;
  const currentDisplay = screen.getAllDisplays().find((display) => display.id === gameLyricsDisplayId)
    || screen.getDisplayMatching(gameLyricsWindow.getBounds())
    || screen.getPrimaryDisplay();
  gameLyricsDisplayId = currentDisplay.id;
  gameLyricsWindow.setBounds(gameLyricsBounds(currentDisplay), false);
}

function applyGameLyricsWindowLock() {
  if (!gameLyricsWindow || gameLyricsWindow.isDestroyed()) return;
  gameLyricsWindow.setResizable(false);
  if (typeof gameLyricsWindow.setMovable === 'function') gameLyricsWindow.setMovable(!gameLyricsSettings.locked);
}

function notifyGameLyricsSettings() {
  gameLyricsWindow?.webContents.send('game-lyrics:settings', gameLyricsSettings);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game-lyrics:settings-updated', gameLyricsSettings);
  }
}

function setGameLyricsLocked(locked) {
  gameLyricsSettings.locked = Boolean(locked);
  if (gameLyricsSettings.locked) gameLyricsDragState = null;
  applyGameLyricsWindowLock();
  notifyGameLyricsSettings();
}

function snapGameLyricsWindow(preferredSide = null) {
  if (!gameLyricsWindow || gameLyricsWindow.isDestroyed()) return;
  const currentBounds = gameLyricsWindow.getBounds();
  const center = {
    x: currentBounds.x + currentBounds.width / 2,
    y: currentBounds.y + currentBounds.height / 2
  };
  const display = screen.getDisplayNearestPoint(center);
  const displayBounds = display.bounds;
  const leftDistance = Math.abs(currentBounds.x - displayBounds.x);
  const rightDistance = Math.abs(displayBounds.x + displayBounds.width - (currentBounds.x + currentBounds.width));
  gameLyricsSettings.side = ['left', 'right'].includes(preferredSide)
    ? preferredSide
    : leftDistance <= rightDistance ? 'left' : 'right';
  const verticalTravel = Math.max(0, displayBounds.height - currentBounds.height);
  const clampedY = Math.max(displayBounds.y, Math.min(currentBounds.y, displayBounds.y + verticalTravel));
  gameLyricsSettings.verticalRatio = verticalTravel ? (clampedY - displayBounds.y) / verticalTravel : 0;
  gameLyricsDisplayId = display.id;
  gameLyricsWindow.setBounds(gameLyricsBounds(display), false);
  notifyGameLyricsSettings();
}

function createGameLyricsWindow() {
  if (gameLyricsWindow && !gameLyricsWindow.isDestroyed()) return gameLyricsWindow;
  gameLyricsWindow = new BrowserWindow({
    ...gameLyricsBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    show: false,
    title: 'Yuvis音乐 · 游戏歌词',
    webPreferences: {
      preload: path.join(__dirname, 'game-lyrics-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  gameLyricsWindow.setAlwaysOnTop(true, 'screen-saver');
  gameLyricsWindow.setIgnoreMouseEvents(false);
  gameLyricsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  gameLyricsDisplayId = screen.getPrimaryDisplay().id;
  applyGameLyricsWindowLock();
  gameLyricsWindow.loadFile(path.join(__dirname, 'game-lyrics.html'));
  gameLyricsWindow.webContents.on('did-finish-load', () => {
    gameLyricsWindow?.webContents.send('game-lyrics:settings', gameLyricsSettings);
    gameLyricsWindow?.webContents.send('game-lyrics:update', gameLyricsPayload);
    if (gameLyricsVisible) gameLyricsWindow?.showInactive();
  });
  gameLyricsWindow.on('closed', () => {
    gameLyricsDragState = null;
    gameLyricsWindow = null;
  });
  return gameLyricsWindow;
}

function setGameLyricsVisible(visible) {
  gameLyricsVisible = Boolean(visible);
  if (gameLyricsVisible) {
    const lyricsWindow = createGameLyricsWindow();
    positionGameLyricsWindow();
    lyricsWindow.showInactive();
  } else {
    gameLyricsDragState = null;
    gameLyricsWindow?.hide();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game-lyrics:visibility', gameLyricsVisible);
  }
}

async function walkDirectory(directory, result = { files: [], skipped: [] }) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    result.skipped.push({ path: directory, code: error.code || 'UNKNOWN' });
    return result;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(fullPath, result);
    } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      result.files.push(fullPath);
    }
  }
  return result;
}

function pictureToDataUrl(picture) {
  if (!picture?.data || !picture?.format) return null;
  return `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`;
}

function normalizeEmbeddedLyrics(lyrics, audioFormat = {}) {
  if (!Array.isArray(lyrics) || !lyrics.length) return null;
  const selected = lyrics.find((item) => item?.syncText?.length) || lyrics.find((item) => item?.text);
  if (!selected) return null;
  const timestampFormat = selected.timeStampFormat;
  const sampleRate = audioFormat.sampleRate;
  const framesToSeconds = timestampFormat === 1 && Number.isFinite(sampleRate)
    ? (timestamp) => timestamp * 1152 / sampleRate
    : null;
  const canSynchronize = timestampFormat !== 1 || Boolean(framesToSeconds);
  return {
    source: 'embedded',
    text: selected.text || selected.syncText?.map((line) => line.text).join('\n') || '',
    syncedLines: (canSynchronize ? selected.syncText || [] : [])
      .filter((line) => Number.isFinite(line.timestamp))
      .map((line) => ({
        time: framesToSeconds ? framesToSeconds(line.timestamp) : line.timestamp / 1000,
        text: line.text || ''
      }))
  };
}

async function readTextFile(filePath) {
  const stats = await fs.stat(filePath);
  if (stats.size > 5 * 1024 * 1024) throw new Error('Lyrics file is too large');
  const buffer = await fs.readFile(filePath);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    return new TextDecoder('utf-16le').decode(swapped);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('gb18030').decode(buffer);
  }
}

async function findSidecarLyrics(filePath) {
  const basePath = filePath.slice(0, -path.extname(filePath).length);
  for (const extension of ['.lrc', '.txt']) {
    const lyricsPath = `${basePath}${extension}`;
    try {
      return { source: 'sidecar', path: lyricsPath, text: await readTextFile(lyricsPath), syncedLines: [] };
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`Unable to read lyrics: ${lyricsPath}`, error.message);
    }
  }
  return null;
}

async function getTrackInfo(filePath) {
  const normalizedPath = path.resolve(filePath);
  const stats = await fs.stat(normalizedPath);
  let metadata = {};
  try {
    const { parseFile } = await import('music-metadata');
    metadata = await parseFile(normalizedPath, { duration: true, skipCovers: false });
  } catch (error) {
    if (['EACCES', 'EPERM'].includes(error.code)) throw error;
    console.warn(`Unable to parse metadata: ${normalizedPath}`, error.message);
  }

  const common = metadata.common || {};
  const format = metadata.format || {};
  const filename = path.basename(normalizedPath, path.extname(normalizedPath));
  const embeddedLyrics = normalizeEmbeddedLyrics(common.lyrics, format);
  const lyrics = embeddedLyrics || await findSidecarLyrics(normalizedPath);
  return {
    id: `${normalizedPath}:${stats.mtimeMs}`,
    path: normalizedPath,
    url: pathToFileURL(normalizedPath).href,
    title: common.title || filename,
    artist: common.artist || common.albumartist || '未知艺术家',
    album: common.album || '未知专辑',
    year: common.year || null,
    duration: Number.isFinite(format.duration) ? format.duration : 0,
    cover: pictureToDataUrl(common.picture?.[0]),
    lyrics,
    size: stats.size,
    modifiedAt: stats.mtimeMs
  };
}

async function loadTracks(paths) {
  const uniquePathMap = new Map();
  for (const filePath of Array.isArray(paths) ? paths : []) {
    if (typeof filePath !== 'string' || !AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;
    const normalizedPath = path.resolve(filePath);
    const key = process.platform === 'win32' ? normalizedPath.toLocaleLowerCase('en-US') : normalizedPath;
    if (!uniquePathMap.has(key)) uniquePathMap.set(key, normalizedPath);
  }
  const uniquePaths = [...uniquePathMap.values()];
  const tracks = new Array(uniquePaths.length);
  const permissionFailures = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < uniquePaths.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        tracks[index] = await getTrackInfo(uniquePaths[index]);
      } catch (error) {
        if (['EACCES', 'EPERM'].includes(error.code)) permissionFailures.push(uniquePaths[index]);
        console.warn(`Unable to load track: ${uniquePaths[index]}`, error.message);
      }
    }
  };
  const workerCount = Math.min(METADATA_CONCURRENCY, uniquePaths.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  if (permissionFailures.length && mainWindow && !mainWindow.isDestroyed()) {
    const preview = permissionFailures.slice(0, 6).map((filePath) => `• ${filePath}`).join('\n');
    const remaining = permissionFailures.length > 6 ? `\n另有 ${permissionFailures.length - 6} 个文件未列出。` : '';
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '部分音乐文件无法访问',
      message: `已跳过 ${permissionFailures.length} 个没有读取权限的文件`,
      detail: `${preview}${remaining}\n\n请检查文件权限后重新导入。`,
      buttons: ['知道了'],
      defaultId: 0,
      noLink: true
    });
  }
  return tracks.filter(Boolean);
}

ipcMain.handle('library:choose-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择音乐',
    buttonLabel: '添加到音乐库',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '音频文件', extensions: [...AUDIO_EXTENSIONS].map((ext) => ext.slice(1)) },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  return result.canceled ? [] : loadTracks(result.filePaths);
});

ipcMain.handle('library:choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入本地音乐',
    buttonLabel: '扫描此文件夹',
    properties: ['openDirectory']
  });
  if (result.canceled) return [];
  const scan = await walkDirectory(result.filePaths[0]);
  if (scan.skipped.length) {
    const preview = scan.skipped.slice(0, 6).map((item) => `• ${item.path}（${item.code}）`).join('\n');
    const remaining = scan.skipped.length > 6 ? `\n另有 ${scan.skipped.length - 6} 个目录未列出。` : '';
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '部分目录无法访问',
      message: `已跳过 ${scan.skipped.length} 个无法读取的目录`,
      detail: `${preview}${remaining}\n\n可访问目录中的音乐仍会正常导入。`,
      buttons: ['知道了'],
      defaultId: 0,
      noLink: true
    });
  }
  return loadTracks(scan.files);
});

ipcMain.handle('library:restore', async (_event, paths) => {
  const validPaths = Array.isArray(paths) ? paths.filter((item) => typeof item === 'string') : [];
  return loadTracks(validPaths);
});

ipcMain.handle('library:load-dropped', async (_event, paths) => {
  const validPaths = Array.isArray(paths) ? paths.filter((item) => typeof item === 'string') : [];
  return loadTracks(validPaths);
});

ipcMain.handle('track:get-path-status', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { exists: false, accessible: false, code: 'INVALID_PATH' };
  }
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return { exists: false, accessible: false, code: 'NOT_A_FILE' };
    const handle = await fs.open(filePath, 'r');
    await handle.close();
    return { exists: true, accessible: true, code: null };
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    const missing = ['ENOENT', 'ENOTDIR'].includes(code);
    return { exists: !missing, accessible: false, code };
  }
});

ipcMain.handle('lyrics:choose-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '为当前音乐选择歌词文件',
    buttonLabel: '使用此歌词',
    properties: ['openFile'],
    filters: [
      { name: '歌词文件', extensions: ['lrc', 'txt'] }
    ]
  });
  if (result.canceled) return null;
  const lyricsPath = result.filePaths[0];
  return { path: lyricsPath, name: path.basename(lyricsPath), text: await readTextFile(lyricsPath) };
});

ipcMain.handle('lyrics:read-file', async (_event, lyricsPath) => {
  if (typeof lyricsPath !== 'string') return null;
  if (!['.lrc', '.txt'].includes(path.extname(lyricsPath).toLowerCase())) return null;
  try {
    return { path: lyricsPath, name: path.basename(lyricsPath), text: await readTextFile(lyricsPath) };
  } catch {
    return null;
  }
});

ipcMain.handle('assistant:get-config', async () => publicAssistantConfig(await readAssistantConfig()));

ipcMain.handle('assistant:save-config', async (_event, nextConfig) => {
  const current = await readAssistantConfig();
  const model = String(nextConfig?.model || '').trim().slice(0, 200);
  const baseUrl = String(nextConfig?.baseUrl || '').trim().slice(0, 2048);
  if (baseUrl) assistantChatEndpoint(baseUrl);
  const saved = {
    model,
    baseUrl: baseUrl || 'https://api.openai.com/v1'
  };
  if (!nextConfig?.clearApiKey) {
    const newApiKey = typeof nextConfig?.apiKey === 'string' ? nextConfig.apiKey.trim() : '';
    if (newApiKey) {
      if (safeStorage.isEncryptionAvailable()) {
        saved.encryptedApiKey = safeStorage.encryptString(newApiKey).toString('base64');
      } else {
        saved.apiKey = newApiKey;
      }
    } else if (current.encryptedApiKey) {
      saved.encryptedApiKey = current.encryptedApiKey;
    } else if (current.apiKey) {
      saved.apiKey = current.apiKey;
    }
  }
  await fs.writeFile(assistantConfigPath(), JSON.stringify(saved, null, 2), 'utf8');
  assistantConfigCache = saved;
  return publicAssistantConfig(saved);
});

ipcMain.handle('assistant:complete', async (_event, payload) => {
  const config = await readAssistantConfig();
  const model = String(config.model || '').trim();
  const baseUrl = String(config.baseUrl || '').trim();
  if (!model || !baseUrl) throw new Error('请先在设置中完成 Yuvis 配置');
  const messages = normalizedAssistantMessages(payload?.messages);
  const tools = Array.isArray(payload?.tools) ? payload.tools.slice(0, 30) : [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const apiKey = assistantApiKey(config);
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const requestBody = { model, messages, temperature: 0.4 };
    if (tools.length) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }
    const response = await fetch(assistantChatEndpoint(baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const responseText = await response.text();
    let data = null;
    try { data = JSON.parse(responseText); } catch { data = null; }
    if (!response.ok) {
      const detail = data?.error?.message || data?.message || responseText || `HTTP ${response.status}`;
      throw new Error(`模型请求失败：${String(detail).slice(0, 500)}`);
    }
    const message = data?.choices?.[0]?.message;
    if (!message || typeof message !== 'object') throw new Error('模型没有返回有效回复');
    const result = {
      role: 'assistant',
      content: typeof message.content === 'string' ? message.content : ''
    };
    const toolCalls = normalizedAssistantToolCalls(message.tool_calls);
    if (toolCalls.length) result.tool_calls = toolCalls;
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('模型请求超时，请检查模型地址或网络');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
});

ipcMain.handle('track:show-in-folder', (_event, filePath) => {
  if (typeof filePath === 'string') shell.showItemInFolder(filePath);
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:set-fullscreen', (event, fullscreen) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
  mainWindow.setFullScreen(Boolean(fullscreen));
  return mainWindow.isFullScreen();
});
ipcMain.on('window:close', () => mainWindow?.close());

ipcMain.on('desktop-lyrics:set-visible', (_event, visible) => setDesktopLyricsVisible(visible));
ipcMain.on('desktop-lyrics:update', (_event, payload) => {
  desktopLyricsPayload = payload && typeof payload === 'object' ? payload : null;
  desktopLyricsWindow?.webContents.send('desktop-lyrics:update', desktopLyricsPayload);
});
ipcMain.on('desktop-lyrics:set-settings', (_event, settings) => {
  if (!settings || typeof settings !== 'object') return;
  const nextSettings = { ...desktopLyricsSettings, ...settings };
  desktopLyricsSettings = {
    dualLine: nextSettings.dualLine !== false,
    locked: Boolean(nextSettings.locked),
    style: ['plain', 'classic', 'outline', 'soft'].includes(nextSettings.style) ? nextSettings.style : 'classic',
    primaryColor: /^#[0-9a-f]{6}$/i.test(nextSettings.primaryColor) ? nextSettings.primaryColor : '#ff3156',
    secondaryColor: /^#[0-9a-f]{6}$/i.test(nextSettings.secondaryColor) ? nextSettings.secondaryColor : '#ffffff'
  };
  applyDesktopLyricsWindowLock();
  desktopLyricsWindow?.webContents.send('desktop-lyrics:settings', desktopLyricsSettings);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-lyrics:settings-updated', desktopLyricsSettings);
  }
});
ipcMain.on('desktop-lyrics:set-locked', (_event, locked) => setDesktopLyricsLocked(locked));
ipcMain.on('desktop-lyrics:hide', () => setDesktopLyricsVisible(false));
ipcMain.on('desktop-lyrics:drag-start', (event, point) => {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed() || desktopLyricsSettings.locked) return;
  if (event.sender !== desktopLyricsWindow.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const bounds = desktopLyricsWindow.getBounds();
  desktopLyricsDragState = { offsetX: point.x - bounds.x, offsetY: point.y - bounds.y };
});
ipcMain.on('desktop-lyrics:drag-move', (event, point) => {
  if (!desktopLyricsDragState || !desktopLyricsWindow || desktopLyricsWindow.isDestroyed() || desktopLyricsSettings.locked) return;
  if (event.sender !== desktopLyricsWindow.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const x = Math.round(point.x - desktopLyricsDragState.offsetX);
  const y = Math.round(point.y - desktopLyricsDragState.offsetY);
  desktopLyricsWindow.setPosition(x, y, false);
});
ipcMain.on('desktop-lyrics:drag-end', (event) => {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed() && event.sender !== desktopLyricsWindow.webContents) return;
  desktopLyricsDragState = null;
});

ipcMain.on('game-lyrics:set-visible', (_event, visible) => setGameLyricsVisible(visible));
ipcMain.on('game-lyrics:update', (_event, payload) => {
  gameLyricsPayload = payload && typeof payload === 'object' ? payload : null;
  gameLyricsWindow?.webContents.send('game-lyrics:update', gameLyricsPayload);
});
ipcMain.on('game-lyrics:set-settings', (_event, settings) => {
  if (!settings || typeof settings !== 'object') return;
  const nextSettings = { ...gameLyricsSettings, ...settings };
  gameLyricsSettings = {
    dualLine: nextSettings.dualLine !== false,
    fontSize: ['compact', 'standard', 'large'].includes(nextSettings.fontSize) ? nextSettings.fontSize : 'standard',
    locked: Boolean(nextSettings.locked),
    side: ['left', 'right'].includes(nextSettings.side) ? nextSettings.side : 'left',
    verticalRatio: Number.isFinite(nextSettings.verticalRatio)
      ? Math.max(0, Math.min(1, nextSettings.verticalRatio))
      : .5
  };
  applyGameLyricsWindowLock();
  positionGameLyricsWindow();
  notifyGameLyricsSettings();
});
ipcMain.on('game-lyrics:set-locked', (event, locked) => {
  if (!gameLyricsWindow || gameLyricsWindow.isDestroyed() || event.sender !== gameLyricsWindow.webContents) return;
  setGameLyricsLocked(locked);
});
ipcMain.on('game-lyrics:snap-side', (event, side) => {
  if (!gameLyricsWindow || gameLyricsWindow.isDestroyed() || event.sender !== gameLyricsWindow.webContents) return;
  snapGameLyricsWindow(side);
});
ipcMain.on('game-lyrics:hide', (event) => {
  if (!gameLyricsWindow || gameLyricsWindow.isDestroyed() || event.sender !== gameLyricsWindow.webContents) return;
  setGameLyricsVisible(false);
});
ipcMain.on('game-lyrics:drag-start', (event, point) => {
  if (!gameLyricsWindow || gameLyricsWindow.isDestroyed() || gameLyricsSettings.locked) return;
  if (event.sender !== gameLyricsWindow.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  const bounds = gameLyricsWindow.getBounds();
  gameLyricsDragState = { offsetX: point.x - bounds.x, offsetY: point.y - bounds.y };
});
ipcMain.on('game-lyrics:drag-move', (event, point) => {
  if (!gameLyricsDragState || !gameLyricsWindow || gameLyricsWindow.isDestroyed() || gameLyricsSettings.locked) return;
  if (event.sender !== gameLyricsWindow.webContents || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  gameLyricsWindow.setPosition(
    Math.round(point.x - gameLyricsDragState.offsetX),
    Math.round(point.y - gameLyricsDragState.offsetY),
    false
  );
});
ipcMain.on('game-lyrics:drag-end', (event) => {
  if (!gameLyricsWindow || gameLyricsWindow.isDestroyed() || event.sender !== gameLyricsWindow.webContents) return;
  if (!gameLyricsDragState) return;
  gameLyricsDragState = null;
  snapGameLyricsWindow();
});

app.whenReady().then(() => {
  migrateLegacyUserData()
    .catch((error) => console.warn('Unable to migrate legacy user data:', error.message))
    .finally(createWindow);
  screen.on('display-metrics-changed', positionGameLyricsWindow);
  screen.on('display-added', positionGameLyricsWindow);
  screen.on('display-removed', positionGameLyricsWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
