const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopWidget', {
  isElectron: true,
  togglePin: () => ipcRenderer.invoke('window:toggle-pin'),
  setOpacity: (val) => ipcRenderer.invoke('window:set-opacity', val),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  openImagesFolder: () => ipcRenderer.invoke('window:open-images-folder'),
  getState: () => ipcRenderer.invoke('window:get-state')
});
