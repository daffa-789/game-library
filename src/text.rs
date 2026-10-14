// ---------------------------------------------------------------------------
// Utilitas teks bersama (padanan text.js di versi Electron).
//
// Dipakai sanitize.rs dan links.rs. Semua pemotongan berbasis byte UTF-8 agar
// karakter multi-byte (CJK, emoji) tidak pernah terpotong di tengah rune.
// ---------------------------------------------------------------------------

/// Potong string agar tidak lebih dari `limit` byte UTF-8, tanpa memecah rune.
pub fn truncate_utf8(s: &str, limit: usize) -> String {
    if s.len() <= limit {
        return s.to_string();
    }
    let mut out = String::new();
    let mut bytes = 0usize;
    for ch in s.chars() {
        let n = ch.len_utf8();
        if bytes + n > limit {
            break;
        }
        out.push(ch);
        bytes += n;
    }
    out
}

/// Trim lalu potong (padanan trimmer() di sanitize.js).
pub fn trim_utf8(s: &str, limit: usize) -> String {
    truncate_utf8(s.trim(), limit)
}
