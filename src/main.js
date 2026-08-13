const { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { pathToFileURL } = require('url');

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma'
]);

let mainWindow;
let desktopLyricsWindow;
let desktopLyricsVisible = false;
let desktopLyricsPayload = null;
let desktopLyricsDragState = null;
let assistantConfigCache = null;
let desktopLyricsSettings = {
  dualLine: true,
  locked: false,
  style: 'classic',
  primaryColor: '#ff3156',
  secondaryColor: '#ffffff'
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
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) desktopLyricsWindow.destroy();
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

async function walkDirectory(directory) {
  const found = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await walkDirectory(fullPath));
    } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      found.push(fullPath);
    }
  }
  return found;
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
  const settled = await Promise.allSettled(uniquePaths.map(getTrackInfo));
  return settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
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
  const files = await walkDirectory(result.filePaths[0]);
  return loadTracks(files);
});

ipcMain.handle('library:restore', async (_event, paths) => {
  const validPaths = Array.isArray(paths) ? paths.filter((item) => typeof item === 'string') : [];
  return loadTracks(validPaths);
});

ipcMain.handle('library:load-dropped', async (_event, paths) => {
  const validPaths = Array.isArray(paths) ? paths.filter((item) => typeof item === 'string') : [];
  return loadTracks(validPaths);
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
  const messages = Array.isArray(payload?.messages) ? payload.messages.slice(-40) : [];
  const tools = Array.isArray(payload?.tools) ? payload.tools.slice(0, 30) : [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const apiKey = assistantApiKey(config);
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(assistantChatEndpoint(baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.4 }),
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
    return {
      role: 'assistant',
      content: typeof message.content === 'string' ? message.content : '',
      tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : []
    };
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

app.whenReady().then(() => {
  migrateLegacyUserData()
    .catch((error) => console.warn('Unable to migrate legacy user data:', error.message))
    .finally(createWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
