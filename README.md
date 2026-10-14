# SoftGame Library

Aplikasi katalog digital portabel untuk game dan software, dibangun dengan **Rust + egui/eframe** (GUI native, tanpa Electron dan tanpa Node.js).

SoftGame Library memungkinkan pengelolaan katalog game dan software, melihat spesifikasi sistem,
mengimpor metadata langsung dari Steam Store API, mengelola thumbnail secara lokal, dan membagikan
link unduhan (beberapa mirror: Gofile, PixelDrain, Google Drive, dan sejenisnya) dengan cepat.

Katalog dimulai **kosong** — tidak ada game bawaan maupun data contoh. Semua isi berasal dari input
pengguna (manual atau hasil impor).

> **Catatan migrasi:** versi terakhir sebelum ini dibangun dengan Electron + React (lihat tag
> `electron-final`), dan sebelum itu dengan Wails (Go, tag `wails-go-final`). Seluruh kode lama
> sudah dihapus dan digantikan oleh proyek Rust murni ini. Data di
> `%APPDATA%\softgame-library` tetap kompatibel dua arah — aplikasi Rust membaca dan menulis
> `library.json` dengan format yang persis sama.

---

## Arsitektur & Teknologi

- **Rust (edisi 2021)**, GUI langsung dengan **eframe 0.31 / egui 0.31** (immediate-mode native,
  OpenGL/winit) — satu binary, tanpa webview, tanpa runtime JavaScript.
- **Backend** (modul Rust di `src/`):
  - Persistensi JSON dengan tulis atomik (`.tmp` + rename) dan karantina file rusak
    (`library.json.rusak-<timestamp>`).
  - `library.json` tetap memakai field camelCase (createdAt/updatedAt/steamAppId) supaya
    identik dengan versi Go/Electron.
  - Klien Steam Store API (storesearch + appdetails) tanpa API key, lengkap dengan parsing
    `pc_requirements` menjadi spesifikasi minimum/rekomendasi.
  - Scraper OpenGraph untuk impor software dari situs resmi vendor.
  - Penyerapan katalog aplikasi lama (`%APPDATA%\libray-game`, `%APPDATA%\software-library`)
    saat folder data pertama kali dibuat.
- **Keamanan tetap load-bearing** (port dari versi Electron):
  - Semua akses thumbnail lewat satu gerbang `safe_thumb_path` (nama file polos saja, tanpa
    traversal, ekstensi gambar dari allow-list, path wajib tetap di dalam folder data).
  - Link & URL eksternal hanya http/https; unduhan hanya dari host Valve yang dipercaya.
  - Thumbnail maksimal 25 MiB, library.json maksimal 64 MiB, maksimal 20 mirror per entri.
- **Katalog mulai kosong**: entri lama ber-id `builtin-*` / `sample-*` (buatan versi sebelumnya)
  dibersihkan sekali jalan saat data dibuka.

---

## Fitur Utama

1. **Link unduhan banyak mirror**
   - Satu entri bisa punya banyak link karena file disimpan di layanan berbeda
     (Gofile, PixelDrain, Google Drive, MEGA, MediaFire, OneDrive, TeraBox, dst).
   - Menambah, mengubah, dan menghapus baris link langsung dari form entri.
   - Label layanan dikenali otomatis dari URL bila dibiarkan kosong.
   - Halaman detail menampilkan tiap mirror dengan tombol Copy/Buka sendiri, plus
     "Copy Semua Link" untuk menyalin semuanya sekaligus (satu URL per baris).

2. **Impor otomatis dari Steam Store**
   - Tempel link Steam apa pun (mis. `https://store.steampowered.com/app/271590/`), atau
     ketik nama game lalu tekan Cari untuk menemukan judul yang baru rilis.
   - Mengambil judul, genre, harga, dan spesifikasi sistem minimum/rekomendasi.
   - Mengunduh dan menyimpan gambar header Steam sebagai thumbnail lokal.

3. **Impor software dari situs resmi**
   - Tempel URL halaman produk; metadata publik (OpenGraph) dipakai sebagai prefill:
     nama, kategori, versi, lisensi, platform, dan ikon situs.

4. **Manajemen katalog (CRUD)**
   - Tambah, ubah, dan hapus entri game maupun software.
   - Pencarian langsung (Ctrl+F) dan pengurutan (Terbaru, A-Z, Z-A, kategori).
   - Filter kategori untuk tab Software, dibangun dari data yang benar-benar ada.

5. **Manajemen thumbnail lokal**
   - Dialog native Windows untuk PNG, JPG, JPEG, WEBP, GIF, SVG, BMP, dan ICO.
   - Nama file acak (hex) di folder data, dengan proteksi path traversal.
   - Thumbnail lama dibersihkan saat diganti atau entri dihapus.

6. **Berbagi & integrasi sistem**
   - Salin semua link mirror (atau satu link tertentu) ke clipboard dengan notifikasi toast.
   - Buka link di browser default (hanya skema http/https yang diizinkan).

---

## Kebutuhan Sistem

- **OS**: Windows 10 / 11 (64-bit)
- **Pengembangan**: Rust toolchain (cargo) — sudah teruji dengan cargo 1.99

---

## Lokasi Data

- **Database**: `%APPDATA%\softgame-library\library.json`
- **Thumbnail**: `%APPDATA%\softgame-library\thumbnails\`

Path ini sengaja dipertahankan sama persis dengan versi Go/Electron, sehingga data lama langsung
terbaca. Variabel lingkungan `SOFTGAME_DATA_DIR` dapat mengarahkan folder data ke lokasi lain
(hanya untuk pengujian/otomasi).

---

## Perintah

```bash
cargo check      # pemeriksaan cepat (compile tanpa linking)
cargo build      # build debug -> target/debug/softgame-library.exe
cargo build --release  # build rilis -> target/release/softgame-library.exe
cargo run        # jalankan langsung dari sumber
```

Nama binary: `softgame-library` (dapat diubah di `Cargo.toml`).

---

## Struktur Proyek

```
SoftGame/
├── Cargo.toml                # Metadata + dependensi Rust
├── build/windows/icon.ico    # Ikon jendela (dipakai main.rs, fallback assets/icon.ico)
├── src/
│   ├── main.rs               # Entry point: jendela eframe + ikon
│   ├── app.rs                # SoftGameApp: state, aksi katalog/link/thumbnail, loop egui
│   ├── model.rs              # Tipe data + serde (kompatibel library.json lama)
│   ├── text.rs               # Pemotongan UTF-8 aman-rune
│   ├── paths.rs              # Lokasi folder data + allow-list ekstensi
│   ├── store.rs              # Load/save katalog: tulis atomik, karantina, normalisasi
│   ├── links.rs              # Normalisasi daftar mirror + tebak nama layanan
│   ├── sanitize.rs           # Pembersihan field + batas panjang + UUID v4
│   ├── thumbs.rs             # Gerbang keamanan path, dialog native, baca/tulis/hapus
│   ├── migrate.rs            # Penyerapan katalog aplikasi lama
│   ├── system.rs             # OpenExternal & clipboard
│   ├── steam.rs              # Steam Store API + unduh gambar header
│   ├── website.rs            # Impor software dari situs vendor (OpenGraph)
│   └── ui/
│       ├── mod.rs            # Tema Steam gelap + util bersama (chip, tombol, thumbnail)
│       ├── grid.rs           # Topbar (brand, tab, pencarian) + grid kartu + keadaan kosong
│       ├── detail.rs         # Panel hero: cover, mirror, spesifikasi/metadata
│       ├── form.rs           # Modal tambah/edit + editor link + editor spesifikasi
│       └── import_modal.rs   # Modal impor Steam/situs + pencarian Steam
├── assets/, logo-output/     # Aset sumber & logo
└── build/bin/                # Artefak installer lama (Electron era, abaikan)
```

---

## Lisensi

MIT License © 2026 Daffa.
