// ---------------------------------------------------------------------------
// Panel grid katalog (port Toolbar.jsx + LibraryBar.jsx + Grid.jsx +
// Card.jsx + EmptyState.jsx).
//
// show_top_bar: topbar merekat di atas jendela.
// show_grid_view: panel tengah berisi library bar (judul + jumlah + urutkan +
// filter kategori khusus software), keadaan kosong, lalu kartu-katalog.
//
// Catatan interaksi kartu: area klik kartu sengaja didaftarkan SEBELUM tombol
// "Copy Link"/"Hapus" supaya klik pada tombol tidak dianggap klik kartu
// (egui memenangkan widget yang didaftarkan paling akhir saat sudah di posisi
// pointer yang sama).
// ---------------------------------------------------------------------------

use eframe::egui;

use crate::app::SoftGameApp;
use crate::model::CatalogTab;

/// Jarak antar kartu di grid (sama dengan jarak Grid::spacing).
const GRID_SPACING: f32 = 14.0;
/// Margin + garis tepi di sekitar isi kartu (inner_margin 10 + stroke 1).
const CARD_CHROME: f32 = 22.0;
/// Lebar maksimum cover di dalam kartu (rasio ~2.14 seperti versi web).
const COVER_W_MAX: f32 = 230.0;
const COVER_H_MAX: f32 = 108.0;

/// Data kartu yang sudah dimiliki (bukan meminjam app) supaya aksi di dalam
/// kartu bisa memanggil &mut app tanpa konflik pinjam.
struct CardInfo {
    id: String,
    title: String,
    sub: String,
    thumbnail: String,
}

/// Topbar: brand, tab katalog (dengan jumlah entri), kotak pencarian, dan
/// tombol aksi impor/tambah. Tinggi tetap ~56px.
pub fn show_top_bar(ctx: &egui::Context, app: &mut SoftGameApp) {
    egui::TopBottomPanel::top("topbar")
        .frame(
            egui::Frame::default()
                .fill(super::color_bg0())
                .inner_margin(egui::Margin::symmetric(16, 8)),
        )
        .exact_height(56.0)
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                // Brand: "SOFT" terang + "GAME" aksen, tebal, ~20px.
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing = egui::vec2(0.0, 0.0);
                    ui.label(
                        egui::RichText::new("SOFT")
                            .strong()
                            .size(20.0)
                            .color(super::color_text_bright()),
                    );
                    ui.label(
                        egui::RichText::new("GAME")
                            .strong()
                            .size(20.0)
                            .color(super::color_accent()),
                    );
                });

                ui.add_space(16.0);

                // Tab katalog: Game / Software dengan jumlah entri.
                for tab in [CatalogTab::Game, CatalogTab::Software] {
                    let active = app.tab == tab;
                    let n = app.entries(tab).len();
                    let label = format!("{} ({})", tab.noun_cap(), n);
                    let btn = egui::Button::new(
                        egui::RichText::new(label).color(if active {
                            super::color_accent()
                        } else {
                            super::color_text()
                        }),
                    )
                    .fill(if active {
                        super::color_panel_hover()
                    } else {
                        super::color_steam_btn()
                    })
                    .stroke(egui::Stroke::new(
                        1.0f32,
                        if active {
                            super::color_accent()
                        } else {
                            egui::Color32::TRANSPARENT
                        },
                    ));
                    if ui.add(btn).clicked() {
                        app.switch_tab(tab);
                    }
                }

                // Grup kanan: pencarian + aksi.
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.add(super::green_button(app.tab.add_label())).clicked() {
                        app.open_add_form();
                    }
                    ui.add_space(8.0);
                    if ui.add(super::steam_button(app.tab.import_label())).clicked() {
                        app.open_import();
                    }
                    ui.add_space(16.0);

                    // Kotak pencarian (live: tiap ketikan langsung menyaring).
                    let search_id = egui::Id::new("kotak-pencarian");
                    let mut query = app.ui().query.clone();
                    let resp = egui::Frame::default()
                        .fill(super::color_bg2())
                        .inner_margin(egui::Margin::symmetric(10, 6))
                        .corner_radius(4.0)
                        .stroke(egui::Stroke::new(1.0f32, super::color_line()))
                        .show(ui, |ui| {
                            ui.add(
                                egui::TextEdit::singleline(&mut query)
                                    .id(search_id)
                                    .hint_text(app.tab.search_placeholder())
                                    .frame(false)
                                    .desired_width(320.0),
                            )
                        })
                        .inner;
                    if resp.changed() {
                        app.set_query(query);
                    }
                    // Pintasan Ctrl+F dari loop utama: fokuskan lalu konsumsi.
                    if app.focus_search {
                        ui.memory_mut(|m| m.request_focus(search_id));
                        app.focus_search = false;
                    }
                });
            });
        });
}

/// Panel tengah: library bar + keadaan kosong atau kartu-katalog.
pub fn show_grid_view(ctx: &egui::Context, app: &mut SoftGameApp) {
    egui::CentralPanel::default()
        .frame(
            egui::Frame::default()
                .fill(super::color_bg2())
                .inner_margin(egui::Margin::same(16)),
        )
        .show(ctx, |ui| {
            let tab = app.tab;

            // --- library bar: judul + jumlah, urutkan, filter kategori --------
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new(app.view_head())
                        .strong()
                        .size(20.0)
                        .color(super::color_text_bright()),
                );
                ui.add_space(8.0);
                ui.label(
                    egui::RichText::new(app.view_count_label())
                        .small()
                        .color(super::color_muted()),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    // Pilihan urutan (label sesuai katalog aktif).
                    let cur = app.ui().sort.clone();
                    let cur_label = tab
                        .sort_options()
                        .iter()
                        .find(|(v, _)| *v == cur)
                        .map(|(_, l)| *l)
                        .unwrap_or("Terbaru");
                    let mut sel = cur;
                    let combo = egui::ComboBox::from_label("Urutkan").selected_text(cur_label);
                    combo.show_ui(ui, |ui| {
                        for (val, lbl) in tab.sort_options() {
                            if ui
                                .selectable_value(&mut sel, val.to_string(), *lbl)
                                .changed()
                            {
                                app.set_sort(val.to_string());
                            }
                        }
                    });

                    // Filter kategori hanya untuk katalog yang punya kategori.
                    if tab.category_field().is_some() {
                        ui.add_space(8.0);
                        let cats = app.categories();
                        let fc = app.ui().filter_cat.clone();
                        let fc_label = if fc.trim().is_empty() {
                            "(Semua)".to_string()
                        } else {
                            fc.clone()
                        };
                        let mut sel_cat = fc;
                        let combo = egui::ComboBox::from_label("Kategori").selected_text(fc_label);
                        combo.show_ui(ui, |ui| {
                            if ui
                                .selectable_value(&mut sel_cat, String::new(), "(Semua)")
                                .changed()
                            {
                                app.set_filter_cat(String::new());
                            }
                            for c in &cats {
                                if ui
                                    .selectable_value(&mut sel_cat, c.clone(), c.as_str())
                                    .changed()
                                {
                                    app.set_filter_cat(c.clone());
                                }
                            }
                        });
                    }
                });
            });

            ui.add_space(12.0);
            ui.separator();
            ui.add_space(4.0);

            // --- keadaan kosong / tidak ada hasil ----------------------------
            if app.entries(tab).is_empty() {
                empty_catalog(app, ui, tab);
                return;
            }
            let visible = app.visible(tab);
            if visible.is_empty() {
                empty_no_results(app, ui, tab);
                return;
            }

            // --- kartu-katalog -------------------------------------------------
            // Data dipindah ke struktur milik sendiri supaya aksi kartu bisa
            // memakai &mut app (borrow app sudah tidak dipakai setelah ini).
            let cards: Vec<CardInfo> = visible
                .iter()
                .map(|e| CardInfo {
                    id: e.id().to_string(),
                    title: e.title().to_string(),
                    sub: e.sub(),
                    thumbnail: e.thumbnail().to_string(),
                })
                .collect();

            egui::ScrollArea::vertical().show(ui, |ui| {
                let avail = ui.available_width().max(0.0);
                // Kolom dihitung dari lebar yang tersedia (satu kolom ~270px).
                let cols = ((avail / 270.0).floor() as usize).max(1);
                // Lebar satu slot kolom, lalu lebar isi kartu supaya grid
                // mengisi penuh area tanpa meluber ke samping.
                let slot = (avail - (cols as f32 - 1.0) * GRID_SPACING) / cols as f32;
                let card_w = (slot - CARD_CHROME).max(180.0);
                // Cover mengikuti lebar kartu, maksimum 230x108.
                let cover_w = (card_w - 20.0).min(COVER_W_MAX).max(80.0);
                let cover_h = (cover_w * COVER_H_MAX / COVER_W_MAX).max(48.0);
                egui::Grid::new("kartu-katalog")
                    .num_columns(cols)
                    .spacing([GRID_SPACING, GRID_SPACING])
                    .show(ui, |ui| {
                        for card in &cards {
                            let selected = app.ui().selected_id.as_deref() == Some(card.id.as_str());
                            let fill = if selected {
                                super::color_panel_hover()
                            } else {
                                super::color_bg1()
                            };
                    let stroke = egui::Stroke::new(
                        1.0f32,
                        if selected {
                            super::color_accent()
                        } else {
                            super::color_line()
                        },
                    );
                            egui::Frame::default()
                                .fill(fill)
                                .inner_margin(egui::Margin::same(10))
                                .corner_radius(6.0)
                                .stroke(stroke)
                                .show(ui, |ui| {
                                    ui.set_width(card_w);

                                    // Cover.
                                    super::thumb_image(
                                        ui,
                                        ctx,
                                        &mut app.textures,
                                        &card.thumbnail,
                                        egui::vec2(cover_w, cover_h),
                                    );
                                    ui.add_space(6.0);

                                    // Judul + sub-teks.
                                    ui.label(
                                        egui::RichText::new(&card.title)
                                            .strong()
                                            .color(super::color_text_bright()),
                                    );
                                    if !card.sub.is_empty() {
                                        ui.label(
                                            egui::RichText::new(&card.sub)
                                                .small()
                                                .color(super::color_muted()),
                                        );
                                    }
                                    ui.add_space(6.0);

                                    // Area klik kartu (lebar penuh), didaftarkan
                                    // SEBELUM tombol supaya tombol yang menang
                                    // klik saat pointer di atasnya.
                                    let m = ui.min_rect();
                                    let body = egui::Rect::from_min_size(
                                        m.min,
                                        egui::vec2(card_w, m.height()),
                                    );
                                    let card_clicked = ui
                                        .interact(
                                            body,
                                            egui::Id::new(("kartu-katalog", &card.id)),
                                            egui::Sense::click(),
                                        )
                                        .clicked();

                                    // Baris tombol aksi kartu.
                                    let mut copy_clicked = false;
                                    let mut del_clicked = false;
                                    ui.horizontal(|ui| {
                                        if ui
                                            .add(super::ghost_button("Copy Link").small())
                                            .on_hover_text("Salin semua link download")
                                            .clicked()
                                        {
                                            copy_clicked = true;
                                        }
                                        ui.add_space(8.0);
                                        if ui
                                            .add(super::danger_button("Hapus").small())
                                            .on_hover_text("Hapus dari library")
                                            .clicked()
                                        {
                                            del_clicked = true;
                                        }
                                    });

                                    // Aksi hanya jalan kalau tombolnya yang
                                    // diklik; klik polos pada kartu = pilih.
                                    if del_clicked {
                                        app.ask_delete(&card.id);
                                    } else if copy_clicked {
                                        app.copy_entry_links(&card.id);
                                    } else if card_clicked {
                                        if selected {
                                            app.select_id(None);
                                        } else {
                                            app.select_id(Some(card.id.clone()));
                                        }
                                    }
                                });
                            ui.end_row();
                        }
                    });
            });
        });
}

/// Keadaan katalog benar-benar kosong: ajakan tambah entri pertama.
fn empty_catalog(app: &mut SoftGameApp, ui: &mut egui::Ui, tab: CatalogTab) {
    ui.vertical_centered(|ui| {
        ui.add_space(80.0);
        ui.label(
            egui::RichText::new(format!("Katalog {} masih kosong", tab.noun_cap()))
                .strong()
                .size(18.0)
                .color(super::color_text()),
        );
        ui.add_space(8.0);
        ui.label(
            egui::RichText::new(tab.empty_sub())
                .color(super::color_muted()),
        );
        ui.add_space(18.0);
        let label = format!("+ Tambah {} Pertama", tab.noun_cap());
        if ui.add(super::green_button(&label)).clicked() {
            app.open_add_form();
        }
    });
}

/// Tidak ada hasil: pencarian atau filter kategori tidak menemukan apa pun.
fn empty_no_results(app: &mut SoftGameApp, ui: &mut egui::Ui, tab: CatalogTab) {
    let q = app.ui().query.trim().to_string();
    let fc = app.ui().filter_cat.trim().to_string();
    let title = if !q.is_empty() {
        format!("Tidak ada hasil untuk \"{}\"", q)
    } else if !fc.is_empty() {
        format!("Tidak ada hasil untuk kategori \"{}\"", fc)
    } else {
        format!("Tidak ada hasil di katalog {}", tab.noun_cap())
    };
    ui.vertical_centered(|ui| {
        ui.add_space(80.0);
        ui.label(
            egui::RichText::new(title)
                .strong()
                .size(18.0)
                .color(super::color_text()),
        );
        ui.add_space(8.0);
        ui.label(
            egui::RichText::new("Coba kata kunci lain, kosongkan filter, atau periksa ejaan namanya.")
                .color(super::color_muted()),
        );
    });
}
