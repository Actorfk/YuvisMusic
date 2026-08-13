const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  chooseFiles: () => ipcRenderer.invoke('library:choose-files'),
  chooseFolder: () => ipcRenderer.invoke('library:choose-folder'),
  restoreTracks: (paths) => ipcRenderer.invoke('library:restore', paths),
  chooseLyricsFile: () => ipcRenderer.invoke('lyrics:choose-file'),
  readLyricsFile: (lyricsPath) => ipcRenderer.invoke('lyrics:read-file', lyricsPath),
  chooseBackgroundImage: () => ipcRenderer.invoke('appearance:choose-background'),
  readBackgroundImage: (imagePath) => ipcRenderer.invoke('appearance:read-background', imagePath),
  showInFolder: (filePath) => ipcRenderer.invoke('track:show-in-folder', filePath),
  setDesktopLyricsVisible: (visible) => ipcRenderer.send('desktop-lyrics:set-visible', visible),
  updateDesktopLyrics: (payload) => ipcRenderer.send('desktop-lyrics:update', payload),
  setDesktopLyricsSettings: (settings) => ipcRenderer.send('desktop-lyrics:set-settings', settings),
  onDesktopLyricsVisibility: (callback) => ipcRenderer.on('desktop-lyrics:visibility', (_event, value) => callback(value)),
  onDesktopLyricsLock: (callback) => ipcRenderer.on('desktop-lyrics:lock', (_event, value) => callback(value)),
  onDesktopLyricsSettings: (callback) => ipcRenderer.on('desktop-lyrics:settings-updated', (_event, value) => callback(value)),
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  onMaximized: (callback) => ipcRenderer.on('window:maximized', (_event, value) => callback(value))
});
