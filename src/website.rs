// ---------------------------------------------------------------------------
// Impor software dari situs vendor (port dari electron/lib/website.js).
//
// Halaman produk tidak punya API seragam seperti Steam, jadi yang dibaca
// adalah metadata publik yang hampir selalu ada: Open Graph / meta tag. Semua
// nilai hanya prefill form; user tetap memeriksa sebelum menyimpan. Semua
// kegagalan ditelan (None) supaya impor tidak pernah menggagalkan UI.
// ---------------------------------------------------------------------------

use std::collections::HashMap;
use std::io::Read;
use std::time::Duration;

use regex::Regex;

use crate::model::SoftwareImportData;
use crate::text::truncate_utf8;

// Batas & konstanta (sama dengan versi JS).
const MAX_PAGE_BYTES: u64 = 4 << 20; // 4 MiB
const MAX_THUMBNAIL_BYTES: u64 = 25 << 20; // 25 MiB
const MAX_LEN_TITLE: usize = 200;
const MAX_LEN_VERSION: usize = 60;
const MAX_LEN_REF: usize = 2000;
const MAX_REDIRECTS: usize = 5;
const API_TIMEOUT_SECS: u64 = 15;
const IMAGE_TIMEOUT_SECS: u64 = 45;
const IMPORT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SoftGameLibrary/1.0";
const THUMB_REF_PREFIX: &str = "/thumbnails/";

/// Whitelist ekstensi thumbnail (sama dengan paths.js).
const ALLOWED_THUMB_EXT: [&str; 8] = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico"];

/// Content-Type gambar -> ekstensi whitelist. Nama file tidak boleh berbohong
/// soal isinya: Content-Type yang dikenal selalu menang atas tebakan URL.
const CONTENT_EXT_THUMB: [(&str, &str); 9] = [
    ("image/png", ".png"),
    ("image/jpeg", ".jpg"),
    ("image/jpg", ".jpg"),
    ("image/webp", ".webp"),
    ("image/gif", ".gif"),
    ("image/svg+xml", ".svg"),
    ("image/bmp", ".bmp"),
    ("image/x-icon", ".ico"),
    ("image/vnd.microsoft.icon", ".ico"),
];

// ---------------------------------------------------------------------------
// Utilitas kecil
// ---------------------------------------------------------------------------

/// Entity HTML yang dikenal (subset yang dipakai halaman vendor).
fn named_entity(body: &str) -> Option<&'static str> {
    Some(match body {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "nbsp" => "\u{00a0}",
        "copy" => "\u{00a9}",
        "reg" => "\u{00ae}",
        "trade" => "\u{2122}",
        "hellip" => "\u{2026}",
        "mdash" => "\u{2014}",
        "ndash" => "\u{2013}",
        "laquo" => "\u{00ab}",
        "raquo" => "\u{00bb}",
        "ldquo" => "\u{201c}",
        "rdquo" => "\u{201d}",
        "lsquo" => "\u{2018}",
        "rsquo" => "\u{2019}",
        "deg" => "\u{00b0}",
        "times" => "\u{00d7}",
        "divide" => "\u{00f7}",
        "euro" => "\u{20ac}",
        "pound" => "\u{00a3}",
        "yen" => "\u{00a5}",
        "cent" => "\u{00a2}",
        _ => return None,
    })
}

/// Decode entity HTML: named + numerik (&#nnn; / &#xhh;). Entity tak dikenal
/// dibiarkan apa adanya (sama seperti JS).
fn unescape_html(s: &str) -> String {
    let re = match Regex::new(r"&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);") {
        Ok(r) => r,
        Err(_) => return s.to_string(),
    };
    re.replace_all(s, |caps: &regex::Captures<'_>| {
        let whole = caps.get(0).map(|m| m.as_str()).unwrap_or("");
        let body = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        if let Some(rest) = body.strip_prefix('#') {
            let hex = rest.starts_with('x') || rest.starts_with('X');
            let digits = if hex { &rest[1..] } else { rest };
            return match u32::from_str_radix(digits, if hex { 16 } else { 10 }) {
                Ok(code) if code <= 0x10FFFF => match char::from_u32(code) {
                    Some(ch) => ch.to_string(),
                    None => whole.to_string(),
                },
                _ => whole.to_string(),
            };
        }
        match named_entity(body) {
            Some(v) => v.to_string(),
            None => whole.to_string(),
        }
    })
    .into_owned()
}

/// Nilai string pertama yang tidak kosong.
fn first_non_empty(values: &[&str]) -> String {
    for v in values {
        if !v.trim().is_empty() {
            return (*v).to_string();
        }
    }
    String::new()
}

/// Hasil pertama regex yang punya grup 1; "" kalau tidak cocok.
fn first_match(re: &Regex, s: &str) -> String {
    match re.captures(s) {
        Some(caps) if caps.len() >= 2 => caps.get(1).map(|m| m.as_str()).unwrap_or("").to_string(),
        _ => String::new(),
    }
}

/// Client blocking dengan user agent impor + maksimal MAX_REDIRECTS redirect.
fn http_client() -> Option<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent(IMPORT_USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .build()
        .ok()
}

/// Baca body maksimal max_bytes byte (padanan readLimited / io.LimitReader).
fn read_limited(res: reqwest::blocking::Response, max_bytes: u64) -> std::io::Result<Vec<u8>> {
    let mut buf: Vec<u8> = Vec::new();
    let mut limited = Read::take(res, max_bytes);
    limited.read_to_end(&mut buf)?;
    Ok(buf)
}

// ---------------------------------------------------------------------------
// Aturan tebakan (urutan penting: aturan pertama yang cocok menang)
// ---------------------------------------------------------------------------

/// Satu aturan: daftar needle (kata utuh, case-insensitive) -> nilai.
struct Rule {
    res: Vec<Regex>,
    value: &'static str,
}

/// Karakter yang dianggap word char oleh \b (\p{L} / \p{Nd}).
fn is_word_char(c: char) -> bool {
    c.is_alphabetic() || c.is_numeric()
}

/// wordPattern: bungkus needle dengan \b hanya di sisi yang berupa word char,
/// supaya needle seperti "100% free" tetap bisa dicocokkan.
fn word_pattern(needle: &str) -> String {
    let chars: Vec<char> = needle.chars().collect();
    let prefix = if chars.first().map_or(false, |c| is_word_char(*c)) {
        "\\b"
    } else {
        ""
    };
    let suffix = if chars.last().map_or(false, |c| is_word_char(*c)) {
        "\\b"
    } else {
        ""
    };
    format!("{}{}{}", prefix, regex::escape(needle), suffix)
}

/// buildRules: ubah daftar needle -> regex kata utuh per aturan.
fn build_rules(inputs: &[(&[&str], &'static str)]) -> Vec<Rule> {
    inputs
        .iter()
        .map(|(needles, value)| Rule {
            res: needles
                .iter()
                .filter_map(|n| Regex::new(&format!("(?i){}", word_pattern(n))).ok())
                .collect(),
            value: *value,
        })
        .collect()
}

/// matchAny: nilai aturan pertama yang cocok; "" kalau tidak ada.
fn match_any(rules: &[Rule], hay: &str) -> String {
    for rule in rules {
        for re in &rule.res {
            if re.is_match(hay) {
                return rule.value.to_string();
            }
        }
    }
    String::new()
}

fn category_rules() -> Vec<Rule> {
    build_rules(&[
        (&["photo editor", "photoshop", "illustrator", "graphic design", "coreldraw", "figma", "canva", "design software"], "Desain Grafis"),
        (&["video editor", "video editing", "premiere", "after effects", "capcut", "davinci resolve", "filmora", "obs studio"], "Editing Video"),
        (&["audio editor", "music production", "fl studio", "ableton", "audacity"], "Audio & Musik"),
        (&["office suite", "word processor", "spreadsheet", "libreoffice", "microsoft office", "pdf editor"], "Produktivitas & Perkantoran"),
        (&["antivirus", "internet security", "cleaner", "optimizer", "defender", "malware"], "Keamanan"),
        (&["download manager", "archiver", "7-zip", "winrar", "file manager", "uninstaller"], "Utilitas"),
        (&["code editor", "ide", "visual studio", "vscode", "intellij", "programming"], "Pemrograman"),
        (&["3d modeling", "blender", "autocad", "sketchup", "solidworks", "cad"], "3D & CAD"),
        (&["browser", "media player", "vlc", "vpn", "remote desktop", "teamviewer", "anydesk"], "Internet & Jaringan"),
        (&["game engine", "unity", "unreal engine", "godot"], "Game Development"),
        (&["driver", "firmware", "hardware monitor"], "Driver & Hardware"),
        (&["accounting", "kasir", "point of sale", "pos"], "Bisnis & Keuangan"),
    ])
}

fn license_rules() -> Vec<Rule> {
    build_rules(&[
        (&["open source", "free and open"], "Open Source"),
        (&["free download", "download free", "100% free", "gratis"], "Gratis"),
        (&["free trial", "trial version", "30-day trial", "coba gratis"], "Trial"),
        (&["freemium", "free version"], "Freemium"),
        (&["buy now", "pricing", "subscription", "license key", "berbayar"], "Berbayar"),
    ])
}

/// guessPlatform: daftar platform yang disebut, tanpa duplikat.
fn guess_platform(hay: &str) -> String {
    let rules: [(&str, &str); 5] = [
        (r"\bwindows\b", "Windows"),
        (r"\bmac ?os\b", "macOS"),
        (r"\blinux\b", "Linux"),
        (r"\bandroid\b", "Android"),
        (r"\bios\b", "iOS"),
    ];
    let mut found: Vec<&str> = Vec::new();
    for (pattern, platform) in rules {
        let re = match Regex::new(&format!("(?i){}", pattern)) {
            Ok(r) => r,
            Err(_) => continue,
        };
        if re.is_match(hay) && !found.contains(&platform) {
            found.push(platform);
        }
    }
    found.join(", ")
}

// ---------------------------------------------------------------------------
// API: import_software
// ---------------------------------------------------------------------------

/// Baca halaman resmi urlStr dan kembalikan prefill form tambah software.
/// None bila halaman tidak bisa dibaca.
pub fn import_software(url: &str) -> Option<SoftwareImportData> {
    let endpoint = normalize_page_url(url)?;

    let client = http_client()?;
    let res = client
        .get(&endpoint)
        .header("Accept", "text/html,application/xhtml+xml")
        .timeout(Duration::from_secs(API_TIMEOUT_SECS))
        .send()
        .ok()?;
    let status = res.status().as_u16();
    // 401/403 = situs menolak permintaan otomatis.
    if status == 401 || status == 403 || status != 200 {
        return None;
    }

    let body = read_limited(res, MAX_PAGE_BYTES).ok()?;
    // Padanan Buffer.toString('utf8'): byte tak valid jadi replacement char.
    let page = String::from_utf8_lossy(&body).into_owned();

    let metas = parse_meta_tags(&page);
    let title = first_non_empty(&[
        metas.get("og:title").map(|s| s.as_str()).unwrap_or(""),
        metas.get("twitter:title").map(|s| s.as_str()).unwrap_or(""),
        &clean_title(&first_match(&title_tag_re(), &page)),
    ]);
    let summary = first_non_empty(&[
        metas.get("og:description").map(|s| s.as_str()).unwrap_or(""),
        metas.get("twitter:description").map(|s| s.as_str()).unwrap_or(""),
        metas.get("description").map(|s| s.as_str()).unwrap_or(""),
    ]);
    let site_name = first_non_empty(&[
        metas.get("og:site_name").map(|s| s.as_str()).unwrap_or(""),
        metas.get("application-name").map(|s| s.as_str()).unwrap_or(""),
        metas.get("author").map(|s| s.as_str()).unwrap_or(""),
    ]);
    let keywords = metas.get("keywords").map(|s| s.as_str()).unwrap_or("");
    let hay = [title.as_str(), summary.as_str(), site_name.as_str(), keywords]
        .join(" ")
        .to_lowercase();

    let mut result = SoftwareImportData {
        title: truncate_utf8(&clean_title(&title), MAX_LEN_TITLE),
        thumbnail: String::new(),
        category: match_any(&category_rules(), &hay),
        version: truncate_utf8(&guess_version(&page, &title, &summary), MAX_LEN_VERSION),
        license: match_any(&license_rules(), &hay),
        platform: guess_platform(&hay),
        website: truncate_utf8(&endpoint, MAX_LEN_REF),
    };

    let img = first_non_empty(&[
        metas.get("og:image").map(|s| s.as_str()).unwrap_or(""),
        metas.get("twitter:image").map(|s| s.as_str()).unwrap_or(""),
    ]);
    if !img.is_empty() {
        result.thumbnail = download_thumb(&img);
    }

    if result.title.is_empty() && result.thumbnail.is_empty() && result.category.is_empty() {
        return None;
    }
    Some(result)
}

/// normalizePageURL: pastikan URL benar-benar http/https tanpa kredensial.
fn normalize_page_url(raw: &str) -> Option<String> {
    let mut trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        return None;
    }
    if !trimmed.contains("://") {
        trimmed = format!("https://{}", trimmed);
    }
    let u = reqwest::Url::parse(&trimmed).ok()?;
    if u.scheme() != "http" && u.scheme() != "https" {
        return None;
    }
    if u.host_str().unwrap_or("").is_empty() {
        return None;
    }
    if !u.username().is_empty() || !u.password().unwrap_or("").is_empty() {
        return None;
    }
    Some(u.to_string())
}

// ---------------------------------------------------------------------------
// Parsing halaman
// ---------------------------------------------------------------------------

fn meta_tag_re() -> Option<Regex> {
    Regex::new(r"(?is)<meta\b[^>]*>").ok()
}

fn title_tag_re() -> Regex {
    Regex::new(r"(?is)<title[^>]*>([\s\S]*?)</title>")
        .unwrap_or_else(|_| Regex::new(r"$^").unwrap())
}

fn tag_re() -> Regex {
    Regex::new(r"<[^>]+>").unwrap_or_else(|_| Regex::new(r"$^").unwrap())
}

fn space_re() -> Regex {
    Regex::new(r"\s+").unwrap_or_else(|_| Regex::new(r"$^").unwrap())
}

fn script_style_re() -> Option<Regex> {
    Regex::new(r"(?is)<(?:script|style)[^>]*>[\s\S]*?</(?:script|style)>").ok()
}

fn attr_re() -> Option<Regex> {
    // (property|name|content) = "..." | '...' | tak-berkutip
    Regex::new(r#"(?is)(property|name|content)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))"#).ok()
}

fn version_re() -> Option<Regex> {
    Regex::new(r"(?i)\b(?:version|versie|versi|ver\.?|v)\s*[:=]?\s*(\d+(?:\.\d+){1,3})").ok()
}

fn version_word_re() -> Option<Regex> {
    Regex::new(r"^\d+(\.\d+)+$").ok()
}

/// parseMetaTags: kumpulkan <meta property|name -> content>. Key lower-case.
fn parse_meta_tags(page: &str) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    let meta_re = match meta_tag_re() {
        Some(r) => r,
        None => return out,
    };
    let attr_re = match attr_re() {
        Some(r) => r,
        None => return out,
    };
    for tag in meta_re.find_iter(page) {
        let tag = tag.as_str();
        let mut name = String::new();
        let mut content = String::new();
        for caps in attr_re.captures_iter(tag) {
            let key = caps.get(1).map(|m| m.as_str()).unwrap_or("").to_lowercase();
            let val = first_non_empty(&[
                caps.get(3).map(|m| m.as_str()).unwrap_or(""),
                caps.get(4).map(|m| m.as_str()).unwrap_or(""),
                caps.get(5).map(|m| m.as_str()).unwrap_or(""),
            ]);
            if key == "property" || key == "name" {
                name = val.trim().to_lowercase();
            } else if key == "content" {
                content = val;
            }
        }
        if !name.is_empty() && !content.trim().is_empty() {
            out.insert(name, unescape_html(&content));
        }
    }
    out
}

/// cleanTitle: buang tag + entity, potong imbuhan situs ("Nama | Vendor"),
/// lalu rapikan whitespace. Tanda hubung sengaja tidak dipotong.
fn clean_title(s: &str) -> String {
    let mut out = unescape_html(s);
    out = tag_re().replace_all(&out, " ").into_owned();
    let parts: Vec<&str> = out.split('|').collect();
    if parts.len() > 1 {
        out = parts[0].to_string();
    }
    space_re().replace_all(&out, " ").trim().to_string()
}

/// cleanText: reduksi HTML jadi teks berbaris untuk pencocokan.
fn clean_text(s: &str) -> String {
    let mut out = match script_style_re() {
        Some(re) => re.replace_all(s, " ").into_owned(),
        None => s.to_string(),
    };
    out = tag_re().replace_all(&out, "\n").into_owned();
    let out = unescape_html(&out);
    let lines: Vec<String> = out
        .split('\n')
        .map(|line| space_re().replace_all(line, " ").trim().to_string())
        .collect();
    lines.join("\n")
}

/// guessVersion: cari nomor versi eksplisit di halaman/deskripsi, lalu jatuh
/// ke angka bergaya versi yang menempel di judul.
fn guess_version(page: &str, title: &str, summary: &str) -> String {
    let re = match version_re() {
        Some(r) => r,
        None => return String::new(),
    };
    let cleaned = clean_text(page);
    for src in [cleaned.as_str(), summary] {
        let m = first_match(&re, src);
        if !m.is_empty() {
            return m;
        }
    }
    if let Some(word_re) = version_word_re() {
        for word in title.split_whitespace() {
            if word_re.is_match(word) {
                return word.to_string();
            }
        }
    }
    String::new()
}

// ---------------------------------------------------------------------------
// Unduh thumbnail
// ---------------------------------------------------------------------------

/// downloadThumb: kegagalan mengambil gambar tidak boleh menggagalkan impor,
/// jadi error ditelan di sini.
fn download_thumb(img_url: &str) -> String {
    match save_thumb_from_url(img_url) {
        Some(r) => r,
        None => String::new(),
    }
}

/// Tujuan unduhan: nama file aman di folder thumbnails + URL normal.
struct ThumbTarget {
    name: String,
    url: String,
    ext: String,
}

/// saveThumbFromURL: simpan gambar dari URL ke folder thumbnails. None bila
/// URL/gambar tidak valid atau unduhan gagal.
fn save_thumb_from_url(img_url: &str) -> Option<String> {
    let target = thumb_target(img_url)?;
    let mut name = target.name;
    let mut ext = target.ext;

    let client = http_client()?;
    let res = client
        .get(&target.url)
        .timeout(Duration::from_secs(IMAGE_TIMEOUT_SECS))
        .send()
        .ok()?;
    if res.status().as_u16() != 200 {
        return None;
    }

    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .map(|v| v.to_str().unwrap_or(""))
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    // Nama file tidak boleh berbohong soal isinya: ekstensi dari Content-Type
    // yang dikenal selalu menang atas tebakan dari URL.
    if let Some(known) = content_ext_for(&content_type) {
        ext = known.to_string();
    }
    if ext.is_empty() || !content_type.starts_with("image/") {
        return None;
    }

    if let Some(cl) = res.headers().get(reqwest::header::CONTENT_LENGTH) {
        if let Ok(n) = cl.to_str().unwrap_or("").trim().parse::<u64>() {
            if n > MAX_THUMBNAIL_BYTES {
                return None;
            }
        }
    }

    // Ekstensi hasil negosiasi mungkin beda dari tebakan URL -> ganti nama.
    if ext_of_name(&name) != ext {
        name = format!("{}{}", stem_of_name(&name), ext);
    }

    // Dibaca cap+1 supaya kelebihan ukuran terdeteksi.
    let buf = match read_limited(res, MAX_THUMBNAIL_BYTES + 1) {
        Ok(b) => b,
        Err(_) => return None,
    };
    if buf.is_empty() || buf.len() as u64 > MAX_THUMBNAIL_BYTES {
        return None;
    }

    if crate::thumbs::write_thumb_bytes(&name, &buf).is_err() {
        return None;
    }
    Some(format!("{}{}", THUMB_REF_PREFIX, name))
}

/// thumbTarget: validasi URL gambar (skema, host, ekstensi) lalu tentukan
/// nama file aman "web-<safe-host-32>-<hex><ext>".
fn thumb_target(img_url: &str) -> Option<ThumbTarget> {
    let u = reqwest::Url::parse(img_url.trim()).ok()?;
    if u.scheme() != "http" && u.scheme() != "https" {
        return None;
    }
    let host_raw = u.host_str().unwrap_or("");
    if host_raw.is_empty() || !u.username().is_empty() || !u.password().unwrap_or("").is_empty() {
        return None;
    }
    let host = host_raw.to_lowercase();
    if !host.contains('.') {
        return None;
    }

    let mut ext = url_ext(u.path());
    if !is_allowed_thumb_ext(&ext) {
        ext = String::new(); // biarkan ditentukan dari Content-Type
    }

    // Nama file hanya boleh karakter aman agar selalu lolos safeThumbPath:
    // karakter di luar [a-z0-9] jadi '-', dipotong 32 karakter.
    let safe_host: String = host
        .chars()
        .take(32)
        .map(|c| if c.is_ascii_lowercase() || c.is_ascii_digit() { c } else { '-' })
        .collect();

    let name = format!("web-{}-{}", safe_host, crate::thumbs::new_thumb_name(&ext));
    Some(ThumbTarget { name, url: u.to_string(), ext })
}

/// Content-Type dikenal -> ekstensi whitelist.
fn content_ext_for(content_type: &str) -> Option<&'static str> {
    CONTENT_EXT_THUMB
        .iter()
        .find(|(ct, _)| *ct == content_type)
        .map(|(_, ext)| *ext)
}

/// Ekstensi dari path URL (padanan path.extname), "" kalau tidak ada.
fn url_ext(path: &str) -> String {
    let file = path.rsplit('/').next().unwrap_or("");
    match file.rfind('.') {
        Some(i) if i > 0 => file[i..].to_lowercase(),
        _ => String::new(),
    }
}

/// Ekstensi sebuah nama file (dengan titik), "" kalau tidak ada.
fn ext_of_name(name: &str) -> String {
    match name.rfind('.') {
        Some(i) if i > 0 => name[i..].to_lowercase(),
        _ => String::new(),
    }
}

/// Nama file tanpa ekstensi terakhir.
fn stem_of_name(name: &str) -> String {
    match name.rfind('.') {
        Some(i) if i > 0 => name[..i].to_string(),
        _ => name.to_string(),
    }
}

/// Ekstensi termasuk whitelist thumbnail?
fn is_allowed_thumb_ext(ext: &str) -> bool {
    ALLOWED_THUMB_EXT.contains(&ext)
}
