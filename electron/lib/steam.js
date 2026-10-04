// ---------------------------------------------------------------------------
// Impor Steam (port dari steam.go).
//
// Pencarian + impor detail game dari Steam Store API. Semua kegagalan
// jaringan/parse ditelan dan dikembalikan sebagai nilai kosong ([] / null / "")
// supaya impor tidak pernah menggagalkan UI.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { thumbsDir, thumbRefPrefix, allowedThumbExt } from './paths.js'

const MAX_STEAM_RESPONSE_BYTES = 8 << 20 // 8 MiB, jauh di atas ukuran appdetails
const MAX_STEAM_SEARCH_RESULTS = 25
const MAX_THUMBNAIL_BYTES = 25 << 20 // 25 MiB
const MAX_LEN_TITLE = 200
const MAX_REDIRECTS = 5
const STEAM_API_TIMEOUT = 15_000
const STEAM_IMAGE_TIMEOUT = 45_000
const STEAM_STORE_REGION = 'id'
const IMPORT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SoftGameLibrary/1.0'

// Host gambar Steam yang dipercaya (beserta subdomainnya).
const STEAM_IMAGE_HOST_SUFFIXES = [
  'steampowered.com',
  'steamstatic.com',
  'steamcommunity.com',
]

// Link store.steampowered.com/app/<id> dengan/tanpa skema, slug, atau query.
const STEAM_URL_RE = /(?:store\.steampowered\.com|steampowered\.com)\/app\/(\d+)/i
// System requirement Steam ditulis sebagai <li><strong>Label:</strong> nilai
// </li>; <h4> dipakai sebagai cadangan per label.
const STEAM_LI_RE =
  /<li[^>]*>\s*<strong[^>]*>\s*([^:<>]+?)\s*:?\s*<\/strong>([\s\S]*?)<\/li>/gi
const STEAM_H4_RE =
  /<h4[^>]*>\s*<strong[^>]*>\s*([^:<>]+?)\s*:?\s*<\/strong>([\s\S]*?)<\/h4>/gi
const STEAM_BR_RE = /<br\s*\/?>/gi
const STEAM_TAG_RE = /<[^>]+>/g
const STEAM_SPC_RE = /\s+/g

// Peta label system requirement Steam → field SystemSpecs.
const STEAM_LABELS = {
  os: 'os',
  processor: 'cpu',
  memory: 'ram',
  graphics: 'gpu',
  directx: 'dx',
  storage: 'storage',
  network: 'net',
  'sound card': 'sound',
  'additional notes': 'notes',
}

// ---------------------------------------------------------------------------
// Utilitas kecil
// ---------------------------------------------------------------------------

// Entity HTML umum. Steam hanya memakai subset kecil; yang tak dikenal
// dibiarkan apa adanya.
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

// truncateUtf8 memotong string hingga <= limit byte tanpa memecah rune, agar
// teks multi-byte (CJK / emoji) tidak rusak.
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

function emptySpecs() {
  return {
    os: '',
    cpu: '',
    ram: '',
    gpu: '',
    dx: '',
    net: '',
    storage: '',
    sound: '',
    notes: '',
  }
}

// newThumbName menghasilkan nama file acak (hex) + ekstensi yang diizinkan,
// dan memastikan tidak menabrak file yang sudah ada.
function newThumbName(ext) {
  let name = crypto.randomBytes(10).toString('hex') + ext
  for (let i = 0; i < 3; i++) {
    if (!fs.existsSync(path.join(thumbsDir, name))) return name
    name = crypto.randomBytes(10).toString('hex') + ext
  }
  return name
}

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

// htmlToText mengubah potongan HTML requirement jadi teks. Urutan penting:
// <br> → spasi, buang tag, baru decode entity (agar "&lt;Fast&gt;" tidak ikut
// terbuang sebagai tag).
function htmlToText(s) {
  let out = s.replace(STEAM_BR_RE, ' ')
  out = out.replace(STEAM_TAG_RE, '')
  out = unescapeHtml(out)
  out = out.replace(STEAM_SPC_RE, ' ')
  return truncateUtf8(out.trim(), 400)
}

// ---------------------------------------------------------------------------
// Pencarian Steam
// ---------------------------------------------------------------------------

// steamSearch mencari game di katalog Steam Store berdasarkan kata kunci.
// Hasil kosong menandakan tidak ditemukan / gagal (tidak pernah throw).
export async function steamSearch(term) {
  const query = String(term ?? '').trim()
  if (query === '') return []
  if (Array.from(query).length > 120) return []

  const params = new URLSearchParams({
    term: query,
    l: 'english',
    cc: STEAM_STORE_REGION,
  })
  const apiUrl =
    'https://store.steampowered.com/api/storesearch/?' + params.toString()

  try {
    const res = await requestWithTimeout(apiUrl, {
      timeout: STEAM_API_TIMEOUT,
      headers: { Accept: 'application/json', 'User-Agent': IMPORT_USER_AGENT },
    })
    if (res.status !== 200) return []

    const text = (await readLimited(res, MAX_STEAM_RESPONSE_BYTES)).toString(
      'utf8'
    )
    const payload = JSON.parse(text)
    const items = Array.isArray(payload?.items) ? payload.items : []

    const out = []
    for (const it of items) {
      // Hanya "app" yang bisa dibuka appdetails — skip bundle/package/dlc.
      if (it.type && it.type !== 'app') continue
      const id = it.id != null ? String(it.id) : ''
      const name = typeof it.name === 'string' ? it.name.trim() : ''
      if (id === '' || id === '0' || name === '') continue

      out.push({
        appId: id,
        title: truncateUtf8(name, MAX_LEN_TITLE),
        thumbnail: typeof it.tiny_image === 'string' ? it.tiny_image : '',
        price:
          typeof it.price?.final_formatted === 'string'
            ? it.price.final_formatted.trim()
            : '',
      })
      if (out.length >= MAX_STEAM_SEARCH_RESULTS) break
    }
    return out
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Impor detail Steam
// ---------------------------------------------------------------------------

// steamImport mengambil detail satu game dari link store Steam. Mengembalikan
// null bila link tidak dikenali atau data tidak bisa diambil.
export async function steamImport(urlStr) {
  const m = STEAM_URL_RE.exec(String(urlStr ?? ''))
  if (!m) return null
  const appId = m[1]

  const detail = await fetchSteamDetails(appId)
  if (!detail) return null

  // Payload membawa steam_appid sendiri; kalau ada, itulah id yang benar
  // (bisa berbeda dari appid di link karena redirect / link lama).
  let resolvedId = appId
  const sid = detail.steam_appid != null ? String(detail.steam_appid) : ''
  if (sid !== '' && sid !== '0') resolvedId = sid

  // pc_requirements bisa berupa object atau array kosong [] (sering terjadi).
  let minSpecs = emptySpecs()
  let recSpecs = emptySpecs()
  const req = detail.pc_requirements
  if (req && typeof req === 'object' && !Array.isArray(req)) {
    minSpecs = parseSysReq(typeof req.minimum === 'string' ? req.minimum : '')
    recSpecs = parseSysReq(
      typeof req.recommended === 'string' ? req.recommended : ''
    )
  }

  const genres = Array.isArray(detail.genres)
    ? detail.genres
        .map((g) => g?.description)
        .filter((d) => typeof d === 'string' && d !== '')
    : []

  const result = {
    appId: resolvedId,
    title: typeof detail.name === 'string' ? detail.name : '',
    thumbnail: '',
    genre: genres.join(', '),
    developer: Array.isArray(detail.developers)
      ? detail.developers.join(', ')
      : '',
    releaseDate: detail.release_date?.date ?? '',
    price: detail.price_overview?.final_formatted ?? '',
    specs: { min: minSpecs, rec: recSpecs },
  }

  if (typeof detail.header_image === 'string' && detail.header_image !== '') {
    result.thumbnail = await downloadSteamImage(resolvedId, detail.header_image)
  }
  return result
}

// fetchSteamDetails mengambil detail dengan region store; kalau region itu
// tidak punya harga, dicoba sekali lagi tanpa cc agar impor tetap selengkap
// mungkin.
async function fetchSteamDetails(appId) {
  const first = await requestSteamDetails(appId, STEAM_STORE_REGION)
  if (first.ok && first.detail.price_overview?.final_formatted) {
    return first.detail
  }

  const fallback = await requestSteamDetails(appId, '')
  if (!fallback.ok) {
    // Percobaan pertama berhasil (hanya tanpa harga) tetap dipakai.
    if (first.ok) return first.detail
    return null
  }
  if (first.ok && !fallback.detail.price_overview?.final_formatted) {
    return first.detail // hasil pertama lebih lengkap (punya harga region)
  }
  return fallback.detail
}

// requestSteamDetails satu panggilan appdetails untuk satu appid dan satu
// region ('' berarti region default Steam).
async function requestSteamDetails(appId, region) {
  const params = new URLSearchParams({ appids: appId, l: 'english' })
  if (region) params.set('cc', region)
  const apiUrl =
    'https://store.steampowered.com/api/appdetails?' + params.toString()

  try {
    const res = await requestWithTimeout(apiUrl, {
      timeout: STEAM_API_TIMEOUT,
      headers: { Accept: 'application/json', 'User-Agent': IMPORT_USER_AGENT },
    })
    if (res.status !== 200) return { ok: false }

    const text = (await readLimited(res, MAX_STEAM_RESPONSE_BYTES)).toString(
      'utf8'
    )
    const root = JSON.parse(text)
    if (!root || typeof root !== 'object') return { ok: false }

    // Steam kadang menjawab dengan key = id internal, bukan appid yang diminta.
    let entry = root[appId]
    if (!entry) entry = singleSteamEntry(root)
    if (!entry || !entry.success || entry.data == null) return { ok: false }

    return { ok: true, detail: entry.data }
  } catch {
    return { ok: false }
  }
}

// singleSteamEntry mengambil satu-satunya entri apa pun key-nya; kalau ada
// lebih dari satu entri, tidak menebak-nebak.
function singleSteamEntry(root) {
  const keys = Object.keys(root)
  if (keys.length !== 1) return null
  return root[keys[0]]
}

// ---------------------------------------------------------------------------
// Parsing spesifikasi sistem
// ---------------------------------------------------------------------------

function parseSysReq(rawHtml) {
  const dict = {}
  const fill = (re) => {
    for (const m of rawHtml.matchAll(re)) {
      const key = m[1].trim().replace(/[* :]+$/, '').toLowerCase()
      const target = STEAM_LABELS[key]
      if (!target || dict[target]) continue // label tak dikenal / sudah terisi
      const text = htmlToText(m[2])
      if (text) dict[target] = text
    }
  }
  // Prioritas format <li>, lalu <h4> untuk label yang masih kosong.
  fill(STEAM_LI_RE)
  fill(STEAM_H4_RE)

  return {
    os: dict.os || '',
    cpu: dict.cpu || '',
    ram: dict.ram || '',
    gpu: dict.gpu || '',
    dx: dict.dx || '',
    net: dict.net || '',
    storage: dict.storage || '',
    sound: dict.sound || '',
    notes: dict.notes || '',
  }
}

// ---------------------------------------------------------------------------
// Unduh gambar header Steam
// ---------------------------------------------------------------------------

// downloadSteamImage menyimpan gambar header ke folder thumbnails. ""
// dikembalikan bila gambar tidak bisa diambil — impor tetap lanjut.
async function downloadSteamImage(appId, imgUrl) {
  const dest = steamImageDest(appId, imgUrl)
  if (!dest) return ''

  try {
    const res = await requestWithTimeout(imgUrl, {
      timeout: STEAM_IMAGE_TIMEOUT,
      headers: { 'User-Agent': IMPORT_USER_AGENT },
    })
    if (res.status !== 200) return ''

    const contentType = res.headers.get('content-type')
    if (contentType && !contentType.toLowerCase().startsWith('image/')) return ''

    const contentLength = res.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_THUMBNAIL_BYTES) return ''

    const buf = await readLimited(res, MAX_THUMBNAIL_BYTES + 1)
    if (buf.length === 0 || buf.length > MAX_THUMBNAIL_BYTES) return ''

    try {
      fs.writeFileSync(dest, buf)
    } catch {
      try {
        fs.unlinkSync(dest)
      } catch {
        /* sisa file gagal dihapus */
      }
      return ''
    }
    return thumbRefPrefix + path.basename(dest)
  } catch {
    return ''
  }
}

// steamImageDest memvalidasi URL gambar (https + host Valve + ekstensi
// diizinkan) lalu menentukan path tujuan yang belum dipakai.
function steamImageDest(appId, imgUrl) {
  let u
  try {
    u = new URL(imgUrl)
  } catch {
    return null
  }
  if (u.protocol.toLowerCase() !== 'https:') return null

  const host = u.hostname.toLowerCase()
  const trusted = STEAM_IMAGE_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith('.' + suffix)
  )
  if (!trusted) return null

  let ext = path.extname(u.pathname).toLowerCase()
  if (ext === '') ext = '.jpg'
  if (!allowedThumbExt.has(ext)) return null

  const name = newThumbName(ext)
  return path.join(thumbsDir, `steam-${appId}-${name}`)
}
