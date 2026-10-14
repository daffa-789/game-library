// ---------------------------------------------------------------------------
// Model data SoftGame Library.
//
// Bentuk JSON di file library.json WAJIB tetap sama persis dengan versi Go dan
// Electron lama supaya data pengguna (%APPDATA%\softgame-library) bisa terus
// dibaca tanpa migrasi ulang. Nama field di JSON memakai camelCase
// (steamAppId, createdAt, updatedAt) lewat atribut serde.
//
// Katalog dibagi dua: games (dengan blok spesifikasi sistem + impor Steam)
// dan software (metadata vendor + impor dari situs resmi).
// ---------------------------------------------------------------------------
use serde::{Deserialize, Serialize};

/// Batas jumlah entri per katalog (sama dengan versi lama).
pub const MAX_GAMES: usize = 5000;
pub const MAX_SOFTWARE: usize = 5000;
/// Batas ukuran file library.json yang mau dibaca (64 MiB).
pub const MAX_LIBRARY_FILE_BYTES: u64 = 64 << 20;

/// Satu baris mirror download: { label, url }.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct LinkMirror {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub url: String,
}

/// Spesifikasi sistem satu kolom (minimum atau recommended).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SystemSpecs {
    #[serde(default)]
    pub os: String,
    #[serde(default)]
    pub cpu: String,
    #[serde(default)]
    pub ram: String,
    #[serde(default)]
    pub gpu: String,
    #[serde(default)]
    pub dx: String,
    #[serde(default)]
    pub net: String,
    #[serde(default)]
    pub storage: String,
    #[serde(default)]
    pub sound: String,
    #[serde(default)]
    pub notes: String,
}

/// Blok spesifikasi game: min & rec.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct GameSpecs {
    #[serde(default)]
    pub min: SystemSpecs,
    #[serde(default)]
    pub rec: SystemSpecs,
}

/// Entri katalog game.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Game {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    /// Referensi thumbnail: /thumbnails/<file> (skema lama dinormalkan saat load).
    #[serde(default)]
    pub thumbnail: String,
    #[serde(default)]
    pub genre: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub price: String,
    #[serde(rename = "steamAppId", default)]
    pub steam_app_id: String,
    #[serde(default)]
    pub links: Vec<LinkMirror>,
    /// Mirror pertama; dipertahankan supaya file lama tetap terbaca.
    #[serde(default)]
    pub link: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub specs: GameSpecs,
}

/// Entri katalog software (tanpa blok spesifikasi).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Software {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub thumbnail: String,
    #[serde(default)]
    pub website: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub license: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub price: String,
    #[serde(default)]
    pub links: Vec<LinkMirror>,
    #[serde(default)]
    pub link: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// Isi library.json.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Library {
    #[serde(default)]
    pub games: Vec<Game>,
    #[serde(default)]
    pub software: Vec<Software>,
}

/// Tab katalog yang aktif.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogTab {
    Game,
    Software,
}

impl CatalogTab {
    pub fn noun(self) -> &'static str {
        match self {
            CatalogTab::Game => "game",
            CatalogTab::Software => "software",
        }
    }
    pub fn noun_cap(self) -> &'static str {
        match self {
            CatalogTab::Game => "Game",
            CatalogTab::Software => "Software",
        }
    }
    /// Katalog ini punya blok spesifikasi sistem?
    pub fn has_specs(self) -> bool {
        matches!(self, CatalogTab::Game)
    }
    /// Field kategori (dipakai filter & urut kategori); game tidak punya.
    pub fn category_field(self) -> Option<&'static str> {
        match self {
            CatalogTab::Game => None,
            CatalogTab::Software => Some("category"),
        }
    }
    pub fn sort_options(self) -> &'static [(&'static str, &'static str)] {
        match self {
            CatalogTab::Game => &[("new", "Terbaru"), ("az", "Judul A–Z"), ("za", "Judul Z–A")],
            CatalogTab::Software => &[
                ("new", "Terbaru"),
                ("az", "Nama A–Z"),
                ("za", "Nama Z–A"),
                ("cat", "Kategori"),
            ],
        }
    }
    pub fn heading(self) -> &'static str {
        match self {
            CatalogTab::Game => "Semua Game",
            CatalogTab::Software => "Semua Software",
        }
    }
    pub fn search_placeholder(self) -> &'static str {
        match self {
            CatalogTab::Game => "Cari judul game...  (Ctrl+F)",
            CatalogTab::Software => "Cari nama software, kategori, versi...  (Ctrl+F)",
        }
    }
    pub fn add_label(self) -> &'static str {
        match self {
            CatalogTab::Game => "Tambah Game",
            CatalogTab::Software => "Tambah Software",
        }
    }
    pub fn import_label(self) -> &'static str {
        match self {
            CatalogTab::Game => "Steam Link",
            CatalogTab::Software => "Impor dari Situs",
        }
    }
    pub fn empty_sub(self) -> &'static str {
        match self {
            CatalogTab::Game => "Tambahkan game pertama Anda beserta link download dan spesifikasinya.",
            CatalogTab::Software => {
                "Tambahkan software pertama Anda beserta link download-nya — tanpa spesifikasi."
            }
        }
    }
}

/// Satu chip kecil di kartu/panel (mis. genre, ukuran, harga).
#[derive(Debug, Clone)]
pub struct Chip {
    pub text: String,
    /// true untuk chip aksen (harga).
    pub accent: bool,
}

/// Satu baris metadata label/nilai (panel detail software).
#[derive(Debug, Clone)]
pub struct MetaRow {
    pub label: &'static str,
    pub value: String,
}

/// Referensi ringan ke satu entri katalog (game atau software) supaya UI tidak
/// perlu tahu perbedaan tipe sebelum benar-benar membutuhkannya.
#[derive(Debug, Clone, Copy)]
pub enum EntryRef<'a> {
    Game(&'a Game),
    Software(&'a Software),
}

impl<'a> EntryRef<'a> {
    pub fn tab(self) -> CatalogTab {
        match self {
            EntryRef::Game(_) => CatalogTab::Game,
            EntryRef::Software(_) => CatalogTab::Software,
        }
    }
    pub fn id(self) -> &'a str {
        match self {
            EntryRef::Game(g) => &g.id,
            EntryRef::Software(s) => &s.id,
        }
    }
    pub fn title(self) -> &'a str {        match self {
            EntryRef::Game(g) => &g.title,
            EntryRef::Software(s) => &s.title,
        }
    }
    pub fn thumbnail(self) -> &'a str {
        match self {
            EntryRef::Game(g) => &g.thumbnail,
            EntryRef::Software(s) => &s.thumbnail,
        }
    }
    pub fn links(self) -> Vec<LinkMirror> {
        crate::links::links_of_entry(self)
    }
    pub fn website(self) -> &'a str {
        match self {
            EntryRef::Game(_) => "",
            EntryRef::Software(s) => &s.website,
        }
    }
    pub fn created_at(self) -> &'a str {
        match self {
            EntryRef::Game(g) => &g.created_at,
            EntryRef::Software(s) => &s.created_at,
        }
    }
    pub fn specs(self) -> Option<&'a GameSpecs> {
        match self {
            EntryRef::Game(g) => Some(&g.specs),
            EntryRef::Software(_) => None,
        }
    }
    /// Sub-teks di bawah judul kartu.
    pub fn sub(self) -> String {
        match self {
            EntryRef::Game(g) => join_non_empty(&[&g.genre, &g.size]),
            EntryRef::Software(s) => join_non_empty(&[&s.category, &s.version, &s.size]),
        }
    }
    /// Chip kartu/panel detail; chip harga memakai gaya aksen.
    pub fn chips(self) -> Vec<Chip> {
        let mut out = Vec::new();
        match self {
            EntryRef::Game(g) => {
                push_chip(&mut out, &g.genre, false);
                if !g.size.trim().is_empty() {
                    push_chip(&mut out, &format!("Ukuran: {}", g.size), false);
                }
                push_chip(&mut out, &g.price, true);
            }
            EntryRef::Software(s) => {
                push_chip(&mut out, &s.category, false);
                if !s.version.trim().is_empty() {
                    push_chip(&mut out, &format!("Versi {}", s.version), false);
                }
                push_chip(&mut out, &s.license, false);
                push_chip(&mut out, &s.platform, false);
                if !s.size.trim().is_empty() {
                    push_chip(&mut out, &format!("Ukuran: {}", s.size), false);
                }
                push_chip(&mut out, &s.price, true);
            }
        }
        out
    }
    /// Baris metadata panel detail (hanya software).
    pub fn meta_rows(self) -> Vec<MetaRow> {
        match self {
            EntryRef::Game(_) => Vec::new(),
            EntryRef::Software(s) => {
                let mut rows = Vec::new();
                let mut push = |label: &'static str, val: &String| {
                    if !val.trim().is_empty() {
                        rows.push(MetaRow { label, value: val.clone() });
                    }
                };
                push("Kategori", &s.category);
                push("Versi", &s.version);
                push("Lisensi", &s.license);
                push("Platform", &s.platform);
                push("Ukuran File", &s.size);
                rows
            }
        }
    }
    /// Teks untuk pencarian (judul + metadata + semua mirror).
    pub fn haystack(self) -> String {
        let mut parts: Vec<String> = match self {
            EntryRef::Game(g) => vec![g.title.clone(), g.genre.clone()],
            EntryRef::Software(s) => vec![
                s.title.clone(),
                s.category.clone(),
                s.version.clone(),
                s.license.clone(),
                s.platform.clone(),
                s.website.clone(),
            ],
        };
        for l in self.links() {
            parts.push(l.label);
            parts.push(l.url);
        }
        parts.join("\u{1f}").to_lowercase()
    }
}

fn push_chip(out: &mut Vec<Chip>, text: &str, accent: bool) {
    if !text.trim().is_empty() {
        out.push(Chip { text: text.trim().to_string(), accent });
    }
}

fn join_non_empty(parts: &[&String]) -> String {
    parts
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

/// Deskriptor satu field form (dipakai form tambah/edit).
#[derive(Debug, Clone, Copy)]
pub struct FormField {
    pub key: &'static str,
    pub label: &'static str,
    pub placeholder: &'static str,
    pub required: bool,
}

/// Field form game (judul, genre, harga).
pub fn game_form_fields() -> Vec<FormField> {
    vec![
        FormField { key: "title", label: "Judul Game *", placeholder: "mis. Grand Theft Auto V", required: true },
        FormField { key: "genre", label: "Genre", placeholder: "mis. Action, RPG", required: false },
        FormField { key: "price", label: "Harga", placeholder: "mis. Rp 25.000", required: false },
    ]
}

/// Field form software (judul, situs, kategori, versi, lisensi, platform,
/// ukuran, harga).
pub fn software_form_fields() -> Vec<FormField> {
    vec![
        FormField { key: "title", label: "Nama Software *", placeholder: "mis. Adobe Photoshop 2025", required: true },
        FormField { key: "website", label: "Situs Resmi", placeholder: "https://www.adobe.com/products/photoshop.html", required: false },
        FormField { key: "category", label: "Kategori", placeholder: "mis. Desain Grafis", required: false },
        FormField { key: "version", label: "Versi", placeholder: "mis. 26.1 atau LTSC 2021", required: false },
        FormField { key: "license", label: "Lisensi", placeholder: "mis. Trial, Full, Portable, Gratis", required: false },
        FormField { key: "platform", label: "Platform", placeholder: "mis. Windows 10/11", required: false },
        FormField { key: "size", label: "Ukuran File", placeholder: "mis. 4 GB", required: false },
        FormField { key: "price", label: "Harga", placeholder: "mis. Rp 75.000", required: false },
    ]
}

pub fn form_fields(tab: CatalogTab) -> Vec<FormField> {
    match tab {
        CatalogTab::Game => game_form_fields(),
        CatalogTab::Software => software_form_fields(),
    }
}

/// Label & placeholder kolom spesifikasi sistem.
pub const SPEC_FIELDS: &[(&str, &str)] = &[
    ("os", "OS"),
    ("cpu", "Processor"),
    ("ram", "Memory (RAM)"),
    ("gpu", "Graphics (GPU)"),
    ("dx", "DirectX"),
    ("net", "Network"),
    ("storage", "Storage"),
    ("sound", "Sound Card"),
    ("notes", "Additional Notes"),
];

pub const SPEC_PLACEHOLDER: &[(&str, &str)] = &[
    ("os", "mis. Windows 10 64-bit"),
    ("cpu", "mis. Intel Core i5-7500 | AMD Ryzen 5 1400"),
    ("ram", "mis. 8 GB RAM"),
    ("gpu", "mis. NVIDIA GTX 1060 3GB | AMD RX 580 4GB"),
    ("dx", "mis. Version 9.0c"),
    ("net", "mis. Broadband Internet connection"),
    ("storage", "mis. 90 GB available space"),
    ("sound", "mis. DirectX compatible sound card"),
    ("notes", "opsional — catatan tambahan"),
];

pub fn spec_placeholder(key: &str) -> &'static str {
    SPEC_PLACEHOLDER
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, p)| *p)
        .unwrap_or("")
}

/// Payload simpan form (tambah atau edit).
#[derive(Debug, Clone, Default)]
pub struct FormInput {
    pub tab: CatalogTab,
    /// None = tambah entri baru.
    pub editing_id: Option<String>,
    /// (key field, nilai) — key berasal dari FormField.key.
    pub values: Vec<(&'static str, String)>,
    pub links: Vec<LinkMirror>,
    pub specs: GameSpecs,
    pub thumbnail: String,
    /// steamAppId hanya dikomit saat simpan (hasil impor Steam).
    pub steam_app_id: String,
}

/// Hasil impor Steam (prefill form game). Developer & release date ikut dibawa
/// untuk kelengkapan data walau form saat ini tidak menampilkannya.
#[allow(dead_code)]
#[derive(Debug, Clone, Default)]
pub struct SteamImportData {
    pub app_id: String,
    pub title: String,
    pub thumbnail: String,
    pub genre: String,
    pub developer: String,
    pub release_date: String,
    pub price: String,
    pub specs: GameSpecs,
}

/// Hasil impor dari situs resmi (prefill form software).
#[derive(Debug, Clone, Default)]
pub struct SoftwareImportData {
    pub title: String,
    pub thumbnail: String,
    pub category: String,
    pub version: String,
    pub license: String,
    pub platform: String,
    pub website: String,
}

/// UUID v4 untuk entri baru.
pub fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

impl Default for CatalogTab {
    fn default() -> Self {
        CatalogTab::Game
    }
}

/// Timestamp RFC3339 dengan milidetik (bentuk sama seperti toISOString() lama
/// supaya urutan leksikografis createdAt tetap berarti).
pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
