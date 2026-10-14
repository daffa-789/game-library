// Smoke test renderer: menyiapkan folder data uji berisi beberapa entri,
// memuat dist/index.html di jendela tersembunyi dengan preload dan IPC yang
// sama seperti aplikasi sungguhan, lalu melaporkan error konsol, kegagalan
// muat, hasil pemuatan cover lewat protokol thumb://, serta tampilan daftar
// mirror dan editor link.
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

// ---------------------------------------------------------------------------
// Data uji
//
// Katalog bawaan sudah dihapus, jadi smoke test menyiapkan sendiri beberapa
// entri + satu gambar kecil di folder thumbnails. Dengan begitu render kartu,
// protokol thumb://, daftar mirror, dan editor link tetap benar-benar teruji.
// ---------------------------------------------------------------------------
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)

function siapkanDataUji() {
  const thumbsDir = path.join(tmp, 'thumbnails')
  fs.mkdirSync(thumbsDir, { recursive: true })
  fs.writeFileSync(path.join(thumbsDir, 'smoke-cover.png'), PNG_1x1)

  const iso = (n) => new Date(Date.UTC(2026, 0, n)).toISOString()
  const kosong = { os: '', cpu: '', ram: '', gpu: '', dx: '', net: '', storage: '', sound: '', notes: '' }
  const spesifikasi = {
    min: { ...kosong, os: 'Windows 10', cpu: 'Core i5', ram: '8 GB' },
    rec: { ...kosong },
  }

  const data = {
    games: [
      {
        id: 'smoke-1',
        title: 'Smoke Game Satu',
        thumbnail: '/thumbnails/smoke-cover.png',
        link: 'https://gofile.io/d/smoke1',
        links: [
          { label: 'Gofile', url: 'https://gofile.io/d/smoke1' },
          { label: 'PixelDrain', url: 'https://pixeldrain.com/u/smoke1' },
        ],
        genre: 'Action',
        size: '10 GB',
        price: 'Rp 10.000',
        steamAppId: '',
        specs: spesifikasi,
        createdAt: iso(1),
        updatedAt: iso(1),
      },
      {
        id: 'smoke-2',
        title: 'Smoke Game Dua',
        thumbnail: '/thumbnails/smoke-cover.png',
        link: 'https://drive.google.com/file/d/smoke2/view',
        links: [{ label: 'Google Drive', url: 'https://drive.google.com/file/d/smoke2/view' }],
        genre: 'Indie',
        size: '2 GB',
        price: '',
        steamAppId: '',
        specs: spesifikasi,
        createdAt: iso(2),
        updatedAt: iso(2),
      },
    ],
    software: [
      {
        id: 'smoke-sw-1',
        title: 'Smoke Software',
        thumbnail: '/thumbnails/smoke-cover.png',
        link: 'https://pixeldrain.com/u/sw1',
        links: [{ label: 'PixelDrain', url: 'https://pixeldrain.com/u/sw1' }],
        website: '',
        category: 'Utility',
        version: '1.0',
        license: 'Gratis',
        platform: 'Windows 10/11',
        size: '1 GB',
        price: '',
        createdAt: iso(3),
        updatedAt: iso(3),
      },
    ],
  }

  fs.writeFileSync(path.join(tmp, 'library.json'), JSON.stringify(data, null, 2))
}

siapkanDataUji()

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
    console.log('GAGAL: dist/index.html belum ada — jalankan `npm run build` dulu.')
    app.exit(1)
    return
  }

  await win.loadFile(indexFile)
  // Beri waktu React menyelesaikan render dan panggilan IPC pertama.
  await new Promise((r) => setTimeout(r, 2500))

  const report = await win.webContents.executeJavaScript(`(async () => {
    const tunggu = (ms) => new Promise((r) => setTimeout(r, ms))
    const cards = document.querySelectorAll('.card').length
    const images = [...document.querySelectorAll('img')]
    const cardImgs = [...document.querySelectorAll('.card img')]

    // Uji definitif cover: minta SEMUA cover lewat protokol thumb:// satu per
    // satu, jadi hasilnya tidak terpengaruh lazy-loading atau area yang terlihat.
    const probe = (src) => new Promise((res) => {
      const im = new Image()
      im.onload = () => res(im.naturalWidth > 0)
      im.onerror = () => res(false)
      im.src = src
    })
    const games = await window.softgame.loadLibrary()
    const hasil = await Promise.all(games.map((g) => probe('thumb://local/' + g.thumbnail.replace('/thumbnails/', ''))))
    const coversOk = hasil.filter(Boolean).length

    // Buka halaman detail kartu "Smoke Game Satu" (yang punya 2 mirror).
    // Kartu dicari lewat judulnya supaya hasilnya tidak bergantung urutan sort.
    const kartu = [...document.querySelectorAll('.card')]
    const target = kartu.find((c) => c.textContent.includes('Smoke Game Satu')) || kartu[0]
    if (target) target.click()
    await tunggu(300)
    const mirrorRows = document.querySelectorAll('.mirror-row').length
    const mirrorNames = [...document.querySelectorAll('.mirror-name')].map((n) => n.textContent.trim())
    const copyAll = !!document.querySelector('#d-copy')

    // Kembali, lalu buka form Tambah Game -> editor link harus bisa menambah baris.
    const back = document.querySelector('#d-back')
    if (back) back.click()
    await tunggu(250)
    document.querySelector('#btn-add').click()
    await tunggu(350)
    const linkRowsAwal = document.querySelectorAll('.link-row').length
    document.querySelector('#f-link-add').click()
    await tunggu(150)
    const linkRowsSetelahTambah = document.querySelectorAll('.link-row').length
    const tombolHapusLink = document.querySelectorAll('.link-del').length

    return {
      cards,
      gameCount: games.length,
      firstTitle: games[0] && games[0].title,
      imgs: images.length,
      cardImgs: cardImgs.length,
      cardImgsLoaded: cardImgs.filter(i => i.complete && i.naturalWidth > 0).length,
      coversOkViaProtocol: coversOk + '/' + games.length,
      mirrorsOnDetail: mirrorRows,
      mirrorNames,
      copyAllButton: copyAll,
      linkRowsAwal,
      linkRowsSetelahTambah,
      tombolHapusLink,
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

  const ok =
    !problems.length &&
    report.cards === 2 &&
    report.gameCount === 2 &&
    report.coversOkViaProtocol === '2/2' &&
    report.mirrorsOnDetail === 2 &&
    report.copyAllButton === true &&
    report.linkRowsSetelahTambah === report.linkRowsAwal + 1 &&
    report.tombolHapusLink >= 2

  fs.rmSync(tmp, { recursive: true, force: true })
  app.exit(ok ? 0 : 1)
})
