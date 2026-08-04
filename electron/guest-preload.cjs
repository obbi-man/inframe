const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('inframeGuest', {
  insert: (url) => ipcRenderer.send('guest:insert-image', url),
})
