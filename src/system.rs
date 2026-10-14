// ---------------------------------------------------------------------------
// Integrasi sistem (browser & clipboard) — padanan electron/lib/system.js.
//
// openExternal hanya mengizinkan skema http/https supaya aplikasi tidak
// pernah jadi jalan masuk untuk meluncurkan protokol berbahaya dari data
// yang diimpor (javascript:, file:, dst).
// ---------------------------------------------------------------------------

/// open_external membuka URL di browser/default handler sistem.
pub fn open_external(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    let parsed = match reqwest::Url::parse(trimmed) {
        Ok(u) => u,
        Err(_) => return Err("URL tidak valid".to_string()),
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("URL tidak valid".to_string());
    }
    if parsed.host_str().unwrap_or("").is_empty() {
        return Err("URL tidak valid".to_string());
    }
    open::that(parsed.as_str()).map_err(|e| format!("Gagal membuka link: {}", e))
}

/// copy_text menyalin teks ke clipboard sistem.
pub fn copy_text(text: &str) -> Result<(), String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("Gagal menyalin teks: {}", e))?;
    clipboard
        .set_text(text.to_string())
        .map_err(|e| format!("Gagal menyalin teks: {}", e))
}
