// ---------------------------------------------------------------------------
// Daftar link unduhan (mirror)
//
// Satu entri katalog bisa punya beberapa link karena file game/software
// disimpan di layanan berbeda (Gofile, PixelDrain, Google Drive, MEGA, dst).
// Struktur yang disimpan di library.json:
//
//   "link":  "https://gofile.io/d/xxxx",                  // mirror utama (lama)
//   "links": [                                            // daftar lengkap
//     { "label": "Gofile",     "url": "https://gofile.io/d/xxxx" },
//     { "label": "PixelDrain", "url": "https://pixeldrain.com/u/yyyy" }
//   ]
//
// `link` sengaja tetap dipertahankan dan selalu disinkronkan dengan mirror
// pertama supaya file library.json versi lama (dan versi Go) tetap terbaca,
// dan supaya kode yang masih membaca satu link tidak pernah kosong.
// ---------------------------------------------------------------------------
import { truncateUTF8 } from './text.js'

// maxLinks batas jumlah mirror per entri; maxLenLinkLabel/maxLenLinkURL batas
// panjang supaya satu entri tidak bisa membengkakkan file library.
export const maxLinks = 20
export const maxLenLinkLabel = 60
export const maxLenLinkURL = 2000

// serviceLabels memetakan hostname ke nama layanan yang dikenal. Dipakai untuk
// mengisi label otomatis saat pengguna hanya menempel URL.
const serviceLabels = [
  [/^(www\.)?drive\.google\.com$/i, 'Google Drive'],
  [/^(www\.)?docs\.google\.com$/i, 'Google Drive'],
  [/^(www\.)?gofile\.io$/i, 'Gofile'],
  [/^(www\.)?pixeldrain\.com$/i, 'PixelDrain'],
  [/^(www\.)?mega\.nz$/i, 'MEGA'],
  [/^(www\.)?mega\.io$/i, 'MEGA'],
  [/^(www\.)?mediafire\.com$/i, 'MediaFire'],
  [/^(www\.)?1drv\.ms$/i, 'OneDrive'],
  [/^(www\.)?onedrive\.live\.com$/i, 'OneDrive'],
  [/^(www\.)?dropbox\.com$/i, 'Dropbox'],
  [/^(www\.)?terabox\.com$/i, 'TeraBox'],
  [/^(www\.)?4funbox\.(com|co)$/i, 'TeraBox'],
  [/^(www\.)?workupload\.com$/i, 'WorkUpload'],
  [/^(www\.)?krakenfiles\.com$/i, 'KrakenFiles'],
  [/^(www\.)?buzzheavier\.com$/i, 'BuzzHeavier'],
  [/^(www\.)?bowfile\.com$/i, 'BowFile'],
  [/^(www\.)?archive\.org$/i, 'Archive.org'],
  [/^(www\.)?github\.com$/i, 'GitHub'],
  [/^(www\.)?itch\.io$/i, 'itch.io'],
  [/^(www\.)?store\.steampowered\.com$/i, 'Steam Store'],
  [/^(www\.)?microsoft\.com$/i, 'Microsoft'],
  [/^(www\.)?adobe\.com$/i, 'Adobe'],
]

// serviceLabel menebak nama layanan dari URL. Kalau tidak dikenal, pakai
// hostname tanpa "www." supaya labelnya tetap informatif.
export function serviceLabel(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  let host = ''
  try {
    host = new URL(withScheme(raw)).hostname
  } catch {
    return ''
  }
  for (const [re, label] of serviceLabels) {
    if (re.test(host)) return label
  }
  return host.replace(/^www\./i, '')
}

// withScheme menambahkan https:// bila pengguna menempel "gofile.io/d/abc"
// tanpa skema. Nilai yang sudah punya skema dibiarkan apa adanya.
export function withScheme(value) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s
  return 'https://' + s
}

// normalizeLinkURL mengembalikan URL yang aman disimpan, atau '' bila tidak
// layak. Hanya http/https yang diterima supaya data yang diimpor tidak pernah
// jadi jalan meluncurkan protokol lain (javascript:, file:, dst).
export function normalizeLinkURL(value) {
  const s = withScheme(value)
  if (!s) return ''
  let parsed
  try {
    parsed = new URL(s)
  } catch {
    return ''
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  if (!parsed.hostname) return ''
  return truncateUTF8(s, maxLenLinkURL)
}

// readLinkEntry menormalkan satu baris input: string polos (URL saja) atau
// objek { label, url }.
function readLinkEntry(entry) {
  if (entry == null) return null
  if (typeof entry === 'string') {
    const url = normalizeLinkURL(entry)
    return url ? { label: '', url } : null
  }
  if (typeof entry !== 'object') return null

  const url = normalizeLinkURL(entry.url)
  if (!url) return null
  const label = truncateUTF8(String(entry.label ?? '').trim(), maxLenLinkLabel)
  return { label, url }
}

// normalizeLinkList membersihkan daftar mirror: URL tidak valid dibuang,
// duplikat dihilangkan, label kosong diisi otomatis dari nama layanan, dan
// jumlah dibatasi maxLinks.
export function normalizeLinkList(raw) {
  const out = []
  const seen = new Set()
  const list = Array.isArray(raw) ? raw : []

  for (const entry of list) {
    if (out.length >= maxLinks) break
    const item = readLinkEntry(entry)
    if (!item) continue
    const key = item.url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label: item.label || serviceLabel(item.url) || 'Link', url: item.url })
  }
  return out
}

// normalizeItemLinks menyelaraskan item.links dengan item.link:
//   - daftar `links` dirapikan bila ada;
//   - kalau belum ada, diturunkan dari field `link` lama;
//   - `link` selalu diisi mirror pertama (kompatibilitas file lama).
// Mengembalikan daftar yang sudah bersih.
export function normalizeItemLinks(item) {
  if (!item || typeof item !== 'object') return []

  let list = normalizeLinkList(item.links)
  if (!list.length && item.link) list = normalizeLinkList([item.link])

  item.links = list
  item.link = list.length ? list[0].url : ''
  return list
}

// normalizeCatalogLinks menerapkan normalizeItemLinks ke seluruh isi katalog.
export function normalizeCatalogLinks(items) {
  if (!Array.isArray(items)) return
  for (const item of items) normalizeItemLinks(item)
}

// linksOf mengembalikan daftar mirror sebuah item tanpa mengubahnya. Dipakai
// renderer (lewat IPC) maupun kode internal.
export function linksOf(item) {
  if (!item || typeof item !== 'object') return []
  const list = normalizeLinkList(item.links)
  if (list.length) return list
  return normalizeLinkList([item.link])
}
