// ---------------------------------------------------------------------------
// Proses utama Electron
//
// Perannya sama dengan main.go + app.go pada versi Wails: menyiapkan jendela,
// menangani satu instance saja, menyajikan thumbnail lewat protokol khusus,
// dan menjembatani seluruh pemanggilan renderer ke modul-modul di lib/.
// ---------------------------------------------------------------------------
import { app, BrowserWindow, protocol, net, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { registerIpc } from './lib/ipc.js'
import { resolveThumbRequest } from './lib/thumbnails.js'
import {
  windowWidth,
  windowHeight,
  windowMinWidth,
  windowMinHeight,
  ensureWindowFitsScreen,
} from './lib/window.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Resolusi berkas bawaan
//
// Saat dipaketkan, seluruh kode berada di dalam app.asar sehingga path relatif
// terhadap modul ini tetap benar. Dua helper di bawah menambahkan jalur mundur
// ke app.getAppPath() dan memeriksa keberadaan berkas lebih dulu, supaya build
// produksi tidak pernah diam-diam kehilangan ikon atau halaman renderer.
// ---------------------------------------------------------------------------

// firstExisting mengembalikan kandidat pertama yang benar-benar ada di disk.
function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      /* kandidat tidak bisa diperiksa; coba berikutnya */
    }
  }
  return null
}

// resolveAppIcon mencari ikon jendela. Mengembalikan null bila tidak ada —
// Electron memakai ikon bawaan dan tidak mencatat peringatan.
function resolveAppIcon() {
  return firstExisting([
    path.join(__dirname, '..', 'build', 'windows', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'windows', 'icon.ico'),
  ])
}

// resolveIndexFile mencari halaman hasil build renderer (dist/index.html).
function resolveIndexFile() {
  return (
    firstExisting([
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(app.getAppPath(), 'dist', 'index.html'),
    ]) || path.join(__dirname, '..', 'dist', 'index.html')
  )
}

// Lingkungan tanpa akses GPU (mesin virtual, remote desktop, atau driver yang
// rusak) membuat proses GPU Chromium mati dan Electron berhenti dengan pesan
// "GPU process isn't usable. Goodbye." sebelum jendela sempat tampil.
// Setel SOFTGAME_SOFTWARE_RENDER=1 untuk memaksa rendering perangkat lunak.
// Harus dipanggil sebelum app siap.
if (process.env.SOFTGAME_SOFTWARE_RENDER === '1') {
  app.disableHardwareAcceleration()
  for (const flag of [
    'disable-gpu',
    'disable-gpu-compositing',
    'disable-gpu-sandbox',
    'disable-software-rasterizer',
    'in-process-gpu',
    'disable-dev-shm-usage',
  ]) {
    app.commandLine.appendSwitch(flag)
  }
}

// Protokol thumb:// menyajikan gambar dari folder thumbnails. Skema harus
// didaftarkan sebagai privileged sebelum app siap, kalau tidak
// <img src="thumb://..."> akan diblokir sebagai skema asing.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'thumb',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

// Hanya satu instance boleh berjalan; instance kedua memunculkan jendela yang
// sudah ada, sama seperti perilaku single-instance versi sebelumnya.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) app.quit()

/** @type {BrowserWindow | null} */
let mainWindow = null

function createWindow() {
  const icon = resolveAppIcon()

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: windowMinWidth,
    minHeight: windowMinHeight,
    backgroundColor: '#171a21',
    show: false,
    autoHideMenuBar: true,
    title: 'SoftGame Library',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    ensureWindowFitsScreen(mainWindow)
    mainWindow.show()
  })

  // Tautan eksternal tidak boleh menggantikan isi jendela aplikasi.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(resolveIndexFile())
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(() => {
  // Handler protokol: satu-satunya jalan gambar keluar dari folder data.
  protocol.handle('thumb', async (request) => {
    const target = resolveThumbRequest(request.url)
    if (!target) return new Response('Not found', { status: 404 })
    const response = await net.fetch(pathToFileURL(target).toString())
    const headers = new Headers(response.headers)
    // Nama file acak (hex) -> isi tidak berubah -> boleh di-cache agresif.
    headers.set('Cache-Control', 'public, max-age=86400, immutable')
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(response.body, { status: response.status, headers })
  })

  registerIpc(() => mainWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
