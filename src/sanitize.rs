// ---------------------------------------------------------------------------
// Sanitasi input — padanan electron/lib/sanitize.js.
//
// Semua data yang masuk ke disk melewati fungsi ini. Batas panjang memakai
// trim_utf8 (text.rs) supaya pemotongan berbasis byte UTF-8 tidak memecah
// karakter multi-byte (CJK, emoji).
// ---------------------------------------------------------------------------

use crate::links::normalize_item_links;
use crate::model::{new_uuid, Game, Library, Software, SystemSpecs};
use crate::text::trim_utf8;

const MAX_LEN_ID: usize = 64;
const MAX_LEN_TITLE: usize = 200;
const MAX_LEN_REF: usize = 2000;
const MAX_LEN_GENRE: usize = 120;
const MAX_LEN_CATEGORY: usize = 120;
const MAX_LEN_VERSION: usize = 60;
const MAX_LEN_LICENSE: usize = 60;
const MAX_LEN_PLATFORM: usize = 80;
const MAX_LEN_SIZE: usize = 60;
const MAX_LEN_PRICE: usize = 60;
const MAX_LEN_STEAM_APP_ID: usize = 20;
const MAX_LEN_SPEC_FIELD: usize = 400;

/// Prefix penanda entri yang dulu dibuat otomatis oleh aplikasi: "builtin-"
/// untuk katalog bawaan, "sample-" untuk data contoh. Entri buatan pengguna
/// selalu memakai UUID, jadi prefix ini tidak pernah bertabrakan.
const LEGACY_SEED_ID_PREFIXES: &[&str] = &["builtin-", "sample-"];

/// sanitize_game membersihkan satu entri game. `now` adalah timestamp RFC3339
/// yang sama untuk seluruh batch pada satu kali simpan.
pub fn sanitize_game(g: &mut Game, now: &str) {
    if g.id.is_empty() {
        g.id = new_uuid();
    }
    if g.created_at.is_empty() {
        g.created_at = now.to_string();
    }
    g.updated_at = now.to_string();

    g.id = trim_utf8(&g.id, MAX_LEN_ID);
    g.title = trim_utf8(&g.title, MAX_LEN_TITLE);
    g.thumbnail = trim_utf8(&g.thumbnail, MAX_LEN_REF);
    g.genre = trim_utf8(&g.genre, MAX_LEN_GENRE);
    g.size = trim_utf8(&g.size, MAX_LEN_SIZE);
    g.price = trim_utf8(&g.price, MAX_LEN_PRICE);
    g.steam_app_id = trim_utf8(&g.steam_app_id, MAX_LEN_STEAM_APP_ID);

    // Link unduhan: `links` (banyak mirror) dirapikan, lalu `link`
    // disinkronkan ke mirror pertama supaya pembaca satu-link lama tetap
    // mendapat URL yang benar.
    normalize_item_links(&mut g.links, &mut g.link);

    sanitize_specs(&mut g.specs.min);
    sanitize_specs(&mut g.specs.rec);
}

fn sanitize_specs(s: &mut SystemSpecs) {
    s.os = trim_utf8(&s.os, MAX_LEN_SPEC_FIELD);
    s.cpu = trim_utf8(&s.cpu, MAX_LEN_SPEC_FIELD);
    s.ram = trim_utf8(&s.ram, MAX_LEN_SPEC_FIELD);
    s.gpu = trim_utf8(&s.gpu, MAX_LEN_SPEC_FIELD);
    s.dx = trim_utf8(&s.dx, MAX_LEN_SPEC_FIELD);
    s.net = trim_utf8(&s.net, MAX_LEN_SPEC_FIELD);
    s.storage = trim_utf8(&s.storage, MAX_LEN_SPEC_FIELD);
    s.sound = trim_utf8(&s.sound, MAX_LEN_SPEC_FIELD);
    s.notes = trim_utf8(&s.notes, MAX_LEN_SPEC_FIELD);
}

/// sanitize_software membersihkan satu entri katalog software. Tidak ada blok
/// spesifikasi di sini: entri software hanya punya metadata + link.
pub fn sanitize_software(s: &mut Software, now: &str) {
    if s.id.is_empty() {
        s.id = new_uuid();
    }
    if s.created_at.is_empty() {
        s.created_at = now.to_string();
    }
    s.updated_at = now.to_string();

    s.id = trim_utf8(&s.id, MAX_LEN_ID);
    s.title = trim_utf8(&s.title, MAX_LEN_TITLE);
    s.thumbnail = trim_utf8(&s.thumbnail, MAX_LEN_REF);
    s.website = trim_utf8(&s.website, MAX_LEN_REF);
    s.category = trim_utf8(&s.category, MAX_LEN_CATEGORY);
    s.version = trim_utf8(&s.version, MAX_LEN_VERSION);
    s.license = trim_utf8(&s.license, MAX_LEN_LICENSE);
    s.platform = trim_utf8(&s.platform, MAX_LEN_PLATFORM);
    s.size = trim_utf8(&s.size, MAX_LEN_SIZE);
    s.price = trim_utf8(&s.price, MAX_LEN_PRICE);

    // Sama seperti game: mirror link dirapikan lalu `link` disinkronkan.
    normalize_item_links(&mut s.links, &mut s.link);
}

/// is_legacy_seed_id true bila entri dibuat otomatis oleh versi sebelumnya.
pub fn is_legacy_seed_id(id: &str) -> bool {
    LEGACY_SEED_ID_PREFIXES.iter().any(|p| id.starts_with(p))
}

/// purge_legacy_seed_entries membuang entri bawaan/contoh yang sudah terlanjur
/// tersimpan di library.json mesin pengguna. Mengembalikan true bila ada yang
/// dibuang, supaya pemanggil tahu file perlu ditulis ulang.
pub fn purge_legacy_seed_entries(lib: &mut Library) -> bool {
    let games_before = lib.games.len();
    let software_before = lib.software.len();
    lib.games.retain(|g| !is_legacy_seed_id(&g.id));
    lib.software.retain(|s| !is_legacy_seed_id(&s.id));
    lib.games.len() != games_before || lib.software.len() != software_before
}
