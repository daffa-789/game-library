// ---------------------------------------------------------------------------
// Backend API: Library Persistence
//
// Desain (sama seperti versi Go sebelumnya, supaya library.json tetap
// kompatibel dua arah):
//   - satu file JSON (library.json) dengan dua katalog: "games" dan "software";
//   - tulis atomik (tmp + rename) supaya proses lain tidak pernah melihat file
//     separuh tertulis;
//   - cache hasil parse di memori dengan fingerprint (mtime+size) supaya
//     LoadLibrary / LoadSoftware tidak selalu membaca dan parse dari disk.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import { dataDir, dataFile, thumbsDir, thumbRefPrefix } from './paths.js'
import { sanitizeGame, sanitizeSoftware } from './sanitize.js'
import { mergeBuiltinGames, recordHiddenBuiltin, builtinGames, seedBuiltin } from './seed.js'
import {
  normalizeGameThumbs,
  normalizeSoftwareThumbs,
} from './thumbnails.js'
import { bootstrapLibrary } from './migrate.js'

export const maxGames = 5000
export const maxSoftware = 5000
export const maxLibraryFileBytes = 64 << 20 // 64 MiB

// ---------------------------------------------------------------------------
// Kunci serialisasi
//
// JavaScript hanya satu thread, tapi operasi baca-tulis file di sini async:
// dua panggilan IPC yang datang hampir bersamaan bisa saling menyisip dan
// menghasilkan file rusak. Rantai promise ini menirukan peran sync.Mutex.
// ---------------------------------------------------------------------------
let lockChain = Promise.resolve()

export function withLock(fn) {
  const run = lockChain.then(fn, fn)
  lockChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
let cache = null
let cacheFinger = ''
let cacheValid = false

function fingerprint(stat) {
  return `${stat.mtimeMs}-${stat.size}`
}

function emptyData() {
  return { games: [], software: [] }
}

// quarantineLibrary memindahkan file library yang tidak bisa dibaca ke
// .rusak-<timestamp> lalu menghapus cache.
function quarantineLibrary() {
  try {
    fs.renameSync(dataFile, `${dataFile}.rusak-${Date.now()}`)
  } catch {
    // Gagal mengarsip tidak boleh menghentikan aplikasi.
  }
  cache = null
  cacheValid = false
  cacheFinger = ''
}

// ---------------------------------------------------------------------------
// Baca / tulis
// ---------------------------------------------------------------------------

// loadLocked membaca katalog dari disk (lewat cache bila masih valid). File
// yang belum ada dibangun dari katalog bawaan + hasil migrasi aplikasi lama.
// Katalog bawaan digabung juga ke library yang sudah ada, jadi pembaruan
// aplikasi tetap menambah judul baru tanpa menyentuh entri buatan pengguna.
export async function loadLocked() {
  let stat
  try {
    stat = fs.statSync(dataFile)
  } catch (err) {
    if (err.code !== 'ENOENT') return emptyData()
    const data = await bootstrapLibrary()
    try {
      writeLibraryLocked(data)
    } catch {
      cache = data
      cacheValid = false
    }
    return data
  }

  if (stat.size > maxLibraryFileBytes) {
    quarantineLibrary()
    return emptyData()
  }

  const finger = fingerprint(stat)
  if (cacheValid && cacheFinger === finger && cache) return cache

  let content
  try {
    content = fs.readFileSync(dataFile, 'utf8')
  } catch {
    return emptyData()
  }

  let fileData
  try {
    fileData = JSON.parse(content)
  } catch {
    quarantineLibrary()
    return emptyData()
  }

  const data = {
    games: Array.isArray(fileData.games) ? fileData.games : [],
    software: Array.isArray(fileData.software) ? fileData.software : [],
  }
  normalizeGameThumbs(data.games)
  normalizeSoftwareThumbs(data.software)

  cache = data
  cacheFinger = finger
  cacheValid = true

  if (mergeBuiltinGames(data)) {
    // Gagal menulis tidak boleh menggagalkan load: katalog bawaan tetap
    // tampil di sesi ini dan digabung ulang pada pembukaan berikutnya.
    try {
      writeLibraryLocked(data)
    } catch {
      /* diabaikan dengan sengaja */
    }
  }

  return data
}

// writeLibraryLocked menulis seluruh katalog ke disk secara atomik lalu
// menyinkronkan cache.
export function writeLibraryLocked(data) {
  fs.mkdirSync(dataDir, { recursive: true })
  if (!Array.isArray(data.games)) data.games = []
  if (!Array.isArray(data.software)) data.software = []

  const payload = JSON.stringify({ games: data.games, software: data.software }, null, 2)

  const tmpFile = `${dataFile}.tmp-${Date.now()}`
  fs.writeFileSync(tmpFile, payload, 'utf8')
  replaceFile(tmpFile, dataFile)

  // Sinkronkan cache langsung dari file hasil tulis supaya fingerprint benar.
  try {
    const stat = fs.statSync(dataFile)
    cache = data
    cacheFinger = fingerprint(stat)
    cacheValid = true
  } catch {
    cacheValid = false
    cacheFinger = ''
  }
}

// replaceFile memindahkan src ke dst, dengan satu kali retry untuk kondisi
// Windows di mana antivirus masih menahan handle dst.
function replaceFile(src, dst) {
  try {
    fs.renameSync(src, dst)
    return
  } catch {
    try {
      fs.unlinkSync(dst)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }
  fs.renameSync(src, dst)
}

// ---------------------------------------------------------------------------
// API publik (dipanggil dari IPC)
// ---------------------------------------------------------------------------

export function loadLibrary() {
  return withLock(async () => (await loadLocked()).games)
}

export function loadSoftware() {
  return withLock(async () => (await loadLocked()).software)
}

export function saveLibrary(games) {
  return withLock(async () => {
    let list = Array.isArray(games) ? games : []
    if (list.length > maxGames) list = list.slice(0, maxGames)

    // Satu timestamp untuk seluruh batch: lebih murah dan membuat UpdatedAt
    // konsisten dalam satu kali simpan.
    const now = new Date().toISOString()
    const sanitized = list.map((g) => sanitizeGame(g, now))
    normalizeGameThumbs(sanitized)

    const prev = await loadLocked()
    // Entri bawaan yang tidak ikut tersimpan berarti sengaja dihapus
    // pengguna; catat supaya tidak ditambahkan ulang saat aplikasi dibuka.
    recordHiddenBuiltin(prev.games, sanitized)

    prev.games = sanitized
    writeLibraryLocked(prev)
  })
}

export function saveSoftware(items) {
  return withLock(async () => {
    let list = Array.isArray(items) ? items : []
    if (list.length > maxSoftware) list = list.slice(0, maxSoftware)

    const now = new Date().toISOString()
    const sanitized = list.map((s) => sanitizeSoftware(s, now))
    normalizeSoftwareThumbs(sanitized)

    const prev = await loadLocked()
    prev.software = sanitized
    writeLibraryLocked(prev)
  })
}

// ---------------------------------------------------------------------------
// Data contoh
// ---------------------------------------------------------------------------

// createSampleData mengisi library.json pertama dengan 2 game + 3 software
// contoh (+ thumbnail SVG-nya) supaya tampilan pertama langsung menjelaskan
// cara pakai aplikasi.
export function createSampleData() {
  const svg = (title, sub) =>
    '<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#2a475e"/><stop offset="1" stop-color="#141d28"/>' +
    '</linearGradient></defs><rect width="460" height="215" fill="url(#g)"/>' +
    '<text x="230" y="115" font-family="Segoe UI, Arial" font-size="32" font-weight="700" fill="#e5e5e5" text-anchor="middle">' +
    title +
    '</text><text x="230" y="145" font-family="Segoe UI, Arial" font-size="13" fill="#8f98a0" text-anchor="middle">' +
    sub +
    '</text></svg>'

  const samples = [
    ['sample-gta.svg', 'GTA V', 'Action, Open World'],
    ['sample-elden.svg', 'ELDEN RING', 'Action RPG, Souls-like'],
    ['sample-photoshop.svg', 'PHOTOSHOP 2025', 'Desain Grafis'],
    ['sample-office.svg', 'OFFICE 2021', 'Produktivitas'],
    ['sample-capcut.svg', 'CAPCUT DESKTOP', 'Editing Video'],
  ]
  fs.mkdirSync(thumbsDir, { recursive: true })
  for (const [file, title, sub] of samples) {
    try {
      fs.writeFileSync(path.join(thumbsDir, file), svg(title, sub), 'utf8')
    } catch {
      // Thumbnail contoh gagal ditulis hanya berarti kartu memakai placeholder.
    }
  }

  const now = new Date().toISOString()
  const emptySpecs = () => ({
    os: '', cpu: '', ram: '', gpu: '', dx: '', net: '', storage: '', sound: '', notes: '',
  })

  return {
    games: [
      {
        id: 'sample-1',
        title: 'Grand Theft Auto V',
        thumbnail: thumbRefPrefix + 'sample-gta.svg',
        link: 'https://drive.google.com/drive/folders/sample-gta-link',
        genre: 'Action, Open World',
        size: '110 GB',
        price: 'Rp 400.000',
        steamAppId: '',
        createdAt: now,
        updatedAt: now,
        specs: {
          min: {
            ...emptySpecs(),
            os: 'Windows 10 64 Bit',
            cpu: 'Intel Core 2 Quad CPU Q6600 @ 2.40GHz',
            ram: '4 GB RAM',
            gpu: 'NVIDIA 9800 GT 1GB / AMD HD 4870 1GB',
            dx: 'Version 10',
            storage: '110 GB',
          },
          rec: {
            ...emptySpecs(),
            os: 'Windows 10 64 Bit',
            cpu: 'Intel Core i5 3470 @ 3.2GHz',
            ram: '8 GB RAM',
            gpu: 'NVIDIA GTX 660 2GB / AMD HD 7870 2GB',
            dx: 'Version 11',
            storage: '110 GB',
          },
        },
      },
      {
        id: 'sample-2',
        title: 'ELDEN RING',
        thumbnail: thumbRefPrefix + 'sample-elden.svg',
        link: 'https://drive.google.com/drive/folders/sample-elden-link',
        genre: 'Action RPG, Souls-like',
        size: '60 GB',
        price: 'Rp 599.000',
        steamAppId: '',
        createdAt: now,
        updatedAt: now,
        specs: {
          min: {
            ...emptySpecs(),
            os: 'Windows 10',
            cpu: 'INTEL CORE I5-8400 or AMD RYZEN 3 3300X',
            ram: '12 GB RAM',
            gpu: 'NVIDIA GEFORCE GTX 1060 3 GB or AMD RADEON RX 580 4 GB',
            dx: 'Version 12',
            storage: '60 GB',
          },
          rec: {
            ...emptySpecs(),
            os: 'Windows 10/11',
            cpu: 'INTEL CORE I7-8700K or AMD RYZEN 5 3600X',
            ram: '16 GB RAM',
            gpu: 'NVIDIA GEFORCE GTX 1070 8 GB or AMD RADEON RX VEGA 56 8 GB',
            dx: 'Version 12',
            storage: '60 GB',
          },
        },
      },
    ],
    software: [
      {
        id: 'sample-sw-1',
        title: 'Adobe Photoshop 2025',
        thumbnail: thumbRefPrefix + 'sample-photoshop.svg',
        link: 'https://drive.google.com/drive/folders/contoh-link-ps',
        website: 'https://www.adobe.com/products/photoshop.html',
        category: 'Desain Grafis',
        version: '26.1',
        license: 'Trial 7 hari',
        platform: 'Windows 10/11',
        size: '4 GB',
        price: 'Rp 75.000',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sample-sw-2',
        title: 'Microsoft Office LTSC 2021',
        thumbnail: thumbRefPrefix + 'sample-office.svg',
        link: 'https://drive.google.com/drive/folders/contoh-link-office',
        website: 'https://learn.microsoft.com/office/',
        category: 'Produktivitas & Perkantoran',
        version: 'LTSC 2021',
        license: 'Full / Activate',
        platform: 'Windows 10/11',
        size: '4 GB',
        price: 'Rp 60.000',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sample-sw-3',
        title: 'CapCut Desktop',
        thumbnail: thumbRefPrefix + 'sample-capcut.svg',
        link: 'https://drive.google.com/drive/folders/contoh-link-capcut',
        website: 'https://www.capcut.com/',
        category: 'Editing Video',
        version: '5.1',
        license: 'Gratis',
        platform: 'Windows 10/11',
        size: '1,2 GB',
        price: 'Gratis',
        createdAt: now,
        updatedAt: now,
      },
    ],
  }
}

// Dipakai migrate.js untuk membangun katalog awal.
export { seedBuiltin, builtinGames }
