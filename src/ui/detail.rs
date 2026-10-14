// ---------------------------------------------------------------------------
// Panel detail entri (port DetailPanel.jsx).
//
// Urutan visual mengikuti aslinya: tombol "Kembali" di atas, hero (cover +
// info + mirror download + aksi), lalu panel bawah yang bentuknya berbeda
// antara game (tabel spesifikasi sistem dua kolom) dan software (metadata).
//
// Semua data entri disalin lebih dulu ke nilai milik sendiri supaya aksi
// (salin, buka, edit, hapus) bisa memakai &mut app tanpa konflik pinjam.
// ---------------------------------------------------------------------------

use eframe::egui;

use crate::app::SoftGameApp;
use crate::model::{LinkMirror, SystemSpecs};

/// Halaman detail satu entri; dipanggil loop utama saat ada entri terpilih.
pub fn show_detail_view(ctx: &egui::Context, app: &mut SoftGameApp) {
    egui::CentralPanel::default()
        .frame(
            egui::Frame::default()
                .fill(super::color_bg0())
                .inner_margin(egui::Margin::same(16)),
        )
        .show(ctx, |ui| {
            // Tanpa entri terpilih (mis. baru dihapus): tidak digambar apa pun;
            // loop utama akan kembali ke grid.
            let Some(entry) = app.selected_entry() else {
                return;
            };

            // Salin semua yang dibutuhkan; pinjam entry berakhir di sini.
            let tab = entry.tab();
            let id = entry.id().to_string();
            let title = entry.title().to_string();
            let thumbnail = entry.thumbnail().to_string();
            let chips = entry.chips();
            let links: Vec<LinkMirror> = entry.links();
            let site = entry.website().to_string();
            let specs = entry.specs().cloned();
            let meta_rows = entry.meta_rows();

            egui::ScrollArea::vertical().show(ui, |ui| {
                // --- kembali ke grid -------------------------------------------
                if ui.add(super::ghost_button("Kembali")).clicked() {
                    app.select_id(None);
                }
                ui.add_space(10.0);

                // --- hero: cover + info + aksi ---------------------------------
                super::panel_frame().show(ui, |ui| {
                    ui.horizontal(|ui| {
                        // Cover kiri (maksimum 420x196, rasio dijaga).
                        ui.vertical(|ui| {
                            super::thumb_image(
                                ui,
                                ctx,
                                &mut app.textures,
                                &thumbnail,
                                egui::vec2(420.0, 196.0),
                            );
                        });
                        ui.add_space(16.0);

                        // Kolom info kanan.
                        ui.vertical(|ui| {
                            let avail = ui.available_width();
                            ui.set_width(avail);

                            ui.heading(
                                egui::RichText::new(&title).color(super::color_text_bright()),
                            );
                            ui.add_space(6.0);

                            // Chip metadata (harga pakai gaya aksen).
                            ui.horizontal_wrapped(|ui| {
                                for c in &chips {
                                    super::chip(ui, &c.text, c.accent);
                                }
                            });
                            ui.add_space(12.0);

                            // Panel mirror download.
                            render_mirrors(app, ui, &id, &links);

                            if links.len() > 1 {
                                ui.add_space(8.0);
                                let label = format!("Copy Semua Link ({})", links.len());
                                if ui.add(super::green_button(&label)).clicked() {
                                    app.copy_entry_links(&id);
                                }
                            }

                            // Situs resmi (khusus software).
                            if !site.trim().is_empty() {
                                ui.add_space(10.0);
                                ui.horizontal(|ui| {
                                    ui.label(
                                        egui::RichText::new("Situs resmi")
                                            .color(super::color_muted()),
                                    );
                                    if ui
                                        .link(
                                            egui::RichText::new(&site).color(super::color_accent()),
                                        )
                                        .clicked()
                                    {
                                        app.open_url(&site);
                                    }
                                });
                            }

                            // Baris aksi: simpan gambar, edit, hapus.
                            ui.add_space(12.0);
                            ui.horizontal(|ui| {
                                let can_save = crate::thumbs::is_stored_thumb(&thumbnail);
                                let save = ui
                                    .add_enabled(can_save, super::ghost_button("Simpan Gambar"));
                                let save = if can_save {
                                    save.on_hover_text("Simpan gambar thumbnail ke komputer")
                                } else {
                                    save.on_hover_text("Belum ada gambar tersimpan untuk entri ini")
                                };
                                if save.clicked() {
                                    app.export_thumbnail(&thumbnail, &title);
                                }
                                ui.add_space(8.0);
                                if ui.add(super::ghost_button("Edit")).clicked() {
                                    app.open_edit_form(&id);
                                }
                                ui.add_space(8.0);
                                if ui.add(super::danger_button("Hapus")).clicked() {
                                    app.ask_delete(&id);
                                }
                            });
                        });
                    });
                });

                ui.add_space(16.0);

                // --- panel bawah: spesifikasi game / metadata software ---------
                super::panel_frame().show(ui, |ui| {
                    if tab.has_specs() {
                        ui.label(
                            egui::RichText::new("System Requirements")
                                .strong()
                                .size(16.0)
                                .color(super::color_text_bright()),
                        );
                        ui.add_space(8.0);

                        let specs = specs.unwrap_or_default();
                        let min_rows = spec_rows(&specs.min);
                        let rec_rows = spec_rows(&specs.rec);

                        if min_rows.is_empty() && rec_rows.is_empty() {
                            ui.label(
                                egui::RichText::new(
                                    "Spesifikasi sistem belum diisi untuk game ini. Klik Edit untuk menambahkan.",
                                )
                                .color(super::color_muted()),
                            );
                        } else {
                            ui.horizontal(|ui| {
                                let avail = ui.available_width();
                                let col_w = ((avail - 16.0) / 2.0).max(120.0);
                                spec_column(ui, col_w, "MINIMUM:", &min_rows);
                                ui.add_space(16.0);
                                spec_column(ui, col_w, "RECOMMENDED:", &rec_rows);
                            });
                        }
                    } else {
                        ui.label(
                            egui::RichText::new("Informasi Software")
                                .strong()
                                .size(16.0)
                                .color(super::color_text_bright()),
                        );
                        ui.add_space(8.0);

                        if meta_rows.is_empty() {
                            ui.label(
                                egui::RichText::new(
                                    "Metadata software belum diisi lengkap. Klik Edit untuk menambahkan.",
                                )
                                .color(super::color_muted()),
                            );
                        } else {
                            for row in &meta_rows {
                                ui.horizontal(|ui| {
                                    ui.label(
                                        egui::RichText::new(format!("{}:", row.label))
                                            .color(super::color_muted()),
                                    );
                                    ui.label(
                                        egui::RichText::new(&row.value).color(super::color_text()),
                                    );
                                });
                            }
                        }
                    }
                });
            });
        });
}

/// Panel mirror download: label, daftar baris mirror (copy/buka), dan tombol
/// salin semua kalau mirror lebih dari satu.
fn render_mirrors(app: &mut SoftGameApp, ui: &mut egui::Ui, _id: &str, links: &[LinkMirror]) {
    let head = if links.len() > 1 {
        format!("LINK DOWNLOAD (MIRROR) — {} MIRROR", links.len())
    } else {
        "LINK DOWNLOAD (MIRROR)".to_string()
    };
    ui.label(egui::RichText::new(head).strong().color(super::color_accent()));
    ui.add_space(4.0);

    if links.is_empty() {
        ui.label(egui::RichText::new("— belum ada link —").color(super::color_muted()));
        return;
    }

    for link in links {
        ui.horizontal(|ui| {
            let name = if link.label.trim().is_empty() {
                "Link"
            } else {
                link.label.trim()
            };
            ui.label(egui::RichText::new(name).strong().color(super::color_text()));
            ui.add_space(8.0);

            // URL dipendekkan kalau sangat panjang; teks lengkap muncul saat hover.
            let shown = if link.url.chars().count() > 64 {
                let short: String = link.url.chars().take(64).collect();
                format!("{}...", short)
            } else {
                link.url.clone()
            };
            let url_resp = ui.label(egui::RichText::new(shown).color(super::color_muted()));
            url_resp.on_hover_text(&link.url);
            ui.add_space(8.0);

            if ui.add(super::green_button("Copy").small()).clicked() {
                app.copy_one_link(&link.url);
            }
            ui.add_space(8.0);
            if ui.add(super::ghost_button("Buka").small()).clicked() {
                app.open_url(&link.url);
            }
        });
    }
}

/// Baris spesifikasi yang terisi (label + nilai) untuk satu kolom.
fn spec_rows(spec: &SystemSpecs) -> Vec<(&'static str, &str)> {
    let mut out: Vec<(&'static str, &str)> = Vec::new();
    for &(key, label) in crate::model::SPEC_FIELDS {
        let value: &str = match key {
            "os" => &spec.os,
            "cpu" => &spec.cpu,
            "ram" => &spec.ram,
            "gpu" => &spec.gpu,
            "dx" => &spec.dx,
            "net" => &spec.net,
            "storage" => &spec.storage,
            "sound" => &spec.sound,
            "notes" => &spec.notes,
            _ => continue,
        };
        if !value.trim().is_empty() {
            out.push((label, value));
        }
    }
    out
}

/// Satu kolom spesifikasi (MINIMUM: / RECOMMENDED:) atau penanda "Belum diisi".
fn spec_column(ui: &mut egui::Ui, width: f32, head: &str, rows: &[(&'static str, &str)]) {
    ui.vertical(|ui| {
        ui.set_width(width);
        ui.label(egui::RichText::new(head).strong().color(super::color_accent()));
        ui.add_space(4.0);
        if rows.is_empty() {
            ui.label(egui::RichText::new("Belum diisi").color(super::color_muted()));
            return;
        }
        for (label, value) in rows {
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new(format!("{}:", label)).color(super::color_muted()),
                );
                ui.label(egui::RichText::new(*value).color(super::color_text()));
            });
        }
    });
}
