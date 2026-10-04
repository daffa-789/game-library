// ---------------------------------------------------------------------------
// Impor software dari situs vendor (port dari website.go).
//
// Halaman produk tidak punya API seragam seperti Steam, jadi yang dibaca
// adalah metadata publik yang hampir selalu ada: Open Graph / meta tag. Semua
// nilai hanya prefill form; user tetap memeriksa sebelum menyimpan.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { thumbsDir, thumbRefPrefix, allowedThumbExt } from './paths.js'

const MAX_PAGE_BYTES = 4 << 20 // 4 MiB
const MAX_THUMBNAIL_BYTES = 25 << 20 // 25 MiB
const MAX_LEN_TITLE = 200
const MAX_LEN_VERSION = 60
const MAX_LEN_REF = 2000
const MAX_REDIRECTS = 5
const API_TIMEOUT = 15_000
const IMAGE_TIMEOUT = 45_000
const IMPORT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SoftGameLibrary/1.0'

const META_TAG_RE = /<meta\b[^>]*>/gis
const TITLE_TAG_RE = /<title[^>]*>([\s\S]*?)<\/title>/is
const ATTR_RE =
  /(property|name|content)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gis
const VERSION_RE = /\b(?:version|versie|versi|ver\.?|v)\s*[:=]?\s*(\d+(?:\.\d+){1,3})/i
const VERSION_WORD_RE = /^\d+(\.\d+)+$/
const TAG_RE = /<[^>]+>/g
const SPACE_RE = /\s+/g
const SCRIPT_STYLE_RE = /<(?:script|style)[^>]*>[\s\S]*?<\/(?:script|style)>/gis

// Content-Type gambar → ekstensi whitelist.
const CONTENT_EXT_THUMB = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
}

// ---------------------------------------------------------------------------
// Utilitas kecil
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  laquo: '\u00ab',
  raquo: '\u00bb',
  ldquo: '\u201c',
  rdquo: '\u201d',
  lsquo: '\u2018',
  rsquo: '\u2019',
  deg: '\u00b0',
  times: '\u00d7',
  divide: '\u00f7',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
}

function unescapeHtml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[body]
    return named !== undefined ? named : match
  })
}

// truncateUtf8 memotong string hingga <= limit byte tanpa memecah rune.
function truncateUtf8(s, limit) {
  if (Buffer.byteLength(s, 'utf8') <= limit) return s
  let out = ''
  let bytes = 0
  for (const ch of s) {
    const b = Buffer.byteLength(ch, 'utf8')
    if (bytes + b > limit) break
    out += ch
    bytes += b
  }
  return out
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return ''
}

function firstMatch(re, s) {
  const m = re.exec(s)
  if (!m || m.length < 2) return ''
  return m[1]
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// wordPattern membungkus needle dengan \b hanya di sisi yang berupa word char,
// supaya needle seperti "c++" atau "100% free" tetap bisa dicocokkan.
function wordPattern(needle) {
  let prefix = '\\b'
  let suffix = '\\b'
  const chars = Array.from(needle)
  if (chars.length > 0) {
    if (!/[\p{L}\p{Nd}]/u.test(chars[0])) prefix = ''
    if (!/[\p{L}\p{Nd}]/u.test(chars[chars.length - 1])) suffix = ''
  }
  return prefix + escapeRegExp(needle) + suffix
}

// buildRules mengubah daftar needle → regex kata utuh per aturan.
function buildRules(inputs) {
  return inputs.map((input) => ({
    res: input.needles.map((n) => new RegExp(wordPattern(n), 'i')),
    value: input.value,
  }))
}

function matchAny(rules, hay) {
  for (const rule of rules) {
    for (const re of rule.res) {
      if (re.test(hay)) return rule.value
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// Aturan tebakan (urutan penting: aturan pertama yang cocok menang)
// ---------------------------------------------------------------------------

const CATEGORY_RULES = buildRules([
  { needles: ['photo editor', 'photoshop', 'illustrator', 'graphic design', 'coreldraw', 'figma', 'canva', 'design software'], value: 'Desain Grafis' },
  { needles: ['video editor', 'video editing', 'premiere', 'after effects', 'capcut', 'davinci resolve', 'filmora', 'obs studio'], value: 'Editing Video' },
  { needles: ['audio editor', 'music production', 'fl studio', 'ableton', 'audacity'], value: 'Audio & Musik' },
  { needles: ['office suite', 'word processor', 'spreadsheet', 'libreoffice', 'microsoft office', 'pdf editor'], value: 'Produktivitas & Perkantoran' },
  { needles: ['antivirus', 'internet security', 'cleaner', 'optimizer', 'defender', 'malware'], value: 'Keamanan' },
  { needles: ['download manager', 'archiver', '7-zip', 'winrar', 'file manager', 'uninstaller'], value: 'Utilitas' },
  { needles: ['code editor', 'ide', 'visual studio', 'vscode', 'intellij', 'programming'], value: 'Pemrograman' },
  { needles: ['3d modeling', 'blender', 'autocad', 'sketchup', 'solidworks', 'cad'], value: '3D & CAD' },
  { needles: ['browser', 'media player', 'vlc', 'vpn', 'remote desktop', 'teamviewer', 'anydesk'], value: 'Internet & Jaringan' },
  { needles: ['game engine', 'unity', 'unreal engine', 'godot'], value: 'Game Development' },
  { needles: ['driver', 'firmware', 'hardware monitor'], value: 'Driver & Hardware' },
  { needles: ['accounting', 'kasir', 'point of sale', 'pos'], value: 'Bisnis & Keuangan' },
])

const LICENSE_RULES = buildRules([
  { needles: ['open source', 'free and open'], value: 'Open Source' },
  { needles: ['free download', 'download free', '100% free', 'gratis'], value: 'Gratis' },
  { needles: ['free trial', 'trial version', '30-day trial', 'coba gratis'], value: 'Trial' },
  { needles: ['freemium', 'free version'], value: 'Freemium' },
  { needles: ['buy now', 'pricing', 'subscription', 'license key', 'berbayar'], value: 'Berbayar' },
])

const PLATFORM_RULES = [
  { re: /\bwindows\b/i, platform: 'Windows' },
  { re: /\bmac ?os\b/i, platform: 'macOS' },
  { re: /\blinux\b/i, platform: 'Linux' },
  { re: /\bandroid\b/i, platform: 'Android' },
  { re: /\bios\b/i, platform: 'iOS' },
]

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

// requestWithTimeout mengambil URL dengan AbortController timeout dan mengikuti
// maksimal MAX_REDIRECTS redirect secara manual (meniru CheckRedirect Go).
async function requestWithTimeout(url, { timeout, headers }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    let current = url
    for (let i = 0; ; i++) {
      const res = await fetch(current, {
        headers,
        signal: controller.signal,
        redirect: 'manual',
      })
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (location && i < MAX_REDIRECTS) {
          current = new URL(location, current).toString()
          try {
            await res.body?.cancel()
          } catch {
            /* body redirect tidak dipakai */
          }
          continue
        }
      }
      return res
    }
  } finally {
    clearTimeout(timer)
  }
}

// readLimited membaca body hingga maxBytes saja (meniru io.LimitReader).
async function readLimited(res, maxBytes) {
  const reader = res.body?.getReader?.()
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf
  }
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const remain = maxBytes - total
    if (remain <= 0) {
      try {
        await reader.cancel()
      } catch {
        /* diabaikan */
      }
      break
    }
    if (value.byteLength >= remain) {
      chunks.push(Buffer.from(value.subarray(0, remain)))
      try {
        await reader.cancel()
      } catch {
        /* diabaikan */
      }
      break
    }
    chunks.push(Buffer.from(value))
    total += value.byteLength
  }
  return Buffer.concat(chunks)
}

// newThumbName menghasilkan nama file acak (hex) + ekstensi yang diizinkan.
function newThumbName(ext) {
  let name = crypto.randomBytes(10).toString('hex') + ext
  for (let i = 0; i < 3; i++) {
    if (!fs.existsSync(path.join(thumbsDir, name))) return name
    name = crypto.randomBytes(10).toString('hex') + ext
  }
  return name
}

// ---------------------------------------------------------------------------
// API: ImportSoftware
// ---------------------------------------------------------------------------

// importSoftware membaca halaman resmi urlStr dan mengembalikan prefill form
// tambah software. null bila halaman tidak bisa dibaca.
export async function importSoftware(urlStr) {
  const endpoint = normalizePageURL(urlStr)
  if (!endpoint) return null

  try {
    const res = await requestWithTimeout(endpoint, {
      timeout: API_TIMEOUT,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': IMPORT_USER_AGENT,
      },
    })
    // 403/401 = situs menolak permintaan otomatis.
    if (res.status === 403 || res.status === 401) return null
    if (res.status !== 200) return null

    const page = (await readLimited(res, MAX_PAGE_BYTES)).toString('utf8')

    const metas = parseMetaTags(page)
    const title = firstNonEmpty(
      metas['og:title'],
      metas['twitter:title'],
      cleanTitle(firstMatch(TITLE_TAG_RE, page))
    )
    const summary = firstNonEmpty(
      metas['og:description'],
      metas['twitter:description'],
      metas['description']
    )
    const siteName = firstNonEmpty(
      metas['og:site_name'],
      metas['application-name'],
      metas['author']
    )
    const hay = (
      title +
      ' ' +
      summary +
      ' ' +
      siteName +
      ' ' +
      (metas['keywords'] || '')
    ).toLowerCase()

    const result = {
      title: truncateUtf8(cleanTitle(title), MAX_LEN_TITLE),
      thumbnail: '',
      category: matchAny(CATEGORY_RULES, hay),
      version: truncateUtf8(guessVersion(page, title, summary), MAX_LEN_VERSION),
      license: matchAny(LICENSE_RULES, hay),
      platform: guessPlatform(hay),
      website: truncateUtf8(endpoint, MAX_LEN_REF),
    }

    const img = firstNonEmpty(metas['og:image'], metas['twitter:image'])
    if (img !== '') {
      result.thumbnail = await downloadThumb(img)
    }

    if (result.title === '' && result.thumbnail === '' && result.category === '') {
      return null
    }
    return result
  } catch {
    return null
  }
}

// normalizePageURL memastikan URL benar-benar http/https tanpa kredensial.
function normalizePageURL(raw) {
  let trimmed = String(raw ?? '').trim()
  if (trimmed === '') return null
  if (!trimmed.includes('://')) trimmed = 'https://' + trimmed

  let u
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.hostname === '') return null
  if (u.username !== '' || u.password !== '') return null
  return u.toString()
}

// parseMetaTags mengumpulkan <meta property|name → content>. Key lower-case.
function parseMetaTags(page) {
  const out = {}
  for (const tag of page.match(META_TAG_RE) || []) {
    let name = ''
    let content = ''
    for (const m of tag.matchAll(ATTR_RE)) {
      const key = m[1].toLowerCase()
      const val = firstNonEmpty(m[3], m[4], m[5])
      if (key === 'property' || key === 'name') {
        name = val.trim().toLowerCase()
      } else if (key === 'content') {
        content = val
      }
    }
    if (name !== '' && content.trim() !== '') {
      out[name] = unescapeHtml(content)
    }
  }
  return out
}

// cleanTitle membuang tag + entity, memotong imbuhan situs ("Nama | Vendor"),
// lalu merapikan whitespace. Tanda hubung sengaja tidak dipotong.
function cleanTitle(s) {
  let out = unescapeHtml(String(s ?? ''))
  out = out.replace(TAG_RE, ' ')
  const parts = out.split('|')
  if (parts.length > 1) out = parts[0] // bagian kiri biasanya nama produk
  return out.replace(SPACE_RE, ' ').trim()
}

// cleanText mereduksi HTML menjadi teks biasa ber-baris untuk pencocokan.
function cleanText(s) {
  let out = s.replace(SCRIPT_STYLE_RE, ' ')
  out = out.replace(TAG_RE, '\n')
  out = unescapeHtml(out)
  return out
    .split('\n')
    .map((line) => line.replace(SPACE_RE, ' ').trim())
    .join('\n')
}

// guessVersion mencari nomor versi eksplisit di halaman/deskripsi, lalu jatuh
// ke angka bergaya versi yang menempel di judul.
function guessVersion(page, title, summary) {
  for (const src of [cleanText(page), summary]) {
    const m = VERSION_RE.exec(src)
    if (m) return m[1]
  }
  for (const word of String(title ?? '').split(/\s+/)) {
    if (VERSION_WORD_RE.test(word)) return word
  }
  return ''
}

// guessPlatform menyusun daftar platform yang disebut, tanpa duplikat.
function guessPlatform(hay) {
  const found = []
  for (const rule of PLATFORM_RULES) {
    if (!rule.re.test(hay)) continue
    if (!found.includes(rule.platform)) found.push(rule.platform)
  }
  return found.join(', ')
}

// ---------------------------------------------------------------------------
// Unduh thumbnail
// ---------------------------------------------------------------------------

// downloadThumb dipakai jalur impor: kegagalan mengambil gambar tidak boleh
// menggagalkan impor, jadi error ditelan di sini.
async function downloadThumb(imgUrl) {
  try {
    const ref = await saveThumbFromURL(imgUrl)
    return ref || ''
  } catch {
    return ''
  }
}

// saveThumbFromURL menyimpan gambar dari URL ke folder thumbnails. null bila
// URL/gambar tidak valid atau unduhan gagal.
async function saveThumbFromURL(imgUrl) {
  const target = thumbTarget(imgUrl)
  if (!target) return null

  let destPath = target.path
  let ext = target.ext

  try {
    const res = await requestWithTimeout(target.url, {
      timeout: IMAGE_TIMEOUT,
      headers: { 'User-Agent': IMPORT_USER_AGENT },
    })
    if (res.status !== 200) return null

    const contentType = (res.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    // Nama file tidak boleh berbohong soal isinya: ekstensi dari Content-Type
    // yang dikenal selalu menang atas tebakan dari URL.
    const known = CONTENT_EXT_THUMB[contentType]
    if (known) ext = known
    if (ext === '' || !contentType.startsWith('image/')) return null

    const contentLength = res.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_THUMBNAIL_BYTES) return null

    // Ekstensi hasil negosiasi mungkin beda dari tebakan URL → ganti nama.
    if (path.extname(destPath).toLowerCase() !== ext) {
      destPath = destPath.slice(0, destPath.length - path.extname(destPath).length) + ext
    }

    const buf = await readLimited(res, MAX_THUMBNAIL_BYTES + 1)
    if (buf.length === 0 || buf.length > MAX_THUMBNAIL_BYTES) return null

    try {
      fs.writeFileSync(destPath, buf)
    } catch {
      try {
        fs.unlinkSync(destPath)
      } catch {
        /* sisa file gagal dihapus */
      }
      return null
    }
    return thumbRefPrefix + path.basename(destPath)
  } catch {
    return null
  }
}

// thumbTarget memvalidasi URL gambar (skema, host, ekstensi) lalu menentukan
// path tujuan yang aman di dalam folder thumbnails.
function thumbTarget(imgUrl) {
  let u
  try {
    u = new URL(String(imgUrl ?? '').trim())
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.hostname === '') return null
  if (u.username !== '' || u.password !== '') return null

  const host = u.hostname.toLowerCase()
  if (!host.includes('.')) return null

  let ext = path.extname(u.pathname).toLowerCase()
  if (!allowedThumbExt.has(ext)) ext = '' // biarkan ditentukan dari Content-Type

  const name = newThumbName(ext)
  // Nama file hanya boleh karakter aman agar selalu lolos safeThumbPath.
  const safeHost = Array.from(host)
    .map((c) => (/[a-z0-9]/.test(c) ? c : '-'))
    .join('')
    .slice(0, 32)

  return {
    path: path.join(thumbsDir, `web-${safeHost}-${name}`),
    url: u.toString(),
    ext,
  }
}
