const { existsSync } = require('fs')
const { join } = require('path')
const { spawnSync } = require('child_process')

const electronDir = join(__dirname, '..', 'node_modules', 'electron')
const distExe = join(electronDir, 'dist', 'electron.exe')
const installJs = join(electronDir, 'install.js')

if (existsSync(distExe)) {
  process.exit(0)
}

if (!existsSync(installJs)) {
  console.warn('[inframe] electron package not found yet — run npm install again if Electron fails to start')
  process.exit(0)
}

console.log('[inframe] Electron binary missing — downloading…')
const result = spawnSync(process.execPath, [installJs], {
  cwd: electronDir,
  stdio: 'inherit',
  env: process.env,
})
process.exit(result.status === null ? 1 : result.status)
