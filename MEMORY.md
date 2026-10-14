# MEMORY.md — SoftGame Library (Dokumentasi Handoff)

> Dokumen ini dibuat agar AI/manusia lain bisa langsung melanjutkan pengerjaan proyek tanpa
> membaca seluruh riwayat percakapan. Terakhir diupdate: 7 Oktober 2026.

---

## 1. Konteks Bisnis

Pemilik (Daffa) menjual **game digital** (installer game). File disimpan di **beberapa layanan
berbeda** — Gofile, PixelDrain, Google Drive, dan sejenisnya — jadi satu judul biasanya punya
beberapa link mirror. Aplikasi ini adalah **katalog internal toko** di PC-nya: saat pelanggan
order, ia buka app → cari judul → cek spesifikasi pelanggan → **Copy Link** (satu mirror, atau
semuanya sekaligus) → kirim ke pelanggan.

- Bahasa UI: **Indonesia** (label spek teknis tetap Inggris: OS, Processor, dst.)
- Desain: **layout grid gaya Epic Games, tema visual Steam** (biru gelap `#1b2838`, aksen `#66c0f4`)
- Pemakai akhir cuma 1 orang (pemilik toko) — tidak ada auth/multi-user

## 2. Tech Stack

| Komponen | Teknologi |
|---|---|
| Runtime + package manager | **Node.js 18+** dengan **npm** |
| Shell desktop | **Electron 33** (Chromium + Node bawaan) |
| Backend | JavaScript ESM di `electron/` (`main.js`, `preload.cjs`, `lib/*.js`) |
| Renderer | **React 18 (JSX)** di `src/`, dibundel **Vite 6** |
| Penyimpanan | JSON di AppData: `%APPDATA%\softgame-library\library.json` |
| Installer | `electron-builder` → NSIS per-user di `build/bin/` |

> **Riwayat:** proyek ini pernah memakai Electron vanilla, lalu dimigrasi ke **Wails v2 (Go +
> WebView2)**, dan pada 4 Okt 2026 dimigrasi penuh ke **Electron + React**. Seluruh kode Go
> sudah dihapus dari repo **dan** dari sistem. Versi Go terakhir tersimpan di tag Git
> **`wails-go-final`** — jangan sarankan kembali ke Go/Wails tanpa diminta.
>
> Proyek sempat memakai Bun sebagai package manager, lalu dikembalikan ke **npm** atas
> permintaan user (4 Okt 2026). Jangan memakai atau menyarankan Bun lagi di proyek ini.

Perintah:
```bash
npm install
npm run dev      # Vite + Electron (hot reload)
npm run build    # bundel renderer ke dist/
npm run start    # jalankan Electron dari hasil build
npm run verify   # 33 pemeriksaan backend
npm run smoke    # build + uji render React, cover, mirror, dan editor link
npm run dist     # bundel + installer NSIS ke build/bin/
```

**Penting:** di lingkungan ini `ELECTRON_RUN_AS_NODE=1` disetel, sehingga Electron berperilaku
sebagai Node biasa. Selalu jalankan dengan `env -u ELECTRON_RUN_AS_NODE ...`
(`npm run dev` sudah membuang variabel itu sendiri).

Kalau proses GPU Chromium tidak bisa jalan (VM / remote desktop / driver rusak), aplikasi
berhenti dengan `GPU process isn't usable. Goodbye.` sebelum jendela tampil. Setel
`SOFTGAME_SOFTWARE_RENDER=1` untuk memaksa rendering perangkat lunak. `npm run dev` juga
meneruskan argumen tambahan ke Electron: `npm run dev -- --no-sandbox`.

## 3. Struktur Proyek

```
SoftGame/
├── index.html                 # Entri Vite (shell minimal, <div id="root">)
├── vite.config.js             # Vite + penyuntik CSP saat build + pembuang crossorigin
├── electron-builder.yml       # Konfigurasi installer Windows (NSIS, per-user)
├── package.json               # Metadata + skrip (npm)
├── electron/
│   ├── main.js                # Jendela, single instance, protokol thumb://, pemuatan dev/prod
│   ├── preload.cjs            # contextBridge → window.softgame (satu-satunya jembatan)
│   └── lib/
│       ├── paths.js           # Lokasi folder data + allow-list ekstensi thumbnail
│       ├── store.js           # Load/save katalog, tulis atomik, cache, pembersihan data bawaan lama
│       ├── migrate.js         # Penyerapan katalog aplikasi lama (tanpa katalog bawaan)
│       ├── links.js           # Normalisasi daftar link mirror + tebak nama layanan
│       ├── text.js            # truncateUTF8 (dipakai sanitize.js & links.js)
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
│                              #   EntryFormModal, LinksEditor, ConfirmModal, ImportModal, Toast
├── scripts/                   # dev.mjs, verify.mjs, smoke.mjs
├── assets/                    # icon.svg/ico/png, logo.svg (aset sumber)
├── build/                     # appicon.png + windows/icon.ico (dipakai electron-builder)
└── logo-output/               # contoh hasil skill logo (tidak dipakai runtime)
```

## 4. Data & Penyimpanan

- **File data**: `%APPDATA%\softgame-library\library.json` → `{ "games": [...], "software": [...] }`
- **Thumbnail lokal**: `%APPDATA%\softgame-library\thumbnails\`
- **Karantina file rusak**: `library.json.rusak-<timestamp>`

Path ini **sengaja identik dengan versi Go**, sehingga data lama langsung terbaca. Jangan diubah.
Folder yang sama juga menjadi `userData` Chromium, jadi cache bawaan Electron (Cache/, GPUCache/,
Local State, dst.) memang muncul di sana — itu normal, bukan sampah aplikasi.

Referensi thumbnail di data selalu berbentuk `/thumbnails/<file>`. Skema lama `glib://thumb/<file>`
dan `slib://thumb/<file>` dinormalisasi otomatis saat load. Renderer mengubahnya menjadi
`thumb://local/<file>` lewat `thumbSrc()` di `src/api.js`; protokol itu ditangani di `electron/main.js`
dan **wajib lewat `safeThumbPath`**.

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

**Kompatibilitas link**: file lama yang hanya punya `link` (string) tetap terbaca — `normalizeItemLinks`
di `electron/lib/links.js` menurunkannya menjadi `links` berisi satu mirror saat load, dan
`link` selalu disinkronkan ke mirror pertama saat simpan. Batas: 20 mirror/entri, hanya http/https,
duplikat dibuang, label kosong diisi otomatis dari hostname.

Definisi field form ada di `src/constants.js` — **sinkronkan** bila menambah field baru.

## 5. Katalog Kosong (per 7 Okt 2026)

Aplikasi **mulai dengan katalog kosong** — katalog bawaan 60 game, `seedcovers/`, `seed.js`, dan
data contoh sudah **dihapus atas permintaan user**. Jangan menambahkan kembali data bawaan apa pun
tanpa diminta eksplisit.

- `bootstrapLibrary()` (`migrate.js`) hanya menyerap data dari folder aplikasi lama
  (`libray-game`, `software-library`); kalau tidak ada, kedua katalog dikembalikan kosong.
- Saat pertama dibuka, `library.json` langsung ditulis berisi `{"games":[],"software":[]}`.
- **Pembersihan sekali jalan**: `purgeLegacySeedEntries()` di `store.js` membuang entri dengan id
  berawalan `builtin-` atau `sample-` yang terlanjur tersimpan di mesin yang pernah menjalankan
  versi lama, lalu menulis ulang file. Entri pengguna (UUID) tidak pernah disentuh.
- Sisa file `sample-*.svg` di `%APPDATA%\softgame-library\thumbnails\` dari versi lama boleh
  dibiarkan (tidak ada entri yang menunjuk ke sana) atau dihapus manual.
- `electron-builder.yml` **tidak lagi** membundel `seedcovers/`, tetapi **wajib** tetap membundel
  `build/windows/icon.ico` karena `main.js` memakai ikon itu untuk jendela (sebelumnya hilang di
  build produksi dan memunculkan peringatan "Failed to load image").

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
2. Overlay kartu saat hover: **Copy Link** (menyalin **semua** mirror, satu URL per baris) dan
   **Hapus** (modal konfirmasi)
3. Pencarian instan (judul, genre, **semua URL+label mirror**; untuk software juga
   website/kategori/versi/lisensi/platform), sort Terbaru/A–Z/Z–A/kategori, counter jumlah per tab
4. Form Tambah/Edit dengan field berbeda untuk game (ada blok spek + impor Steam) dan software
   (tanpa spek). Thumbnail via dialog native. **Editor link mirror** (`LinksEditor.jsx`): baris
   label+URL bisa ditambah/dihapus bebas, label ditebak otomatis dari URL, duplikat ditandai
5. Halaman detail gaya Steam Store: hero blur, chip genre/ukuran/harga, **daftar mirror** dengan
   tombol Copy/Buka per link + "Copy Semua Link (n)", tombol Save/Edit/Hapus, tabel System
   Requirements MINIMUM/RECOMMENDED
6. **Impor Steam**: tempel link `https://store.steampowered.com/app/<appid>/` → judul, developer,
   tanggal rilis, genre, harga, spek min/rec, dan cover terisi otomatis
7. **Pencarian Steam** di dalam form impor (hasil bisa langsung diklik)
8. **Impor software** dari situs resmi vendor (OpenGraph)
9. Keyboard: `Ctrl/Cmd+F` fokus cari, `Esc` tutup modal/detail, `Enter` simpan
10. Placeholder otomatis untuk gambar yang gagal dimuat
11. Installer NSIS per-user (tanpa UAC) lewat `npm run dist`

## 8. Verifikasi (wajib setelah mengubah backend/renderer)

```bash
npm run verify   # 33 pemeriksaan backend
npm run smoke    # build + render React, cover, daftar mirror, editor link
```

Di lingkungan ini jalankan dengan `env -u ELECTRON_RUN_AS_NODE npm run verify` (lihat §12).

`verify.mjs` menguji: katalog dimulai kosong, `library.json` awal benar, penyimpanan entri pengguna,
normalisasi banyak mirror (duplikat/skema terlarang/label otomatis/`link` = mirror pertama),
kompatibilitas field `link` lama, pembersihan entri `builtin-*` & `sample-*`, helper `links.js`,
gerbang keamanan path, dan sanitasi. `smoke.mjs` menyiapkan folder data uji (termasuk satu gambar
kecil), memuat `dist/index.html` di jendela tersembunyi, lalu memeriksa jumlah kartu, cover yang
termuat lewat `thumb://`, jumlah baris mirror di halaman detail, tombol Copy Semua, dan bahwa
editor link bisa menambah/menghapus baris.

Keduanya mengalihkan folder data ke direktori sementara (`SOFTGAME_DATA_DIR`), jadi data asli
pengguna tidak pernah tersentuh.

> **Penting saat menulis skrip probe sendiri**: `SOFTGAME_DATA_DIR` harus disetel **sebelum**
> modul `electron/lib/*` dievaluasi. ESM mengevaluasi seluruh `import` statis lebih dulu, jadi
> pakai `await import(...)` di dalam `app.whenReady()` — kalau tidak, `paths.js` akan memakai
> folder data asli pengguna dan katalog aslinya bisa tertimpa.

## 9. GitHub

- Repo: **https://github.com/daffa-789/game-library** (public, akun `daffa-789`)
- Branch utama: `main`. Remote `origin` sudah terpasang; kredensial tersimpan di Windows
  Credential Manager sehingga push langsung jalan. Tidak ada `gh` CLI.
- Tag penting: **`wails-go-final`** = versi terakhir sebelum migrasi ke Electron.
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
7. Playbook lengkap: skill **`electron-app-windows`**.
