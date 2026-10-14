// ---------------------------------------------------------------------------
// Persistensi katalog — padanan electron/lib/store.js.
//
// Desain (sama seperti versi Go dan Electron sebelumnya, supaya library.json
// tetap kompatibel dua arah):
//   - satu file JSON (library.json) dengan dua katalog: "games" & "software";
//   - tulis atomik (tmp + rename) supaya tidak ada proses yang pernah melihat
//     file separuh tertulis;
//   - file yang tidak bisa dibaca dikarantina (.rusak-<timestamp>) dan bukan
//     ditimpa, supaya datanya masih bisa diselamatkan manual.
//
// Aplikasi native hanya memuat sekali saat start, jadi cache fingerprint
// seperti versi JS tidak diperlukan: beban selalu langsung dari disk.
// ---------------------------------------------------------------------------

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::links;
use crate::migrate;
use crate::model::{Library, MAX_GAMES, MAX_LIBRARY_FILE_BYTES, MAX_SOFTWARE};
use crate::sanitize;
use crate::thumbs;

/// load_library membaca katalog dari disk sekaligus menormalkannya: referensi
/// thumbnail skema lama dan bentuk link lama diseragamkan, lalu entri bawaan
/// versi sebelumnya dibersihkan sekali jalan. File yang belum ada dibangun
/// dari hasil migrasi aplikasi lama lalu ditulis; kalau tidak ada apa pun
/// untuk dimigrasi, katalog dimulai kosong.
pub fn load_library() -> Library {
    let file = crate::paths::data_file();
    let meta = match fs::metadata(&file) {
        Ok(m) => m,
        Err(e) if e.kind() == ErrorKind::NotFound => {
            let lib = migrate::bootstrap_library();
            // Tulis sekali supaya migrasi tidak diulang tiap start; gagal
            // menulis tidak boleh menghentikan aplikasi.
            let _ = write_library_atomic(&lib);
            return lib;
        }
        Err(_) => return Library::default(),
    };
    if meta.len() > MAX_LIBRARY_FILE_BYTES {
        quarantine(&file);
        return Library::default();
    }
    let content = match fs::read_to_string(&file) {
        Ok(c) => c,
        Err(_) => return Library::default(),
    };
    let mut lib = match parse_library_json(&content) {
        Some(l) => l,
        None => {
            quarantine(&file);
            return Library::default();
        }
    };

    // Data lama hanya punya satu `link` dan referensi thumbnail glib:// atau
    // slib://; di sini diturunkan/diseragamkan supaya sisa aplikasi selalu
    // menerima bentuk yang seragam.
    for g in &mut lib.games {
        thumbs::normalize_thumb_ref(&mut g.thumbnail);
        links::normalize_item_links(&mut g.links, &mut g.link);
    }
    for s in &mut lib.software {
        thumbs::normalize_thumb_ref(&mut s.thumbnail);
        links::normalize_item_links(&mut s.links, &mut s.link);
    }

    // Entri yang dulu dibuat otomatis (katalog bawaan / data contoh)
    // dibersihkan sekali jalan; kalau ada yang dibuang, tulis ulang file.
    if sanitize::purge_legacy_seed_entries(&mut lib) {
        let _ = write_library_atomic(&lib);
    }
    lib
}

/// save_library menyimpan seluruh katalog: setiap entri disanitasi (timestamp
/// `now` sama untuk seluruh batch), link dinormalkan, jumlah dibatasi 5000 per
/// katalog, lalu ditulis secara atomik.
pub fn save_library(lib: &Library) -> Result<(), String> {
    let now = crate::model::now_rfc3339();
    let mut out = Library::default();

    for g in lib.games.iter().take(MAX_GAMES) {
        let mut g = g.clone();
        sanitize::sanitize_game(&mut g, &now);
        out.games.push(g);
    }
    for s in lib.software.iter().take(MAX_SOFTWARE) {
        let mut s = s.clone();
        sanitize::sanitize_software(&mut s, &now);
        out.software.push(s);
    }

    write_library_atomic(&out)
}

/// quarantine memindahkan file library yang tidak bisa dibaca ke
/// .rusak-<timestamp>; gagal mengarsipkan tidak boleh menghentikan aplikasi.
fn quarantine(file: &Path) {
    let mut name = file.as_os_str().to_os_string();
    name.push(format!(".rusak-{}", chrono::Utc::now().timestamp_millis()));
    let _ = fs::rename(file, PathBuf::from(name));
}

/// write_library_atomic menulis seluruh katalog ke disk secara atomik: tulis
/// ke file tmp lalu rename ke tujuan.
fn write_library_atomic(lib: &Library) -> Result<(), String> {
    fs::create_dir_all(crate::paths::data_dir())
        .map_err(|e| format!("Gagal menyiapkan folder data: {}", e))?;
    let payload = library_payload(lib)?;

    let dst = crate::paths::data_file();
    let mut tmp_name = dst.as_os_str().to_os_string();
    tmp_name.push(format!(".tmp-{}", chrono::Utc::now().timestamp_millis()));
    let tmp = PathBuf::from(tmp_name);

    fs::write(&tmp, payload).map_err(|e| format!("Gagal menulis library.json: {}", e))?;

    match fs::rename(&tmp, &dst) {
        Ok(()) => Ok(()),
        Err(first_err) => {
            // Kondisi Windows: antivirus bisa masih menahan handle file lama,
            // jadi dst dilepas lalu rename dicoba sekali lagi.
            let _ = fs::remove_file(&dst);
            match fs::rename(&tmp, &dst) {
                Ok(()) => Ok(()),
                Err(e) => {
                    let _ = fs::remove_file(&tmp); // jangan tinggalkan file sampah
                    Err(format!("Gagal menulis library.json: {} ({})", e, first_err))
                }
            }
        }
    }
}

/// library_payload membentuk JSON katalog (indent 2 spasi seperti
/// JSON.stringify lama). Kunci waktu ditulis camelCase (createdAt/updatedAt)
/// supaya sama persis dengan file Electron/Go lama: model.rs hanya me-rename
/// steamAppId, sehingga serde sendirian akan menulis created_at.
fn library_payload(lib: &Library) -> Result<String, String> {
    let mut value = serde_json::to_value(lib)
        .map_err(|e| format!("Gagal menyiapkan data: {}", e))?;
    for key in ["games", "software"] {
        if let Some(list) = value.get_mut(key).and_then(|v| v.as_array_mut()) {
            for entry in list.iter_mut() {
                rename_time_keys(entry);
            }
        }
    }
    serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Gagal menyiapkan data: {}", e))
}

fn rename_time_keys(entry: &mut Value) {
    if let Some(obj) = entry.as_object_mut() {
        for (snake, camel) in [("created_at", "createdAt"), ("updated_at", "updatedAt")] {
            if let Some(v) = obj.remove(snake) {
                obj.insert(camel.to_string(), v);
            }
        }
    }
}

/// parse_library_json membaca isi library.json lewat serde_json::Value lalu
/// men coerci tiap field (padanan String(value) di JS), jadi angka/null di
/// file lama tidak membuat data ikut terkarantina — versi JS memakai
/// String(value) untuk kasus ini. JSON yang benar-benar rusak mengembalikan
/// None supaya pemanggil mengarantina file.
pub(crate) fn parse_library_json(content: &str) -> Option<Library> {
    let value: Value = serde_json::from_str(content).ok()?;
    // JSON valid tapi bukan objek: katalog kosong (JS: games/software undefined
    // jatuh ke []), bukan file rusak.
    let obj = match value.as_object() {
        Some(o) => o,
        None => return Some(Library::default()),
    };
    let games = obj
        .get("games")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(game_from_value).collect())
        .unwrap_or_default();
    let software = obj
        .get("software")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(software_from_value).collect())
        .unwrap_or_default();
    Some(Library { games, software })
}

fn lenient_str(field: Option<&Value>) -> String {
    match field {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        // Array/object tidak punya padanan string yang masuk akal.
        _ => String::new(),
    }
}

/// Field waktu: file Electron/Go lama memakai camelCase (createdAt), sedangkan
/// serde model.rs menulis created_at. Kedua kunci dibaca, camelCase
/// diprioritaskan.
fn field_either(obj: &serde_json::Map<String, Value>, camel: &str, snake: &str) -> String {
    if obj.contains_key(camel) {
        lenient_str(obj.get(camel))
    } else {
        lenient_str(obj.get(snake))
    }
}

fn game_from_value(v: &Value) -> Option<crate::model::Game> {
    let o = v.as_object()?;
    Some(crate::model::Game {
        id: lenient_str(o.get("id")),
        title: lenient_str(o.get("title")),
        thumbnail: lenient_str(o.get("thumbnail")),
        genre: lenient_str(o.get("genre")),
        size: lenient_str(o.get("size")),
        price: lenient_str(o.get("price")),
        steam_app_id: lenient_str(o.get("steamAppId")),
        links: links_from_value(o.get("links")),
        link: lenient_str(o.get("link")),
        created_at: field_either(o, "createdAt", "created_at"),
        updated_at: field_either(o, "updatedAt", "updated_at"),
        specs: crate::model::GameSpecs {
            min: specs_from_value(o.get("specs").and_then(|s| s.get("min"))),
            rec: specs_from_value(o.get("specs").and_then(|s| s.get("rec"))),
        },
    })
}

fn software_from_value(v: &Value) -> Option<crate::model::Software> {
    let o = v.as_object()?;
    Some(crate::model::Software {
        id: lenient_str(o.get("id")),
        title: lenient_str(o.get("title")),
        thumbnail: lenient_str(o.get("thumbnail")),
        website: lenient_str(o.get("website")),
        category: lenient_str(o.get("category")),
        version: lenient_str(o.get("version")),
        license: lenient_str(o.get("license")),
        platform: lenient_str(o.get("platform")),
        size: lenient_str(o.get("size")),
        price: lenient_str(o.get("price")),
        links: links_from_value(o.get("links")),
        link: lenient_str(o.get("link")),
        created_at: field_either(o, "createdAt", "created_at"),
        updated_at: field_either(o, "updatedAt", "updated_at"),
    })
}

fn links_from_value(field: Option<&Value>) -> Vec<crate::model::LinkMirror> {
    let arr = match field.and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Vec::new(),
    };
    let mut out = Vec::new();
    for item in arr {
        match item {
            // Entri lama bisa berupa string URL polos (padanan readLinkEntry).
            Value::String(url) => out.push(crate::model::LinkMirror {
                label: String::new(),
                url: url.clone(),
            }),
            Value::Object(o) => out.push(crate::model::LinkMirror {
                label: lenient_str(o.get("label")),
                url: lenient_str(o.get("url")),
            }),
            _ => {}
        }
    }
    out
}

fn specs_from_value(field: Option<&Value>) -> crate::model::SystemSpecs {
    let mut specs = crate::model::SystemSpecs::default();
    if let Some(o) = field.and_then(|v| v.as_object()) {
        specs.os = lenient_str(o.get("os"));
        specs.cpu = lenient_str(o.get("cpu"));
        specs.ram = lenient_str(o.get("ram"));
        specs.gpu = lenient_str(o.get("gpu"));
        specs.dx = lenient_str(o.get("dx"));
        specs.net = lenient_str(o.get("net"));
        specs.storage = lenient_str(o.get("storage"));
        specs.sound = lenient_str(o.get("sound"));
        specs.notes = lenient_str(o.get("notes"));
    }
    specs
}
