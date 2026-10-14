// ---------------------------------------------------------------------------
// Aplikasi inti SoftGame Library (pengganti App.jsx + jembatan IPC Electron).
//
// Memegang seluruh state aplikasi (katalog, tab aktif, pencarian/urut/filter,
// modal, toast) dan semua aksi: muat/simpan katalog, tambah/edit/hapus entri,
// salin & buka link, kelola thumbnail, ekspor gambar. Gambaran murni untuk
// tiap panel ada di src/ui/*.rs.
// ---------------------------------------------------------------------------

use std::collections::HashMap;
use std::time::{Duration, Instant};

use eframe::egui;

use crate::model::*;
use crate::sanitize;
use crate::store;
use crate::system;
use crate::thumbs;
use crate::ui;

/// UI state per tab (pencarian, urutan, filter kategori, entri terpilih).
#[derive(Debug, Clone)]
pub struct TabUi {
    pub query: String,
    pub sort: String,
    pub filter_cat: String,
    pub selected_id: Option<String>,
}

impl Default for TabUi {
    fn default() -> Self {
        Self {
            query: String::new(),
            sort: "new".to_string(),
            filter_cat: String::new(),
            selected_id: None,
        }
    }
}

/// Data hasil impor yang dipakai untuk prefill form (dari modal impor).
pub enum FormPrefill {
    Steam(SteamImportData),
    Site(SoftwareImportData),
}

/// Modal yang sedang terbuka; state tiap modal dimiliki modul ui terkait.
pub enum Modal {
    Form(ui::form::FormModal),
    Confirm {
        title: String,
        message: String,
        /// (tab, id entri) yang akan dihapus.
        target: Option<(CatalogTab, String)>,
    },
    Import(ui::import_modal::ImportModal),
}

/// Toast sementara di bawah layar.
#[derive(Debug, Clone)]
pub struct Toast {
    pub msg: String,
    pub error: bool,
    pub at: Instant,
}

const TOAST_DURATION: Duration = Duration::from_millis(2600);

/// Aplikasi utama.
pub struct SoftGameApp {
    pub lib: Library,
    pub tab: CatalogTab,
    pub ui_game: TabUi,
    pub ui_software: TabUi,
    pub modal: Option<Modal>,
    pub toast: Option<Toast>,
    /// Cache tekstur thumbnail; key = nama file di folder thumbnails.
    pub textures: HashMap<String, Option<egui::TextureHandle>>,
    /// Diminta pintasan Ctrl+F; dikonsumsi kotak pencarian lalu direset.
    pub focus_search: bool,
    /// true kalau close_modal() dipanggil saat modal sedang digambar — dipakai
    /// loop utama supaya modal yang sudah ditutup tidak ter-restore lagi.
    pub modal_dismissed: bool,
}

impl Default for SoftGameApp {
    fn default() -> Self {
        Self::build()
    }
}

impl SoftGameApp {
    fn build() -> Self {
        thumbs::ensure_dirs();
        let lib = store::load_library();
        Self {
            lib,
            tab: CatalogTab::Game,
            ui_game: TabUi::default(),
            ui_software: TabUi::default(),
            modal: None,
            toast: None,
            textures: HashMap::new(),
            focus_search: false,
            modal_dismissed: false,
        }
    }

    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        ui::apply_theme(&cc.egui_ctx);
        Self::build()
    }

    // --- akses state ----------------------------------------------------

    pub fn ui(&self) -> &TabUi {
        self.ui_of(self.tab)
    }

    pub fn ui_mut(&mut self) -> &mut TabUi {
        self.ui_of_mut(self.tab)
    }

    pub fn ui_of(&self, tab: CatalogTab) -> &TabUi {
        match tab {
            CatalogTab::Game => &self.ui_game,
            CatalogTab::Software => &self.ui_software,
        }
    }

    pub fn ui_of_mut(&mut self, tab: CatalogTab) -> &mut TabUi {
        match tab {
            CatalogTab::Game => &mut self.ui_game,
            CatalogTab::Software => &mut self.ui_software,
        }
    }

    pub fn entries(&self, tab: CatalogTab) -> EntryList<'_> {
        match tab {
            CatalogTab::Game => EntryList::Games(&self.lib.games),
            CatalogTab::Software => EntryList::Software(&self.lib.software),
        }
    }

    pub fn find_entry(&self, tab: CatalogTab, id: &str) -> Option<EntryRef<'_>> {
        match tab {
            CatalogTab::Game => self.lib.games.iter().find(|g| g.id == id).map(EntryRef::Game),
            CatalogTab::Software => {
                self.lib.software.iter().find(|s| s.id == id).map(EntryRef::Software)
            }
        }
    }

    pub fn selected_entry(&self) -> Option<EntryRef<'_>> {
        let id = self.ui().selected_id.clone()?;
        self.find_entry(self.tab, &id)
    }

    // --- aksi navigasi ---------------------------------------------------

    pub fn switch_tab(&mut self, tab: CatalogTab) {
        if tab != self.tab {
            self.tab = tab;
        }
    }

    pub fn set_query(&mut self, q: String) {
        self.ui_mut().query = q;
    }

    pub fn set_sort(&mut self, s: String) {
        self.ui_mut().sort = s;
    }

    pub fn set_filter_cat(&mut self, c: String) {
        self.ui_mut().filter_cat = c;
    }

    pub fn select_id(&mut self, id: Option<String>) {
        self.ui_mut().selected_id = id;
    }

    /// Filter kategori yang sudah tidak ada di data otomatis direset.
    fn reset_stale_category_filter(&mut self) {
        if self.tab.category_field().is_none() {
            return;
        }
        let fc = self.ui().filter_cat.trim().to_string();
        if fc.is_empty() {
            return;
        }
        let exists = self.lib.software.iter().any(|s| s.category.trim() == fc);
        if !exists {
            self.ui_of_mut(CatalogTab::Software).filter_cat = String::new();
        }
    }

    /// Daftar kategori software (unik, terurut) untuk dropdown filter.
    pub fn categories(&self) -> Vec<String> {
        let mut out: Vec<String> = self
            .lib
            .software
            .iter()
            .map(|s| s.category.trim().to_string())
            .filter(|c| !c.is_empty())
            .collect();
        out.sort();
        out.dedup();
        out
    }

    /// Entri yang lolos pencarian + filter kategori, terurut sesuai pilihan.
    pub fn visible(&self, tab: CatalogTab) -> Vec<EntryRef<'_>> {
        let u = self.ui_of(tab);
        let q = u.query.trim().to_lowercase();
        let mut out: Vec<EntryRef<'_>> = self
            .entries(tab)
            .iter()
            .into_iter()
            .filter(|e| q.is_empty() || e.haystack().contains(&q))
            .filter(|e| {
                match tab.category_field() {
                    Some(_) => u.filter_cat.trim().is_empty() || entry_category(e) == u.filter_cat.trim(),
                    None => true,
                }
            })
            .collect();
        match u.sort.as_str() {
            "az" => out.sort_by(|a, b| a.title().to_lowercase().cmp(&b.title().to_lowercase())),
            "za" => out.sort_by(|a, b| b.title().to_lowercase().cmp(&a.title().to_lowercase())),
            "cat" => out.sort_by(|a, b| {
                let ka = (entry_category(a).is_empty(), entry_category(a).to_lowercase(), a.title().to_lowercase());
                let kb = (entry_category(b).is_empty(), entry_category(b).to_lowercase(), b.title().to_lowercase());
                ka.cmp(&kb)
            }),
            _ => out.sort_by(|a, b| b.created_at().cmp(a.created_at())),
        }
        out
    }

    /// Judul besar di library bar (Hasil untuk "...", kategori, atau heading).
    pub fn view_head(&self) -> String {
        let u = self.ui();
        let q = u.query.trim().to_string();
        if !q.is_empty() {
            return format!("Hasil untuk “{}”", q);
        }
        if self.tab.category_field().is_some() && !u.filter_cat.trim().is_empty() {
            return u.filter_cat.trim().to_string();
        }
        self.tab.heading().to_string()
    }

    pub fn view_count_label(&self) -> String {
        format!("{} {}", self.visible(self.tab).len(), self.tab.noun())
    }

    // --- aksi modal ------------------------------------------------------

    pub fn open_add_form(&mut self) {
        let tab = self.tab;
        self.modal = Some(Modal::Form(ui::form::FormModal::new(tab)));
    }

    pub fn open_edit_form(&mut self, id: &str) {
        let tab = self.tab;
        if let Some(entry) = self.find_entry(tab, id) {
            self.modal = Some(Modal::Form(ui::form::FormModal::from_entry(entry)));
        }
    }

    /// Buka form dengan data hasil impor (prefill hanya untuk entri baru).
    pub fn open_prefill_form(&mut self, tab: CatalogTab, prefill: FormPrefill) {
        self.modal = Some(Modal::Form(ui::form::FormModal::from_prefill(tab, prefill)));
    }

    pub fn open_import(&mut self) {
        let tab = self.tab;
        self.modal = Some(Modal::Import(ui::import_modal::ImportModal::new(tab)));
    }

    pub fn close_modal(&mut self) {
        self.modal = None;
        self.modal_dismissed = true;
    }

    /// Tanya konfirmasi sebelum menghapus entri.
    pub fn ask_delete(&mut self, id: &str) {
        let tab = self.tab;
        let entry = match self.find_entry(tab, id) {
            Some(e) => e,
            None => return,
        };
        let extra = if tab.has_specs() {
            "beserta link dan spesifikasinya"
        } else {
            "beserta link download-nya"
        };
        self.modal = Some(Modal::Confirm {
            title: format!("Hapus {}?", tab.noun_cap()),
            message: format!(
                "\"{}\" akan dihapus dari library {}. Tindakan ini tidak bisa dibatalkan.",
                entry.title(),
                extra
            ),
            target: Some((tab, id.to_string())),
        });
    }

    // --- aksi data -------------------------------------------------------

    /// Simpan hasil form (tambah atau edit), lalu persist ke disk.
    pub fn save_form(&mut self, input: FormInput) {
        let now = now_rfc3339();
        let adding = input.editing_id.is_none();
        let mut old_thumb = String::new();

        match input.tab {
            CatalogTab::Game => {
                if let Some(id) = input.editing_id.as_deref() {
                    match self.lib.games.iter_mut().find(|g| g.id == id) {
                        Some(g) => {
                            old_thumb = g.thumbnail.clone();
                            apply_game_fields(g, &input);
                            sanitize::sanitize_game(g, &now);
                        }
                        None => return,
                    }
                } else {
                    let mut g = Game {
                        id: new_uuid(),
                        created_at: now.clone(),
                        ..Default::default()
                    };
                    apply_game_fields(&mut g, &input);
                    sanitize::sanitize_game(&mut g, &now);
                    self.lib.games.push(g);
                }
            }
            CatalogTab::Software => {
                if let Some(id) = input.editing_id.as_deref() {
                    match self.lib.software.iter_mut().find(|s| s.id == id) {
                        Some(s) => {
                            old_thumb = s.thumbnail.clone();
                            apply_software_fields(s, &input);
                            sanitize::sanitize_software(s, &now);
                        }
                        None => return,
                    }
                } else {
                    let mut s = Software {
                        id: new_uuid(),
                        created_at: now.clone(),
                        ..Default::default()
                    };
                    apply_software_fields(&mut s, &input);
                    sanitize::sanitize_software(&mut s, &now);
                    self.lib.software.push(s);
                }
            }
        }

        // Thumbnail lama dibuang kalau entri sudah tidak lagi memakainya.
        if !old_thumb.is_empty() && old_thumb != input.thumbnail && thumbs::is_stored_thumb(&old_thumb) {
            thumbs::delete_thumbnail(&old_thumb);
        }

        self.persist();
        self.close_modal();
        if adding {
            let title = input
                .values
                .iter()
                .find(|(k, _)| *k == "title")
                .map(|(_, v)| v.clone())
                .unwrap_or_default();
            self.toast(
                format!("\"{}\" ditambahkan ke katalog {}", title, input.tab.noun_cap()),
                false,
            );
        } else {
            self.toast("Perubahan tersimpan", false);
        }
    }

    /// Hapus entri (plus file thumbnail-nya) lalu persist.
    pub fn delete_entry(&mut self, tab: CatalogTab, id: &str) {
        let thumb = match tab {
            CatalogTab::Game => match self.lib.games.iter().position(|g| g.id == id) {
                Some(pos) => self.lib.games.remove(pos).thumbnail,
                None => return,
            },
            CatalogTab::Software => match self.lib.software.iter().position(|s| s.id == id) {
                Some(pos) => self.lib.software.remove(pos).thumbnail,
                None => return,
            },
        };
        self.ui_of_mut(tab).selected_id = None;
        if thumbs::is_stored_thumb(&thumb) {
            thumbs::delete_thumbnail(&thumb);
        }
        self.persist();
        self.toast(format!("{} dihapus dari library", tab.noun_cap()), false);
    }

    fn persist(&mut self) {
        if let Err(e) = store::save_library(&self.lib) {
            self.toast(format!("Gagal menyimpan data: {}", e), true);
        }
    }

    // --- aksi link & gambar ----------------------------------------------

    /// Salin SEMUA mirror satu entri ke clipboard (satu URL per baris).
    pub fn copy_entry_links(&mut self, id: &str) {
        let tab = self.tab;
        let entry = match self.find_entry(tab, id) {
            Some(e) => e,
            None => return,
        };
        let links = entry.links();
        if links.is_empty() {
            self.toast(format!("{} ini belum punya link download", tab.noun_cap()), true);
            return;
        }
        let text = links.iter().map(|l| l.url.clone()).collect::<Vec<_>>().join("\n");
        match system::copy_text(&text) {
            Ok(()) => {
                if links.len() > 1 {
                    self.toast(
                        format!("{} link mirror disalin! Siap dikirim ke pelanggan.", links.len()),
                        false,
                    );
                } else {
                    self.toast("Link download disalin! Siap dikirim ke pelanggan.", false);
                }
            }
            Err(e) => self.toast(format!("Gagal menyalin link: {}", e), true),
        }
    }

    pub fn copy_one_link(&mut self, url: &str) {
        match system::copy_text(url) {
            Ok(()) => self.toast("Link disalin!", false),
            Err(e) => self.toast(format!("Gagal menyalin link: {}", e), true),
        }
    }

    pub fn open_url(&mut self, url: &str) {
        if let Err(e) = system::open_external(url) {
            self.toast(format!("Gagal membuka link: {}", e), true);
        }
    }

    /// Ekspor gambar thumbnail entri ke lokasi pilihan pengguna.
    pub fn export_thumbnail(&mut self, reference: &str, title: &str) {
        match thumbs::save_thumbnail_as_dialog(reference, title) {
            Ok(Some(_)) => self.toast("Gambar disimpan", false),
            Ok(None) => {}
            Err(e) => self.toast(e, true),
        }
    }

    pub fn toast(&mut self, msg: impl Into<String>, error: bool) {
        self.toast = Some(Toast { msg: msg.into(), error, at: Instant::now() });
    }
}

// ---------------------------------------------------------------------------
// Helper data
// ---------------------------------------------------------------------------

/// Kategori entri (hanya software yang punya).
fn entry_category(e: &EntryRef) -> String {
    match e {
        EntryRef::Software(s) => s.category.trim().to_string(),
        EntryRef::Game(_) => String::new(),
    }
}

/// Salinan nilai form ke field entri game.
fn apply_game_fields(g: &mut Game, input: &FormInput) {
    for (k, v) in &input.values {
        match *k {
            "title" => g.title = v.clone(),
            "genre" => g.genre = v.clone(),
            "price" => g.price = v.clone(),
            _ => {}
        }
    }
    g.thumbnail = input.thumbnail.clone();
    g.links = input.links.clone();
    if !input.steam_app_id.trim().is_empty() {
        g.steam_app_id = input.steam_app_id.trim().to_string();
    }
    g.specs = input.specs.clone();
}

/// Salinan nilai form ke field entri software.
fn apply_software_fields(s: &mut Software, input: &FormInput) {
    for (k, v) in &input.values {
        match *k {
            "title" => s.title = v.clone(),
            "website" => s.website = v.clone(),
            "category" => s.category = v.clone(),
            "version" => s.version = v.clone(),
            "license" => s.license = v.clone(),
            "platform" => s.platform = v.clone(),
            "size" => s.size = v.clone(),
            "price" => s.price = v.clone(),
            _ => {}
        }
    }
    s.thumbnail = input.thumbnail.clone();
    s.links = input.links.clone();
}

/// Daftar entri read-only untuk satu katalog.
pub enum EntryList<'a> {
    Games(&'a [Game]),
    Software(&'a [Software]),
}

impl<'a> EntryList<'a> {
    pub fn len(&self) -> usize {
        match self {
            EntryList::Games(v) => v.len(),
            EntryList::Software(v) => v.len(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn iter(&self) -> Vec<EntryRef<'a>> {
        match self {
            EntryList::Games(v) => v.iter().map(EntryRef::Game).collect(),
            EntryList::Software(v) => v.iter().map(EntryRef::Software).collect(),
        }
    }
}

// ---------------------------------------------------------------------------
// Loop utama egui
// ---------------------------------------------------------------------------

impl eframe::App for SoftGameApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Pintasan global: Escape menutup modal / batalkan pilih, Ctrl+F fokus pencarian.
        let (escape, focus_search) = ctx.input(|i| {
            (
                i.key_pressed(egui::Key::Escape),
                i.modifiers.command && i.key_pressed(egui::Key::F),
            )
        });
        if escape {
            if self.modal.is_some() {
                self.close_modal();
            } else if self.ui().selected_id.is_some() {
                self.ui_mut().selected_id = None;
            }
        }
        if focus_search {
            self.focus_search = true;
        }

        self.reset_stale_category_filter();
        ui::grid::show_top_bar(ctx, self);

        // Modal diambil keluar lebih dulu supaya bisa digambar tanpa meminjam
        // self dua kali; kalau aksi di dalam modal menutupnya (Batal/Simpan/
        // klik di luar) atau membuka modal lain, modal lama tidak dikembalikan.
        self.modal_dismissed = false;
        let mut modal = self.modal.take();
        if modal.is_some() {
            let screen = ctx.screen_rect();
            let resp = egui::Area::new("lapisan-gelap".into())
                .fixed_pos(screen.min)
                .order(egui::Order::Middle)
                .show(ctx, |ui| {
                    let r = ui.allocate_response(screen.size(), egui::Sense::click());
                    ui.painter().rect_filled(screen, 0.0, egui::Color32::from_black_alpha(150));
                    r
                })
                .inner;
            if resp.clicked() {
                modal = None;
            }
        }
        match modal.as_mut() {
            Some(Modal::Form(m)) => ui::form::show_form_modal(ctx, self, m),
            Some(Modal::Import(m)) => ui::import_modal::show_import_modal(ctx, self, m),
            Some(Modal::Confirm { title, message, target }) => {
                let (t, m, tg) = (title.clone(), message.clone(), target.clone());
                self.show_confirm(ctx, t, m, tg);
            }
            None => {
                if self.ui().selected_id.is_some() {
                    ui::detail::show_detail_view(ctx, self);
                } else {
                    ui::grid::show_grid_view(ctx, self);
                }
            }
        }
        if self.modal.is_none() && !self.modal_dismissed {
            self.modal = modal;
        }

        self.show_toast(ctx);
    }
}

impl SoftGameApp {
    /// Modal konfirmasi (mis. sebelum hapus).
    fn show_confirm(
        &mut self,
        ctx: &egui::Context,
        title: String,
        message: String,
        target: Option<(CatalogTab, String)>,
    ) {
        let mut open = true;
        egui::Window::new(title)
            .collapsible(false)
            .resizable(false)
            .open(&mut open)
            .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
            .default_width(440.0)
            .show(ctx, |ui| {
                ui.label(message);
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if ui.button("Batal").clicked() {
                        self.close_modal();
                    }
                    if ui
                        .add(egui::Button::new("Ya, Hapus").fill(egui::Color32::from_rgb(110, 47, 47)))
                        .clicked()
                    {
                        if let Some((tab, id)) = target {
                            self.delete_entry(tab, &id);
                        }
                        self.close_modal();
                    }
                });
            });
        if !open {
            self.close_modal();
        }
    }

    /// Toast bawah-tengah; hilang sendiri setelah jeda singkat.
    fn show_toast(&mut self, ctx: &egui::Context) {
        let toast = match &self.toast {
            Some(t) if t.at.elapsed() < TOAST_DURATION => t.clone(),
            _ => {
                self.toast = None;
                return;
            }
        };
        ctx.request_repaint_after(Duration::from_millis(250));
        let fill = if toast.error {
            egui::Color32::from_rgb(110, 47, 47)
        } else {
            egui::Color32::from_rgb(42, 71, 94)
        };
        egui::Area::new("toast".into())
            .order(egui::Order::Tooltip)
            .anchor(egui::Align2::CENTER_BOTTOM, egui::vec2(0.0, -28.0))
            .show(ctx, |ui| {
                egui::Frame::default()
                    .fill(fill)
                    .inner_margin(egui::Margin::symmetric(14, 9))
                    .corner_radius(4.0)
                    .show(ui, |ui| {
                        ui.label(
                            egui::RichText::new(toast.msg).color(egui::Color32::from_rgb(235, 235, 235)),
                        );
                    });
            });
    }
}
