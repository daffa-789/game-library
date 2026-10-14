// SoftGame Library — entry point versi Rust (eframe/egui).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod links;
mod migrate;
mod model;
mod paths;
mod sanitize;
mod steam;
mod store;
mod system;
mod text;
mod thumbs;
mod ui;
mod website;

use app::SoftGameApp;

fn main() -> eframe::Result<()> {
    let native_options = eframe::NativeOptions {
        viewport: build_viewport(),
        ..Default::default()
    };
    eframe::run_native(
        "SoftGame Library",
        native_options,
        Box::new(|cc: &eframe::CreationContext<'_>| {
            Ok(Box::new(SoftGameApp::new(cc)))
        }),
    )
}

/// Ukuran & properti jendela (sama dengan versi Electron: 1400x880, min
/// 980x620), plus ikon jendela dari build/windows/icon.ico.
fn build_viewport() -> eframe::egui::ViewportBuilder {
    let mut builder = eframe::egui::ViewportBuilder::default()
        .with_title("SoftGame Library")
        .with_inner_size([1400.0, 880.0])
        .with_min_inner_size([980.0, 620.0]);
    if let Some(icon) = load_window_icon() {
        builder = builder.with_icon(icon);
    }
    builder
}

/// Ikon jendela: cari build/windows/icon.ico dulu, lalu turun ke assets/.
/// Path relatif-jarak-jauh dari folder exe juga diperiksa supaya binary hasil
/// build tetap menemukan ikon walau dijalankan dari direktori lain.
fn load_window_icon() -> Option<eframe::egui::IconData> {
    let mut candidates: Vec<std::path::PathBuf> = vec![
        std::path::Path::new("build/windows/icon.ico").into(),
        std::path::Path::new("assets/icon.ico").into(),
    ];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("build/windows/icon.ico"));
            candidates.push(dir.join("assets/icon.ico"));
        }
    }
    for path in candidates {
        let Ok(bytes) = std::fs::read(&path) else { continue };
        let Ok(img) = image::load_from_memory(&bytes) else { continue };
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        return Some(eframe::egui::IconData {
            rgba: rgba.into_raw(),
            width: w,
            height: h,
        });
    }
    None
}
