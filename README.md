# SoftGame Library

Aplikasi katalog digital portabel untuk game dan software, dibangun dengan **Electron + React (JSX)**.

SoftGame Library memungkinkan pengelolaan katalog game dan software, melihat spesifikasi sistem,
mengimpor metadata langsung dari Steam Store API, mengelola thumbnail secara lokal, dan membagikan
link unduhan (beberapa mirror: Gofile, PixelDrain, Google Drive, dan sejenisnya) dengan cepat.

Katalog dimulai **kosong** — tidak ada game bawaan maupun data contoh. Semua isi berasal dari input
pengguna (manual atau hasil impor).

> **Catatan migrasi:** versi sebelumnya dibangun dengan Wails (Go + WebView2) dan frontend vanilla JS.
> Seluruh kode Go sudah dihapus dan digantikan oleh proses utama Electron + renderer React.
> Versi Go terakhir tetap tersimpan di riwayat Git pada tag `wails-go-final`.

---

## Arsitektur & Teknologi

- **Runtime & package manager**: **Node.js 18+** dengan **npm** (proses utama berjalan di Node bawaan Electron)
- **Shell desktop**: **Electron 33**
  - Satu instance saja (`requestSingleInstanceLock`); instance kedua memunculkan jendela yang sudah ada.
  - Jendela disesuaikan dengan work area layar supaya title bar tidak pernah keluar layar.
  - Protokol kustom `thumb://` menyajikan thumbnail dari folder data, dengan gerbang keamanan yang sama
    seperti operasi baca/tulis/hapus.
  - Isolasi renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
    Renderer hanya melihat `window.softgame` dari preload.
- **Backend**: JavaScript ESM di `electron/`
  - Persistensi JSON dengan tulis atomik (`.tmp` + rename) dan karantina file rusak.
  - Cache parse di memori ber-key fingerprint (mtime + size).
  - Mutex berbasis rantai promise supaya panggilan IPC yang bersamaan tidak saling menyisip.
  - Klien Steam Store API (storesearch + appdetails) tanpa API key, lengkap dengan parsing
    `pc_requirements` menjadi spesifikasi min/rec.
  - Scraper OpenGraph untuk impor software dari situs resmi vendor.
- **Frontend**: **React 18** (JSX) di `src/`, dibundel **Vite 6**
  - Tema gelap khas Steam (`#171a21`, `#1b2838`, `#66c0f4`).
  - Grid kartu responsif (`repeat(auto-fill, minmax(250px, 1fr))`).
  - Rekonsiliasi berbasis key + `React.memo`, jadi kartu tidak dibangun ulang saat mengetik.
- **Katalog mulai kosong**: tidak ada katalog bawaan maupun data contoh. Entri yang dulu dibuat
  otomatis oleh versi lama (id `builtin-*` / `sample-*`) dibersihkan sekali jalan saat data dibuka.

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
   - Tempel link Steam apa pun (mis. `https://store.steampowered.com/app/271590/`).
   - Mengambil judul, developer, tanggal rilis, genre, dan harga.
   - Mengurai kebutuhan sistem minimum dan rekomendasi.
   - Mengunduh dan menyimpan gambar header Steam sebagai thumbnail lokal.

3. **Manajemen katalog (CRUD)**
   - Tambah, ubah, dan hapus entri game maupun software.
   - Pencarian langsung dan pengurutan (Terbaru, A-Z, Z-A, kategori).
   - Filter kategori untuk tab Software, dibangun dari data yang benar-benar ada.

4. **Manajemen thumbnail lokal**
   - Dialog native Windows untuk PNG, JPG, JPEG, WEBP, GIF, SVG, BMP, dan ICO.
   - Nama file acak (hex) di folder data, dengan proteksi path traversal.
   - Thumbnail lama dibersihkan saat diganti atau entri dihapus.

5. **Berbagi & integrasi sistem**
   - Salin semua link mirror (atau satu link tertentu) ke clipboard dengan notifikasi toast.
   - Buka link di browser default (hanya skema http/https yang diizinkan).

6. **Persistensi data yang tahan banting**
   - Tulis atomik mencegah database rusak saat aplikasi tertutup mendadak.
   - Pemulihan otomatis file rusak dengan cadangan bertimestamp (`library.json.rusak-<timestamp>`).
   - Kompatibel dua arah dengan `library.json` versi lama: field `link` tunggal otomatis
     diturunkan menjadi daftar `links`, dan referensi `glib://` / `slib://` dinormalisasi.

---

## Kebutuhan Sistem

- **OS**: Windows 10 / 11 (64-bit)
- **Pengembangan**: Node.js 18+ dan npm
- **Pemaketan installer**: `electron-builder` (sudah termasuk devDependency)

---

## Lokasi Data

- **Database**: `%APPDATA%\softgame-library\library.json`
- **Thumbnail**: `%APPDATA%\softgame-library\thumbnails\`

Path ini sengaja dipertahankan sama persis dengan versi Go, sehingga data lama langsung terbaca.
Folder ini juga menjadi `userData` Chromium, jadi cache bawaan Electron (Cache/, GPUCache/, dll.)
memang muncul di sana.

---

## Perintah

```bash
npm install        # pasang dependensi
npm run dev        # mode pengembangan (Vite + Electron, hot reload)
npm run build      # bundel renderer ke dist/
npm run start      # jalankan Electron dari hasil build
npm run verify     # 33 pemeriksaan backend
npm run smoke      # build + uji render React, cover, mirror, dan editor link
npm run dist       # bundel renderer + buat installer NSIS
```

Installer dihasilkan di `build/bin/SoftGameLibrary-Setup-<versi>-amd64.exe`
(konfigurasi di `electron-builder.yml`, instalasi per-user, tanpa UAC).

### Catatan lingkungan

Jika `electron` dijalankan dari shell yang menyetel `ELECTRON_RUN_AS_NODE=1`, Electron akan
berperilaku sebagai Node biasa dan gagal memuat `app`. Jalankan dengan variabel itu dihapus:

```bash
env -u ELECTRON_RUN_AS_NODE npm run start
```

`npm run dev` sudah membuang variabel itu dari proses anak, jadi tidak perlu diurus manual.

**Mesin tanpa akses GPU** (mesin virtual, remote desktop, driver rusak) membuat proses GPU
Chromium mati dan Electron berhenti dengan `GPU process isn't usable. Goodbye.` sebelum jendela
tampil. Setel `SOFTGAME_SOFTWARE_RENDER=1` untuk memaksa rendering perangkat lunak:

```bash
SOFTGAME_SOFTWARE_RENDER=1 npm run dev
```

`npm run dev` juga meneruskan argumen tambahan apa adanya ke Electron, berguna untuk lingkungan
yang membatasi sandbox Chromium:

```bash
npm run dev -- --no-sandbox --in-process-gpu
```

---

## Struktur Proyek

```
SoftGame/
├── index.html                 # Entri Vite (shell minimal, <div id="root">)
├── vite.config.js             # Konfigurasi Vite + penyuntik CSP saat build
├── electron-builder.yml       # Konfigurasi installer Windows (NSIS)
├── package.json               # Metadata + skrip (npm)
├── electron/
│   ├── main.js                # Proses utama: jendela, single instance, protokol thumb://
│   ├── preload.cjs            # contextBridge -> window.softgame
│   └── lib/
│       ├── paths.js           # Lokasi folder data (identik dengan versi Go)
│       ├── store.js           # Load/save katalog, tulis atomik, cache, pembersihan data bawaan lama
│       ├── migrate.js         # Penyerapan katalog aplikasi lama
│       ├── links.js           # Normalisasi daftar link mirror + tebak nama layanan
│       ├── text.js            # truncateUTF8 (dipakai sanitize.js & links.js)
│       ├── sanitize.js        # Pembersihan field, pemotongan aman-rune, UUID v4
│       ├── steam.js           # Steam Store API + unduh gambar header
│       ├── website.js         # Impor software dari situs vendor (OpenGraph)
│       ├── thumbnails.js      # Gerbang keamanan path, dialog native, protokol thumb://
│       ├── window.js          # Penyesuaian ukuran jendela terhadap layar
│       ├── system.js          # OpenExternal & CopyText
│       └── ipc.js             # Pendaftaran seluruh channel IPC
├── src/                       # Renderer React (JSX)
│   ├── main.jsx, App.jsx
│   ├── api.js                 # Pembungkus window.softgame + thumbSrc()
│   ├── constants.js           # Deskriptor katalog + helper link (linksOf, cleanLinks)
│   ├── styles.css             # Tema gelap Steam
│   └── components/            # Toolbar, Grid, Card, DetailPanel, LinksEditor, modal, Toast, dll.
├── scripts/                   # dev.mjs, verify.mjs, smoke.mjs
└── assets/, build/, logo-output/   # Aset sumber & ikon
```

---

## Verifikasi

```bash
# Pemeriksaan backend (katalog kosong, pembersihan data bawaan lama, link mirror,
# keamanan path, sanitasi)
npm run verify

# Pemeriksaan renderer (React ter-render, cover lewat thumb://, daftar mirror,
# editor link bisa menambah/menghapus baris)
npm run smoke
```

Di lingkungan yang menyetel `ELECTRON_RUN_AS_NODE=1`, jalankan dengan variabel itu dihapus:

```bash
env -u ELECTRON_RUN_AS_NODE npm run verify
env -u ELECTRON_RUN_AS_NODE npm run smoke
```

---

## Lisensi

MIT License © 2026 Daffa.
