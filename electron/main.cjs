const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  shell,
  clipboard,
  session,
} = require('electron')
const path = require('path')
const fs = require('fs')
const {
  downloadAndInsert,
  openInbox,
  detectInstalledApps,
  getInboxRoot,
} = require('./nle-import.cjs')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL) && !app.isPackaged
const LAYOUT = { top: 56, left: 340, right: 0, bottom: 0 }

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {BrowserView | null} */
let browserView = null

const state = {
  targets: ['premiere', 'aftereffects', 'resolve', 'capcut'],
  url: 'https://www.pexels.com/',
  recentMedia: [],
}

function rememberMediaUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return
  if (!/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) && !/videos\.pexels\.com|video\./i.test(url)) {
    return
  }
  state.recentMedia = [url, ...state.recentMedia.filter((u) => u !== url)].slice(0, 40)
}

function resolveInsertUrl(rawUrl) {
  const url = String(rawUrl || '')
  if (url.startsWith('__recent__:')) {
    return state.recentMedia[0] || ''
  }
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) {
    return state.recentMedia[0] || url
  }
  return url
}

function loadPlugins() {
  const file = path.join(__dirname, 'plugins.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function sendToast(payload) {
  mainWindow?.webContents.send('ui:toast', payload)
}

function layoutBrowserView() {
  if (!mainWindow || !browserView) return
  const [width, height] = mainWindow.getContentSize()
  const x = LAYOUT.left
  const y = LAYOUT.top
  const w = Math.max(100, width - LAYOUT.left - LAYOUT.right)
  const h = Math.max(100, height - LAYOUT.top - LAYOUT.bottom)
  browserView.setBounds({ x, y, width: w, height: h })
}

function injectInsertButtons() {
  if (!browserView) return
  const scriptPath = path.join(__dirname, 'inject-insert.js')
  const code = fs.readFileSync(scriptPath, 'utf8')
  browserView.webContents.executeJavaScript(code, true).catch(() => {})
}

function createBrowserView() {
  browserView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'guest-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.setBrowserView(browserView)
  layoutBrowserView()

  const wc = browserView.webContents

  wc.session.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
    if (details.statusCode >= 200 && details.statusCode < 400) {
      rememberMediaUrl(details.url)
      if (details.resourceType === 'media') rememberMediaUrl(details.url)
    }
  })

  wc.setWindowOpenHandler(({ url }) => {
    wc.loadURL(url)
    return { action: 'deny' }
  })

  wc.on('did-start-loading', () => {
    mainWindow?.webContents.send('browser:loading', true)
  })
  wc.on('did-stop-loading', () => {
    mainWindow?.webContents.send('browser:loading', false)
    injectInsertButtons()
    // push captured media urls into page for button fallback
    const list = JSON.stringify(state.recentMedia.slice(0, 20))
    wc.executeJavaScript(`window.__inframeNetworkMedia = ${list};`).catch(() => {})
  })
  wc.on('did-navigate', (_e, url) => {
    state.url = url
    state.recentMedia = []
    mainWindow?.webContents.send('browser:url', url)
  })
  wc.on('did-navigate-in-page', (_e, url) => {
    state.url = url
    mainWindow?.webContents.send('browser:url', url)
  })
  wc.on('dom-ready', () => injectInsertButtons())
  wc.on('page-title-updated', () => injectInsertButtons())

  wc.loadURL(state.url)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#12100e',
    title: 'InFrame',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  createBrowserView()

  mainWindow.on('resize', layoutBrowserView)
  mainWindow.on('closed', () => {
    mainWindow = null
    browserView = null
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function normalizeUrl(input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) return state.url
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return `https://${trimmed}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

async function handleInsert(imageUrl) {
  try {
    const resolved = resolveInsertUrl(imageUrl)
    if (!resolved || resolved.startsWith('blob:') || resolved.startsWith('data:') || resolved.startsWith('__recent__:')) {
      sendToast({
        type: 'error',
        message: 'Не нашёл прямую ссылку на видео. Запустите ролик на странице и нажмите «Вставить видео» ещё раз.',
      })
      return null
    }
    sendToast({ type: 'info', message: 'Скачиваю и вставляю…' })
    const result = await downloadAndInsert(resolved, state.targets, clipboard)
    const lines = result.results.map((r) => `${r.label}: ${r.message}`)
    sendToast({
      type: 'success',
      message: `Готово → ${result.sharedPath}`,
      detail: lines.join('\n'),
    })
    return result
  } catch (error) {
    sendToast({ type: 'error', message: error.message || 'Ошибка вставки' })
    throw error
  }
}

app.whenReady().then(() => {
  // Allow embedding cross-origin images in UI
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http:; img-src * data: blob:;",
        ],
      },
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('ui:layout', (_event, layout) => {
  if (layout?.left != null) LAYOUT.left = layout.left
  if (layout?.top != null) LAYOUT.top = layout.top
  layoutBrowserView()
})

ipcMain.on('guest:insert-image', async (_event, url) => {
  mainWindow?.webContents.send('guest:insert-image', url)
  await handleInsert(url)
})

ipcMain.handle('app:get-state', () => ({
  targets: state.targets,
  url: state.url,
  inbox: getInboxRoot(),
  installed: detectInstalledApps(),
}))

ipcMain.handle('app:set-targets', (_e, targets) => {
  if (Array.isArray(targets) && targets.length) {
    state.targets = targets
  }
  return state.targets
})

ipcMain.handle('browser:navigate', async (_e, url) => {
  const next = normalizeUrl(url)
  state.url = next
  await browserView?.webContents.loadURL(next)
  return next
})

ipcMain.handle('browser:back', () => {
  const wc = browserView?.webContents
  if (!wc) return
  const history = wc.navigationHistory
  if (history?.canGoBack?.()) history.goBack()
  else if (typeof wc.canGoBack === 'function' && wc.canGoBack()) wc.goBack()
})

ipcMain.handle('browser:forward', () => {
  const wc = browserView?.webContents
  if (!wc) return
  const history = wc.navigationHistory
  if (history?.canGoForward?.()) history.goForward()
  else if (typeof wc.canGoForward === 'function' && wc.canGoForward()) wc.goForward()
})

ipcMain.handle('browser:reload', () => browserView?.webContents.reload())

ipcMain.handle('browser:scan-images', async () => {
  if (!browserView) return []
  const images = await browserView.webContents.executeJavaScript(`
    (() => {
      const seen = new Set();
      const out = [];
      for (const img of document.querySelectorAll('img')) {
        const url = img.currentSrc || img.src || img.getAttribute('data-src') || '';
        if (!url || url.startsWith('data:') || url.startsWith('blob:') || seen.has(url)) continue;
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w && h && (w < 120 || h < 120)) continue;
        seen.add(url);
        out.push({ url, width: w, height: h, alt: img.alt || '', kind: 'image' });
      }
      for (const video of document.querySelectorAll('video')) {
        const source = video.querySelector('source[src], source[data-src]');
        const url = video.currentSrc || video.src || source?.src || source?.getAttribute('data-src') || '';
        if (!url || url.startsWith('data:') || url.startsWith('blob:') || seen.has(url)) continue;
        const w = video.videoWidth || video.clientWidth || 0;
        const h = video.videoHeight || video.clientHeight || 0;
        if (w && h && (w < 120 || h < 120)) continue;
        seen.add(url);
        out.push({
          url,
          width: w,
          height: h,
          alt: video.getAttribute('aria-label') || 'video',
          kind: 'video',
          poster: video.poster || '',
        });
      }
      return out.slice(0, 80);
    })()
  `)
  return images
})

ipcMain.handle('media:insert', async (_e, url) => handleInsert(url))

ipcMain.handle('media:open-inbox', (_e, target) => openInbox(target))

ipcMain.handle('shell:open-external', async (_e, url) => {
  await shell.openExternal(url)
})

ipcMain.handle('plugins:list', () => loadPlugins())
