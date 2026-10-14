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
//
// Katalog sengaja TIDAK lagi membawa data bawaan: aplikasi dimulai dengan
// katalog kosong dan seluruh isinya berasal dari input pengguna.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import { dataDir, dataFile } from './paths.js'
import { sanitizeGame, sanitizeSoftware } from './sanitize.js'
import {
  normalizeGameThumbs,
  normalizeSoftwareThumbs,
} from './thumbnails.js'
import { normalizeCatalogLinks } from './links.js'
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
// yang belum ada dibangun dari hasil migrasi aplikasi lama; kalau tidak ada
// apa pun untuk dimigrasi, katalog dimulai kosong.
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
  // Data lama hanya punya satu `link`; di sini diturunkan menjadi daftar mirror
  // supaya renderer selalu menerima bentuk yang seragam.
  normalizeCatalogLinks(data.games)
  normalizeCatalogLinks(data.software)

  // Entri yang dulu dibuat otomatis (katalog bawaan / data contoh) dibersihkan
  // sekali jalan supaya mesin yang sudah pernah menjalankan versi lama ikut
  // mulai dengan katalog kosong.
  if (purgeLegacySeedEntries(data)) {
    try {
      writeLibraryLocked(data)
      return data
    } catch {
      /* gagal menulis: lanjutkan dengan data di memori */
    }
  }

  cache = data
  cacheFinger = finger
  cacheValid = true

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
// Pembersihan data bawaan versi lama
// ---------------------------------------------------------------------------

// legacySeedIDPrefixes penanda entri yang dulu dibuat otomatis oleh aplikasi:
// "builtin-" untuk katalog 60 game bawaan, "sample-" untuk data contoh.
// Entri buatan pengguna selalu memakai UUID, jadi prefix ini tidak pernah
// bertabrakan dengan entri asli.
const legacySeedIDPrefixes = ['builtin-', 'sample-']

// isLegacySeedEntry true bila entri dibuat otomatis oleh versi sebelumnya.
export function isLegacySeedEntry(item) {
  const id = String(item?.id ?? '')
  return legacySeedIDPrefixes.some((p) => id.startsWith(p))
}

// purgeLegacySeedEntries membuang entri bawaan/contoh yang sudah terlanjur
// tersimpan di library.json mesin pengguna. Mengembalikan true bila ada yang
// dibuang, supaya pemanggil tahu file perlu ditulis ulang.
export function purgeLegacySeedEntries(data) {
  let removed = false

  const keep = (list) => {
    if (!Array.isArray(list)) return []
    const out = list.filter((item) => !isLegacySeedEntry(item))
    if (out.length !== list.length) removed = true
    return out
  }

  data.games = keep(data.games)
  data.software = keep(data.software)
  return removed
}
