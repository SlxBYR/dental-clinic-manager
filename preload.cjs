const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronSqliteStore', {
  get: (key) => ipcRenderer.invoke('sqlite-store:get', key),
  set: (key, value) => ipcRenderer.invoke('sqlite-store:set', key, value),
  status: () => ipcRenderer.invoke('sqlite-store:status')
});
