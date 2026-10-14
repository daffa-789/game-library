// ---------------------------------------------------------------------------
// Modal form tambah/edit entri (port EntryFormModal.jsx + LinksEditor.jsx).
//
// Satu modal melayani katalog game maupun software: field teks dibangun dari
// model::form_fields(tab), blok spesifikasi hanya muncul untuk game, dan baris
// link mirror bisa ditambah/dihapus dinamis. Nilai "pending" (thumbnail dan
// steamAppId hasil impor) baru dikomit ke entri saat tombol Simpan ditekan.
// ---------------------------------------------------------------------------

use std::collections::{HashMap, HashSet};

use eframe::egui;

use crate::app::{FormPrefill, SoftGameApp};
use crate::model::{self, CatalogTab, EntryRef, FormInput, GameSpecs, LinkMirror};

/// State modal form tambah/edit satu entri katalog.
pub struct FormModal {
    pub tab: CatalogTab,
    /// None = menambah entri baru.
    pub editing_id: Option<String>,
    /// Nilai field teks; key sama dengan FormField.key.
    pub values: HashMap<&'static str, String>,
    pub specs: GameSpecs,
    pub links: Vec<LinkMirror>,
    pub pending_thumb: String,
    pub pending_steam_app_id: String,
    /// Key field wajib yang masih kosong (garis merah pada input).
    pub invalid: HashSet<&'static str>,
    /// Daftar link belum punya satu URL valid pun.
    pub links_invalid: bool,
    /// Fokus awal belum dikonsumsi: judul, atau URL link pertama bila prefill.
    pub focus_first: bool,
    /// Form dibuka dari hasil impor: fokus awal ke URL link pertama.
    from_prefill: bool,
}

impl FormModal {
    /// Form tambah baru: semua field kosong, satu baris link kosong.
    pub fn new(tab: CatalogTab) -> Self {
        Self {
            tab,
            editing_id: None,
            values: HashMap::new(),
            specs: GameSpecs::default(),
            links: vec![LinkMirror::default()],
            pending_thumb: String::new(),
            pending_steam_app_id: String::new(),
            invalid: HashSet::new(),
            links_invalid: false,
            focus_first: true,
            from_prefill: false,
        }
    }

    /// Form edit: nilai diambil dari entri yang sudah ada.
    pub fn from_entry(entry: EntryRef<'_>) -> Self {
        let tab = entry.tab();
        let mut values = HashMap::new();
        for f in model::form_fields(tab) {
            values.insert(f.key, entry_field_value(entry, f.key));
        }
        // Data lama bisa hanya punya field `link` tunggal; links() sudah
        // menyerapnya jadi daftar mirror. Minimal selalu satu baris.
        let mut links = entry.links();
        if links.is_empty() {
            links.push(LinkMirror::default());
        }
        let specs = entry.specs().cloned().unwrap_or_default();
        let steam_app_id = match entry {
            EntryRef::Game(g) => g.steam_app_id.clone(),
            EntryRef::Software(_) => String::new(),
        };
        Self {
            tab,
            editing_id: Some(entry.id().to_string()),
            values,
            specs,
            links,
            pending_thumb: entry.thumbnail().to_string(),
            pending_steam_app_id: steam_app_id,
            invalid: HashSet::new(),
            links_invalid: false,
            focus_first: true,
            from_prefill: false,
        }
    }

    /// Form tambah dengan prefill dari hasil impor (Steam atau situs resmi).
    pub fn from_prefill(tab: CatalogTab, prefill: FormPrefill) -> Self {
        let mut values: HashMap<&'static str, String> = HashMap::new();
        let mut specs = GameSpecs::default();
        let pending_thumb: String;
        let mut pending_steam_app_id = String::new();

        match prefill {
            FormPrefill::Steam(data) => {
                // Game: judul/genre/harga langsung dipakai (boleh menimpa).
                values.insert("title", data.title);
                values.insert("genre", data.genre);
                values.insert("price", data.price);
                specs = data.specs;
                pending_thumb = data.thumbnail;
                pending_steam_app_id = data.app_id;
            }
            FormPrefill::Site(data) => {
                // Software: hanya mengisi field yang masih kosong.
                for (key, val) in [
                    ("title", data.title),
                    ("category", data.category),
                    ("version", data.version),
                    ("license", data.license),
                    ("platform", data.platform),
                    ("website", data.website),
                ] {
                    if val.trim().is_empty() {
                        continue;
                    }
                    let empty = values
                        .get(key)
                        .map(|s| s.trim().is_empty())
                        .unwrap_or(true);
                    if empty {
                        values.insert(key, val);
                    }
                }
                pending_thumb = data.thumbnail;
            }
        }

        Self {
            tab,
            editing_id: None,
            values,
            specs,
            links: vec![LinkMirror::default()],
            pending_thumb,
            pending_steam_app_id,
            invalid: HashSet::new(),
            links_invalid: false,
            focus_first: true,
            from_prefill: true,
        }
    }
}

/// Nilai satu field teks form diambil dari entri (key tak dikenal = kosong).
fn entry_field_value(entry: EntryRef<'_>, key: &str) -> String {
    match entry {
        EntryRef::Game(g) => match key {
            "title" => g.title.clone(),
            "genre" => g.genre.clone(),
            "price" => g.price.clone(),
            _ => String::new(),
        },
        EntryRef::Software(s) => match key {
            "title" => s.title.clone(),
            "website" => s.website.clone(),
            "category" => s.category.clone(),
            "version" => s.version.clone(),
            "license" => s.license.clone(),
            "platform" => s.platform.clone(),
            "size" => s.size.clone(),
            "price" => s.price.clone(),
            _ => String::new(),
        },
    }
}

/// Sasaran fokus awal modal (dikonsumsi pada frame pertama).
#[derive(Clone, Copy, PartialEq)]
enum FocusTarget {
    None,
    Title,
    LinkUrl0,
}

/// Gambar modal form; dipanggil dari loop utama aplikasi.
pub fn show_form_modal(ctx: &egui::Context, app: &mut SoftGameApp, modal: &mut FormModal) {
    let window_title = match (modal.editing_id.is_some(), modal.tab) {
        (true, CatalogTab::Game) => "Edit Game",
        (true, CatalogTab::Software) => "Edit Software",
        (false, CatalogTab::Game) => "Tambah Game",
        (false, CatalogTab::Software) => "Tambah Software",
    };

    // Fokus awal: judul (form kosong) atau URL link pertama (hasil prefill).
    let mut focus = FocusTarget::None;
    if modal.focus_first {
        modal.focus_first = false;
        focus = if modal.from_prefill {
            FocusTarget::LinkUrl0
        } else {
            FocusTarget::Title
        };
    }

    egui::Window::new(window_title)
        .collapsible(false)
        .resizable(false)
        .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
        .default_width(600.0)
        .show(ctx, |ui| {
            egui::ScrollArea::vertical()
                .max_height(560.0)
                .show(ui, |ui| {
                    render_fields(ui, modal, focus);
                    render_links(app, ui, modal, focus);
                    render_thumb(app, ui, ctx, modal);
                    // Editor spesifikasi hanya ada untuk katalog game.
                    if modal.tab.has_specs() {
                        render_specs(ui, modal);
                    }
                });
            ui.add_space(2.0);
            ui.separator();
            render_footer(app, ui, modal);
        });
}

/// Field teks dari deskriptor, dua per baris.
fn render_fields(ui: &mut egui::Ui, modal: &mut FormModal, focus: FocusTarget) {
    let fields = model::form_fields(modal.tab);
    let mut idx = 0;
    while idx < fields.len() {
        let end = (idx + 2).min(fields.len());
        let pair = &fields[idx..end];
        ui.horizontal(|ui| {
            let avail = ui.available_width();
            for f in pair {
                let w = if pair.len() == 2 {
                    ((avail - 8.0) / 2.0).max(80.0)
                } else {
                    avail
                };
                ui.vertical(|ui| {
                    ui.set_width(w);
                    ui.label(f.label);
                    let invalid = modal.invalid.contains(f.key);
                    let val = modal.values.entry(f.key).or_default();
                    let resp = add_text_input(
                        ui,
                        val,
                        f.placeholder,
                        egui::Id::new(("form-field", f.key)),
                        invalid,
                        false,
                        w,
                    );
                    if focus == FocusTarget::Title && f.key == "title" {
                        resp.request_focus();
                    }
                });
            }
        });
        idx = end;
    }
}

/// Editor daftar link mirror: label + URL per baris, tambah/hapus dinamis.
fn render_links(app: &mut SoftGameApp, ui: &mut egui::Ui, modal: &mut FormModal, focus: FocusTarget) {
    ui.add_space(6.0);
    ui.label(egui::RichText::new("Link Download (bisa lebih dari satu)").strong());

    // URL yang muncul lebih dari sekali ditandai kuning.
    let mut counts: HashMap<String, usize> = HashMap::new();
    for row in &modal.links {
        let key = row.url.trim().to_lowercase();
        if !key.is_empty() {
            *counts.entry(key).or_insert(0) += 1;
        }
    }

    let label_ph = "Layanan (mis. Gofile)";
    let url_ph = match modal.tab {
        CatalogTab::Game => "https://gofile.io/d/xxxxxxxx",
        CatalogTab::Software => "https://pixeldrain.com/u/xxxxxxxx",
    };

    let mut remove_idx: Option<usize> = None;
    let count = modal.links.len();
    for i in 0..count {
        ui.horizontal(|ui| {
            let avail = ui.available_width();
            let label_w = 150.0;
            let del_w = 70.0;
            let url_w = (avail - label_w - del_w - 12.0).max(80.0);

            let url_key = modal.links[i].url.trim().to_lowercase();
            let dup = !url_key.is_empty() && counts.get(&url_key).copied().unwrap_or(0) > 1;
            let bad = modal.links_invalid
                && crate::links::normalize_link_url(&modal.links[i].url)
                    .trim()
                    .is_empty();

            let label_resp = {
                let row = &mut modal.links[i];
                add_text_input(
                    ui,
                    &mut row.label,
                    label_ph,
                    egui::Id::new(("form-link-label", i)),
                    false,
                    false,
                    label_w,
                )
            };
            let url_resp = {
                let row = &mut modal.links[i];
                add_text_input(
                    ui,
                    &mut row.url,
                    url_ph,
                    egui::Id::new(("form-link-url", i)),
                    bad,
                    dup,
                    url_w,
                )
            };
            if focus == FocusTarget::LinkUrl0 && i == 0 {
                url_resp.request_focus();
            }

            // Label ditebak otomatis dari URL saat kolom kehilangan fokus.
            if label_resp.lost_focus() || url_resp.lost_focus() {
                let row = &mut modal.links[i];
                if row.label.trim().is_empty() {
                    let norm = crate::links::normalize_link_url(&row.url);
                    if !norm.trim().is_empty() {
                        row.label = crate::links::service_label(&row.url);
                    }
                }
            }

            let del = ui.add(
                egui::Button::new(egui::RichText::new("Hapus").small())
                    .fill(super::color_danger_dark()),
            );
            if del.on_hover_text("Hapus link ini").clicked() {
                remove_idx = Some(i);
            }
        });
    }

    // Selalu sisakan minimal satu baris.
    if let Some(i) = remove_idx {
        if modal.links.len() > 1 {
            modal.links.remove(i);
        } else {
            modal.links[0] = LinkMirror::default();
        }
    }

    ui.horizontal(|ui| {
        if ui.add(super::ghost_button("Tambah Link")).clicked() {
            if modal.links.len() >= crate::links::MAX_LINKS {
                app.toast(
                    format!("Maksimal {} link per entri", crate::links::MAX_LINKS),
                    true,
                );
            } else {
                modal.links.push(LinkMirror::default());
            }
        }
        ui.label(
            egui::RichText::new(
                "Satu baris untuk tiap layanan penyimpanan (Gofile, PixelDrain, Google Drive, MEGA, ...). Label dikenali otomatis dari URL.",
            )
            .small()
            .color(super::color_muted()),
        );
    });
}

/// Blok thumbnail: preview + pilih/simpan/hapus gambar.
fn render_thumb(app: &mut SoftGameApp, ui: &mut egui::Ui, ctx: &egui::Context, modal: &mut FormModal) {
    ui.add_space(6.0);
    ui.label(egui::RichText::new("Thumbnail").strong());
    ui.horizontal(|ui| {
        super::thumb_image(
            ui,
            ctx,
            &mut app.textures,
            &modal.pending_thumb,
            egui::vec2(220.0, 103.0),
        );
        ui.vertical(|ui| {
            ui.add_space(2.0);
            if ui
                .add(super::ghost_button("Pilih Gambar dari Komputer..."))
                .clicked()
            {
                if let Some(reference) = crate::thumbs::pick_thumbnail_dialog() {
                    modal.pending_thumb = reference;
                }
            }
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                let can_export = crate::thumbs::is_stored_thumb(&modal.pending_thumb);
                let title = modal.values.get("title").cloned().unwrap_or_default();
                if ui
                    .add_enabled(can_export, super::ghost_button("Simpan Gambar").small())
                    .clicked()
                {
                    // pending_thumb baru dikomit ke file pengguna di sini.
                    app.export_thumbnail(&modal.pending_thumb, &title);
                }
                if ui
                    .add(super::ghost_button("Hapus Gambar").small())
                    .clicked()
                {
                    modal.pending_thumb.clear();
                }
            });
        });
    });
}

/// Blok spesifikasi sistem (khusus katalog game): dua kolom min/rec.
fn render_specs(ui: &mut egui::Ui, modal: &mut FormModal) {
    ui.add_space(6.0);
    ui.label(egui::RichText::new("Spesifikasi Sistem").strong());
    ui.add_space(2.0);
    ui.horizontal(|ui| {
        let avail = ui.available_width();
        let col_w = ((avail - 10.0) / 2.0).max(120.0);
        for (is_rec, side_title) in [(false, "MINIMUM"), (true, "RECOMMENDED")] {
            ui.vertical(|ui| {
                ui.set_width(col_w);
                ui.label(
                    egui::RichText::new(side_title)
                        .strong()
                        .color(super::color_accent()),
                );
                for &(key, label) in model::SPEC_FIELDS {
                    let slot = if is_rec {
                        spec_field_mut(&mut modal.specs.rec, key)
                    } else {
                        spec_field_mut(&mut modal.specs.min, key)
                    };
                    if let Some(v) = slot {
                        ui.label(label);
                        add_text_input(
                            ui,
                            v,
                            model::spec_placeholder(key),
                            egui::Id::new(("spec", side_title, key)),
                            false,
                            false,
                            col_w,
                        );
                    }
                }
            });
        }
    });
}

/// Slot &mut String satu kolom spesifikasi; None untuk key tak dikenal.
fn spec_field_mut<'a>(
    specs: &'a mut crate::model::SystemSpecs,
    key: &str,
) -> Option<&'a mut String> {
    Some(match key {
        "os" => &mut specs.os,
        "cpu" => &mut specs.cpu,
        "ram" => &mut specs.ram,
        "gpu" => &mut specs.gpu,
        "dx" => &mut specs.dx,
        "net" => &mut specs.net,
        "storage" => &mut specs.storage,
        "sound" => &mut specs.sound,
        "notes" => &mut specs.notes,
        _ => return None,
    })
}

/// Satu kotak input dengan opsi garis merah (wajib) / kuning (duplikat).
fn add_text_input(
    ui: &mut egui::Ui,
    text: &mut String,
    hint: &str,
    id: egui::Id,
    invalid: bool,
    warn: bool,
    width: f32,
) -> egui::Response {
    let te = egui::TextEdit::singleline(text)
        .hint_text(hint)
        .id(id)
        .frame(false)
        .desired_width(width);
    let stroke = if invalid {
        egui::Stroke::new(1.5f32, super::color_danger())
    } else if warn {
        egui::Stroke::new(1.5f32, egui::Color32::from_rgb(0xd8, 0xb5, 0x4a))
    } else {
        egui::Stroke::NONE
    };
    egui::Frame::default()
        .fill(super::color_bg2())
        .inner_margin(egui::Margin::symmetric(6, 5))
        .corner_radius(4.0)
        .stroke(stroke)
        .show(ui, |ui| ui.add(te))
        .inner
}

/// Footer modal: Batal + Simpan.
fn render_footer(app: &mut SoftGameApp, ui: &mut egui::Ui, modal: &mut FormModal) {
    ui.horizontal(|ui| {
        if ui.add(super::ghost_button("Batal")).clicked() {
            app.close_modal();
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            let label = format!("Simpan {}", modal.tab.noun_cap());
            if ui.add(super::green_button(&label)).clicked() {
                handle_save(app, modal);
            }
        });
    });
}

/// Validasi lalu bangun FormInput dan serahkan ke aplikasi.
fn handle_save(app: &mut SoftGameApp, modal: &mut FormModal) {
    let fields = model::form_fields(modal.tab);

    // Nilai dirapikan (trim); field wajib yang kosong ditandai.
    let mut values: Vec<(&'static str, String)> = Vec::with_capacity(fields.len());
    let mut invalid: HashSet<&'static str> = HashSet::new();
    for f in &fields {
        let v = modal
            .values
            .get(f.key)
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        if f.required && v.is_empty() {
            invalid.insert(f.key);
        }
        values.push((f.key, v));
    }
    if !invalid.is_empty() {
        modal.invalid = invalid;
        if let Some(f) = fields.iter().find(|f| modal.invalid.contains(f.key)) {
            let label = f.label.trim_end_matches(" *");
            app.toast(format!("{} wajib diisi", label), true);
        }
        return;
    }
    modal.invalid.clear();

    // Daftar mirror: minimal satu URL http/https yang sah.
    let links = crate::links::normalize_link_list(&modal.links);
    if links.is_empty() {
        modal.links_invalid = true;
        app.toast("Isi minimal satu link download yang valid", true);
        return;
    }
    modal.links_invalid = false;

    let input = FormInput {
        tab: modal.tab,
        editing_id: modal.editing_id.clone(),
        values,
        links,
        specs: modal.specs.clone(),
        thumbnail: modal.pending_thumb.clone(),
        steam_app_id: modal.pending_steam_app_id.clone(),
    };
    // pending_thumb & pending_steam_app_id dikomit ke entri di titik ini.
    app.save_form(input);
}
