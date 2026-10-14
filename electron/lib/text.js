// ---------------------------------------------------------------------------
// Utilitas teks bersama (dipakai sanitize.js & links.js).
//
// Dipisah ke modul sendiri supaya links.js tidak perlu mengimpor sanitize.js,
// sehingga tidak ada impor melingkar di antara keduanya.
// ---------------------------------------------------------------------------

// truncateUTF8 memotong string pada batas byte tanpa memecah karakter
// multibyte. Padanan truncateUTF8 di sanitize.go versi lama.
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
