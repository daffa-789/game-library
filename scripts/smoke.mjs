// Smoke test renderer: memuat dist/index.html di jendela tersembunyi dengan
// preload dan IPC yang sama seperti aplikasi sungguhan, lalu melaporkan error
// konsol, kegagalan muat, dan hasil beberapa panggilan bridge.
//
// Jalankan: env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/smoke.mjs
import { app, BrowserWindow, protocol, net } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

// Lingkungan uji sering tidak punya akses GPU maupun sandbox Chromium; proses
// GPU yang mati membuat pemuatan halaman gagal dengan ERR_FAILED. Switch ini
// HANYA untuk smoke test - aplikasi sungguhan tidak memakainya.
app.disableHardwareAcceleration()
for (const flag of [
  'disable-gpu',
  'disable-gpu-compositing',
  'disable-software-rasterizer',
  'no-sandbox',
  'disable-gpu-sandbox',
  'in-process-gpu',
  'disable-dev-shm-usage',
]) {
  app.commandLine.appendSwitch(flag)
}

// Folder data dialihkan supaya data asli pengguna tidak tersentuh.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'softgame-smoke-'))
process.env.SOFTGAME_DATA_DIR = tmp

protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

const problems = []

app.whenReady().then(async () => {
  const { registerIpc } = await import('../electron/lib/ipc.js')
  const { resolveThumbRequest } = await import('../electron/lib/thumbnails.js')

  protocol.handle('thumb', async (request) => {
    const target = resolveThumbRequest(request.url)
    if (!target) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(target).toString())
  })

  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    show: false,
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  registerIpc(() => win)

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) problems.push(`console(${level}): ${message}`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    problems.push(`did-fail-load ${code} ${desc} ${url}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    problems.push(`render-process-gone: ${details.reason}`)
  })

  const indexFile = path.join(root, 'dist', 'index.html')
  if (!fs.existsSync(indexFile)) {
    console.log('GAGAL: dist/index.html belum ada — jalankan `bun run build` dulu.')
    app.exit(1)
    return
  }

  await win.loadFile(indexFile)
  // Beri waktu React menyelesaikan render dan panggilan IPC pertama.
  await new Promise((r) => setTimeout(r, 2500))

  const report = await win.webContents.executeJavaScript(`(async () => {
    const cards = document.querySelectorAll('.card').length
    const tabs = [...document.querySelectorAll('[role="tab"], .tab, button')].map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 12)
    const images = [...document.querySelectorAll('img')]
    const imgs = images.length
    const broken = images.filter(i => i.complete && i.naturalWidth === 0).length
    const cardImgs = [...document.querySelectorAll('.card img')]
    const cardOk = cardImgs.filter(i => i.complete && i.naturalWidth > 0).length
    const lazyCount = cardImgs.filter(i => i.getAttribute('loading') === 'lazy').length
    const firstCardThumb = cardImgs[0] ? cardImgs[0].getAttribute('src') : null
    const games = await window.softgame.loadLibrary()

    // Uji definitif: minta SEMUA cover lewat protokol thumb:// satu per satu,
    // jadi hasilnya tidak terpengaruh lazy-loading atau area yang terlihat.
    const probe = (src) => new Promise((res) => {
      const im = new Image()
      im.onload = () => res(im.naturalWidth > 0)
      im.onerror = () => res(false)
      im.src = src
    })
    const results = await Promise.all(games.map((g) => probe('thumb://local/' + g.thumbnail.replace('/thumbnails/', ''))))
    const coversOk = results.filter(Boolean).length
    return {
      cards, imgs, broken, tabLabels: tabs,
      gameCount: games.length,
      firstTitle: games[0] && games[0].title,
      cardImgs: cardImgs.length,
      cardCoversLoaded: cardOk,
      cardImgsLazy: lazyCount,
      coversOkViaProtocol: coversOk + '/' + games.length,
      firstCardThumb,
    }
  })()`)

  console.log('\n=== hasil smoke test renderer ===')
  console.log(JSON.stringify(report, null, 2))
  if (problems.length) {
    console.log('\n=== masalah ===')
    problems.forEach((p) => console.log('  ' + p))
  } else {
    console.log('\ntidak ada error konsol / kegagalan muat')
  }

  fs.rmSync(tmp, { recursive: true, force: true })
  app.exit(problems.length || report.cards === 0 ? 1 : 0)
})
