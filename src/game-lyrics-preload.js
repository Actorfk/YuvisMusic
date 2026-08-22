const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameLyrics', {
  hide: () => ipcRenderer.send('game-lyrics:hide'),
  setLocked: (locked) => ipcRenderer.send('game-lyrics:set-locked', locked),
  snapSide: (side) => ipcRenderer.send('game-lyrics:snap-side', side),
  startDrag: (point) => ipcRenderer.send('game-lyrics:drag-start', point),
  moveDrag: (point) => ipcRenderer.send('game-lyrics:drag-move', point),
  endDrag: () => ipcRenderer.send('game-lyrics:drag-end'),
  onUpdate: (callback) => ipcRenderer.on('game-lyrics:update', (_event, payload) => callback(payload)),
  onSettings: (callback) => ipcRenderer.on('game-lyrics:settings', (_event, settings) => callback(settings))
});
