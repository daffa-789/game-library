// ---------------------------------------------------------------------------
// Path bersama SoftGame Library (padanan electron/lib/paths.js).
//
// app.getPath('appData') Electron = %APPDATA%, jadi dataDir wajib sama persis
// dengan folder aplikasi lama (%APPDATA%\softgame-library) supaya data
// pengguna tetap terbaca tanpa migrasi ulang.
//
// SOFTGAME_DATA_DIR hanya dipakai untuk pengujian/otomasi: mengarahkan folder
// data ke lokasi sementara supaya data asli pengguna tidak pernah tersentuh.
// Pada pemakaian normal variabel ini kosong dan path tetap %APPDATA%.
// ---------------------------------------------------------------------------

use std::env;
use std::path::PathBuf;

/// Nama folder data di bawah %APPDATA%.
const APP_DATA_FOLDER: &str = "softgame-library";

/// Nama folder aplikasi lama yang datanya diserap saat migrasi (Game Library
/// & Software Library terpisah). Perhatian: typo "libray-game" memang nama
/// folder asli dari aplikasi lama.
const LEGACY_DIR_NAMES: &[&str] = &["libray-game", "software-library"];

/// Whitelist ekstensi gambar yang boleh masuk folder thumbnails. Mencegah
/// file berbahaya (mis. .exe/.html) ikut tersaji dari folder data aplikasi.
const ALLOWED_THUMB_EXTENSIONS: &[&str] =
    &[".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico"];

/// Folder data utama SoftGame Library.
pub fn data_dir() -> PathBuf {
    if let Some(dir) = env::var_os("SOFTGAME_DATA_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    base_app_data().join(APP_DATA_FOLDER)
}

/// File katalog utama.
pub fn data_file() -> PathBuf {
    data_dir().join("library.json")
}

/// Folder thumbnail milik katalog gabungan.
pub fn thumbs_dir() -> PathBuf {
    data_dir().join("thumbnails")
}

/// legacyDirs hanya berisi folder lama yang benar-benar ada di disk.
pub fn legacy_dirs() -> Vec<PathBuf> {
    let base = base_app_data();
    LEGACY_DIR_NAMES
        .iter()
        .map(|name| base.join(name))
        .filter(|dir| dir.exists())
        .collect()
}

/// %APPDATA% di Windows. Di luar Windows APPDATA bisa kosong, jadi turun ke
/// HOME (seperti app.getPath('appData') Electron di Linux/macOS) supaya build
/// lintas-platform tetap punya folder data yang wajar.
fn base_app_data() -> PathBuf {
    if let Some(dir) = env::var_os("APPDATA") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    if let Some(home) = env::var_os("HOME") {
        if !home.is_empty() {
            return PathBuf::from(home).join(".config");
        }
    }
    if let Some(profile) = env::var_os("USERPROFILE") {
        if !profile.is_empty() {
            return PathBuf::from(profile).join("AppData").join("Roaming");
        }
    }
    PathBuf::from(".")
}

/// Ekstensi (sudah lowercase, termasuk titik) termasuk whitelist gambar?
pub fn allowed_thumb_ext(ext_lowercase: &str) -> bool {
    ALLOWED_THUMB_EXTENSIONS.contains(&ext_lowercase)
}

/// Prefix referensi thumbnail yang dipakai UI/penyimpanan entri.
pub fn thumb_ref_prefix() -> &'static str {
    "/thumbnails/"
}
