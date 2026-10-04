// ---------------------------------------------------------------------------
// Sanitasi input: semua data yang masuk ke disk melewati fungsi ini.
// Batas panjang memakai truncateUTF8 supaya pemotongan tidak memecah rune.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto'

export const maxLenID = 64
export const maxLenTitle = 200
export const maxLenRef = 2000
export const maxLenGenre = 120
export const maxLenCategory = 120
export const maxLenVersion = 60
export const maxLenLicense = 60
export const maxLenPlatform = 80
export const maxLenSize = 60
export const maxLenPrice = 60
export const maxLenSteamAppID = 20
export const maxLenSpecField = 400

// truncateUTF8 memotong string pada batas byte tanpa memecah karakter
// multibyte. Padanan truncateUTF8 di sanitize.go.
export function truncateUTF8(s, limit) {
  if (s == null) return ''
  const str = String(s)
  if (Buffer.byteLength(str, 'utf8') <= limit) return str
  let out = ''
  let bytes = 0
  for (const ch of str) {
    const n = Buffer.byteLength(ch, 'utf8')
    if (bytes + n > limit) break
    out += ch
    bytes += n
  }
  return out
}

function trimmer(value, limit) {
  return truncateUTF8(String(value ?? '').trim(), limit)
}

// sanitizeGame membersihkan satu entri game. `now` adalah timestamp RFC3339
// yang sama untuk seluruh batch pada satu kali simpan.
export function sanitizeGame(g, now) {
  const out = { ...g }
  if (!out.id) out.id = newEntryID()
  if (!out.createdAt) out.createdAt = now
  out.updatedAt = now

  out.id = trimmer(out.id, maxLenID)
  out.title = trimmer(out.title, maxLenTitle)
  out.thumbnail = trimmer(out.thumbnail, maxLenRef)
  out.link = trimmer(out.link, maxLenRef)
  out.genre = trimmer(out.genre, maxLenGenre)
  out.size = trimmer(out.size, maxLenSize)
  out.price = trimmer(out.price, maxLenPrice)
  out.steamAppId = trimmer(out.steamAppId, maxLenSteamAppID)

  out.specs = {
    min: sanitizeSpecs(g.specs?.min),
    rec: sanitizeSpecs(g.specs?.rec),
  }
  return out
}

function sanitizeSpecs(s) {
  const src = s || {}
  return {
    os: trimmer(src.os, maxLenSpecField),
    cpu: trimmer(src.cpu, maxLenSpecField),
    ram: trimmer(src.ram, maxLenSpecField),
    gpu: trimmer(src.gpu, maxLenSpecField),
    dx: trimmer(src.dx, maxLenSpecField),
    net: trimmer(src.net, maxLenSpecField),
    storage: trimmer(src.storage, maxLenSpecField),
    sound: trimmer(src.sound, maxLenSpecField),
    notes: trimmer(src.notes, maxLenSpecField),
  }
}

// sanitizeSoftware membersihkan satu entri katalog software. Tidak ada blok
// spesifikasi di sini: entri software hanya punya metadata + link.
export function sanitizeSoftware(sw, now) {
  const out = { ...sw }
  if (!out.id) out.id = newEntryID()
  if (!out.createdAt) out.createdAt = now
  out.updatedAt = now

  out.id = trimmer(out.id, maxLenID)
  out.title = trimmer(out.title, maxLenTitle)
  out.thumbnail = trimmer(out.thumbnail, maxLenRef)
  out.link = trimmer(out.link, maxLenRef)
  out.website = trimmer(out.website, maxLenRef)
  out.category = trimmer(out.category, maxLenCategory)
  out.version = trimmer(out.version, maxLenVersion)
  out.license = trimmer(out.license, maxLenLicense)
  out.platform = trimmer(out.platform, maxLenPlatform)
  out.size = trimmer(out.size, maxLenSize)
  out.price = trimmer(out.price, maxLenPrice)
  return out
}

// newEntryID menghasilkan UUID v4. Dipakai kedua katalog karena ID hanya perlu
// unik di dalam file library yang sama.
export function newEntryID() {
  return crypto.randomUUID()
}
