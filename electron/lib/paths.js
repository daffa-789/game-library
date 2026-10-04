// ---------------------------------------------------------------------------
// Modul path bersama (dipakai steam.js & website.js).
//
// app.getPath('appData') = %APPDATA%, jadi dataDir wajib sama persis dengan
// folder app Go lama (%APPDATA%\softgame-library) supaya data user lama tetap
// terbaca tanpa migrasi ulang.
// ---------------------------------------------------------------------------
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// SOFTGAME_DATA_DIR hanya dipakai untuk pengujian/otomasi: mengarahkan folder
// data ke lokasi sementara supaya data asli pengguna tidak pernah tersentuh.
// Pada pemakaian normal variabel ini kosong dan path-nya tetap %APPDATA%.
export const dataDir = process.env.SOFTGAME_DATA_DIR
  ? path.resolve(process.env.SOFTGAME_DATA_DIR)
  : path.join(app.getPath('appData'), 'softgame-library')
export const dataFile = path.join(dataDir, 'library.json')
export const thumbsDir = path.join(dataDir, 'thumbnails')

// Nama folder aplikasi lama yang datanya diserap saat migrasi (Game Library &
// Software Library terpisah). Folder gabungan sendiri tidak ikut diserap.
const legacyDataDirNames = ['libray-game', 'software-library']

// legacyDirs hanya berisi folder yang benar-benar ada di disk.
export const legacyDirs = legacyDataDirNames
  .filter((name) => name !== 'softgame-library')
  .map((name) => path.join(app.getPath('appData'), name))
  .filter((dir) => fs.existsSync(dir))

// Prefix referensi thumbnail yang dipakai frontend / AssetServer.
export const thumbRefPrefix = '/thumbnails/'

// Whitelist ekstensi gambar yang boleh masuk folder thumbnails. Mencegah file
// berbahaya (mis. .exe/.html) ikut tersaji dari origin aplikasi.
export const allowedThumbExt = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.bmp',
  '.ico',
])

// Pastikan folder thumbnail sudah ada agar unduhan impor bisa menulis file.
fs.mkdirSync(thumbsDir, { recursive: true })
