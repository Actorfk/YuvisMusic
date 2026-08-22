const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameLyrics', {
  onUpdate: (callback) => ipcRenderer.on('game-lyrics:update', (_event, payload) => callback(payload)),
  onSettings: (callback) => ipcRenderer.on('game-lyrics:settings', (_event, settings) => callback(settings))
});
