const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mathPadSettings', {
  load: widths => ipcRenderer.invoke('settings:load', widths),
  update: patch => ipcRenderer.invoke('settings:update', patch),
  reset: () => ipcRenderer.invoke('settings:reset'),
  resetBallPosition: () => ipcRenderer.invoke('settings:reset-ball-position'),
  onChange(callback) { ipcRenderer.on('settings:changed', (_event, values) => callback(values)); },
  onError(callback) { ipcRenderer.on('settings:error', (_event, error) => callback(error)); },
});
