'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadLibrary: () => ipcRenderer.invoke('data:load'),
  saveLibrary: (games) => ipcRenderer.invoke('data:save', games),
  pickThumbnail: () => ipcRenderer.invoke('thumb:pickAndImport'),
  deleteThumbnail: (ref) => ipcRenderer.invoke('thumb:delete', ref),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
});
