// ---------------------------------------------------------------------------
// Migrasi katalog lama — padanan electron/lib/migrate.js.
//
// Sebelum digabung, ada dua aplikasi terpisah yang masing-masing menyimpan
// katalognya sendiri: Game Library (%APPDATA%\libray-game) dan Software
// Library (%APPDATA%\software-library). Saat folder data gabungan pertama kali
// dibuat, keduanya diserap ke sini lengkap dengan file thumbnail-nya, jadi
// koleksi yang sudah ada tidak perlu diketik ulang.
//
// Sumber lama TIDAK diubah: file aslinya tetap di tempat sebagai cadangan.
//
// Bila tidak ada katalog lama yang bisa diserap, katalog dimulai KOSONG:
// aplikasi tidak lagi membawa game bawaan maupun data contoh.
// ---------------------------------------------------------------------------

use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::Path;

use crate::model::Library;
use crate::paths;
use crate::thumbs::{self, MAX_THUMB_BYTES};

/// bootstrap_library membangun isi library.json pertama kali dari hasil
/// gabungan katalog aplikasi lama. Kalau tidak ada data lama, kedua katalog
/// dibiarkan kosong sehingga pengguna memulai dari nol.
pub fn bootstrap_library() -> Library {
    // Folder tujuan harus ada sebelum thumbnail disalin.
    thumbs::ensure_dirs();

    let mut lib = Library::default();
    let mut seen_games: HashSet<String> = HashSet::new();
    let mut seen_software: HashSet<String> = HashSet::new();
    let mut seen_app_id: HashSet<String> = HashSet::new();

    for dir in paths::legacy_dirs() {
        let legacy = match read_legacy_library(&dir) {
            Some(l) => l,
            None => continue,
        };

        for g in legacy.games {
            if g.title.is_empty() || seen_games.contains(&g.id) {
                continue;
            }
            if !g.steam_app_id.is_empty() && seen_app_id.contains(&g.steam_app_id) {
                continue;
            }
            seen_games.insert(g.id.clone());
            if !g.steam_app_id.is_empty() {
                seen_app_id.insert(g.steam_app_id.clone());
            }
            lib.games.push(g);
        }
        for s in legacy.software {
            if s.title.is_empty() || seen_software.contains(&s.id) {
                continue;
            }
            seen_software.insert(s.id.clone());
            lib.software.push(s);
        }
        copy_legacy_thumbs(&dir);
    }

    lib.games.truncate(crate::model::MAX_GAMES);
    lib.software.truncate(crate::model::MAX_SOFTWARE);

    for g in &mut lib.games {
        thumbs::normalize_thumb_ref(&mut g.thumbnail);
        // Katalog lama hanya punya satu link per entri; diturunkan jadi daftar
        // mirror supaya bentuknya seragam dengan entri baru.
        crate::links::normalize_item_links(&mut g.links, &mut g.link);
    }
    for s in &mut lib.software {
        thumbs::normalize_thumb_ref(&mut s.thumbnail);
        crate::links::normalize_item_links(&mut s.links, &mut s.link);
    }
    lib
}

/// read_legacy_library membaca library.json dari folder aplikasi lama.
/// Kegagalan apa pun dianggap "tidak ada data", bukan error yang menghentikan
/// aplikasi.
fn read_legacy_library(dir: &Path) -> Option<Library> {
    let file = dir.join("library.json");
    let meta = fs::metadata(&file).ok()?;
    if meta.len() == 0 || meta.len() > crate::model::MAX_LIBRARY_FILE_BYTES {
        return None;
    }
    let content = fs::read_to_string(&file).ok()?;
    crate::store::parse_library_json(&content)
}

/// copy_legacy_thumbs menyalin gambar dari folder thumbnails lama ke folder
/// gabungan. File yang namanya sudah dipakai tidak ditimpa, dan file di luar
/// whitelist ekstensi gambar dilewati.
fn copy_legacy_thumbs(dir: &Path) {
    let src_dir = dir.join("thumbnails");
    let entries = match fs::read_dir(&src_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let dst_dir = paths::thumbs_dir();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !paths::allowed_thumb_ext(&thumbs::file_ext_lower(&name)) {
            continue;
        }
        let src = entry.path();
        let meta = match fs::metadata(&src) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_THUMB_BYTES {
            continue;
        }
        let dst = dst_dir.join(&name);
        if dst.exists() {
            continue;
        }
        copy_file_no_clobber(&src, &dst);
    }
}

/// copy_file_no_clobber menyalin satu file; gagal diam-diam karena thumbnail
/// yang hilang hanya berarti kartu memakai placeholder.
fn copy_file_no_clobber(src: &Path, dst: &Path) {
    let data = match fs::read(src) {
        Ok(d) => d,
        Err(_) => return,
    };
    if data.len() as u64 > MAX_THUMB_BYTES {
        return;
    }
    // create_new = O_EXCL: jangan pernah menimpa file yang sudah ada.
    let mut file = match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dst)
    {
        Ok(f) => f,
        Err(_) => return,
    };
    let _ = file.write_all(&data);
}
