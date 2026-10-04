# MEMORY.md — SoftGame Library (Dokumentasi Handoff)

> Dokumen ini dibuat agar AI/manusia lain bisa langsung melanjutkan pengerjaan proyek tanpa
> membaca seluruh riwayat percakapan. Terakhir diupdate: 4 Oktober 2026.

---

## 1. Konteks Bisnis

Pemilik (Daffa) menjual **game digital** (installer game via Google Drive). Aplikasi ini adalah
**katalog internal toko** di PC-nya: saat pelanggan order, ia buka app → cari judul → cek
spesifikasi pelanggan → **Copy Link** Google Drive → kirim ke pelanggan.

- Bahasa UI: **Indonesia** (label spek teknis tetap Inggris: OS, Processor, dst.)
- Desain: **layout grid gaya Epic Games, tema visual Steam** (biru gelap `#1b2838`, aksen `#66c0f4`)
- Pemakai akhir cuma 1 orang (pemilik toko) — tidak ada auth/multi-user

## 2. Tech Stack

| Komponen | Teknologi |
|---|---|
| Package manager + runtime | **Bun 1.4.2** |
| Shell desktop | **Electron 33** (Chromium + Node bawaan) |
| Backend | JavaScript ESM di `electron/` (`main.js`, `preload.cjs`, `lib/*.js`) |
| Renderer | **React 18 (JSX)** di `src/`, dibundel **Vite 6** |
| Penyimpanan | JSON di AppData: `%APPDATA%\softgame-library\library.json` |
| Installer | `electron-builder` → NSIS per-user di `build/bin/` |

> **Riwayat:** proyek ini pernah memakai Electron vanilla, lalu dimigrasi ke **Wails v2 (Go +
> WebView2)**, dan pada 4 Okt 2026 dimigrasi penuh ke **Bun + Electron + React**. Seluruh kode Go
> sudah dihapus dari repo **dan** dari sistem. Versi Go terakhir tersimpan di tag Git
> **`wails-go-final`** — jangan sarankan kembali ke Go/Wails tanpa diminta.

Perintah:
```bash
bun install
bun run dev      # Vite + Electron (hot reload)
bun run build    # bundel renderer ke dist/
bun run start    # jalankan Electron dari hasil build
bun run dist     # bundel + installer NSIS ke build/bin/
```

**Penting:** di lingkungan ini `ELECTRON_RUN_AS_NODE=1` disetel, sehingga Electron berperilaku
sebagai Node biasa. Selalu jalankan dengan `env -u ELECTRON_RUN_AS_NODE ...`.

## 3. Struktur Proyek

```
SoftGame/
├── index.html                 # Entri Vite (shell minimal, <div id="root">)
├── vite.config.js             # Vite + penyuntik CSP saat build + pembuang crossorigin
├── electron-builder.yml       # Konfigurasi installer Windows (NSIS, per-user)
├── package.json               # Metadata + skrip (Bun)
├── electron/
│   ├── main.js                # Jendela, single instance, protokol thumb://, pemuatan dev/prod
│   ├── preload.cjs            # contextBridge → window.softgame (satu-satunya jembatan)
│   └── lib/
│       ├── paths.js           # Lokasi folder data + allow-list ekstensi thumbnail
│       ├── store.js           # Load/save katalog, tulis atomik, cache, data contoh
│       ├── migrate.js         # Penyerapan katalog aplikasi lama
│       ├── seed.js            # Katalog bawaan 60 game + penggabungan + hidden-builtin
│       ├── sanitize.js        # Pembersihan field, pemotongan aman-rune, UUID v4
│       ├── steam.js           # Steam Store API + unduh gambar header
│       ├── website.js         # Impor software dari situs vendor (OpenGraph)
│       ├── thumbnails.js      # Gerbang keamanan path, dialog native, resolver thumb://
│       ├── window.js          # Penyesuaian ukuran jendela terhadap work area
│       ├── system.js          # OpenExternal & CopyText
│       └── ipc.js             # Pendaftaran seluruh channel IPC
├── src/                       # Renderer React (JSX)
│   ├── main.jsx, App.jsx, api.js, constants.js, icons.jsx, styles.css, logo.svg
│   └── components/            # Toolbar, LibraryBar, Grid, Card, EmptyState, DetailPanel,
│                              #   EntryFormModal, ConfirmModal, ImportModal, Toast
├── seedcovers/                # 60 cover bawaan (jpg)
├── scripts/                   # dev.mjs, verify.mjs, smoke.mjs
├── assets/                    # icon.svg/ico/png, logo.svg (aset sumber)
├── build/                     # appicon.png + windows/icon.ico (dipakai electron-builder)
└── logo-output/               # contoh hasil skill logo (tidak dipakai runtime)
```

## 4. Data & Penyimpanan

- **File data**: `%APPDATA%\softgame-library\library.json` → `{ "games": [...], "software": [...] }`
- **Thumbnail lokal**: `%APPDATA%\softgame-library\thumbnails\`
- **Penanda entri bawaan yang dihapus**: `%APPDATA%\softgame-library\hidden-builtin.json`
- **Karantina file rusak**: `library.json.rusak-<timestamp>`

Path ini **sengaja identik dengan versi Go**, sehingga data lama langsung terbaca. Jangan diubah.

Referensi thumbnail di data selalu berbentuk `/thumbnails/<file>`. Skema lama `glib://thumb/<file>`
dan `slib://thumb/<file>` dinormalisasi otomatis saat load. Renderer mengubahnya menjadi
`thumb://local/<file>` lewat `thumbSrc()` di `src/api.js`; protokol itu ditangani di `electron/main.js`
dan **wajib lewat `safeThumbPath`**.

### Skema objek game
```jsonc
{
  "id": "uuid | builtin-<appid>",
  "title": "string (wajib)",
  "thumbnail": "/thumbnails/xxx.jpg | https://... | ''",
  "link": "URL Google Drive (atau URL Steam Store untuk entri bawaan)",
  "genre": "string (entri bawaan: genre Steam + ' · <tahun>')",
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

Definisi field form ada di `src/constants.js` — **sinkronkan** bila menambah field baru.

## 5. Katalog Bawaan (60 game)

- **20 judul per tahun** untuk 2024, 2025, 2026; campuran AAA dan indie populer; semuanya
  **single-player/offline** (difilter dengan `category2=2` di Steam search).
- Data ada di `electron/lib/seed.js`, cover di `seedcovers/` (60 jpg, ~2 MB, ikut dibundel).
- `ID = builtin-<appid>`, `Link = https://store.steampowered.com/app/<appid>/`.
- **Penggabungan**: entri bawaan yang belum ada ditambahkan otomatis saat katalog dibaca,
  termasuk pada `library.json` yang sudah berisi data lama. Entri buatan pengguna tidak pernah
  ditimpa. Entri bawaan yang dihapus pengguna dicatat di `hidden-builtin.json` agar tidak kembali.
- Untuk menambah/mengubah judul: edit `builtinCatalog` di `seed.js`, taruh covernya di
  `seedcovers/seed-<appid>.jpg`. `seedBuiltin` (konstanta di `seed.js`) bisa dimatikan saat menelusuri masalah.

## 6. Gerbang Keamanan (load-bearing — jangan dilonggarkan)

1. **`safeThumbPath`** di `thumbnails.js` adalah **satu-satunya** jalur ke file thumbnail —
   dipakai untuk menyajikan (`thumb://`), mengekspor, dan menghapus. Menolak pemisah path,
   `..`, nama berawalan titik, path absolut, karakter `:`, dan ekstensi di luar allow-list.
2. **Allow-list ekstensi** gambar (`paths.js`) untuk semua file yang masuk folder thumbnails.
3. **https-only + allow-list host** untuk unduhan gambar Steam (`steampowered.com`,
   `steamstatic.com`, `steamcommunity.com`) dan situs vendor; batas 25 MiB.
4. **Isolasi renderer**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
   Renderer hanya melihat `window.softgame`.
5. **`OpenExternal`** hanya menerima skema http/https dengan host.
6. **Single instance** lewat `app.requestSingleInstanceLock()`.
7. **Sanitasi** semua field sebelum ditulis (`sanitize.js`), pemotongan aman-rune.

## 7. Fitur yang Sudah Jadi

1. Grid library (`repeat(auto-fill, minmax(250px,1fr))`), kartu rasio 460/215, hover glow + overlay
2. Overlay kartu saat hover: **Copy Link** (clipboard + toast) dan **Hapus** (modal konfirmasi)
3. Pencarian instan (judul, genre, link; untuk software juga website/kategori/versi/lisensi/platform),
   sort Terbaru/A–Z/Z–A/kategori, counter jumlah per tab
4. Form Tambah/Edit dengan field berbeda untuk game (ada blok spek + impor Steam) dan software
   (tanpa spek). Thumbnail via dialog native **atau** tempel URL
5. Halaman detail gaya Steam Store: hero blur, chip genre/ukuran/harga, tombol Open/Copy/Save/Edit/Hapus,
   tabel System Requirements MINIMUM/RECOMMENDED
6. **Impor Steam**: tempel link `https://store.steampowered.com/app/<appid>/` → judul, developer,
   tanggal rilis, genre, harga, spek min/rec, dan cover terisi otomatis
7. **Pencarian Steam** di dalam form impor (hasil bisa langsung diklik)
8. **Impor software** dari situs resmi vendor (OpenGraph)
9. Keyboard: `Ctrl/Cmd+F` fokus cari, `Esc` tutup modal/detail, `Enter` simpan
10. Placeholder otomatis untuk gambar yang gagal dimuat
11. Installer NSIS per-user (tanpa UAC) lewat `bun run dist`

## 8. Verifikasi (wajib setelah mengubah backend/renderer)

```bash
bun run build
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/verify.mjs   # 17 pemeriksaan backend
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/smoke.mjs    # render + cover
```

`verify.mjs` menguji: 60 game bawaan, distribusi 20/20/20, link & referensi thumbnail, cover
tersalin, 3 software contoh, muat ulang tidak menggandakan, `hidden-builtin.json`, gerbang
keamanan path, dan sanitasi. `smoke.mjs` memuat `dist/index.html` di jendela tersembunyi dan
melaporkan jumlah kartu, cover yang termuat lewat `thumb://`, serta error konsol.

Keduanya mengalihkan folder data ke direktori sementara (`SOFTGAME_DATA_DIR`), jadi data asli
pengguna tidak pernah tersentuh.

## 9. GitHub

- Repo: **https://github.com/daffa-789/game-library** (public, akun `daffa-789`)
- Branch utama: `main`. Remote `origin` sudah terpasang; kredensial tersimpan di Windows
  Credential Manager sehingga push langsung jalan. Tidak ada `gh` CLI.
- Tag penting: **`wails-go-final`** = versi terakhir sebelum migrasi ke Bun/Electron.
- `.gitignore`: `node_modules/`, `dist/`, `build/bin/`, `*.exe`, `*.log`, `.workbuddy-ai/`

## 10. Konvensi & Selera User (penting!)

- Semua teks UI bahasa Indonesia; toast singkat & ramah (contoh: "Link download disalin! Siap
  dikirim ke pelanggan.")
- User suka konfirmasi visual (toast) untuk semua aksi.
- **User tidak ingin fitur backup/restore** (sudah dihapus atas permintaan) — jangan ditambah lagi.
- Hapus entri selalu lewat modal konfirmasi.
- User lebih percaya hasil yang **dibuktikan empiris** (dijalankan & diukur) daripada klaim dokumentasi.
- Perubahan besar tanyakan dulu; perubahan kecil langsung kerjakan lalu laporkan.
- Komentar kode berbahasa Indonesia, menjelaskan *maksud*, bukan menarasikan kode.

## 11. Aset Pendukung (di luar repo)

- **Skill logo "logo-toko-digital"** di `C:\Users\Daffa\.agents\skills\logo-toko-digital\` —
  generate 4 gaya logo (appicon/badge/wordmark/banner) × 6 palet (steam, neon, gamer, sunset, gold,
  merah) → SVG + PNG + `preview.html`. Konversi PNG dijalankan lewat Electron.
- Contoh hasil untuk "Daffa Game Store" ada di `logo-output/`.

## 12. Jebakan Lingkungan yang Sudah Terkonfirmasi

1. **`ELECTRON_RUN_AS_NODE=1`** — Electron jadi Node biasa; `require('electron')` mengembalikan
   `undefined`. Pakai `env -u ELECTRON_RUN_AS_NODE`.
2. **`BrowserWindow` gagal `ERR_FAILED (-2)`** di sandbox ini kecuali diberi flag Chromium
   (`no-sandbox`, `in-process-gpu`, `disable-gpu`, `disable-gpu-sandbox`, `disable-dev-shm-usage`).
   Hanya untuk skrip verifikasi — jangan di aplikasi produksi.
3. **`crossorigin` dari Vite harus dibuang** — pada `file://` ia memicu CORS yang selalu gagal
   sehingga modul React tidak dieksekusi.
4. **CSP hanya disuntikkan saat build** — Vite dev menyuntikkan skrip inline untuk HMR yang
   diblokir `script-src 'self'`.
5. **`rm -rf <dir>` sering dimatikan `SIGTERM`** oleh sandbox; pakai `rm -f <daftar file>` lalu `rmdir`.
6. `reg.exe`, `wmic.exe`, `schtasks.exe` diblokir; membuka `cmd.exe` dari PowerShell diblokir.
   Operasi yang butuh admin bisa lewat `Start-Process -Verb RunAs -Wait`.
7. Playbook lengkap: skill **`electron-bun-app-windows`**.
