// ---------------------------------------------------------------------------
// Thumbnail: normalisasi referensi, gerbang keamanan path, dialog native, dan
// penyajian lewat protokol thumb://
//
// Semua akses file thumbnail — menyajikan, menyalin keluar, dan menghapus —
// lewat satu gerbang yang sama (safeThumbPath), jadi tidak ada jalur yang bisa
// menunjuk ke luar folder thumbnails.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dialog, BrowserWindow } from 'electron'
import { thumbsDir, thumbRefPrefix, allowedThumbExt } from './paths.js'

export const maxThumbnailBytes = 25 << 20 // 25 MiB

// maxFileNameLen batas panjang nama file (tanpa ekstensi) yang diturunkan dari
// judul entri.
const maxFileNameLen = 80

// forbiddenFileNameChars karakter yang tidak boleh ada di nama file Windows.
const forbiddenFileNameChars = '<>:"/\\|?*'

// legacyThumbPrefixes semua skema lama yang dikenal: glib:// dari Game Library
// lama, slib:// dari Software Library lama. Keduanya menunjuk ke file di dalam
// folder thumbnails yang sekarang dipakai bersama.
const legacyThumbPrefixes = ['glib://thumb/', 'slib://thumb/']

// ---------------------------------------------------------------------------
// Normalisasi referensi
// ---------------------------------------------------------------------------

// hasKnownThumbPrefix true bila referensi memakai salah satu prefix lama,
// sehingga perlu dinormalisasi ke /thumbnails/.
export function hasKnownThumbPrefix(ref) {
  const s = String(ref ?? '')
  return legacyThumbPrefixes.some((p) => s.startsWith(p))
}

// trimThumbPrefix membuang prefix referensi thumbnail dan mengembalikan nama
// file mentah (belum divalidasi).
export function trimThumbPrefix(ref) {
  let s = String(ref ?? '').trim()
  for (const p of legacyThumbPrefixes) {
    if (s.startsWith(p)) s = s.slice(p.length)
  }
  if (s.startsWith(thumbRefPrefix)) s = s.slice(thumbRefPrefix.length)
  if (s.startsWith('thumbnails/')) s = s.slice('thumbnails/'.length)
  return s
}

// normalizeGameThumbs mengubah referensi skema lama menjadi /thumbnails/<file>.
export function normalizeGameThumbs(games) {
  for (const g of games) {
    if (hasKnownThumbPrefix(g.thumbnail)) g.thumbnail = thumbRefPrefix + trimThumbPrefix(g.thumbnail)
  }
}

export function normalizeSoftwareThumbs(items) {
  for (const s of items) {
    if (hasKnownThumbPrefix(s.thumbnail)) s.thumbnail = thumbRefPrefix + trimThumbPrefix(s.thumbnail)
  }
}

// ---------------------------------------------------------------------------
// Keamanan path
// ---------------------------------------------------------------------------

// safeThumbPath adalah satu-satunya gerbang menuju file thumbnail. Referensi
// apa pun yang bukan nama file polos di dalam thumbsDir ditolak, sehingga
// traversal (../../), path absolut, drive label, null byte, direktori induk,
// dan ekstensi non-gambar tidak bisa diakses maupun dihapus.
export function safeThumbPath(ref) {
  const name = trimThumbPrefix(ref)
  if (!name || name.length > 200) return null
  if (/[/\\\u0000]/.test(name) || name.includes('..') || name.startsWith('.')) return null
  if (path.isAbsolute(name) || name.includes(':')) return null
  if (!allowedThumbExt.has(path.extname(name).toLowerCase())) return null

  const target = path.join(thumbsDir, name)
  const cleanDir = path.resolve(thumbsDir)
  const rel = path.relative(cleanDir, path.resolve(target))
  if (!rel || rel !== name || path.dirname(rel) !== '.') return null
  return target
}

// ---------------------------------------------------------------------------
// Nama file
// ---------------------------------------------------------------------------

// newThumbName menghasilkan nama file acak dengan ekstensi yang sudah diizinkan.
export function newThumbName(ext) {
  let name = crypto.randomBytes(10).toString('hex') + ext
  for (let i = 0; i < 3; i++) {
    if (!fs.existsSync(path.join(thumbsDir, name))) return name
    name = crypto.randomBytes(10).toString('hex') + ext
  }
  return name
}

// safeFileName menurunkan nama file yang aman dari judul entri: karakter
// terlarang diganti tanda hubung supaya masih mirip judul aslinya, whitespace
// dirapikan jadi satu spasi, dan panjang dipotong agar tidak memecah karakter.
export function safeFileName(title, ext) {
  let out = ''
  for (const ch of String(title ?? '')) {
    const code = ch.codePointAt(0)
    if (code < 0x20 || code === 0x7f) continue
    if (forbiddenFileNameChars.includes(ch)) out += '-'
    else if (/\s/.test(ch)) out += ' '
    else out += ch
  }
  let name = out.trim().replace(/^[. ]+|[. ]+$/g, '')
  if (!name) name = 'thumbnail'
  const chars = [...name]
  if (chars.length > maxFileNameLen) name = chars.slice(0, maxFileNameLen).join('')
  return name + ext
}

// ---------------------------------------------------------------------------
// Baca / ekspor
// ---------------------------------------------------------------------------

// exportThumbBytes membaca gambar yang ditunjuk sebuah referensi thumbnail.
// Ini satu-satunya jalan keluar data gambar dari folder aplikasi.
export function exportThumbBytes(ref) {
  const target = safeThumbPath(ref)
  if (!target) throw new Error('Entri ini tidak punya gambar tersimpan')
  let data
  try {
    data = fs.readFileSync(target)
  } catch {
    throw new Error('File gambar tidak ditemukan di folder data')
  }
  if (!data.length) throw new Error('File gambar kosong')
  return { data, ext: path.extname(target).toLowerCase() }
}

// ---------------------------------------------------------------------------
// Dialog native
// ---------------------------------------------------------------------------

const IMAGE_FILTER = {
  name: 'Gambar (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.svg;*.bmp;*.ico)',
  extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'],
}

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

// pickThumbnail membuka dialog pilih gambar, menyalin hasilnya ke folder data,
// dan mengembalikan referensi /thumbnails/<nama>. Dialog dibatalkan = "".
export async function pickThumbnail() {
  const win = focusedWindow()
  if (!win) return ''
  const result = await dialog.showOpenDialog(win, {
    title: 'Pilih Gambar Thumbnail',
    properties: ['openFile'],
    filters: [IMAGE_FILTER],
  })
  if (result.canceled || !result.filePaths.length) return ''

  const filePath = result.filePaths[0]
  const ext = path.extname(filePath).toLowerCase()
  if (!allowedThumbExt.has(ext)) throw new Error(`Format gambar tidak didukung: ${ext}`)

  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    throw new Error('gagal membuka gambar sumber')
  }
  if (stat.isDirectory() || stat.size <= 0) throw new Error('Yang dipilih bukan file gambar')
  if (stat.size > maxThumbnailBytes) {
    throw new Error(`Ukuran gambar terlalu besar (maks ${maxThumbnailBytes >> 20} MB)`)
  }

  const name = newThumbName(ext)
  const destPath = path.join(thumbsDir, name)
  try {
    // Salin dengan batas ukuran supaya file raksasa tidak pernah masuk.
    const fd = fs.openSync(destPath, 'w')
    try {
      const buf = fs.readFileSync(filePath)
      if (buf.length > maxThumbnailBytes) throw new Error('too big')
      fs.writeSync(fd, buf)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    try {
      fs.unlinkSync(destPath)
    } catch {
      /* tidak ada yang perlu dibersihkan */
    }
    throw new Error(`Ukuran gambar terlalu besar (maks ${maxThumbnailBytes >> 20} MB)`)
  }

  return thumbRefPrefix + name
}

// deleteThumbnail menghapus file thumbnail; input di luar whitelist diabaikan
// secara diam-diam (panggilan tidak boleh gagal untuk ref yang sudah basi).
export function deleteThumbnail(ref) {
  const target = safeThumbPath(ref)
  if (!target) return
  try {
    if (fs.statSync(target).isDirectory()) return
  } catch {
    return
  }
  try {
    fs.unlinkSync(target)
  } catch {
    /* sudah tidak ada */
  }
}

// saveThumbnail membuka dialog Simpan Sebagai lalu menyalin gambar entri ke
// lokasi pilihan user. Dialog dibatalkan = "" tanpa error.
export async function saveThumbnail(ref, title) {
  const win = focusedWindow()
  if (!win) return ''

  const { data, ext } = exportThumbBytes(ref)
  const result = await dialog.showSaveDialog(win, {
    title: 'Simpan Gambar Thumbnail',
    defaultPath: safeFileName(title, ext),
    filters: [{ name: `Gambar (${ext})`, extensions: [ext.replace(/^\./, '')] }],
  })
  if (result.canceled || !result.filePath) return ''

  try {
    fs.writeFileSync(result.filePath, data)
  } catch {
    throw new Error('Gagal menyimpan gambar di lokasi itu')
  }
  return result.filePath
}

// ---------------------------------------------------------------------------
// Penyajian lewat protokol thumb://local/<file>
// ---------------------------------------------------------------------------

// resolveThumbRequest memetakan URL protokol thumb:// ke file di thumbsDir.
// Dipakai protocol.handle di main.js; gerbang keamanannya sama persis dengan
// operasi lain di modul ini.
export function resolveThumbRequest(requestUrl) {
  let url
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  const target = safeThumbPath(name)
  if (!target) return null
  try {
    if (!fs.statSync(target).isFile()) return null
  } catch {
    return null
  }
  return target
}
