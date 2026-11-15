const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mathPadFloating', Object.freeze({
  down: () => ipcRenderer.send('floating:down'),
  up: () => ipcRenderer.send('floating:up'),
  cancel: () => ipcRenderer.send('floating:cancel'),
  menu: () => ipcRenderer.send('floating:menu'),
  onDrag: callback => ipcRenderer.on('floating:drag-state', (_, dragging) => callback(dragging)),
  onPresentation: callback => ipcRenderer.on('floating:presentation', (_, state) => callback(state)),
}));
