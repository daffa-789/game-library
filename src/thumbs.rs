// ---------------------------------------------------------------------------
// Thumbnail: normalisasi referensi, gerbang keamanan path, dialog native, dan
// impor/ekspor file — padanan electron/lib/thumbnails.js.
//
// Semua akses file thumbnail — menyajikan, menyalin keluar, menghapus, dan
// menulis — lewat gerbang yang sama (is_plain_thumb_name / safe_thumb_path),
// jadi tidak ada jalur yang bisa menunjuk ke luar folder thumbnails.
// ---------------------------------------------------------------------------

use std::fs;
use std::path::{Path, PathBuf};

use crate::paths;

/// Batas ukuran file thumbnail (25 MiB). Dipakai juga modul migrate.
pub(crate) const MAX_THUMB_BYTES: u64 = 25 << 20;

/// Panjang maksimum nama file (tanpa ekstensi) yang diturunkan dari judul.
const MAX_FILE_NAME_LEN: usize = 80;

/// Panjang maksimum nama file mentah yang masih dianggap wajar.
const MAX_RAW_NAME_LEN: usize = 200;

/// Karakter yang tidak boleh ada di nama file Windows.
const FORBIDDEN_FILE_NAME_CHARS: &str = "<>:\"/\\|?*";

/// Skema referensi lama: glib:// dari Game Library lama, slib:// dari Software
/// Library lama. Keduanya menunjuk ke file di dalam folder thumbnails yang
/// sekarang dipakai bersama.
const LEGACY_THUMB_PREFIXES: &[&str] = &["glib://thumb/", "slib://thumb/"];

/// Pastikan folder data + folder thumbnail sudah ada.
pub fn ensure_dirs() {
    let _ = fs::create_dir_all(paths::data_dir());
    let _ = fs::create_dir_all(paths::thumbs_dir());
}

/// is_stored_thumb true kalau referensi menunjuk ke file yang disimpan di
/// folder thumbnail aplikasi (bukan URL luar).
pub fn is_stored_thumb(reference: &str) -> bool {
    reference.starts_with("glib://")
        || reference.starts_with("slib://")
        || reference.starts_with(paths::thumb_ref_prefix())
}

/// thumb_file_name membuang prefix referensi thumbnail dan mengembalikan nama
/// file mentah (belum divalidasi); None kalau nama yang tersisa kosong.
pub fn thumb_file_name(reference: &str) -> Option<String> {
    let name = trim_thumb_prefix(reference);
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// safe_thumb_path adalah satu-satunya gerbang menuju file thumbnail.
/// Referensi apa pun yang bukan nama file polos di dalam thumbs_dir ditolak,
/// sehingga traversal (../), path absolut, drive letter, null byte, direktori
/// induk, dan ekstensi non-gambar tidak bisa diakses maupun dihapus.
pub fn safe_thumb_path(reference: &str) -> Option<PathBuf> {
    let name = trim_thumb_prefix(reference);
    if !is_plain_thumb_name(&name) {
        return None;
    }
    if !paths::allowed_thumb_ext(&file_ext_lower(&name)) {
        return None;
    }

    let dir = paths::thumbs_dir();
    let target = dir.join(&name);
    // Gerbang terakhir: hasil join harus tetap tepat satu file di dalam dir.
    if target.parent() != Some(dir.as_path()) {
        return None;
    }
    match target.file_name().and_then(|f| f.to_str()) {
        Some(f) if f == name => {}
        _ => return None,
    }
    Some(target)
}

/// new_thumb_name menghasilkan nama file acak (20 hex = 10 byte) dengan
/// ekstensi yang sudah diizinkan, di-retry sampai 3x kalau nama sudah ada.
pub fn new_thumb_name(ext: &str) -> String {
    let dir = paths::thumbs_dir();
    let mut name = random_thumb_name(ext);
    for _ in 0..3 {
        if !dir.join(&name).exists() {
            return name;
        }
        name = random_thumb_name(ext);
    }
    name
}

/// write_thumb_bytes menulis satu file ke folder thumbnails. Nama harus nama
/// file polos (modul pengimpor menyusunnya sendiri), tapi gerbang traversal
/// tetap dipertahankan di sini supaya nama yang dibentuk dari input pengguna
/// (mis. appId Steam) tidak bisa keluar dari folder.
pub fn write_thumb_bytes(name: &str, data: &[u8]) -> Result<(), String> {
    if !is_plain_thumb_name(name) {
        return Err(format!("Nama file thumbnail tidak valid: {}", name));
    }
    ensure_dirs();
    fs::write(paths::thumbs_dir().join(name), data)
        .map_err(|e| format!("Gagal menulis thumbnail: {}", e))
}

/// store_imported_file memvalidasi file yang dipilih pengguna (ekstensi
/// whitelist, ukuran 1..25 MiB), menyalinnya ke folder thumbnails dengan nama
/// acak, lalu mengembalikan referensi "/thumbnails/<nama>".
pub fn store_imported_file(src: &Path) -> Result<String, String> {
    let file_name = match src.file_name().and_then(|n| n.to_str()) {
        Some(n) => n.to_string(),
        None => return Err("gagal membuka gambar sumber".to_string()),
    };
    let ext = file_ext_lower(&file_name);
    if !paths::allowed_thumb_ext(&ext) {
        return Err(format!("Format gambar tidak didukung: {}", ext));
    }
    let meta = fs::metadata(src).map_err(|_| "gagal membuka gambar sumber".to_string())?;
    if !meta.is_file() || meta.len() == 0 {
        return Err("Yang dipilih bukan file gambar".to_string());
    }
    if meta.len() > MAX_THUMB_BYTES {
        return Err(too_big_message());
    }
    // Ukuran diperiksa ulang setelah dibaca: file bisa berubah di antara stat
    // dan read.
    let data = fs::read(src).map_err(|_| "gagal membaca gambar sumber".to_string())?;
    if data.len() as u64 > MAX_THUMB_BYTES {
        return Err(too_big_message());
    }

    let name = new_thumb_name(&ext);
    write_thumb_bytes(&name, &data)?;
    Ok(format!("{}{}", paths::thumb_ref_prefix(), name))
}

fn too_big_message() -> String {
    format!("Ukuran gambar terlalu besar (maks {} MB)", MAX_THUMB_BYTES >> 20)
}

/// delete_thumbnail menghapus file thumbnail; input di luar whitelist
/// diabaikan secara diam-diam (panggilan tidak boleh gagal untuk ref yang
/// sudah basi).
pub fn delete_thumbnail(reference: &str) {
    if let Some(target) = safe_thumb_path(reference) {
        if target.is_file() {
            let _ = fs::remove_file(target);
        }
    }
}

/// pick_thumbnail_dialog membuka dialog pilih gambar, menyalin hasilnya ke
/// folder data, dan mengembalikan referensi "/thumbnails/<nama>". Dialog
/// dibatalkan maupun gagal impor = None (form tidak boleh menerima referensi
/// yang tidak punya file).
pub fn pick_thumbnail_dialog() -> Option<String> {
    let picked = rfd::FileDialog::new()
        .set_title("Pilih Gambar Thumbnail")
        .add_filter(
            "Gambar (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.svg;*.bmp;*.ico)",
            &["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico"],
        )
        .pick_file();
    let path = picked?;
    store_imported_file(&path).ok()
}

/// save_thumbnail_as_dialog membuka dialog Simpan Sebagai lalu menyalin gambar
/// entri ke lokasi pilihan pengguna. Ok(Some(path)) tersimpan, Ok(None)
/// dibatalkan, Err untuk referensi tanpa gambar tersimpan / gagal menulis.
pub fn save_thumbnail_as_dialog(
    reference: &str,
    title: &str,
) -> Result<Option<PathBuf>, String> {
    let target = match safe_thumb_path(reference) {
        Some(t) => t,
        None => return Err("Entri ini belum punya gambar tersimpan".to_string()),
    };
    let data =
        fs::read(&target).map_err(|_| "File gambar tidak ditemukan di folder data".to_string())?;
    if data.is_empty() {
        return Err("File gambar kosong".to_string());
    }
    let ext = file_ext_lower(target.file_name().and_then(|n| n.to_str()).unwrap_or(""));

    let dest = rfd::FileDialog::new()
        .set_title("Simpan Gambar Thumbnail")
        .set_file_name(safe_file_name(title, &ext))
        .add_filter(&format!("Gambar ({})", ext), &[ext.trim_start_matches('.')])
        .save_file();
    let dest = match dest {
        Some(d) => d,
        None => return Ok(None),
    };
    fs::write(&dest, &data).map_err(|_| "Gagal menyimpan gambar di lokasi itu".to_string())?;
    Ok(Some(dest))
}

/// safe_file_name menurunkan nama file aman dari judul entri: karakter
/// terlarang diganti tanda hubung supaya masih mirip judul aslinya, karakter
/// kontrol dibuang, whitespace jadi satu spasi, ujung titik/spasi dibersihkan,
/// panjang dipotong 80 karakter (berbasis char, bukan byte).
pub fn safe_file_name(title: &str, ext: &str) -> String {
    let mut out = String::new();
    for ch in title.chars() {
        let code = ch as u32;
        if code < 0x20 || code == 0x7f {
            continue;
        }
        if FORBIDDEN_FILE_NAME_CHARS.contains(ch) {
            out.push('-');
        } else if ch.is_whitespace() {
            out.push(' ');
        } else {
            out.push(ch);
        }
    }
    let trimmed = out.trim();
    let stripped = trimmed.trim_matches(|c| c == '.' || c == ' ');
    let name: String = if stripped.is_empty() {
        "thumbnail".to_string()
    } else {
        stripped.chars().take(MAX_FILE_NAME_LEN).collect()
    };
    format!("{}{}", name, ext)
}

/// normalize_thumb_ref mengubah referensi skema lama (glib://thumb/,
/// slib://thumb/) menjadi "/thumbnails/<file>". Referensi lain dibiarkan.
pub fn normalize_thumb_ref(reference: &mut String) {
    if has_known_thumb_prefix(reference) {
        let name = trim_thumb_prefix(reference);
        *reference = format!("{}{}", paths::thumb_ref_prefix(), name);
    }
}

fn has_known_thumb_prefix(reference: &str) -> bool {
    LEGACY_THUMB_PREFIXES
        .iter()
        .any(|p| reference.starts_with(p))
}

/// trim_thumb_prefix membuang semua prefix referensi yang dikenal dan
/// mengembalikan nama file mentah (belum divalidasi).
fn trim_thumb_prefix(reference: &str) -> String {
    let mut s = reference.trim().to_string();
    for p in LEGACY_THUMB_PREFIXES {
        if s.starts_with(p) {
            s = s[p.len()..].to_string();
        }
    }
    let prefix = paths::thumb_ref_prefix();
    if s.starts_with(prefix) {
        s = s[prefix.len()..].to_string();
    }
    if s.starts_with("thumbnails/") {
        s = s["thumbnails/".len()..].to_string();
    }
    s
}

/// Nama file polos: tidak kosong, tanpa separator, tanpa "..", tanpa awalan
/// titik, tanpa drive letter (":")/null byte, dan tidak terlalu panjang.
pub(crate) fn is_plain_thumb_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_RAW_NAME_LEN
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains('\0')
        && !name.contains("..")
        && !name.starts_with('.')
        && !name.contains(':')
}

fn random_thumb_name(ext: &str) -> String {
    let hex = uuid::Uuid::new_v4().simple().to_string();
    format!("{}{}", &hex[..20], ext)
}

/// Ekstensi lowercase termasuk titik (padanan path.extname Node: dotfile tanpa
/// titik lain tidak punya ekstensi).
pub(crate) fn file_ext_lower(name: &str) -> String {
    match name.rfind('.') {
        Some(0) | None => String::new(),
        Some(i) => name[i..].to_lowercase(),
    }
}
