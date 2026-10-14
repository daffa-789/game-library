// ---------------------------------------------------------------------------
// Daftar link unduhan (mirror) — padanan electron/lib/links.js.
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

use std::collections::HashSet;

use crate::model::{EntryRef, LinkMirror};
use crate::text::truncate_utf8;

/// Batas jumlah mirror per entri.
pub const MAX_LINKS: usize = 20;
pub const MAX_LEN_LABEL: usize = 60;
pub const MAX_LEN_URL: usize = 2000;

/// with_scheme menambahkan https:// bila pengguna menempel "gofile.io/d/abc"
/// tanpa skema. Nilai yang sudah punya skema dibiarkan apa adanya.
pub fn with_scheme(value: &str) -> String {
    let s = value.trim();
    if s.is_empty() {
        return String::new();
    }
    if has_scheme(s) {
        return s.to_string();
    }
    format!("https://{}", s)
}

/// Pola skema mirip regex JS /^[a-z][a-z0-9+.-]*:/i.
fn has_scheme(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    for c in chars {
        if c == ':' {
            return true;
        }
        if !(c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-') {
            return false;
        }
    }
    false
}

/// normalize_link_url mengembalikan URL yang aman disimpan, atau '' bila tidak
/// layak. Hanya http/https yang diterima supaya data yang diimpor tidak pernah
/// jadi jalan meluncurkan protokol lain (javascript:, file:, dst).
pub fn normalize_link_url(value: &str) -> String {
    let s = with_scheme(value);
    if s.is_empty() {
        return String::new();
    }
    match reqwest::Url::parse(&s) {
        Ok(parsed) => {
            if parsed.scheme() != "http" && parsed.scheme() != "https" {
                return String::new();
            }
            // Host wajib ada; URL tanpa host bukan mirror yang bisa dibuka.
            if parsed.host_str().unwrap_or("").is_empty() {
                return String::new();
            }
        }
        Err(_) => return String::new(),
    }
    truncate_utf8(&s, MAX_LEN_URL)
}

/// service_label menebak nama layanan dari URL. Kalau tidak dikenal, pakai
/// hostname tanpa "www." supaya labelnya tetap informatif. Daftar host di
/// bawah ini padanan tepat dari serviceLabels di links.js (regex (?i)
/// dicerminkan lewat lowercase sebelum pencocokan).
pub fn service_label(url: &str) -> String {
    let raw = url.trim();
    if raw.is_empty() {
        return String::new();
    }
    let host = match reqwest::Url::parse(&with_scheme(raw))
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
    {
        Some(h) if !h.is_empty() => h,
        _ => return String::new(),
    };
    let no_www = host.strip_prefix("www.").unwrap_or(&host);
    let label = match no_www.to_lowercase().as_str() {
        "drive.google.com" | "docs.google.com" => "Google Drive",
        "gofile.io" => "Gofile",
        "pixeldrain.com" => "PixelDrain",
        "mega.nz" | "mega.io" => "MEGA",
        "mediafire.com" => "MediaFire",
        "1drv.ms" | "onedrive.live.com" => "OneDrive",
        "dropbox.com" => "Dropbox",
        "terabox.com" | "4funbox.com" | "4funbox.co" => "TeraBox",
        "workupload.com" => "WorkUpload",
        "krakenfiles.com" => "KrakenFiles",
        "buzzheavier.com" => "BuzzHeavier",
        "bowfile.com" => "BowFile",
        "archive.org" => "Archive.org",
        "github.com" => "GitHub",
        "itch.io" => "itch.io",
        "store.steampowered.com" => "Steam Store",
        "microsoft.com" => "Microsoft",
        "adobe.com" => "Adobe",
        _ => return no_www.to_string(),
    };
    label.to_string()
}

/// normalize_link_list membersihkan daftar mirror: URL tidak valid dibuang,
/// duplikat dihilangkan (case-insensitive), label kosong diisi otomatis dari
/// nama layanan, dan jumlah dibatasi MAX_LINKS.
pub fn normalize_link_list(raw: &[LinkMirror]) -> Vec<LinkMirror> {
    let mut out: Vec<LinkMirror> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for entry in raw {
        if out.len() >= MAX_LINKS {
            break;
        }
        let url = normalize_link_url(&entry.url);
        if url.is_empty() {
            continue;
        }
        if !seen.insert(url.to_lowercase()) {
            continue;
        }
        let label = truncate_utf8(entry.label.trim(), MAX_LEN_LABEL);
        let label = if label.is_empty() {
            let svc = service_label(&url);
            if svc.is_empty() {
                "Link".to_string()
            } else {
                svc
            }
        } else {
            label
        };
        out.push(LinkMirror { label, url });
    }
    out
}

/// normalize_item_links menyelaraskan links dengan link:
///   - daftar `links` dirapikan bila ada;
///   - kalau belum ada, diturunkan dari field `link` lama;
///   - `link` selalu diisi mirror pertama (kompatibilitas file lama).
pub fn normalize_item_links(links: &mut Vec<LinkMirror>, link: &mut String) {
    let mut list = normalize_link_list(links);
    if list.is_empty() && !link.is_empty() {
        list = normalize_link_list(&[LinkMirror {
            label: String::new(),
            url: link.clone(),
        }]);
    }
    *link = list.first().map(|m| m.url.clone()).unwrap_or_default();
    *links = list;
}

/// links_of mengembalikan daftar mirror sebuah item tanpa mengubahnya. Dipakai
/// renderer maupun kode internal: pakai `links`, kalau kosong turunkan dari
/// `link` tunggal.
pub fn links_of(links: &[LinkMirror], link: &str) -> Vec<LinkMirror> {
    let list = normalize_link_list(links);
    if !list.is_empty() {
        return list;
    }
    if link.is_empty() {
        return Vec::new();
    }
    normalize_link_list(&[LinkMirror {
        label: String::new(),
        url: link.to_string(),
    }])
}

/// links_of_entry: dipakai EntryRef::links() di model.rs.
pub fn links_of_entry(entry: EntryRef<'_>) -> Vec<LinkMirror> {
    match entry {
        EntryRef::Game(g) => links_of(&g.links, &g.link),
        EntryRef::Software(s) => links_of(&s.links, &s.link),
    }
}
