// ---------------------------------------------------------------------------
// Impor Steam (port dari electron/lib/steam.js).
//
// Pencarian + impor detail game dari Steam Store API. Semua kegagalan
// jaringan/parse ditelan dan dikembalikan sebagai nilai kosong ([] / None / "")
// supaya impor tidak pernah menggagalkan UI. HTTP memakai reqwest blocking
// karena modal impor menjalankan fungsi ini di thread terpisah.
// ---------------------------------------------------------------------------

use std::collections::HashMap;
use std::io::Read;
use std::time::Duration;

use regex::Regex;
use serde_json::Value;

use crate::model::{GameSpecs, SteamImportData, SystemSpecs};
use crate::text::truncate_utf8;

// Batas & konstanta (sama dengan versi JS).
const MAX_STEAM_RESPONSE_BYTES: u64 = 8 << 20; // 8 MiB, jauh di atas appdetails
const MAX_STEAM_SEARCH_RESULTS: usize = 25;
const MAX_THUMBNAIL_BYTES: u64 = 25 << 20; // 25 MiB
const MAX_LEN_TITLE: usize = 200;
const MAX_LEN_SPEC: usize = 400;
const MAX_REDIRECTS: usize = 5;
const STEAM_API_TIMEOUT_SECS: u64 = 15;
const STEAM_IMAGE_TIMEOUT_SECS: u64 = 45;
const STEAM_STORE_REGION: &str = "id";
const IMPORT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SoftGameLibrary/1.0";
const THUMB_REF_PREFIX: &str = "/thumbnails/";

// Host gambar Steam yang dipercaya (beserta subdomainnya).
const STEAM_IMAGE_HOST_SUFFIXES: [&str; 3] =
    ["steampowered.com", "steamstatic.com", "steamcommunity.com"];

// Whitelist ekstensi thumbnail (sama dengan paths.js).
const ALLOWED_THUMB_EXT: [&str; 8] = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico"];

/// Satu baris hasil pencarian Steam.
#[allow(dead_code)]
pub struct SteamSearchItem {
    pub app_id: String,
    pub title: String,
    /// URL gambar jarak jauh (UI hanya menampilkan baris teks).
    pub thumbnail: String,
    pub price: String,
}

// ---------------------------------------------------------------------------
// Utilitas kecil
// ---------------------------------------------------------------------------

/// Entity HTML yang dikenal (subset yang dipakai Steam).
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

/// htmlToText: <br> jadi spasi, buang tag, baru decode entity (agar
/// "&lt;Fast&gt;" tidak ikut terbuang sebagai tag), rapikan whitespace,
/// potong 400 byte.
fn html_to_text(s: &str) -> String {
    let br = match Regex::new(r"(?i)<br\s*/?>") {
        Ok(r) => r,
        Err(_) => return truncate_utf8(s.trim(), MAX_LEN_SPEC),
    };
    let tag = match Regex::new(r"<[^>]+>") {
        Ok(r) => r,
        Err(_) => return truncate_utf8(s.trim(), MAX_LEN_SPEC),
    };
    let spc = match Regex::new(r"\s+") {
        Ok(r) => r,
        Err(_) => return truncate_utf8(s.trim(), MAX_LEN_SPEC),
    };
    let out = br.replace_all(s, " ");
    let out = tag.replace_all(&out, "");
    let out = unescape_html(&out);
    let out = spc.replace_all(&out, " ");
    truncate_utf8(out.trim(), MAX_LEN_SPEC)
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

/// Percent-encode gaya URLSearchParams (spasi jadi '+').
fn form_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*'
            | b'\'' | b'(' | b')' => out.push(b as char),
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Susun query string dari pasangan (k, v).
fn form_params(params: &[(&str, &str)]) -> String {
    params
        .iter()
        .map(|(k, v)| format!("{}={}", form_encode(k), form_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Nilai string dari Value: string langsung, angka distringkan (padanan
/// String(x) di JS), selain itu kosong.
fn value_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

// ---------------------------------------------------------------------------
// Pencarian Steam
// ---------------------------------------------------------------------------

/// Cari game di katalog Steam Store berdasarkan kata kunci. Hasil kosong
/// menandakan tidak ditemukan / gagal (tidak pernah panic).
pub fn steam_search(term: &str) -> Vec<SteamSearchItem> {
    let query = term.trim();
    if query.is_empty() {
        return Vec::new();
    }
    if query.chars().count() > 120 {
        return Vec::new();
    }

    let api_url = format!(
        "https://store.steampowered.com/api/storesearch/?{}",
        form_params(&[("term", query), ("l", "english"), ("cc", STEAM_STORE_REGION)])
    );

    let client = match http_client() {
        Some(c) => c,
        None => return Vec::new(),
    };
    let res = match client
        .get(&api_url)
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(STEAM_API_TIMEOUT_SECS))
        .send()
    {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    if res.status().as_u16() != 200 {
        return Vec::new();
    }
    let body = match read_limited(res, MAX_STEAM_RESPONSE_BYTES) {
        Ok(b) => b,
        Err(_) => return Vec::new(),
    };
    let payload: Value = match serde_json::from_str(&String::from_utf8_lossy(&body)) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut out: Vec<SteamSearchItem> = Vec::new();
    let items = match payload.get("items") {
        Some(Value::Array(a)) => a,
        _ => return Vec::new(),
    };
    for it in items {
        // Hanya "app" yang bisa dibuka appdetails - skip bundle/package/dlc.
        match it.get("type") {
            Some(Value::Null) | None => {}
            Some(t) => {
                if value_str(t) != "app" {
                    continue;
                }
            }
        }
        let id = value_str(&it["id"]);
        let name = it["name"].as_str().unwrap_or("").trim().to_string();
        if id.is_empty() || id == "0" || name.is_empty() {
            continue;
        }
        let price = it["price"]["final_formatted"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();
        out.push(SteamSearchItem {
            app_id: id,
            title: truncate_utf8(&name, MAX_LEN_TITLE),
            thumbnail: it["tiny_image"].as_str().unwrap_or("").to_string(),
            price,
        });
        if out.len() >= MAX_STEAM_SEARCH_RESULTS {
            break;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Impor detail Steam
// ---------------------------------------------------------------------------

/// Ambil detail satu game dari link store Steam. None bila link tidak
/// dikenali atau data tidak bisa diambil.
pub fn steam_import(url: &str) -> Option<SteamImportData> {
    let re = match Regex::new(r"(?i)(?:store\.steampowered\.com|steampowered\.com)/app/(\d+)") {
        Ok(r) => r,
        Err(_) => return None,
    };
    let caps = match re.captures(url) {
        Some(c) => c,
        None => return None,
    };
    let app_id = caps.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
    if app_id.is_empty() {
        return None;
    }

    let detail = match fetch_steam_details(&app_id) {
        Some(d) => d,
        None => return None,
    };

    // Payload membawa steam_appid sendiri; kalau ada, itulah id yang benar
    // (bisa berbeda dari appid di link karena redirect / link lama).
    let sid = value_str(&detail["steam_appid"]);
    let resolved_id = if !sid.is_empty() && sid != "0" { sid } else { app_id };

    // pc_requirements bisa berupa object atau array kosong [] (sering terjadi).
    let mut min_specs = SystemSpecs::default();
    let mut rec_specs = SystemSpecs::default();
    if let Some(req) = detail.get("pc_requirements") {
        if req.is_object() {
            if let Some(m) = req.get("minimum").and_then(|v| v.as_str()) {
                min_specs = parse_sys_req(m);
            }
            if let Some(r) = req.get("recommended").and_then(|v| v.as_str()) {
                rec_specs = parse_sys_req(r);
            }
        }
    }

    let genre = match detail.get("genres") {
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|g| g.get("description").and_then(|d| d.as_str()))
            .filter(|d| !d.is_empty())
            .collect::<Vec<_>>()
            .join(", "),
        _ => String::new(),
    };
    let developer = match detail.get("developers") {
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|d| d.as_str())
            .collect::<Vec<_>>()
            .join(", "),
        _ => String::new(),
    };

    let mut result = SteamImportData {
        app_id: resolved_id.clone(),
        title: detail["name"].as_str().unwrap_or("").to_string(),
        thumbnail: String::new(),
        genre,
        developer,
        release_date: value_str(&detail["release_date"]["date"]),
        price: value_str(&detail["price_overview"]["final_formatted"]),
        specs: GameSpecs { min: min_specs, rec: rec_specs },
    };

    let header = detail["header_image"].as_str().unwrap_or("");
    if !header.is_empty() {
        result.thumbnail = download_steam_image(&resolved_id, header);
    }
    Some(result)
}

/// fetchSteamDetails: ambil detail dengan region store; kalau region itu tidak
/// punya harga, dicoba sekali lagi tanpa cc agar impor tetap selengkap mungkin.
fn fetch_steam_details(app_id: &str) -> Option<Value> {
    let first = request_steam_details(app_id, STEAM_STORE_REGION);
    let first_has_price = first
        .as_ref()
        .map(|d| !value_str(&d["price_overview"]["final_formatted"]).is_empty())
        .unwrap_or(false);
    if first.is_some() && first_has_price {
        return first;
    }

    let fallback = request_steam_details(app_id, "");
    match fallback {
        None => first,
        Some(f) => {
            let fallback_price = value_str(&f["price_overview"]["final_formatted"]);
            if first.is_some() && fallback_price.is_empty() {
                first // hasil pertama lebih lengkap (punya harga region)
            } else {
                Some(f)
            }
        }
    }
}

/// requestSteamDetails: satu panggil appdetails untuk satu appid & satu
/// region ('' berarti region default Steam).
fn request_steam_details(app_id: &str, region: &str) -> Option<Value> {
    let mut params: Vec<(&str, &str)> = vec![("appids", app_id), ("l", "english")];
    if !region.is_empty() {
        params.push(("cc", region));
    }
    let api_url = format!(
        "https://store.steampowered.com/api/appdetails?{}",
        form_params(&params)
    );

    let client = http_client()?;
    let res = client
        .get(&api_url)
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(STEAM_API_TIMEOUT_SECS))
        .send()
        .ok()?;
    if res.status().as_u16() != 200 {
        return None;
    }
    let body = read_limited(res, MAX_STEAM_RESPONSE_BYTES).ok()?;
    let root: Value = match serde_json::from_str(&String::from_utf8_lossy(&body)) {
        Ok(v) => v,
        Err(_) => return None,
    };
    if !root.is_object() {
        return None;
    }

    // Steam kadang menjawab dengan key = id internal, bukan appid yang diminta.
    let entry = match root.get(app_id) {
        Some(e) if !e.is_null() => e,
        _ => match single_steam_entry(&root) {
            Some(e) => e,
            None => return None,
        },
    };
    if !entry["success"].as_bool().unwrap_or(false) {
        return None;
    }
    let data = &entry["data"];
    if data.is_null() {
        return None;
    }
    Some(data.clone())
}

/// singleSteamEntry: ambil satu-satunya entri apa pun key-nya; lebih dari satu
/// entri tidak ditebak.
fn single_steam_entry(root: &Value) -> Option<&Value> {
    let map = root.as_object()?;
    if map.len() != 1 {
        return None;
    }
    map.values().next()
}

// ---------------------------------------------------------------------------
// Parsing spesifikasi sistem
// ---------------------------------------------------------------------------

/// Peta label system requirement Steam -> field SystemSpecs.
fn steam_label(key: &str) -> Option<&'static str> {
    Some(match key {
        "os" => "os",
        "processor" => "cpu",
        "memory" => "ram",
        "graphics" => "gpu",
        "directx" => "dx",
        "storage" => "storage",
        "network" => "net",
        "sound card" => "sound",
        "additional notes" => "notes",
        _ => return None,
    })
}

/// Parsing HTML system requirement Steam jadi SystemSpecs.
fn parse_sys_req(raw_html: &str) -> SystemSpecs {
    let mut dict: HashMap<String, String> = HashMap::new();
    // Prioritas format <li>, lalu <h4> untuk label yang masih kosong.
    if let Ok(re) = Regex::new(
        r"(?i)<li[^>]*>\s*<strong[^>]*>\s*([^:<>]+?)\s*:?\s*</strong>([\s\S]*?)</li>",
    ) {
        fill_sys_req(&re, raw_html, &mut dict);
    }
    if let Ok(re) = Regex::new(
        r"(?i)<h4[^>]*>\s*<strong[^>]*>\s*([^:<>]+?)\s*:?\s*</strong>([\s\S]*?)</h4>",
    ) {
        fill_sys_req(&re, raw_html, &mut dict);
    }

    let get = |k: &str| dict.get(k).cloned().unwrap_or_default();
    SystemSpecs {
        os: get("os"),
        cpu: get("cpu"),
        ram: get("ram"),
        gpu: get("gpu"),
        dx: get("dx"),
        net: get("net"),
        storage: get("storage"),
        sound: get("sound"),
        notes: get("notes"),
    }
}

/// Isi dict dari satu regex; label tak dikenal / sudah terisi dilewati.
fn fill_sys_req(re: &Regex, raw_html: &str, dict: &mut HashMap<String, String>) {
    for caps in re.captures_iter(raw_html) {
        let label = caps.get(1).map(|m| m.as_str()).unwrap_or("").trim();
        let key = label
            .trim_end_matches(|c| c == '*' || c == ' ' || c == ':')
            .to_lowercase();
        let target = match steam_label(&key) {
            Some(t) => t,
            None => continue, // label tak dikenal
        };
        if dict.contains_key(target) {
            continue; // sudah terisi
        }
        let text = html_to_text(caps.get(2).map(|m| m.as_str()).unwrap_or(""));
        if !text.is_empty() {
            dict.insert(target.to_string(), text);
        }
    }
}

// ---------------------------------------------------------------------------
// Unduh gambar header Steam
// ---------------------------------------------------------------------------

/// Simpan gambar header ke folder thumbnails. "" dikembalikan bila gambar
/// tidak bisa diambil - impor tetap lanjut.
fn download_steam_image(app_id: &str, img_url: &str) -> String {
    let dest_name = match steam_image_dest(app_id, img_url) {
        Some(n) => n,
        None => return String::new(),
    };

    let client = match http_client() {
        Some(c) => c,
        None => return String::new(),
    };
    let res = match client
        .get(img_url)
        .timeout(Duration::from_secs(STEAM_IMAGE_TIMEOUT_SECS))
        .send()
    {
        Ok(r) => r,
        Err(_) => return String::new(),
    };
    if res.status().as_u16() != 200 {
        return String::new();
    }
    if let Some(ct) = res.headers().get(reqwest::header::CONTENT_TYPE) {
        let ct = ct.to_str().unwrap_or("").to_lowercase();
        if !ct.is_empty() && !ct.starts_with("image/") {
            return String::new();
        }
    }
    if let Some(cl) = res.headers().get(reqwest::header::CONTENT_LENGTH) {
        if let Ok(n) = cl.to_str().unwrap_or("").trim().parse::<u64>() {
            if n > MAX_THUMBNAIL_BYTES {
                return String::new();
            }
        }
    }

    // Dibaca cap+1 supaya kelebihan ukuran terdeteksi.
    let buf = match read_limited(res, MAX_THUMBNAIL_BYTES + 1) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };
    if buf.is_empty() || buf.len() as u64 > MAX_THUMBNAIL_BYTES {
        return String::new();
    }

    if crate::thumbs::write_thumb_bytes(&dest_name, &buf).is_err() {
        return String::new();
    }
    format!("{}{}", THUMB_REF_PREFIX, dest_name)
}

/// steamImageDest: validasi URL gambar (https + host Valve + ekstensi
/// diizinkan) lalu susun nama file "steam-<appId>-<hex><ext>".
fn steam_image_dest(app_id: &str, img_url: &str) -> Option<String> {
    let u = reqwest::Url::parse(img_url).ok()?;
    if u.scheme().to_lowercase() != "https" {
        return None;
    }
    let host = u.host_str().unwrap_or("").to_lowercase();
    if host.is_empty() {
        return None;
    }
    let trusted = STEAM_IMAGE_HOST_SUFFIXES
        .iter()
        .any(|s| host == *s || host.ends_with(&format!(".{}", s)));
    if !trusted {
        return None;
    }

    let mut ext = url_ext(u.path());
    if ext.is_empty() {
        ext = ".jpg".to_string();
    }
    if !is_allowed_thumb_ext(&ext) {
        return None;
    }

    Some(format!(
        "steam-{}-{}",
        app_id,
        crate::thumbs::new_thumb_name(&ext)
    ))
}

/// Ekstensi file dari path URL (padanan path.extname), "" kalau tidak ada.
fn url_ext(path: &str) -> String {
    let file = path.rsplit('/').next().unwrap_or("");
    match file.rfind('.') {
        Some(i) if i > 0 => file[i..].to_lowercase(),
        _ => String::new(),
    }
}

/// Ekstensi termasuk whitelist thumbnail?
fn is_allowed_thumb_ext(ext: &str) -> bool {
    ALLOWED_THUMB_EXT.contains(&ext)
}
