const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopLyrics', {
  hide: () => ipcRenderer.send('desktop-lyrics:hide'),
  setLocked: (locked) => ipcRenderer.send('desktop-lyrics:set-locked', locked),
  setSettings: (settings) => ipcRenderer.send('desktop-lyrics:set-settings', settings),
  onUpdate: (callback) => ipcRenderer.on('desktop-lyrics:update', (_event, payload) => callback(payload)),
  onSettings: (callback) => ipcRenderer.on('desktop-lyrics:settings', (_event, settings) => callback(settings))
});
