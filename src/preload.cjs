const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nativeMath', {
  open: () => ipcRenderer.invoke('native-math:open'),
  cancel: () => ipcRenderer.invoke('native-math:cancel'),
});
