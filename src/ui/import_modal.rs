// ---------------------------------------------------------------------------
// Modal impor (port ImportModal.jsx): Steam untuk game (dengan pencarian
// judul), halaman resmi untuk software. Semua panggilan jaringan bersifat
// blocking dan dijalankan di thread terpisah; hasilnya dikirim balik lewat
// channel mpsc dan diproses di thread UI. Tidak ada async runtime.
// ---------------------------------------------------------------------------

use std::sync::mpsc::{self, Receiver, TryRecvError};

use eframe::egui;

use crate::app::{FormPrefill, SoftGameApp};
use crate::model::{CatalogTab, SoftwareImportData, SteamImportData};

/// Teks-teks modal per katalog (padanan CATALOGS[tab].import di JS).
#[derive(Clone, Copy)]
struct ImportConf {
    title: &'static str,
    label: &'static str,
    placeholder: &'static str,
    fetch_label: &'static str,
    need_url: &'static str,
    fail_toast: &'static str,
    is_steam: bool,
}

fn import_conf(tab: CatalogTab) -> ImportConf {
    match tab {
        CatalogTab::Game => ImportConf {
            title: "Impor dari Steam",
            label: "Link halaman Steam Store",
            placeholder: "https://store.steampowered.com/app/271590/",
            fetch_label: "Ambil Data Steam",
            need_url: "Masukkan link Steam Store terlebih dahulu.",
            fail_toast: "Gagal mengambil data dari Steam.",
            is_steam: true,
        },
        CatalogTab::Software => ImportConf {
            title: "Impor dari Situs Resmi",
            label: "Link halaman resmi software",
            placeholder: "https://www.example.com/product",
            fetch_label: "Ambil Data",
            need_url: "Masukkan link halaman software terlebih dahulu.",
            fail_toast: "Gagal mengambil data dari situs.",
            is_steam: false,
        },
    }
}

/// Hasil kerja thread jaringan.
enum JobDone {
    Search(Vec<crate::steam::SteamSearchItem>),
    Steam(Option<SteamImportData>),
    Site(Option<SoftwareImportData>),
}

/// State modal impor.
pub struct ImportModal {
    pub tab: CatalogTab,
    pub url: String,
    pub results: Vec<crate::steam::SteamSearchItem>,
    pub status: String,
    pub busy: bool,
    /// Penerima hasil thread jaringan (None kalau tidak sedang bekerja).
    rx: Option<Receiver<JobDone>>,
    /// Fokus otomatis ke kotak URL saat modal baru dibuka.
    focus_url: bool,
}

impl ImportModal {
    pub fn new(tab: CatalogTab) -> Self {
        Self {
            tab,
            url: String::new(),
            results: Vec::new(),
            status: String::new(),
            busy: false,
            rx: None,
            focus_url: true,
        }
    }
}

/// Gambar modal impor; dipanggil dari loop utama aplikasi.
pub fn show_import_modal(ctx: &egui::Context, app: &mut SoftGameApp, modal: &mut ImportModal) {
    let conf = import_conf(modal.tab);

    // Ambil hasil thread jaringan kalau sudah ada.
    let mut disconnected = false;
    let mut msg = None;
    if let Some(rx) = modal.rx.as_ref() {
        match rx.try_recv() {
            Ok(m) => msg = Some(m),
            Err(TryRecvError::Empty) => {}
            Err(TryRecvError::Disconnected) => disconnected = true,
        }
    }
    if disconnected {
        // Thread mati tanpa kirim hasil: anggap gagal, jangan busy selamanya.
        modal.rx = None;
        modal.busy = false;
        modal.status = conf.fail_toast.to_string();
    } else if let Some(m) = msg {
        modal.rx = None;
        handle_job(app, modal, conf, m);
    }
    if modal.rx.is_some() {
        // Selama menunggu thread, UI digambar ulang terus (label "Mengambil...").
        ctx.request_repaint();
    }

    egui::Window::new(conf.title)
        .collapsible(false)
        .resizable(false)
        .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
        .default_width(520.0)
        .show(ctx, |ui| {
            ui.label(conf.label);

            let mut focus_now = false;
            if modal.focus_url {
                modal.focus_url = false;
                focus_now = true;
            }
            let resp = ui.add(
                egui::TextEdit::singleline(&mut modal.url)
                    .id(egui::Id::new("import-url"))
                    .hint_text(conf.placeholder)
                    .desired_width(ui.available_width()),
            );
            if focus_now {
                resp.request_focus();
            }
            // Enter di kotak URL menjalankan aksi ambil data.
            if (resp.has_focus() || resp.lost_focus())
                && ctx.input(|i| i.key_pressed(egui::Key::Enter))
            {
                fetch_import(modal, conf);
            }

            // Petunjuk + tombol Cari hanya relevan untuk Steam.
            if conf.is_steam {
                ui.add_space(4.0);
                ui.label(
                    egui::RichText::new(
                        "Tempel link Steam Store, atau ketik nama game lalu tekan Cari untuk menemukan judul yang baru rilis.",
                    )
                    .small()
                    .color(super::color_muted()),
                );
            }

            // Hasil pencarian Steam (tanpa gambar: judul + AppID + harga).
            if !modal.results.is_empty() {
                ui.add_space(6.0);
                let mut import_url: Option<String> = None;
                egui::ScrollArea::vertical()
                    .max_height(280.0)
                    .show(ui, |ui| {
                        for item in &modal.results {
                            let frame = egui::Frame::default()
                                .fill(super::color_bg2())
                                .inner_margin(egui::Margin::symmetric(8, 6))
                                .corner_radius(4.0)
                                .stroke(egui::Stroke::new(1.0f32, super::color_line()))
                                .show(ui, |ui| {
                                    ui.set_width(ui.available_width());
                                    ui.horizontal(|ui| {
                                        ui.vertical(|ui| {
                                            ui.label(
                                                egui::RichText::new(&item.title)
                                                    .strong()
                                                    .color(super::color_text_bright()),
                                            );
                                            ui.label(
                                                egui::RichText::new(format!(
                                                    "AppID {}",
                                                    item.app_id
                                                ))
                                                .small()
                                                .color(super::color_muted()),
                                            );
                                        });
                                        if !item.price.trim().is_empty() {
                                            ui.with_layout(
                                                egui::Layout::right_to_left(egui::Align::Center),
                                                |ui| {
                                                    ui.label(
                                                        egui::RichText::new(&item.price)
                                                            .color(super::color_accent()),
                                                    );
                                                },
                                            );
                                        }
                                    });
                                });
                            let resp = frame
                                .response
                                .interact(egui::Sense::click())
                                .on_hover_cursor(egui::CursorIcon::PointingHand);
                            if resp.hovered() {
                                ui.painter().rect_stroke(
                                    resp.rect,
                                    4.0,
                                    egui::Stroke::new(1.0f32, super::color_accent()),
                                    egui::StrokeKind::Inside,
                                );
                            }
                            if resp.clicked() {
                                // Klik hasil = impor lewat URL store app id.
                                import_url = Some(format!(
                                    "https://store.steampowered.com/app/{}/",
                                    item.app_id
                                ));
                            }
                        }
                    });
                if let Some(url) = import_url {
                    run_import(modal, url);
                }
            }

            if !modal.status.is_empty() {
                ui.add_space(4.0);
                ui.label(
                    egui::RichText::new(&modal.status)
                        .color(egui::Color32::from_rgb(0xe0, 0x8a, 0x8a)),
                );
            }

            ui.add_space(6.0);
            ui.separator();
            ui.horizontal(|ui| {
                if conf.is_steam {
                    let label = if modal.busy { "Mencari..." } else { "Cari" };
                    if ui
                        .add_enabled(!modal.busy, super::ghost_button(label))
                        .clicked()
                    {
                        run_search(modal);
                    }
                }
                if ui.add(super::ghost_button("Batal")).clicked() {
                    app.close_modal();
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let label = if modal.busy { "Mengambil..." } else { conf.fetch_label };
                    if ui
                        .add_enabled(!modal.busy, super::green_button(label))
                        .clicked()
                    {
                        fetch_import(modal, conf);
                    }
                });
            });
        });
}

/// Aksi tombol ambil data (dan Enter di kotak URL).
fn fetch_import(modal: &mut ImportModal, conf: ImportConf) {
    let value = modal.url.trim().to_string();
    if value.is_empty() {
        modal.status = conf.need_url.to_string();
        return;
    }
    // Input yang bukan link (mis. nama game) diarahkan ke pencarian Steam,
    // bukan error "link tidak dikenali".
    let lower = value.to_ascii_lowercase();
    let looks_like_url = lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.contains("steampowered.com");
    if !looks_like_url && conf.is_steam {
        run_search(modal);
        return;
    }
    run_import(modal, value);
}

/// Pencarian judul di Steam (khusus katalog game).
fn run_search(modal: &mut ImportModal) {
    let term = modal.url.trim().to_string();
    if term.is_empty() {
        modal.status = "Ketik nama game dulu untuk dicari.".to_string();
        return;
    }
    modal.results.clear();
    modal.status = String::new();
    modal.busy = true;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let items = crate::steam::steam_search(&term);
        let _ = tx.send(JobDone::Search(items));
    });
    modal.rx = Some(rx);
}

/// Impor detail dari URL (Steam store atau halaman situs resmi).
fn run_import(modal: &mut ImportModal, url: String) {
    modal.status = String::new();
    modal.busy = true;
    let tab = modal.tab;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || match tab {
        CatalogTab::Game => {
            let data = crate::steam::steam_import(&url);
            let _ = tx.send(JobDone::Steam(data));
        }
        CatalogTab::Software => {
            let data = crate::website::import_software(&url);
            let _ = tx.send(JobDone::Site(data));
        }
    });
    modal.rx = Some(rx);
}

/// Proses hasil thread jaringan.
fn handle_job(app: &mut SoftGameApp, modal: &mut ImportModal, conf: ImportConf, msg: JobDone) {
    modal.busy = false;
    match msg {
        JobDone::Search(items) => {
            modal.results = items;
            if modal.results.is_empty() {
                modal.status = "Tidak ada hasil. Coba kata kunci lain.".to_string();
            } else {
                modal.status = String::new();
            }
        }
        JobDone::Steam(data) => match data {
            Some(d) => {
                let tab = modal.tab;
                app.open_prefill_form(tab, FormPrefill::Steam(d));
                app.toast("Data terisi otomatis — tinggal isi link download", false);
            }
            None => modal.status = conf.fail_toast.to_string(),
        },
        JobDone::Site(data) => match data {
            Some(d) => {
                let tab = modal.tab;
                app.open_prefill_form(tab, FormPrefill::Site(d));
                app.toast("Data terisi otomatis — tinggal isi link download", false);
            }
            None => modal.status = conf.fail_toast.to_string(),
        },
    }
}
