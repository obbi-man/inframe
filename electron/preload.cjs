const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('inframe', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  setTargets: (targets) => ipcRenderer.invoke('app:set-targets', targets),
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  goBack: () => ipcRenderer.invoke('browser:back'),
  goForward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  scanImages: () => ipcRenderer.invoke('browser:scan-images'),
  insertImage: (url) => ipcRenderer.invoke('media:insert', url),
  openInbox: (target) => ipcRenderer.invoke('media:open-inbox', target),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openPluginInBrowser: (url) => ipcRenderer.invoke('browser:navigate', url),
  getPlugins: () => ipcRenderer.invoke('plugins:list'),
  setLayout: (layout) => ipcRenderer.send('ui:layout', layout),
  onBrowserUrl: (cb) => {
    const listener = (_event, url) => cb(url)
    ipcRenderer.on('browser:url', listener)
    return () => ipcRenderer.removeListener('browser:url', listener)
  },
  onBrowserLoading: (cb) => {
    const listener = (_event, loading) => cb(loading)
    ipcRenderer.on('browser:loading', listener)
    return () => ipcRenderer.removeListener('browser:loading', listener)
  },
  onGuestInsert: (cb) => {
    const listener = (_event, url) => cb(url)
    ipcRenderer.on('guest:insert-image', listener)
    return () => ipcRenderer.removeListener('guest:insert-image', listener)
  },
  onToast: (cb) => {
    const listener = (_event, payload) => cb(payload)
    ipcRenderer.on('ui:toast', listener)
    return () => ipcRenderer.removeListener('ui:toast', listener)
  },
})
