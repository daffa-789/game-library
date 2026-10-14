// ---------------------------------------------------------------------------
// Modul gambar SoftGame: tema visual + util bersama antar panel.
//
// Palet mengikuti tema Steam versi Electron (styles.css): latar gelap biru,
// aksen biru #66c0f4, aksi hijau #75b022, bahaya merah.
// ---------------------------------------------------------------------------

pub mod detail;
pub mod form;
pub mod grid;
pub mod import_modal;

use std::collections::HashMap;

use eframe::egui;

// --- palet (padanan variabel styles.css) -----------------------------------
pub fn color_bg0() -> egui::Color32 {
    egui::Color32::from_rgb(0x17, 0x1a, 0x21)
}
pub fn color_bg1() -> egui::Color32 {
    egui::Color32::from_rgb(0x1b, 0x28, 0x38)
}
pub fn color_bg2() -> egui::Color32 {
    egui::Color32::from_rgb(0x16, 0x20, 0x2d)
}
pub fn color_panel_hover() -> egui::Color32 {
    egui::Color32::from_rgb(0x2a, 0x47, 0x5e)
}
pub fn color_line() -> egui::Color32 {
    egui::Color32::from_rgb(0x2a, 0x3f, 0x55)
}
pub fn color_accent() -> egui::Color32 {
    egui::Color32::from_rgb(0x66, 0xc0, 0xf4)
}
pub fn color_text() -> egui::Color32 {
    egui::Color32::from_rgb(0xc7, 0xd5, 0xe0)
}
pub fn color_text_bright() -> egui::Color32 {
    egui::Color32::from_rgb(0xe5, 0xe5, 0xe5)
}
pub fn color_muted() -> egui::Color32 {
    egui::Color32::from_rgb(0x8f, 0x98, 0xa0)
}
pub fn color_green() -> egui::Color32 {
    egui::Color32::from_rgb(0x75, 0xb0, 0x22)
}
pub fn color_green_text() -> egui::Color32 {
    egui::Color32::from_rgb(0xd2, 0xef, 0xa9)
}
pub fn color_danger() -> egui::Color32 {
    egui::Color32::from_rgb(0xb0, 0x4a, 0x4a)
}
pub fn color_danger_dark() -> egui::Color32 {
    egui::Color32::from_rgb(0x6e, 0x2f, 0x2f)
}
pub fn color_ghost_btn() -> egui::Color32 {
    egui::Color32::from_rgb(0x32, 0x45, 0x5b)
}
pub fn color_steam_btn() -> egui::Color32 {
    egui::Color32::from_rgb(0x1b, 0x28, 0x38)
}

/// Terapkan tema gelap ala Steam ke egui.
pub fn apply_theme(ctx: &egui::Context) {
    let mut style = (*ctx.style()).clone();
    style.visuals = egui::Visuals::dark();
    style.visuals.panel_fill = color_bg0();
    style.visuals.window_fill = color_bg1();
    style.visuals.extreme_bg_color = color_bg2();
    style.visuals.faint_bg_color = color_bg2();
    style.visuals.widgets.inactive.bg_fill = color_ghost_btn();
    style.visuals.widgets.inactive.weak_bg_fill = color_ghost_btn();
    style.visuals.widgets.hovered.bg_fill = color_panel_hover();
    style.visuals.widgets.active.bg_fill = color_accent();
    style.visuals.widgets.noninteractive.bg_fill = color_bg1();
    style.visuals.widgets.noninteractive.fg_stroke.color = color_text();
    style.visuals.widgets.inactive.fg_stroke.color = color_text();
    style.visuals.widgets.hovered.fg_stroke.color = color_text_bright();
    style.visuals.widgets.active.fg_stroke.color = color_bg0();
    style.visuals.selection.bg_fill = color_accent();
    style.visuals.selection.stroke.color = color_bg0();
    style.spacing.item_spacing = egui::vec2(8.0, 6.0);
    style.spacing.button_padding = egui::vec2(10.0, 5.0);
    ctx.set_style(style);
}

/// Tombol kayu "ghost" (abu biru).
pub fn ghost_button(text: &str) -> egui::Button<'_> {
    egui::Button::new(egui::RichText::new(text).color(color_text())).fill(color_ghost_btn())
}

/// Tombol aksi utama (hijau Steam).
pub fn green_button(text: &str) -> egui::Button<'_> {
    egui::Button::new(egui::RichText::new(text).color(color_green_text()))
        .fill(color_green())
}

/// Tombol bahaya (merah).
pub fn danger_button(text: &str) -> egui::Button<'_> {
    egui::Button::new(egui::RichText::new(text).color(egui::Color32::from_rgb(0xf0, 0xcf, 0xcf)))
        .fill(color_danger_dark())
}

/// Tombol bergaris aksen (mis. impor Steam).
pub fn steam_button(text: &str) -> egui::Button<'_> {
    egui::Button::new(egui::RichText::new(text).color(color_accent()))
        .fill(color_steam_btn())
        .stroke(egui::Stroke::new(1.0f32, egui::Color32::from_rgb(0x3d, 0x6a, 0x8c)))
}

/// Chip kecil (label metadata); `accent` = harga (teks aksen).
pub fn chip(ui: &mut egui::Ui, text: &str, accent: bool) {
    let fill = if accent {
        egui::Color32::from_rgb(0x2a, 0x47, 0x5e)
    } else {
        egui::Color32::from_rgb(0x21, 0x32, 0x45)
    };
    let color = if accent { color_accent() } else { color_text() };
    egui::Frame::default()
        .fill(fill)
        .inner_margin(egui::Margin::symmetric(8, 3))
        .corner_radius(10.0)
        .show(ui, |ui| {
            ui.label(egui::RichText::new(text).color(color).small());
        });
}

/// Frame panel dengan sudut membulat dan garis tepi tipis.
pub fn panel_frame() -> egui::Frame {
    egui::Frame::default()
        .fill(color_bg1())
        .inner_margin(egui::Margin::same(12))
        .corner_radius(6.0)
        .stroke(egui::Stroke::new(1.0f32, color_line()))
}

/// Muat tekstur thumbnail dari referensi tersimpan (`/thumbnails/<file>`).
/// Referensi non-gambar (URL luar, kosong) → None (pemanggil pakai
/// placeholder). Hasil gagal decode juga di-cache supaya tidak dibaca ulang.
pub fn thumb_texture(
    ctx: &egui::Context,
    cache: &mut HashMap<String, Option<egui::TextureHandle>>,
    reference: &str,
) -> Option<egui::TextureHandle> {
    let name = crate::thumbs::thumb_file_name(reference)?;
    if let Some(cached) = cache.get(&name) {
        return cached.clone();
    }
    let tex = crate::thumbs::safe_thumb_path(reference)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|bytes| image::load_from_memory(&bytes).ok())
        .map(|img| {
            let rgba = img.to_rgba8();
            let size = [rgba.width() as usize, rgba.height() as usize];
            egui::ColorImage::from_rgba_unmultiplied(size, &rgba.into_raw())
        })
        .map(|image| {
            ctx.load_texture(
                format!("thumb:{}", name),
                image,
                egui::TextureOptions::LINEAR,
            )
        });
    cache.insert(name, tex.clone());
    tex
}

/// Placeholder kartu "Tidak ada gambar".
pub fn draw_placeholder(ui: &mut egui::Ui, size: egui::Vec2) {
    let (rect, _) = ui.allocate_exact_size(size, egui::Sense::hover());
    ui.painter().rect_filled(rect, 4.0, egui::Color32::from_rgb(0x1c, 0x2a, 0x3a));
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        "Tidak ada gambar",
        egui::FontId::proportional(13.0),
        egui::Color32::from_rgb(0x55, 0x67, 0x7a),
    );
}

/// Gambar thumbnail (atau placeholder) dengan rasio dijaga.
pub fn thumb_image(
    ui: &mut egui::Ui,
    ctx: &egui::Context,
    cache: &mut HashMap<String, Option<egui::TextureHandle>>,
    reference: &str,
    size: egui::Vec2,
) {
    match thumb_texture(ctx, cache, reference) {
        Some(tex) => {
            ui.add(
                egui::Image::new(egui::load::SizedTexture::new(tex.id(), tex.size_vec2()))
                    .max_width(size.x)
                    .max_height(size.y)
                    .corner_radius(4.0),
            );
        }
        None => draw_placeholder(ui, size),
    }
}
