# MEMORY.md — SoftGame Library (Dokumen Handoff)

> Dokumen ini dibuat agar AI/manusia lain bisa langsung melanjutkan pengerjaan proyek tanpa
> membaca seluruh riwayat percakapan. Terakhir diupdate: 14 Oktober 2026 (rombakan penuh ke Rust).

---

## 1. Konteks Bisnis

Pemilik (Daffa) menjual **game digital** (installer game). File disimpan di **beberapa layanan
berbeda** — Gofile, PixelDrain, Google Drive, dan sejenisnya — jadi satu judul biasanya punya
beberapa link mirror. Aplikasi ini adalah **katalog internal toko** di PC-nya: saat pelanggan
order, ia buka app → cari judul → cek spesifikasi pelanggan → **Copy Link** (satu mirror, atau
semuanya sekaligus) → kirim ke pelanggan.

- Bahasa UI: **Indonesia** (label spek teknis tetap Inggris: OS, Processor, dst.)
- Desain: **layout grid gaya Epic Games, tema visual Steam** (biru gelap `#1b2838`, aksen `#66c0f4`),
  dirender ulang via egui (tema & util bersama di `src/ui/mod.rs`)
- Pemakai akhir cuma 1 orang (pemilik toko) — tidak ada auth/multi-user

## 2. Tech Stack

| Komponen | Teknologi |
|---|---|
| Bahasa | **Rust (edisi 2021)** — satu binary native Windows, tanpa Node/Electron/webview |
| GUI | **eframe 0.31 / egui 0.31** (immediate-mode, winit + OpenGL) |
| HTTP | reqwest 0.12 (blocking + native-tls) — Steam Store API, scraper OpenGraph |
| Dialog & sistem | rfd (dialog native), open (browser luar), arboard (clipboard) |
| Gambar | image 0.25 (decode/encode thumbnail) |
| Lain-lain | serde/serde_json, uuid v4, regex, chrono |
| Penyimpanan | JSON di AppData: `%APPDATA%\softgame-library\library.json` |

> **Riwayat:** proyek ini lahir sebagai Electron vanilla, lalu dimigrasi ke **Wails v2 (Go +
> WebView2)**, lalu ke **Electron + React**, dan pada **14 Okt 2026** dirombak penuh ke
> **Rust native (egui/eframe)**. Kode Go terakhir tersimpan di tag Git **`wails-go-final`**,
> kode Electron terakhir di tag **`electron-final`** — jangan sarankan kembali ke Go/Wails
> tanpa diminta, dan jangan pakai/sarankan Bun (dilarang user sejak 4 Okt 2026). Tidak ada
> lagi npm/Node di proyek ini; semua perintah lewat cargo.

Perintah:
```bash
cargo check                # wajib 0 error 0 warning sebelum lapor selesai
cargo build                # debug -> target/debug/softgame-library.exe
cargo build --release      # rilis -> target/release/softgame-library.exe
cargo run                  # jalankan dari sumber
```

`SOFTGAME_DATA_DIR` mengarahkan folder data ke lokasi lain (uji/otomasi saja).

**Installer Windows** (Inno Setup 6, per-user tanpa admin) — script di
`installer/softgame.iss`, build dengan `ISCC.exe installer\softgame.iss` →
`installer/output/SoftGameLibrary-Setup-3.0.0.exe` (± 8,7 MB). Versi 14 Okt 2026:
app Rust sudah dipasang via installer ini (Start Menu + Add/Remove Programs) dan
versi Electron lama (`C:\Program Files\SoftGame Library`) sudah di-uninstall.

## 3. Struktur Proyek

```
SoftGame/
├── Cargo.toml, Cargo.lock  # Metadata + dependensi Rust (package: softgame-library)
├── src/
│   ├── main.rs             # Entry point: jendela eframe + ikon (cari build/windows/icon.ico
│   │                       #   lalu assets/icon.ico, juga relatif dari folder exe)
│   ├── app.rs              # SoftGameApp: state, aksi katalog/link/thumbnail, loop egui,
│   │                       #   orkestrasi modal (hati-hati bug "modal hidup lagi")
│   ├── model.rs            # Tipe data + serde (hanya rename steamAppId; camelCase lain
│   │                       #   dinormalkan di store.rs)
│   ├── text.rs             # Pemotongan UTF-8 aman-rune (dipakai links & sanitize)
│   ├── paths.rs            # Lokasi folder data + allow-list ekstensi thumbnail
│   ├── store.rs            # Load/save katalog: tulis atomik, karantina, normalisasi,
│   │                       #   purge entri bawaan sekali jalan
│   ├── links.rs            # Normalisasi daftar mirror + tebak nama layanan
│   ├── sanitize.rs         # Pembersihan field + batas panjang + UUID v4
│   ├── thumbs.rs           # Gerbang keamanan path, dialog native, baca/tulis/hapus thumbnail
│   ├── migrate.rs          # Penyerapan katalog aplikasi lama
│   ├── system.rs           # OpenExternal & clipboard
│   ├── steam.rs            # Steam Store API (storesearch + appdetails) + unduh header
│   ├── website.rs          # Impor software dari situs vendor (OpenGraph)
│   └── ui/
│       ├── mod.rs          # Tema Steam gelap + util bersama (chip, tombol, thumbnail)
│       ├── grid.rs         # Topbar (brand, tab, pencarian) + grid kartu + keadaan kosong
│       ├── detail.rs       # Panel hero: cover, mirror, spesifikasi/metadata
│       ├── form.rs         # Modal tambah/edit + editor link + editor spesifikasi
│       └── import_modal.rs # Modal impor Steam/situs + pencarian Steam
├── build/windows/icon.ico  # Ikon jendela (dipakai main.rs, fallback assets/icon.ico)
├── build/appicon.png       # Ikon sumber (tidak dipakai runtime)
├── installer/              # Script Inno Setup + ikon installer (output/ gitignored)
├── assets/                 # icon.svg/ico/png, logo.svg (aset sumber)
└── logo-output/            # contoh hasil skill logo (tidak dipakai runtime)
```

Sisa `node_modules/` dan `build/bin/` dari era Electron sudah dihapus dari disk pada
14 Okt 2026 (keduanya gitignored, tidak ada di repo).

## 4. Data & Penyimpanan

- **File data**: `%APPDATA%\softgame-library\library.json` → `{ "games": [...], "software": [...] }`
- **Thumbnail lokal**: `%APPDATA%\softgame-library\thumbnails\`
- **Karantina file rusak**: `library.json.rusak-<timestamp>`

Path ini **sengaja identik dengan versi Go/Electron**, sehingga data lama langsung terbaca.
Jangan diubah.

Referensi thumbnail di data selalu berbentuk `/thumbnails/<file>`. Skema lama `glib://thumb/<file>`
dan `slib://thumb/<file>` dinormalisasi otomatis saat load (store.rs) menjadi `/thumbnails/<file>`,
dan **wajib lewat `safe_thumb_path`** di `thumbs.rs` setiap kali file dibaca/ditulis.

### Skema objek game
```jsonc
{
  "id": "uuid",
  "title": "string (wajib)",
  "thumbnail": "/thumbnails/xxx.jpg | https://... | ''",
  "links": [                                  // banyak mirror (Gofile, PixelDrain, ...)
    { "label": "Gofile",     "url": "https://gofile.io/d/xxxx" },
    { "label": "PixelDrain", "url": "https://pixeldrain.com/u/yyyy" }
  ],
  "link": "mirror pertama — dipertahankan untuk kompatibilitas file lama",
  "genre": "string",
  "size": "mis. 90 GB", "price": "mis. Rp 25.000",
  "steamAppId": "string, hasil impor Steam (bisa '')",
  "specs": {
    "min": { "os","cpu","ram","gpu","dx","net","storage","sound","notes" },
    "rec": { ...sama... }
  },
  "createdAt": "ISO", "updatedAt": "ISO"
}
```

Skema objek software sama tanpa `specs` dan `steamAppId`, tetapi punya `website`, `category`,
`version`, `license`, `platform`.

**Kompatibilitas link**: file lama yang hanya punya `link` (string) tetap terbaca — `links.rs`
menurunkannya menjadi `links` berisi satu mirror saat load, dan `link` selalu disinkronkan
ke mirror pertama saat simpan. Batas: 20 mirror/entri, hanya http/https, duplikat (case-insensitive)
dibuang, label kosong diisi otomatis dari nama layanan.

Field form (perbedaan field game vs software) didefinisikan di `src/ui/form.rs` — **sinkronkan**
bila menambah field baru.

## 5. Katalog Kosong (per 7 Okt 2026, masih berlaku)

Aplikasi **mulai dengan katalog kosong** — katalog bawaan 60 game, `seedcovers/`, `seed.js`, dan
data contoh sudah **dihapus atas permintaan user**. Jangan menambahkan kembali data bawaan apa pun
tanpa diminta eksplisit.

- `bootstrap_library()` (`migrate.rs`) hanya menyerap data dari folder aplikasi lama
  (`libray-game`, `software-library`); kalau tidak ada, kedua katalog dikembalikan kosong.
- Saat pertama dibuka, `library.json` langsung ditulis berisi `{"games":[],"software":[]}`.
- **Pembersihan sekali jalan**: `purge_legacy_seed_entries()` di `store.rs` membuang entri dengan id
  berawalan `builtin-` atau `sample-` yang terlanjur tersimpan di mesin yang pernah menjalankan
  versi lama, lalu menulis ulang file. Entri pengguna (UUID) tidak pernah disentuh.
- Sisa file `sample-*.svg` di `%APPDATA%\softgame-library\thumbnails\` dari versi lama boleh
  dibiarkan (tidak ada entri yang menunjuk ke sana) atau dihapus manual.

## 6. Gerbang Keamanan (load-bearing — jangan dilonggarkan)

1. **`safe_thumb_path`** di `thumbs.rs` adalah **satu-satunya** jalur ke file thumbnail —
   dipakai untuk menyajikan, mengekspor, dan menghapus. Menolak pemisah path, `..`, nama
   berawalan titik, path absolut, karakter `:`, dan ekstensi di luar allow-list.
2. **Allow-list ekstensi** gambar (`paths.rs`) untuk semua file yang masuk folder thumbnails.
3. **https-only + allow-list host** untuk unduhan gambar Steam (`steampowered.com`,
   `steamstatic.com`, `steamcommunity.com`) dan situs vendor; batas 25 MiB.
4. **URL eksternal hanya http/https** dengan host (`system.rs`).
5. **Sanitasi** semua field sebelum ditulis (`sanitize.rs`), pemotongan aman-rune (`text.rs`).
6. **Batas ukuran**: thumbnail maks 25 MiB, `library.json` maks 64 MiB, maks 20 mirror/entri.

## 7. Fitur yang Sudah Jadi

1. Grid library kartu rasio 460/215 dengan tema Steam (rata rapi via egui).
2. Overlay kartu saat hover/selected: **Copy Link** (menyalin **semua** mirror, satu URL per
   baris) dan **Hapus** (modal konfirmasi).
3. Pencarian instan (judul, genre, **semua URL+label mirror**; untuk software juga
   website/kategori/versi/lisensi/platform), sort Terbaru/A–Z/Z–A/kategori, counter jumlah per tab.
4. Form tambah/edit dengan field berbeda untuk game (blok spek + impor Steam) dan software
   (tanpa spek). Thumbnail via dialog native. **Editor link mirror**: baris label+URL bisa
   ditambah/dihapus bebas, label ditebak otomatis, duplikat ditandai.
5. Halaman detail gaya Steam Store: hero blur, chip genre/ukuran/harga, **daftar mirror** dengan
   tombol Copy/Buka per link + "Copy Semua Link (n)", tombol Save/Edit/Hapus, tabel System
   Requirements MINIMUM/RECOMMENDED.
6. **Impor Steam**: tempel link `https://store.steampowered.com/app/<appid>/` → judul, developer,
   tanggal rilis, genre, harga, spek min/rec, dan cover terisi otomatis.
7. **Pencarian Steam** di dalam modal impor (hasil bisa langsung diklik).
8. **Impor software** dari situs resmi vendor (OpenGraph).
9. Keyboard: `Ctrl+F` fokus cari, `Esc` tutup modal/detail, `Enter` simpan.
10. Notifikasi toast singkat untuk tiap aksi.

## 8. Verifikasi

```bash
cargo check     # 0 error 0 warning
cargo build     # binary debug
```

**Belum ada tes runtime** (per 14 Okt 2026, user minta fokus tulis kode dulu, testing menyusul):
menjalankan UI, impor Steam, dan dialog native **belum pernah dijalankan**. Untuk uji terbatas
tanpa menyentuh data asli, set `SOFTGAME_DATA_DIR` ke folder sementara sebelum `cargo run`.

## 9. GitHub

- Repo: **https://github.com/daffa-789/game-library** (public, akun `daffa-789`)
- Branch utama: `main`. Remote `origin` sudah terpasang; kredensial tersimpan di Windows
  Credential Manager sehingga push langsung jalan. Tidak ada `gh` CLI.
- Tag penting: **`wails-go-final`** = versi Go terakhir, **`electron-final`** = versi
  Electron terakhir.
- `.gitignore`: `node_modules/`, `dist/`, `build/bin/`, `target/`, `*.log`, `.workbuddy-ai/`.

## 10. Konvensi & Selera User (penting!)

- Semua teks UI bahasa Indonesia; toast singkat & ramah (contoh: "Link download disalin! Siap
  dikirim ke pelanggan.")
- Komentar kode berbahasa Indonesia, menjelaskan *maksud*, bukan menarasikan kode.
- User suka konfirmasi visual (toast) untuk semua aksi.
- **User tidak ingin fitur backup/restore** (sudah dihapus atas permintaan) — jangan ditambah lagi.
- Hapus entri selalu lewat modal konfirmasi.
- User lebih percaya hasil yang **dibuktikan empiris** (dijalankan & diukur) daripada klaim dokumentasi.
- Perubahan besar tanyakan dulu; perubahan kecil langsung kerjakan lalu laporkan.

## 11. Aset Pendukung (di luar repo)

- **Skill logo "logo-toko-digital"** di `C:\Users\Daffa\.agents\skills\logo-toko-digital\` —
  generate 4 gaya logo (appicon/badge/wordmark/banner) × 6 palet (steam, neon, gamer, sunset, gold,
  merah) → SVG + PNG + `preview.html`.
- Contoh hasil untuk "Daffa Game Store" ada di `logo-output/`.

## 12. Jebakan yang Sudah Terkonfirmasi

1. **egui 0.31.1**: `Margin` ctor pakai **i8** (pakai `MarginF` kalau mau float);
   `Painter::rect_stroke` butuh **4 argumen** (StrokeKind); `Align2::CENTER_CENTER`;
   `.rounding(x)` sudah diganti `.corner_radius(x)`.
2. **Modal "hidup lagi"**: modal bisa muncul kembali setelah `close_modal()` dipanggil dari dalam
   modal — pakai penanda `modal_dismissed` di `SoftGameApp` (`app.rs`).
3. **Kompatibilitas camelCase**: `model.rs` hanya rename `steamAppId`; createdAt/updatedAt dan
   field camelCase lain dinormalkan di `store.rs` lewat manipulasi `serde_json::Value`
   (buang key snake_case). `link` tunggal lama diturunkan jadi `links` saat load;
   `glib://thumb/` & `slib://thumb/` → `/thumbnails/`.
4. **Ikon jendela**: `main.rs` mencari `build/windows/icon.ico` (folder kerjanya + relatif dari
   folder exe) dengan fallback `assets/icon.ico`. Jangan hapus kedua file itu.
5. **Debug build besar**: `target/debug/softgame-library.exe` ± 261 MB — normal untuk eframe debug.
