const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn, execFile } = require('child_process')
const { promisify } = require('util')
const https = require('https')
const http = require('http')

const execFileAsync = promisify(execFile)

const APP_LABELS = {
  premiere: 'Premiere Pro',
  aftereffects: 'After Effects',
  resolve: 'DaVinci Resolve',
  capcut: 'CapCut',
}

function getInboxRoot() {
  return path.join(os.homedir(), 'InFrame', 'inbox')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120)
}

function sniffMediaExtension(filePath) {
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(16)
  try {
    fs.readSync(fd, buf, 0, 16, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif'
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return '.webp'
  }
  // WebM / Matroska
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return '.webm'
  // ISO BMFF: mp4 / mov / avif / heic
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii')
    if (brand === 'avif' || brand === 'avis') return '.avif'
    if (brand === 'heic' || brand === 'heif') return '.heic'
    if (['isom', 'iso2', 'mp41', 'mp42', 'M4V ', 'M4A ', 'avc1', 'dash'].includes(brand)) {
      return '.mp4'
    }
    if (['qt  ', 'havc'].includes(brand)) return '.mov'
    // unknown ftyp — treat as mp4-compatible container
    if (!['avif', 'avis', 'heic', 'heif'].includes(brand)) return '.mp4'
  }
  return null
}

function isResolveFriendlyExt(ext) {
  return [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.tif',
    '.tiff',
    '.bmp',
    '.dpx',
    '.exr',
    '.mp4',
    '.mov',
    '.m4v',
    '.webm',
    '.avi',
    '.mxf',
  ].includes(String(ext || '').toLowerCase())
}

function looksLikeVideoUrl(url) {
  return (
    /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url) ||
    /videos\.pexels\.com/i.test(url) ||
    /\/download\/video\//i.test(url) ||
    /\/video\//i.test(url)
  )
}

function preferEditableImageUrl(url) {
  try {
    const parsed = new URL(url)
    if (looksLikeVideoUrl(url)) return parsed.toString()
    // Pexels/Unsplash часто отдают AVIF по Accept — просим jpeg через query, если есть.
    if (parsed.hostname.includes('pexels.com') || parsed.hostname.includes('unsplash.com')) {
      parsed.searchParams.set('fm', 'jpg')
      parsed.searchParams.set('auto', 'compress')
      if (!parsed.searchParams.has('w') && !parsed.searchParams.has('h')) {
        parsed.searchParams.set('w', '2000')
      }
    }
    // .avif/.webp в пути — пробуем .jpg
    parsed.pathname = parsed.pathname.replace(/\.(avif|webp)$/i, '.jpg')
    return parsed.toString()
  } catch {
    return url
  }
}

function downloadFile(
  url,
  destPath,
  accept = 'image/jpeg,image/jpg,image/png,image/gif,video/mp4,video/webm,video/*;q=0.8,*/*;q=0.1',
) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const request = client.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: accept,
          Referer: (() => {
            try {
              return new URL(url).origin + '/'
            } catch {
              return undefined
            }
          })(),
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          downloadFile(response.headers.location, destPath, accept).then(resolve).catch(reject)
          return
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`))
          response.resume()
          return
        }
        const file = fs.createWriteStream(destPath)
        response.pipe(file)
        file.on('finish', () => file.close(() => resolve(destPath)))
        file.on('error', reject)
      },
    )
    request.setTimeout(120000, () => {
      request.destroy(new Error('Таймаут скачивания'))
    })
    request.on('error', reject)
  })
}

async function downloadEditableImage(imageUrl) {
  const inbox = getInboxRoot()
  ensureDir(inbox)
  const stamp = String(Date.now())
  const tempPath = path.join(inbox, `_download-${stamp}.bin`)
  const isVideo = looksLikeVideoUrl(imageUrl)

  const candidates = isVideo
    ? [imageUrl]
    : [preferEditableImageUrl(imageUrl), imageUrl].filter((u, i, arr) => u && arr.indexOf(u) === i)

  let lastError = null
  for (const candidate of candidates) {
    try {
      const accept = isVideo
        ? 'video/mp4,video/webm,video/quicktime,video/*;q=0.9,*/*;q=0.1'
        : 'image/jpeg,image/jpg,image/png,image/gif;q=0.9,*/*;q=0.1'
      await downloadFile(candidate, tempPath, accept)
      let ext = sniffMediaExtension(tempPath)

      if (!isVideo && (!ext || !isResolveFriendlyExt(ext))) {
        await downloadFile(
          preferEditableImageUrl(candidate),
          tempPath,
          'image/jpeg,image/jpg,image/png;q=0.9',
        )
        ext = sniffMediaExtension(tempPath)
      }

      // fallback by URL extension for videos if sniff failed
      if (!ext && isVideo) {
        try {
          const fromUrl = path.extname(new URL(candidate).pathname).toLowerCase()
          if (isResolveFriendlyExt(fromUrl)) ext = fromUrl
          else ext = '.mp4'
        } catch {
          ext = '.mp4'
        }
      }

      if (!ext || !isResolveFriendlyExt(ext)) {
        lastError = new Error(
          `Формат ${ext || 'unknown'} не поддерживается. Нужен JPEG/PNG или MP4/MOV/WebM.`,
        )
        continue
      }

      let base = isVideo ? 'video' : 'image'
      try {
        base = sanitizeFilename(path.basename(new URL(candidate).pathname) || base)
      } catch {
        /* keep default */
      }
      base = path.basename(base, path.extname(base)) || (isVideo ? 'video' : 'image')
      const finalName = `${base}-${stamp}${ext === '.jpeg' ? '.jpg' : ext}`
      const sharedPath = path.join(inbox, finalName)
      if (fs.existsSync(sharedPath)) fs.unlinkSync(sharedPath)
      fs.renameSync(tempPath, sharedPath)
      return sharedPath
    } catch (error) {
      lastError = error
    }
  }

  try {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  } catch {
    /* ignore */
  }
  throw lastError || new Error('Не удалось скачать медиа')
}

function findLatestAdobeApp(productName) {
  const roots = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Adobe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Adobe'),
  ]
  const matches = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root)) {
      if (!entry.toLowerCase().includes(productName.toLowerCase())) continue
      const full = path.join(root, entry)
      try {
        if (fs.statSync(full).isDirectory()) matches.push(full)
      } catch {
        /* ignore */
      }
    }
  }
  matches.sort().reverse()
  return matches[0] || null
}

function findExecutable(dir, names) {
  if (!dir) return null
  for (const name of names) {
    const candidate = path.join(dir, name)
    if (fs.existsSync(candidate)) return candidate
  }
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (names.some((n) => entry.toLowerCase() === n.toLowerCase())) {
        return path.join(dir, entry)
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeJsxImport(filePath, appKind) {
  const escaped = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  if (appKind === 'premiere') {
    return `
(function () {
  if (!app.project) { alert('Откройте проект Premiere Pro'); return; }
  app.project.importFiles(['${escaped}'], true, app.project.rootItem, false);
})();
`
  }
  return `
(function () {
  if (!app.project) { alert('Откройте проект After Effects'); return; }
  app.project.importFile(new ImportOptions(File('${escaped}')));
})();
`
}

async function tryAdobeImport(filePath, appKind) {
  const product =
    appKind === 'premiere' ? 'Adobe Premiere Pro' : 'Adobe After Effects'
  const exeNames =
    appKind === 'premiere'
      ? ['Adobe Premiere Pro.exe']
      : ['AfterFX.exe', 'After Effects.exe']

  const appDir = findLatestAdobeApp(product)
  const exe = findExecutable(appDir, exeNames)
  const scriptsDir = path.join(getInboxRoot(), '_scripts')
  ensureDir(scriptsDir)
  const jsxPath = path.join(scriptsDir, `import-${appKind}-${Date.now()}.jsx`)
  fs.writeFileSync(jsxPath, writeJsxImport(filePath, appKind), 'utf8')

  if (!exe) {
    return {
      ok: false,
      method: 'file',
      message: `${APP_LABELS[appKind]} не найден. Файл сохранён в inbox.`,
      filePath,
      jsxPath,
    }
  }

  try {
    // -r runs a script on launch for After Effects; Premiere accepts JSX via BridgeTalk-like drop.
    // We also leave JSX next to the file for manual File > Scripts > Run.
    if (appKind === 'aftereffects') {
      spawn(exe, ['-r', jsxPath], { detached: true, stdio: 'ignore' }).unref()
      return {
        ok: true,
        method: 'script',
        message: `Запущен импорт в ${APP_LABELS[appKind]}`,
        filePath,
        jsxPath,
      }
    }

    // Premiere: open app if needed and rely on inbox + JSX for Scripts panel / CEP later.
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref()
    return {
      ok: true,
      method: 'inbox',
      message: `Файл готов для Premiere. JSX: ${path.basename(jsxPath)} (File → Scripts)`,
      filePath,
      jsxPath,
    }
  } catch (error) {
    return {
      ok: false,
      method: 'file',
      message: error.message,
      filePath,
      jsxPath,
    }
  }
}

function findResolveExe() {
  const candidates = [
    path.join(
      process.env['ProgramFiles'] || 'C:\\Program Files',
      'Blackmagic Design',
      'DaVinci Resolve',
      'Resolve.exe',
    ),
    path.join(
      process.env['ProgramFiles'] || 'C:\\Program Files',
      'Blackmagic Design',
      'DaVinci Resolve',
      'DaVinci Resolve.exe',
    ),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

function getResolveScriptEnv() {
  const api = path.join(
    process.env.PROGRAMDATA || 'C:\\ProgramData',
    'Blackmagic Design',
    'DaVinci Resolve',
    'Support',
    'Developer',
    'Scripting',
  )
  const lib = path.join(
    process.env['ProgramFiles'] || 'C:\\Program Files',
    'Blackmagic Design',
    'DaVinci Resolve',
    'fusionscript.dll',
  )
  return {
    api,
    lib,
    modules: path.join(api, 'Modules'),
    ready: fs.existsSync(path.join(api, 'Modules', 'DaVinciResolveScript.py')) && fs.existsSync(lib),
  }
}

function findPythonCandidates() {
  const local = process.env.LOCALAPPDATA || ''
  const candidates = [
    path.join(local, 'Python', 'pythoncore-3.14-64', 'python.exe'),
    path.join(local, 'Python', 'pythoncore-3.13-64', 'python.exe'),
    path.join(local, 'Python', 'pythoncore-3.12-64', 'python.exe'),
    path.join(local, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(local, 'Programs', 'Python', 'Python311', 'python.exe'),
    'python',
    'py',
  ]
  return candidates.filter((p, index, arr) => arr.indexOf(p) === index && (p === 'python' || p === 'py' || fs.existsSync(p)))
}

function writeResolveImportScript(mediaPath) {
  const scriptsDir = path.join(getInboxRoot(), '_scripts')
  ensureDir(scriptsDir)
  const scriptPath = path.join(scriptsDir, `import-resolve-${Date.now()}.py`)
  const env = getResolveScriptEnv()

  const code = `# -*- coding: utf-8 -*-
import json
import os
import sys

os.environ["RESOLVE_SCRIPT_API"] = ${JSON.stringify(env.api)}
os.environ["RESOLVE_SCRIPT_LIB"] = ${JSON.stringify(env.lib)}
sys.path.insert(0, ${JSON.stringify(env.modules)})

FILE_PATH = ${JSON.stringify(mediaPath)}

def fail(msg, code=1):
    print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    sys.exit(code)

try:
    import DaVinciResolveScript as dvr
except Exception as exc:
    fail("Не удалось загрузить DaVinciResolveScript: %s" % exc, 2)

resolve = dvr.scriptapp("Resolve")
if not resolve:
    fail("Resolve не отвечает. Откройте Resolve и включите: Preferences → System → General → External scripting = Local", 3)

project = resolve.GetProjectManager().GetCurrentProject()
if not project:
    fail("Откройте проект в DaVinci Resolve", 4)

if not os.path.isfile(FILE_PATH):
    fail("Файл не найден: %s" % FILE_PATH, 5)

media_pool = project.GetMediaPool()
storage = resolve.GetMediaStorage()

# Папка InFrame в Media Pool (если получится создать)
try:
    root = media_pool.GetRootFolder()
    target = None
    for folder in (root.GetSubFolderList() or []):
        if folder and folder.GetName() == "InFrame":
            target = folder
            break
    if not target:
        target = media_pool.AddSubFolder(root, "InFrame")
    if target:
        media_pool.SetCurrentFolder(target)
except Exception:
    pass

imported = storage.AddItemListToMediaPool([FILE_PATH]) or []
if not imported:
    imported = media_pool.ImportMedia([FILE_PATH]) or []

# По возможности сразу на timeline
appended = False
try:
    timeline = project.GetCurrentTimeline()
    if timeline and imported:
        appended = bool(media_pool.AppendToTimeline(list(imported)))
except Exception:
    appended = False

print(json.dumps({
    "ok": bool(imported),
    "count": len(imported) if imported else 0,
    "appended": appended,
    "project": project.GetName(),
    "file": FILE_PATH,
}, ensure_ascii=False))
if not imported:
    sys.exit(6)
`
  fs.writeFileSync(scriptPath, code, 'utf8')
  return scriptPath
}

async function runResolvePython(scriptPath) {
  const envInfo = getResolveScriptEnv()
  const baseEnv = {
    ...process.env,
    RESOLVE_SCRIPT_API: envInfo.api,
    RESOLVE_SCRIPT_LIB: envInfo.lib,
    PYTHONPATH: [envInfo.modules, process.env.PYTHONPATH || ''].filter(Boolean).join(';'),
    PYTHONIOENCODING: 'utf-8',
  }

  let lastError = 'Python не найден'
  for (const python of findPythonCandidates()) {
    try {
      const args = python === 'py' ? ['-3', scriptPath] : [scriptPath]
      const { stdout, stderr } = await execFileAsync(python, args, {
        env: baseEnv,
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      })
      const text = String(stdout || '').trim()
      const line = text.split(/\r?\n/).filter(Boolean).pop() || ''
      let parsed = null
      try {
        parsed = JSON.parse(line)
      } catch {
        parsed = { ok: false, error: text || stderr || 'Пустой ответ Python' }
      }
      if (parsed.ok) return parsed
      lastError = parsed.error || stderr || 'Импорт не удался'
      // scripting connected but import failed — no point trying other pythons
      if (parsed.error && !/DaVinciResolveScript|fusionscript|load/i.test(parsed.error)) {
        return parsed
      }
    } catch (error) {
      const stdout = error.stdout ? String(error.stdout).trim() : ''
      const line = stdout.split(/\r?\n/).filter(Boolean).pop()
      if (line) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.error) return parsed
        } catch {
          /* continue */
        }
      }
      lastError = error.stderr || error.message || String(error)
    }
  }
  return { ok: false, error: lastError }
}

async function tryResolveImport(filePath) {
  const exe = findResolveExe()
  if (!exe) {
    return {
      ok: false,
      method: 'file',
      message: 'Resolve не найден. Файл сохранён в inbox.',
      filePath,
    }
  }

  const envInfo = getResolveScriptEnv()
  if (!envInfo.ready) {
    return {
      ok: false,
      method: 'inbox',
      message: 'Scripting API Resolve не найден. Файл в inbox — перетащите вручную.',
      filePath,
    }
  }

  const scriptPath = writeResolveImportScript(filePath)
  const result = await runResolvePython(scriptPath)

  if (result.ok) {
    return {
      ok: true,
      method: 'script',
      message: result.appended
        ? `В Media Pool (InFrame) и на timeline: ${path.basename(filePath)}`
        : `Импортировано в Media Pool → папка InFrame`,
      filePath,
      scriptPath,
    }
  }

  return {
    ok: false,
    method: 'inbox',
    message:
      result.error ||
      'Не удалось импортировать. Проверьте: Resolve открыт, проект загружен, External scripting = Local.',
    filePath,
    scriptPath,
  }
}

function findCapCutExe() {
  const local = process.env.LOCALAPPDATA || ''
  const candidates = [
    path.join(local, 'CapCut', 'Apps', 'CapCut.exe'),
    path.join(local, 'CapCut', 'CapCut.exe'),
    path.join(
      process.env['ProgramFiles'] || 'C:\\Program Files',
      'CapCut',
      'CapCut.exe',
    ),
  ]
  // CapCut often nests versioned folders under Apps
  const appsDir = path.join(local, 'CapCut', 'Apps')
  if (fs.existsSync(appsDir)) {
    try {
      const versions = fs
        .readdirSync(appsDir)
        .map((name) => path.join(appsDir, name, 'CapCut.exe'))
        .filter((p) => fs.existsSync(p))
      candidates.unshift(...versions.reverse())
    } catch {
      /* ignore */
    }
  }
  return candidates.find((p) => fs.existsSync(p)) || null
}

async function importToTarget(filePath, target) {
  const destDir = path.join(getInboxRoot(), target)
  ensureDir(destDir)
  const dest = path.join(destDir, path.basename(filePath))
  if (path.resolve(filePath) !== path.resolve(dest)) {
    fs.copyFileSync(filePath, dest)
  }

  if (target === 'premiere' || target === 'aftereffects') {
    return tryAdobeImport(dest, target)
  }

  if (target === 'resolve') {
    return tryResolveImport(dest)
  }

  if (target === 'capcut') {
    const exe = findCapCutExe()
    if (exe) {
      try {
        spawn(exe, [], { detached: true, stdio: 'ignore' }).unref()
      } catch {
        /* ignore */
      }
    }
    return {
      ok: true,
      method: 'inbox',
      message: exe
        ? 'Файл в inbox CapCut. Импортируйте через «Медиа».'
        : 'CapCut не найден. Файл сохранён в inbox.',
      filePath: dest,
    }
  }

  return { ok: false, method: 'none', message: `Неизвестная цель: ${target}`, filePath: dest }
}

async function downloadAndInsert(imageUrl, targets, clipboard) {
  const sharedPath = await downloadEditableImage(imageUrl)

  if (clipboard) {
    clipboard.writeText(sharedPath)
  }

  const results = []
  for (const target of targets) {
    results.push({ target, label: APP_LABELS[target] || target, ...(await importToTarget(sharedPath, target)) })
  }

  return {
    sharedPath,
    results,
  }
}

function openInbox(target) {
  const dir = target ? path.join(getInboxRoot(), target) : getInboxRoot()
  ensureDir(dir)
  if (process.platform === 'win32') {
    spawn('explorer', [dir], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref()
  }
  return dir
}

function detectInstalledApps() {
  return {
    premiere: Boolean(findLatestAdobeApp('Adobe Premiere Pro')),
    aftereffects: Boolean(findLatestAdobeApp('Adobe After Effects')),
    resolve: Boolean(findResolveExe()),
    capcut: Boolean(findCapCutExe()),
  }
}

module.exports = {
  APP_LABELS,
  getInboxRoot,
  downloadAndInsert,
  openInbox,
  detectInstalledApps,
}
