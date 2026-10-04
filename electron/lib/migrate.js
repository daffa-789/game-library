// ---------------------------------------------------------------------------
// Migrasi katalog lama
//
// Sebelum digabung, ada dua aplikasi terpisah yang masing-masing menyimpan
// katalognya sendiri: Game Library (%APPDATA%\libray-game) dan Software
// Library (%APPDATA%\software-library). Saat folder data gabungan pertama kali
// dibuat, keduanya diserap ke sini lengkap dengan file thumbnail-nya, jadi
// koleksi yang sudah ada tidak perlu diketik ulang.
//
// Sumber lama TIDAK diubah: file aslinya tetap di tempat sebagai cadangan.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import { legacyDirs, thumbsDir, allowedThumbExt } from './paths.js'
import { builtinGames, seedBuiltin } from './seed.js'
import {
  normalizeGameThumbs,
  normalizeSoftwareThumbs,
  maxThumbnailBytes,
} from './thumbnails.js'
// Impor melingkar dengan store.js disengaja: keduanya hanya memakai fungsi
// yang dipanggil saat runtime, bukan saat modul dievaluasi.
import { createSampleData } from './store.js'

const maxGames = 5000
const maxSoftware = 5000
const maxLibraryFileBytes = 64 << 20 // 64 MiB

// bootstrapLibrary membangun isi library.json pertama kali: hasil gabungan
// katalog lama, atau 60 game bawaan (bila seedBuiltin aktif), atau data contoh
// bila tidak ada apa pun untuk dimigrasi.
export function bootstrapLibrary() {
  const data = { games: [], software: [] }
  const seenGames = new Set()
  const seenSoftware = new Set()
  const seenAppID = new Set()
  let migrated = false

  for (const dir of legacyDirs) {
    const legacy = readLegacyLibrary(dir)
    if (!legacy) continue

    for (const g of legacy.games) {
      if (!g.title || seenGames.has(g.id)) continue
      if (g.steamAppId && seenAppID.has(g.steamAppId)) continue
      seenGames.add(g.id)
      if (g.steamAppId) seenAppID.add(g.steamAppId)
      data.games.push(g)
    }
    for (const s of legacy.software) {
      if (!s.title || seenSoftware.has(s.id)) continue
      seenSoftware.add(s.id)
      data.software.push(s)
    }
    if (legacy.games.length || legacy.software.length) migrated = true
    copyLegacyThumbs(dir)
  }

  if (!migrated) {
    if (seedBuiltin) {
      for (const g of builtinGames()) {
        if (seenGames.has(g.id)) continue
        seenGames.add(g.id)
        if (g.steamAppId) seenAppID.add(g.steamAppId)
        data.games.push(g)
      }
      const samples = createSampleData()
      data.software.push(...samples.software)
    } else {
      return createSampleData()
    }
  }

  if (data.games.length > maxGames) data.games = data.games.slice(0, maxGames)
  if (data.software.length > maxSoftware) data.software = data.software.slice(0, maxSoftware)
  normalizeGameThumbs(data.games)
  normalizeSoftwareThumbs(data.software)
  return data
}

// readLegacyLibrary membaca library.json dari folder aplikasi lama. Kegagalan
// apa pun dianggap "tidak ada data", bukan error yang menghentikan aplikasi.
function readLegacyLibrary(dir) {
  const file = path.join(dir, 'library.json')
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }
  if (!stat.size || stat.size > maxLibraryFileBytes) return null

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return {
      games: Array.isArray(parsed.games) ? parsed.games : [],
      software: Array.isArray(parsed.software) ? parsed.software : [],
    }
  } catch {
    return null
  }
}

// copyLegacyThumbs menyalin gambar dari folder thumbnails lama ke folder
// gabungan. File yang namanya sudah dipakai tidak ditimpa, dan file di luar
// whitelist ekstensi gambar dilewati.
function copyLegacyThumbs(dir) {
  const srcDir = path.join(dir, 'thumbnails')
  let entries
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.isDirectory()) continue
    if (!allowedThumbExt.has(path.extname(entry.name).toLowerCase())) continue

    const src = path.join(srcDir, entry.name)
    let stat
    try {
      stat = fs.statSync(src)
    } catch {
      continue
    }
    if (!stat.size || stat.size > maxThumbnailBytes) continue

    const dst = path.join(thumbsDir, path.basename(entry.name))
    if (fs.existsSync(dst)) continue
    copyFile(src, dst)
  }
}

// copyFile menyalin satu file; gagal diam-diam karena thumbnail yang hilang
// hanya berarti kartu memakai placeholder.
function copyFile(src, dst) {
  let data
  try {
    data = fs.readFileSync(src)
  } catch {
    return
  }
  if (data.length > maxThumbnailBytes) return
  try {
    // O_EXCL: jangan pernah menimpa file yang sudah ada.
    fs.writeFileSync(dst, data, { flag: 'wx' })
  } catch {
    /* nama sudah dipakai atau folder tidak bisa ditulis */
  }
}
