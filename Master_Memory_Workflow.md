---
type: memory
kind: project
name: "master-libray-game"
description: "Memory terpusat SoftGame Library (folder 'Libray Game') — app desktop Go+Wails, katalog Game+Software, impor Steam & OpenGraph, installer NSIS"
scope: project
project: "Game Library (Libray Game)"
status: active
updated: 2026-09-23
tags: ["memory/project", "project/Libray Game"]
---

# Master Memory Workflow — SoftGame Library (folder: `Libray Game`)

> ## ⚠️ Baca ini lebih dulu: dokumen lama di proyek ini saling bertentangan
>
> Berkas ini menggantikan `MEMORY.md`, `PROJECT.md`, `README.md`, `TEST_INFRA.md`, dan
> `TEST_READY.md` yang kini diarsipkan verbatim di bagian bawah. **Semua dokumen itu ditulis
> sebelum penggabungan Software Library → Game Library (komit `61c710d`, 23 Sep 2026)**, jadi
> sebagian isinya sudah salah. Rincian ketidaksesuaian ada di **R7**.

**Lokasi:** `C:\Users\Daffa\Desktop\Folder Space AI\Folder Space Semester 7\Libray Game`
**Status (23 Sep 2026): SELESAI & terverifikasi build.** Working tree bersih;
`build/bin/SoftGameLibrary.exe` (12.060.672 B ≈ 11,5 MB) dan
`SoftGameLibrary-Setup-1.0.0-amd64.exe` (5,58 MB) sudah ada.

## R1. Angka Kunci

| Aspek | Nilai |
|---|---|
| Nama modul | `softgame-library` (Go **1.25.0**) |
| Shell desktop | **Wails v2.16.0** + WebView2 |
| Frontend | **Vanilla** — tanpa bundler, tanpa dependensi npm; di-embed `//go:embed all:renderer` |
| Storage | `%APPDATA%\softgame-library\library.json` = `{games, software}` + folder `thumbnails\` |
| Saji aset | `AssetServer.Handler` di `/thumbnails/*`; skema `glib://thumb/` dinormalisasi saat load |
| Backend Go | `main.go` 56 · `app.go` 260 · `library.go` 381 · `thumbnails.go` 231 · `steam.go` 300 · `website.go` 426 · `sanitize.go` 113 · `migrate.go` 151 · `system.go` 34 · `window.go` 101 |
| Frontend | `app.js` 1187 · `styles.css` 774 · `index.html` 175 · `wails-bridge.js` 30 |
| Test Go | **5 berkas / 51 fungsi** — `app_test.go` 9, `app_stress_test.go` 12, `boundary_adversarial_test.go` 7, `hardening_test.go` 11, `software_test.go` 12 |
| Test E2E | PowerShell 4 tier (baris `Invoke-TestCase`: 75/74/16/7). `TEST_READY.md` lama mencatat 70/70/14/7 = 161 |
| Mutex jendela tunggal | `com.daffa.softgamelibrary` (**bukan** `com.daffa.libraygame` — catatan lama salah) |
| Git | 10 commit, terakhir `61c710d` "Merge Software Library into Game Library…" |

## R2. Yang Berubah Sejak Penggabungan (kanonik sekarang)

- Aplikasi punya **2 tab: Game + Software**. Item **software tidak punya blok spesifikasi**.
- `website.go` (426 baris) mengimpor metadata software dari URL lewat **OpenGraph**.
- `migrate.go` menyerap data lama dari **`libray-game`** dan **`software-library`** (auto-migrate saat start).
- `window.go` membatasi ukuran jendela ke **work area layar**.
- Kontrak API yang tersedia untuk frontend: `LoadLibrary`, `SaveLibrary`, **`LoadSoftware`**,
  **`SaveSoftware`**, **`ImportSoftware`**, `SteamImport`, `PickThumbnail`, `DeleteThumbnail`,
  `OpenExternal`, `CopyText`.

## R3. Cara Menjalankan

```bash
npm run dev            # wails dev
npm run test           # go test
npm run build          # biner
npm run installer      # aset NSIS + wails build -nsis -installscope user
npm run assets:installer
pwsh -File tests/e2e/run_tests.ps1 -Tier all   # WAJIB pwsh 7
```

## R4. Konvensi Wajib Proyek Ini

1. **Bahasa UI Indonesia**, notifikasi gaya toast, **tanpa fitur backup/restore** (ditolak user),
   hapus item selalu lewat modal konfirmasi.
2. **Berkas Go tetap di root proyek** — jangan dipindah ke `internal/`; assertion E2E membaca
   sumber Go lewat `Get-GoSource` sehingga **rename literal apa pun menggagalkan test**.
3. Build installer = `wails build -nsis -installscope user` + generator aset NSIS (`npm run assets:installer`).
4. Data **selalu** di `%APPDATA%\softgame-library`, bukan di folder instalasi.
5. Setiap perubahan berarti dicatat di dokumen ini lewat komit `docs(memory): catat …`.

## R5. Gotchas Build & Verifikasi (hasil percobaan nyata, bukan teori)

- **NSIS ada di `C:\Program Files (x86)\NSIS`** dan **tidak di PATH** → Wails diam-diam skip
  pembuatan installer. Cek hasilnya, jangan anggap sukses.
- **E2E wajib PowerShell 7 (`pwsh`)** — di Windows PowerShell 5.1 ±8 test gagal **palsu**.
- Layar 1920×1080 @125% → work area **1536×816**; skrip screenshot wajib memanggil
  `SetProcessDPIAware()` atau ukurannya salah.
- NSIS: `!ifndef REQUEST_EXECUTION_LEVEL`, override `PRODUCT_EXECUTABLE`, bitmap kaku 164×314 / 150×57,
  dan `wails_tools.nsh` diregenerasi oleh Wails (jangan sunting manual).
- Klaim UI harus dibuktikan di mesin asli (rect/angka/screenshot nyata), bukan dari teori.

## R6. Riwayat Migrasi Electron → Wails (konteks, jangan diulang)

Proyek ini dulu Electron (`main.js`/`preload.js`, `%APPDATA%\libray-game`, `npm start`, `npm run dist`)
dan dimigrasikan penuh ke Go+Wails oleh beberapa agen. Sisa-sisa era Electron inilah yang membuat
`MEMORY.md` lama menyesatkan. Yang **masih berlaku** dari dokumen lama hanya: konteks bisnis (§1),
pelajaran bug (§7), dan selera UI pengguna (§11).

## R7. Dokumen Lama: Mana yang Salah

| Berkas | Keadaan | Kesalahan utama vs kode sekarang |
|---|---|---|
| `MEMORY.md` (22 Sep) | ❌ tidak akurat | Seluruhnya era Electron: `main.js`/`preload.js`, `npm start`/`npm run dist`, `%APPDATA%\libray-game`, "Steam Link BELUM", "tetap Electron" |
| `PROJECT.md` | ❌ usang | Pra-penggabungan: tak menyebut `website.go`, `migrate.go`, `window.go`, `software_test.go`; kontrak tanpa API software; path lama `c:\Users\Daffa\Desktop\Libray Game\` |
| `README.md` | ⚠️ sebagian | Nama output installer tertulis `GameLibrary-Setup` (aktual `SoftGameLibrary-Setup`); "Go 1.23+"; struktur file kurang 4 berkas |
| `TEST_INFRA.md` / `TEST_READY.md` | ⚠️ sebagian | Assertion masih `GameLibrary.exe` & `libray-game`; matriks 14 fitur belum mencakup tab software |
| `.agents/**` | ℹ️ snapshot sejarah | Hanya mencakup migrasi Electron→Wails. `orchestrator/GATE_STATUS.md` = IN_PROGRESS dengan reviewer/challenger/auditor PENDING, padahal `PROJECT.md` mengklaim M5/M6 DONE — dua-duanya bukan keadaan kini |

Peran agen di `.agents/`: `explorer_electron_1` + `explorer_frontend_1` + `spec_miner_wails_1/2` (survei),
`worker_backend_m1` (M1+M2), `worker_frontend_m3` (M3), `worker_cleanup_m4` (build 11,41 MB, pruned
Electron, README), `test_writer_e2e_1` (161 E2E + `TEST_READY.md`), `sentinel` (monitoring).
Folder ini **dibiarkan** sebagai arsip sejarah, bukan memory aktif.

## R8. Aturan Memory Proyek Ini

Berkas ini **satu-satunya memory terpusat** proyek. Jangan membuat `MEMORY.md`/`PROJECT.md` baru;
perbarui bagian R1–R7 di sini, lalu sinkronkan ke vault Obsidian dengan
`node scripts/sync-memory-to-obsidian.mjs`.

---

## Peta Dokumen Proyek

Berkas ini adalah **satu-satunya memory terpusat** untuk proyek `Libray Game`.
Perubahan berarti dicatat di sini lewat commit `docs(memory): catat …`.

### Diserap ke arsip di bawah (file aslinya dihapus)
- `Libray Game` root: `MEMORY.md`, `PROJECT.md`, `README.md`, `TEST_INFRA.md`, `TEST_READY.md` → **file aslinya dihapus**
- memori Qoder: `qoder-store/project-build-verification-gotchas.md` → arsip saja, **berkas aslinya tidak disentuh**

### Dibiarkan (bukan memory)
- .agents/** (transkrip kerja agen)
- .zcode/plans/*
- build/VERIFIKASI.md

---

## Arsip Dokumen Sumber (verbatim)

Isi setiap sumber dipertahankan apa adanya; separator hanya menandai batas antar dokumen.
Diarsipkan saat konsolidasi memory 2026-09-23 (generator satu-kali pakai, sudah dihapus)

<!-- ARCHIVE-BEGIN -->
<details>
<summary>MEMORY.md · 177 baris · disalin verbatim</summary>

<!-- BEGIN SOURCE: MEMORY.md -->

# MEMORY.md — Game Library (Dokumentasi Handoff untuk AI)

> Dokumen ini dibuat agar AI/manusia lain bisa langsung melanjutkan pengerjaan proyek tanpa
> membaca seluruh riwayat percakapan. Terakhir diupdate: 22 September 2026.

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
| Framework desktop | **Wails v2 (v2.16.0)** (Go 1.27 + Microsoft WebView2 bawaan Windows) |
| UI | Vanilla HTML/CSS/JS — **tanpa build step, tanpa framework**, tema Steam |
| Penyimpanan | File JSON di AppData: `%APPDATA%\libray-game\library.json` |
| Build executable | `wails build -clean -ldflags "-s -w" -trimpath` → single file `build/bin/GameLibrary.exe` (~11.4 MB) |
| Go / Node di dev | Go 1.27.1 / Node v24.18.0 |

Perintah:
```bash
wails dev           # jalankan mode development
wails build         # kompilasi binary mandiri ke build/bin/GameLibrary.exe
go test -v ./...    # jalankan unit test Go backend
```

## 3. Struktur Proyek

```
Libray Game/                      (folder = C:\Users\Daffa\Desktop\Libray Game)
├── main.js                       # Electron main process: window, IPC, data, protokol glib://
├── preload.js                    # contextBridge → window.api (loadLibrary, saveLibrary,
│                                 #   pickThumbnail, deleteThumbnail, openExternal, copyText)
├── renderer/
│   ├── index.html                # Seluruh UI: topbar, view-library, view-detail, modals
│   ├── styles.css                # Tema Steam (CSS variables di :root)
│   └── app.js                    # Semua logika UI (state, renderGrid, renderDetail, form, dll)
├── assets/                       # logo.svg, icon.ico (auto-generate), icon.html, icon-256.png
├── dist/                         # hasil build (TIDAK di-git, file >100MB)
├── logo-output/                  # contoh hasil skill logo (SVG+PNG+preview.html)
└── package.json                  # scripts + konfigurasi electron-builder
```

## 4. Data & Penyimpanan

- **File data**: `%APPDATA%\libray-game\library.json` → format `{ "games": [ ... ] }`
- **Thumbnail lokal**: `%APPDATA%\libray-game\thumbnails\` — file gambar diakses renderer lewat
  protokol kustom **`glib://thumb/<namafile>`** (didefinisikan di main.js, `registerThumbProtocol`).
  Thumbnail berupa URL http(s) disimpan apa adanya.
- Penyimpanan pakai atomic write (tulis `.tmp` lalu rename) + sanitasi field di `sanitizeGames`.
- 2 game contoh dibuat otomatis saat pertama kali jalan (fungsi `createSampleData`), boleh dihapus user.

### Skema objek game
```jsonc
{
  "id": "uuid",
  "title": "string (wajib)",
  "thumbnail": "glib://thumb/xxx.jpg | https://... | '' ",
  "link": "string URL Google Drive (wajib)",
  "genre": "string", "size": "mis. 90 GB", "price": "mis. Rp 25.000",
  "steamAppId": "string, hasil impor Steam (bisa '')",
  "specs": {
    "min": { "os","cpu","ram","gpu","dx","net","storage","sound","notes" },  // semua string
    "rec": { ...sama... }
  },
  "createdAt": "ISO", "updatedAt": "ISO"
}
```
Kunci spek: `os` (OS), `cpu` (Processor), `ram` (Memory), `gpu` (Graphics), `dx` (DirectX),
`net` (Network), `storage` (Storage), `sound` (Sound Card), `notes` (Additional Notes).
Daftar ini juga ada di `renderer/app.js` konstanta `SPEC_FIELDS` — **jangan lupa sinkron** kalau
menambah field baru di kedua tempat (form editor dibangun dari konstanta ini).

## 5. Fitur yang SUDAH JADI & TERUJI

1. Grid library (auto-fill `minmax(250px,1fr)`), kartu 16:9 rasio 460/215, hover glow + tombol overlay
2. Tombol overlay kartu saat hover: **Copy Link** (clipboard + toast) dan **Hapus** (ikon merah → modal konfirmasi)
3. Pencarian instan (judul + genre), sort Terbaru/A–Z/Z–A, counter jumlah
4. Form Tambah/Edit: judul & link wajib (validasi + highlight merah), thumbnail via file picker
   (disalin ke AppData) ATAU tempel URL (preview live), genre/ukuran/harga opsional, editor spek 2 kolom
5. Halaman detail gaya Steam Store: hero blur dari thumbnail, panel link + Copy Link + Buka di Browser,
   tabel System Requirements 2 kolom MINIMUM/RECOMMENDED, tombol Edit/Hapus
6. Keyboard: `Ctrl+F` fokus cari, `Esc` tutup modal/detail, `Enter` di field link = simpan
7. Klik kartu → detail; gambar gagal load → placeholder otomatis (error handler capture-phase)
8. Single instance lock; link eksternal dibuka browser default (bukan window baru)
9. Installer NSIS + Portable via electron-builder

## 6. Fitur yang DITUNDUNKAN: "Steam Link" (setengah jadi!)

**Konsep**: tombol **"Steam Link"** di sebelah "Tambah Game" → user tempel link
`https://store.steampowered.com/app/<appid>/...` → app mengambil otomatis dari API publik Steam
(judul, thumbnail header 460×215, genre, sysreq min/rec) → form Tambah Game terisi otomatis →
**link Google Drive tetap diisi manual** → Simpan.

### Status per file:
| File | Status | Detail |
|---|---|---|
| `main.js` | ✅ **SELESAI** | IPC `steam:import` sudah ada: regex ambil appid, fetch `https://store.steampowered.com/api/appdetails?appids=<id>&l=english` (dengan User-Agent), parse `pc_requirements.minimum/recommended` (HTML `<li><strong>Label:</strong> value</li>` → field via `STEAM_LABEL_MAP`), unduh `data.header_image` ke `thumbnails/steam-<appid>-<hash>.jpg` → return `{appId,title,thumbnail,genre,developer,releaseDate,specs}`. Field `steamAppId` juga sudah ditambahkan ke `sanitizeGames`. |
| `preload.js` | ❌ BELUM | Tambahkan: `steamImport: (url) => ipcRenderer.invoke('steam:import', url),` |
| `renderer/index.html` | ❌ BELUM | (a) Tombol `#btn-steam` (class `btn ghost` atau kelas baru `btn steam`) DI SEBELAH KIRI `#btn-add` di `.topbar-actions`, dengan icon + teks "Steam Link". (b) Modal baru `#modal-steam` (pola sama seperti `#modal-confirm`): judul "Impor dari Steam", 1 field input `#steam-url` placeholder `https://store.steampowered.com/app/...`, paragraf status `#steam-status` (hidden), footer Batal (`#steam-cancel`, `#steam-close`) + tombol hijau `#steam-fetch` "Ambil Data Steam". |
| `renderer/app.js` | ❌ BELUM | (a) `openForm(game, prefill)` — tambah parameter opsional `prefill` (dari hasil steamImport); saat `game == null && prefill` isi field judul/genre dari prefill, `state.pendingThumb = prefill.thumbnail`, `fillSpecInputs(prefill.specs)`, simpan `prefill.appId` ke state (mis. `state.pendingSteamAppId`) lalu sertakan sebagai `steamAppId` saat push game baru di `saveGameFromForm`. Edit game lama: pertahankan `steamAppId` yang ada. (b) Fungsi `fetchSteam()`: validasi input non-kosong → tombol loading "Mengambil..." (disable) → `await window.api.steamImport(url)` → sukses: `closeModal()`, `openForm(null, hasil)`, toast "Data terisi otomatis — tinggal isi link Google Drive"; gagal: tampilkan `err.message` di `#steam-status` warna merah. (c) Bind: `#btn-steam` buka modal + fokus input, Enter di `#steam-url` = fetch. |
| `renderer/styles.css` | ❌ BELUM | Opsional: `.error-text { color:#e57373 }` untuk status, dan class `.btn.steam` bila mau beda warna (usul: background `#1b2838`, border `#3d6a8c`, teks `#66c0f4`) |
| Test | ❌ BELUM | Alur: restart app → klik Steam Link → tempel `https://store.steampowered.com/app/271590/` (GTA V) → form harus terisi otomatis (judul, thumbnail, genre, 2 kolom spek) → isi link Drive manual → Simpan → cek kartu + halaman detail + library.json |

### Catatan teknis Steam API
- Endpoint appdetails **gratis tanpa key**, tetap kirim User-Agent (kadang 403 tanpa UA).
- Beberapa app return `success:false` (delisted/regional) → sudah ditangani jadi error jelas.
- `pc_requirements` bisa null / tanpa `recommended` → parser sudah aman (hasil objek kosong → kolom tampil "Belum diisi").
- `header_image` 460×215 persis rasio kartu — cocok tanpa crop berarti.
- Bahasa `l=english` dipilih agar teks spek konsisten.

## 7. Bug yang PERNAH TERJADI (pelajaran — jangan diulang)

1. **`renderGrid` dulu menimpa `innerHTML` judul sehingga `<span id="lib-count"> hilang** →
   `$('#lib-count')` null → render berhenti diam-diam. Fix: judul + counter ditulis sekali
   sekaligus dalam satu innerHTML. Kalau menambah elemen di dalam `#lib-title`, ingat pola ini.
2. **Entity HTML `&middot;` di dalam file SVG** bukan entity XML yang valid → SVG rusak & gambar
   gagal load. Di dalam SVG yang digenerate lewat template string, pakai karakter unicode langsung (`·`).
3. **`render-png.js` lupa `require('node:url')`** untuk `pathToFileURL` → PNG silently gagal.
   Saat menambah require di file Electron main-process, selalu cek log stderr-nya.
4. Accessibility tree Electron kadang butuh observasi kedua (`disableDiffing`) sebelum konten
   terlihat penuh — tree 13 elemen ≠ app kosong.

## 8. Build & Distribusi

- `npm run dist` → `dist/Game Library Setup 1.0.0.exe` (installer NSIS, ±111MB) dan
  `dist/GameLibrary-Portable-1.0.0.exe` (portable). `dist/win-unpacked/Game Library.exe` = versi
  terpasang tanpa install (bagus untuk tes cepat hasil build).
- Ukuran besar itu **normal untuk Electron** (membawa Chromium+Node). Keputusan sudah dibuat:
  **tetap Electron**, TIDAK pindah ke Tauri (butuh install Rust+MSVC ±4-5GB di mesin dev;
  user sudah menolak).
- File exe >100MB → **tidak bisa di-push ke GitHub**; `dist/` sudah di `.gitignore`.
- Icon exe dibaca dari `assets/icon.ico` (dibangkitkan otomatis dari `assets/logo.svg` saat dev
  start via `generateIcon()` — hanya jika belum ada).

## 9. GitHub

- Repo: **https://github.com/daffa-789/game-library** (**public**, akun `daffa-789`)
- Remote `origin` sudah terpasang di folder proyek, kredensial tersimpan di Windows Credential
  Manager (push langsung jalan tanpa login).
- Alur update: `git add -A && git commit -m "..." && git push`
- `.gitignore`: `node_modules/`, `dist/`, `*.log`, `.zcode/`, `Thumbs.db`, `.DS_Store`

## 10. Aset Pendukung (di luar repo)

- **Skill ZCode "logo-toko-digital"** di `C:\Users\Daffa\.agents\skills\logo-toko-digital\`
  (global, aktif di semua project). Generate 4 gaya logo (appicon/badge/wordmark/banner) ×
  6 palet → SVG+PNG+preview.html. Skrip: `scripts/generate.mjs` (Node murni) dan
  `scripts/render-png.js` (dijalankan LEWAT electron untuk konversi PNG; deteksi otomatis bila
  dijalankan dari folder project yang punya electron di node_modules).
  Palet tersedia: steam, neon, gamer, sunset, gold, merah.
- Contoh hasil (untuk "Daffa Game Store"): folder `logo-output/`.

## 11. Konvensi & Selera User (penting!)

- Semua teks UI bahasa Indonesia; toast singkat & ramah (contoh: "Link download disalin! Siap
  dikirim ke pelanggan.")
- User suka konfirmasi visual (toast) untuk semua aksi.
- User tidak ingin fitur backup/restore (sudah dihapus per atas permintaan) — JANGAN ditambah lagi.
- Hapus game selalu lewat modal konfirmasi (sudah ada `askDeleteGame`).
- Perubahan besar tanyakan dulu; perubahan kecil langsung kerjakan lalu laporkan.

## 12. Cara Kerja Cepat (recap untuk melanjutkan)

1. `npm start` untuk development. Setelah edit file renderer, restart app (tidak ada hot reload).
2. Data uji ada di `%APPDATA%\libray-game\library.json` — bisa dihapus untuk reset ke sample.
3. Uji visual: screenshot via automation, atau `OPEN_DEVTOOLS=1 npm start` untuk DevTools.
4. Setelah fitur Steam Link selesai: uji e2e (bagian 6), commit + push, dan rebuild `npm run dist`
   karena installer di `dist/` belum berisi fitur ini.

<!-- END SOURCE: MEMORY.md -->
</details>
<details>
<summary>PROJECT.md · 179 baris · disalin verbatim</summary>

<!-- BEGIN SOURCE: PROJECT.md -->

# Project: SoftGame Library Migration (Electron to Wails v2)

## Architecture
- **Backend**: Go 1.25+ with Wails v2.16.0 framework, split into focused files in `package main`:
  - `main.go`: Entry point, Wails options, single instance lock (`com.daffa.softgamelibrary`), window sizing (1400x880, min 980x620), dark theme background `#171a21`, asset server configuration with dynamic thumbnail fallback handler.
  - `app.go`: Data models, `App` struct, lifecycle (`startup`, `RestoreWindow`), shared `*http.Client` with connection pooling, guard-rail constants (max games, max file/thumbnail bytes, timeouts), image extension whitelist.
  - `library.go`: `LoadLibrary` / `SaveLibrary`, atomic write with retry, corrupt-file quarantine, in-memory parse cache keyed by file fingerprint, sample data.
  - `thumbnails.go`: AssetServer handler, `PickThumbnail`, `DeleteThumbnail`, and the single `safeThumbPath` validation gateway.
  - `steam.go`: `SteamImport`, header image download (host + size + content-type validated), `<li>`/`<h4>` system requirement parsing, rune-safe truncation.
  - `sanitize.go`: Field sanitisation with named length limits, UUID v4 generation.
  - `system.go`: `OpenExternal` (url.Parse scheme/host validation) and `CopyText`.
- **Data Persistence**:
  - `%APPDATA%\softgame-library\library.json`: JSON database of games with atomic write (`.tmp` + rename) and corrupted file backup (`.rusak-<timestamp>`).
  - `%APPDATA%\softgame-library\thumbnails\`: Local directory for stored thumbnails, served dynamically to WebView2 via `AssetServer.Handler` on path `/thumbnails/*`.
- **Frontend**: Vanilla HTML5/CSS3/ES6 in `renderer/` (no bundler or npm dependencies).
  - `wails-bridge.js`: Shim mapping `window.api.*` calls to `window.go.main.App.*`.
  - `styles.css`: Steam dark theme, Epic Games grid layout, responsive design, `content-visibility: auto` cards.
  - `app.js`: State management, search, sort, modals, game CRUD, thumbnail preview. Grid uses keyed reconciliation plus an element pool (cards are reused, not rebuilt), a cached lowercase search index, rAF-coalesced renders with a timeout fallback, and delegated events.
- **Packaging**:
  - Portable: `wails build -clean -trimpath -ldflags "-s -w"` → `build/bin/SoftGameLibrary.exe` (~11.4 MB).
  - Installer: `wails build ... -nsis -installscope user` → `build/bin/GameLibrary-Setup-<version>-amd64.exe` (~5.3 MB), scripted by `build/windows/installer/project.nsi` (Indonesian wizard, per-user scope, WebView2 bootstrapper, LZMA, catalog preserved on uninstall).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Wails v2 Project Configuration | `wails.json` setup with `renderer` frontend dir, `GameLibrary` output binary, metadata | M1 | ORIGINAL_REQUEST §R3 |
| 2 | Go Module & Manifest Setup | `go.mod`, `build/windows/info.json`, `build/windows/wails.exe.manifest`, app icons | M1 | ORIGINAL_REQUEST §R3 |
| 3 | Data Schema Compatibility | Structs for `Game`, `SpecsContainer`, `SystemSpecs` matching 100% of existing `library.json` | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Atomic Library Persistence | `LoadLibrary` and `SaveLibrary` with `.tmp` write, rename, corrupt backup, sample data fallback | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Dynamic Thumbnail Asset Server | `AssetServer.Handler` serving `%APPDATA%\softgame-library\thumbnails\` on `/thumbnails/*` with path sanitization | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Native Thumbnail Picker | `PickThumbnail` using Wails file dialog, copying image to AppData with hex filename | M1 | ORIGINAL_REQUEST §R1 |
| 7 | Thumbnail Deletion | `DeleteThumbnail` removing image file from AppData with path safety checks | M1 | ORIGINAL_REQUEST §R1 |
| 8 | Single Instance Lock | Windows mutex focusing existing window on secondary launch attempt | M1 | Survey (main.js parity) |
| 9 | External URL Browser Opener | `OpenExternal` opening HTTP/HTTPS URLs in Windows default browser via runtime | M2 | ORIGINAL_REQUEST §R1 |
| 10 | System Clipboard Text Copy | `CopyText` copying links to Windows clipboard via runtime | M2 | ORIGINAL_REQUEST §R1 |
| 11 | Steam Store API Client | `SteamImport` fetching `store.steampowered.com/api/appdetails` with custom User-Agent | M2 | ORIGINAL_REQUEST §R1 |
| 12 | Steam HTML SysReq Parser | Regex parser extracting 9 min/rec specs (`os`, `cpu`, `ram`, `gpu`, `dx`, `net`, `storage`, `sound`, `notes`) | M2 | ORIGINAL_REQUEST §R1 |
| 13 | Steam Thumbnail Downloader | Downloading Steam `header_image` to `%APPDATA%\softgame-library\thumbnails\` and returning URL ref | M2 | ORIGINAL_REQUEST §R1 |
| 14 | Frontend Wails API Shim | `renderer/wails-bridge.js` providing `window.api` interface to `window.go.main.App` | M3 | ORIGINAL_REQUEST §R2 |
| 15 | Frontend Asset & HTML Adaptation | Updating `index.html` for `wails-bridge.js` inclusion and fixing `logo.svg` relative path | M3 | ORIGINAL_REQUEST §R2 |
| 16 | Frontend Bug & Scheme Fix | Guarding `#f-thumburl` in `app.js:546` and updating thumbnail deletion check for `/thumbnails/` | M3 | Survey (frontend handoff) |
| 17 | Game Catalog UI Integrity | Preserving grid cards, hover effects, search, sort (Terbaru, A-Z, Z-A), and responsive layout | M3 | ORIGINAL_REQUEST §R2 |
| 18 | Add/Edit/Delete Game Modals | Full CRUD form integration with input validation and toast notifications | M3 | ORIGINAL_REQUEST §R2 |
| 19 | Steam Link UI Workflow | Steam Link button, URL modal, auto-fill pre-population of form, and status messages | M3 | ORIGINAL_REQUEST §R2 |
| 20 | Portable Build Compilation | Compiling standalone executable in `build/bin/` with size < 15 MB | M4 | ORIGINAL_REQUEST §R3 |
| 21 | Electron Files Cleanup | Pruning `main.js`, `preload.js`, `dist/`, obsolete devDependencies, and node_modules | M4 | ORIGINAL_REQUEST §R3 |
| 22 | Project Documentation Update | Updating `README.md` with Wails v2 build, run, and dev instructions | M4 | ORIGINAL_REQUEST §R3 |
| 23 | E2E Test Suite Validation | 100% pass across all 4 tiers of opaque-box E2E tests | M5 | Acceptance Criteria |
| 24 | Adversarial Hardening (Tier 5) | White-box edge case testing and robustness verification | M5 | Acceptance Criteria |
| 25 | Backend Module Split | `app.go` divided into `app.go`/`library.go`/`thumbnails.go`/`steam.go`/`sanitize.go`/`system.go` with unchanged `window.api` contract | M6 | Optimisation pass |
| 26 | Path & Input Hardening | Single `safeThumbPath` gateway, image extension whitelist, size caps, trusted Steam image hosts, SVG sandbox headers, rune-safe truncation | M6 | Optimisation pass |
| 27 | Library Parse Cache | mtime+size fingerprint cache, batched timestamps, encoder-based JSON writes | M6 | Optimisation pass |
| 28 | Frontend Render Optimisation | Keyed grid reconciliation + element pool, cached search index, rAF-coalesced render with timeout fallback, delegated detail events, `content-visibility` cards | M6 | Optimisation pass |
| 29 | Windows Installer (NSIS) | `GameLibrary-Setup-<ver>-amd64.exe`: Indonesian wizard, per-user scope, WebView2 bootstrapper, LZMA, catalog preserved on uninstall | M6 | ORIGINAL_REQUEST (installer exe) |
| 30 | Build Script Surface | `npm run dev/test/build/installer` with `-trimpath -ldflags "-s -w"` | M6 | ORIGINAL_REQUEST (installer exe) |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Independent opaque-box test runner & suites (Tiers 1-4) published via `TEST_READY.md` | none | DONE |
| M1 | Backend Core & Persistence | `wails.json`, `go.mod`, `main.go`, `app.go` (`LoadLibrary`, `SaveLibrary`, `PickThumbnail`, `DeleteThumbnail`, `AssetServer.Handler`) | none | DONE |
| M2 | Utilities & Steam Import | `OpenExternal`, `CopyText`, `SteamImport` (API fetch, HTML spec parsing, image download) | M1 | DONE |
| M3 | Frontend Vanilla Integration | `wails-bridge.js`, `index.html`, `app.js` fixes, asset paths, UI event binding | M1, M2 | DONE |
| M4 | Portable Build & Cleanup | `wails build` < 15MB, prune `main.js`/`preload.js`/`dist/`, update `package.json` & `README.md` | M3 | DONE |
| M5 | Final E2E Pass & Hardening | 100% E2E test pass (Phase 1) + Adversarial hardening Tier 5 (Phase 2) + Forensic Audit | E2E, M4 | DONE |
| M6 | Optimisation & Installer | Backend module split, path/input hardening, parse cache, keyed grid rendering, NSIS per-user installer + build scripts | M5 | DONE |

---

## Interface Contracts

### Frontend ↔ Go Backend Contract (`window.api` ↔ `window.go.main.App`)
```typescript
interface SystemSpecs {
  os: string;
  cpu: string;
  ram: string;
  gpu: string;
  dx: string;
  net: string;
  storage: string;
  sound: string;
  notes: string;
}

interface SpecsContainer {
  min: SystemSpecs;
  rec: SystemSpecs;
}

interface Game {
  id: string;
  title: string;
  thumbnail: string;
  link: string;
  genre: string;
  size: string;
  price: string;
  steamAppId: string;
  specs: SpecsContainer;
  createdAt: string;
  updatedAt: string;
}

interface SteamImportResult {
  appId: string;
  title: string;
  thumbnail: string;
  genre: string;
  developer: string;
  releaseDate: string;
  price: string;
  specs: SpecsContainer;
}

// Backend API exposed on window.go.main.App and bridged to window.api
interface BackendAPI {
  LoadLibrary(): Promise<Game[]>;
  SaveLibrary(games: Game[]): Promise<void>;
  PickThumbnail(): Promise<string>; // returns "/thumbnails/<hex>.<ext>" or ""
  DeleteThumbnail(ref: string): Promise<void>;
  OpenExternal(url: string): Promise<void>;
  CopyText(text: string): Promise<void>;
  SteamImport(url: string): Promise<SteamImportResult>;
}
```

### Storage Contract
- Library file: `%APPDATA%\softgame-library\library.json`
- Thumbnails directory: `%APPDATA%\softgame-library\thumbnails\`
- URL scheme in frontend: `/thumbnails/<filename>` (legacy `glib://thumb/<filename>` normalized on load)

---

## Code Layout
```
c:\Users\Daffa\Desktop\Libray Game\
├── go.mod / go.sum
├── wails.json
├── package.json                 # npm run dev | test | build | installer
├── main.go                      # Wails bootstrap & options
├── app.go                       # Models, App struct, lifecycle, HTTP client, limits
├── library.go                   # Persistence: load/save, atomic write, parse cache
├── thumbnails.go                # Asset handler, picker, deletion, safeThumbPath
├── steam.go                     # Steam import, image download, sysreq parsing
├── sanitize.go                  # Field sanitisation, UUID v4, rune-safe truncation
├── system.go                    # OpenExternal, CopyText
├── app_test.go                  # Unit tests (9)
├── app_stress_test.go           # Stress/concurrency tests (12)
├── boundary_adversarial_test.go # Adversarial white-box tests (7)
├── hardening_test.go            # Refactor proof tests (10)
├── build/
│   ├── appicon.png
│   ├── bin/                     # SoftGameLibrary.exe, GameLibrary-Setup-<ver>-amd64.exe
│   └── windows/
│       ├── icon.ico
│       ├── info.json
│       ├── wails.exe.manifest
│       └── installer/
│           ├── project.nsi      # Installer script (customise here)
│           ├── wails_tools.nsh  # Regenerated by Wails; do not edit
│           └── resources/       # sidebar.bmp + header.bmp (generated)
├── tools/
│   └── gen-installer-images/    # NSIS wizard artwork generator (stdlib only)
├── renderer/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── wails-bridge.js
│   └── assets/logo.svg
└── tests/
    ├── e2e/                     # Tiers 1-4 (161 assertions), test_utils.ps1
    └── stress/                  # Load & resilience runners
```

<!-- END SOURCE: PROJECT.md -->
</details>
<details>
<summary>README.md · 246 baris · disalin verbatim</summary>

<!-- BEGIN SOURCE: README.md -->

# SoftGame Library

A lightweight, portable digital game catalog application built with **Wails v2** (Go + Microsoft Edge WebView2) and modern vanilla web technologies (HTML5, CSS3, ES6).

SoftGame Library allows users to manage their game dan software catalog, view system requirements, auto-import game metadata from the Steam Store API, manage thumbnails locally, and quickly share or open download links (Google Drive).

---

## Architecture & Technology Stack

- **Backend**: Go 1.23+ powered by **Wails v2.16.0**
  - High performance, minimal memory footprint (~30–50 MB RAM vs ~150–200 MB in Electron).
  - Native Windows single-instance mutex (`com.daffa.softgamelibrary`) focusing existing window on subsequent launches.
  - Native runtime integration for file picker dialogs, system clipboard, and default browser launching.
  - Custom dynamic asset handler (`AssetServer.Handler`) serving local thumbnails securely from AppData.
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript (ES6) in `renderer/`
  - Steam-inspired dark UI theme (`#171a21`, `#1b2838`, `#66c0f4`).
  - Epic Games style responsive grid card layout (`repeat(auto-fill, minmax(250px, 1fr))`).
  - Keyed incremental grid rendering: cards are reused (plus an element pool) instead of being rebuilt on every keystroke, so thumbnails are not re-decoded and the grid does not flicker while searching.
  - Cached lowercase search index per game, render passes coalesced to one per animation frame, and event delegation instead of per-render listeners.
  - `content-visibility: auto` on cards so the browser skips layout/paint of off-screen cards in large libraries.
  - Lightweight bridge shim (`wails-bridge.js`) interfacing UI events seamlessly with Go backend bindings.
  - Zero npm dependencies, bundlers, or heavy frontend frameworks.
- **Output**:
  - Portable standalone executable: `build/bin/SoftGameLibrary.exe` (~11.4 MB, below the 15 MB budget).
  - Windows installer: `build/bin/GameLibrary-Setup-<version>-amd64.exe` (~5.3 MB, LZMA, per-user install, Indonesian UI).

---

## Key Features

1. **Steam Store Auto-Import**:
   - Paste any public Steam game store link (e.g., `https://store.steampowered.com/app/271590/Grand_Theft_Auto_V/`).
   - Automatically retrieves game title, developer, release date, genres, and pricing.
   - Parses minimum and recommended system requirements (OS, CPU, RAM, GPU, DirectX, Network, Storage, Sound, Notes).
   - Automatically downloads and caches official Steam header banner images as local thumbnails.

2. **Full SoftGame Library Management (CRUD)**:
   - Add, edit, and delete game entries with comprehensive details.
   - Real-time title search and multi-criteria sorting (Terbaru, A-Z, Z-A).
   - Form input validation preventing invalid entries.

3. **Local Thumbnail Management**:
   - Native Windows file picker supporting PNG, JPG, JPEG, WEBP, GIF, SVG, and BMP images.
   - Unique hex-hashed filename storage in AppData with path-traversal protection.
   - Automatic thumbnail cleanup upon replacement or game deletion.

4. **One-Click Sharing & Browser Integration**:
   - Copy download links (Google Drive) directly to clipboard with toast notification feedback.
   - "Buka di Browser" button opens download links directly in the default Windows browser.

5. **Robust Data Persistence & Recovery**:
   - Atomic disk commits (`.tmp` write followed by rename) preventing database corruption during unexpected shutdowns.
   - Automatic corrupted database recovery with timestamped backups (`library.json.rusak-<timestamp>`) and fallback initialization.
   - In-memory parse cache keyed by file fingerprint (mtime + size), so opening the library does not re-read and re-parse the JSON on every call; external edits are still detected.

6. **Hardening**:
   - Single validated gateway (`safeThumbPath`) for every thumbnail read/write/delete: rejects separators, `..`, absolute paths, drive letters, null bytes, dot files, and any extension outside the image whitelist.
   - Downloaded and picked images are size-capped (25 MB) and content-checked; Steam image URLs must be HTTPS on trusted Valve hosts.
   - SVG responses carry `Content-Security-Policy: ... sandbox` and `X-Content-Type-Options: nosniff`, so a stored SVG cannot script against the app origin.
   - All field truncation is rune-safe, so multi-byte titles (CJK, accents, emoji) never turn into mojibake at the length limit.
   - Outbound HTTP requests run under a deadline tied to the window context, and `OpenExternal` validates via `url.Parse` (http/https with a host only).

---

## System Requirements

- **Operating System**: Windows 10 / Windows 11 (64-bit)
- **Web Engine**: Microsoft Edge WebView2 Evergreen Runtime (pre-installed on Windows 10/11)
- **Development & Compilation**:
  - Go 1.25 or newer (`go version`)
  - Wails v2 CLI 2.16.0 or newer (`wails version`)
  - NSIS 3.x only when building the installer (`makensis -VERSION`)

---

## Data Persistence Locations

SoftGame Library stores all user data in standard Windows Application Data directories:

- **Database**: `%APPDATA%\softgame-library\library.json`
- **Cached Thumbnails**: `%APPDATA%\softgame-library\thumbnails\`

Legacy thumbnail references (from prior Electron versions using `glib://thumb/*`) are automatically normalized to `/thumbnails/*` upon load.

---

## Development Workflow

To run the application in live-development mode with hot-reloading:

```powershell
# Ensure Go and Wails are in PATH
$env:PATH = "C:\Program Files\Go\bin;C:\Users\Daffa\go\bin;" + $env:PATH

# Start Wails dev server
wails dev
```

---

## Building the Portable Standalone Executable

To produce an optimized, standalone Windows 64-bit portable executable:

```powershell
# Set environment PATH
$env:PATH = "C:\Program Files\Go\bin;C:\Users\Daffa\go\bin;" + $env:PATH

# Compile with stripped symbols and trimmed paths
wails build -clean -ldflags "-s -w" -trimpath -o SoftGameLibrary.exe
```

The resulting binary will be output to:
```
build/bin/SoftGameLibrary.exe
```

### Build Verification & Metrics
- **Format**: Windows PE x64 standalone executable
- **Size**: ~11.4 MB (strictly < 15 MB)
- **Dependencies**: Uses system WebView2 runtime; no external DLLs or Node.js runtime required.

---

## Building the Windows Installer (NSIS)

The installer is produced by Wails' NSIS integration, so it packages the same
binary plus the WebView2 bootstrapper into a single setup executable.

Prerequisite (one-time): [NSIS 3.x](https://nsis.sourceforge.io/Download) must be
installed and `makensis` reachable. Installed via winget it lands in
`C:\Program Files (x86)\NSIS`, which is added to `PATH` by the installer itself:

```powershell
winget install -e --id NSIS.NSIS
```

Build portable exe **and** installer in one step:

```powershell
$env:PATH = "C:\Program Files\Go\bin;C:\Users\Daffa\go\bin;C:\Program Files (x86)\NSIS;" + $env:PATH

npm run installer
# sama dengan:
wails build -clean -platform windows/amd64 -trimpath -ldflags "-s -w" -o SoftGameLibrary.exe -nsis -installscope user
```

Output:

```
build/bin/GameLibrary-Setup-1.0.0-amd64.exe
```

Installer behaviour (defined in `build/windows/installer/project.nsi`):

- Indonesian wizard with an English fallback language.
- Branded wizard artwork: sidebar (164x314) and header (150x57) 24-bit BMPs are
  generated from `build/appicon.png` by `go run ./tools/gen-installer-images`
  (also wired into `npm run installer` and available as `npm run assets:installer`).
  NSIS rejects other formats/sizes, so regenerate after changing the app icon.
- **Per-user install** (`%LOCALAPPDATA%\Programs\SoftGame Library`) — no UAC prompt.
- Registers in *Apps & features* / `HKCU\...\Uninstall\GameLibrary`, creates Start
  Menu and Desktop shortcuts, and offers "Jalankan SoftGame Library sekarang".
- Installs the WebView2 Runtime automatically when the system lacks it.
- Uninstall removes program files and shortcuts but **keeps** the catalog in
  `%APPDATA%\softgame-library`, so a reinstall restores the collection.
- LZMA solid compression (~5.3 MB for a 11.4 MB executable).

Silent install / uninstall for testing:

```powershell
.\build\bin\GameLibrary-Setup-1.0.0-amd64.exe /S /D=C:\temp\gl
& "C:\temp\gl\uninstall.exe" /S
```

> `build/windows/installer/wails_tools.nsh` is regenerated by Wails on every
> build. Keep all customisation in `project.nsi`, before its `!include`.

---

## Testing & Quality Assurance

### Go Unit Tests
Run backend unit tests verifying library persistence, atomic writes, thumbnail routing, sysreq parsing, and Steam import logic:

```powershell
$env:PATH = "C:\Program Files\Go\bin;C:\Users\Daffa\go\bin;" + $env:PATH
go test -v ./...
```

### End-to-End (E2E) Test Suite
Run the automated multi-tier PowerShell verification suites:

```powershell
# Run all test tiers (Features, Boundaries, Combinations, Scenarios)
pwsh -File tests/e2e/run_tests.ps1
```

---

## Project Structure

```
c:\Users\Daffa\Desktop\Libray Game\
├── main.go                # Application entry point, Wails options & asset server
├── app.go                 # Models, App struct, lifecycle, HTTP client, guard-rail constants
├── library.go             # LoadLibrary / SaveLibrary, atomic write, parse cache, sample data
├── thumbnails.go          # Asset server handler, picker, deletion, path validation
├── steam.go               # Steam Store import, header image download, sysreq parsing
├── sanitize.go            # Field sanitisation, rune-safe truncation, UUID v4
├── system.go              # OpenExternal & CopyText (OS integration)
├── app_test.go            # Unit tests for Go backend services
├── app_stress_test.go     # Concurrency, capacity, and resilience stress tests
├── boundary_adversarial_test.go  # White-box adversarial edge cases
├── hardening_test.go      # Proofs for the refactor: UTF-8 safety, path isolation, cache
├── wails.json             # Wails v2 project configuration
├── go.mod / go.sum        # Go module definition & checksums
├── package.json           # Project metadata & build scripts (dev/test/build/installer)
├── build/
│   ├── appicon.png        # Source application icon
│   ├── bin/               # SoftGameLibrary.exe + GameLibrary-Setup-<ver>-amd64.exe (gitignored)
│   └── windows/
│       ├── icon.ico       # Windows application icon
│       ├── info.json      # Executable metadata configuration
│       ├── wails.exe.manifest # DPI awareness & Windows assembly manifest
│       └── installer/
│           ├── project.nsi    # NSIS installer script (Indonesian wizard, per-user scope)
│           └── wails_tools.nsh # Regenerated by Wails each build (do not hand-edit)
├── renderer/              # Vanilla frontend assets
│   ├── index.html         # Main UI layout & modal structures
│   ├── styles.css         # Steam dark theme & Epic Games grid styles
│   ├── app.js             # UI controller, keyed grid rendering, state management
│   ├── wails-bridge.js    # Shim translating window.api to window.go.main.App
│   └── assets/
│       └── logo.svg       # Vector application logo
└── tests/
    ├── e2e/               # Automated multi-tier verification test suite (Tiers 1-4)
    └── stress/            # Load & resilience PowerShell stress runners
```

---

## License

MIT License © 2026 Daffa.

<!-- END SOURCE: README.md -->
</details>
<details>
<summary>TEST_INFRA.md · 50 baris · disalin verbatim</summary>

<!-- BEGIN SOURCE: TEST_INFRA.md -->

# E2E Test Infra: Game Library Wails v2 Migration

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests verify the external behavior, file system artifacts, API contracts, executable properties, and user workflows specified in `ORIGINAL_REQUEST.md`. No reliance on internal implementation details.
- **Methodology**: Systematic 4-tier methodology (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, and Real-World Workload Testing).

## Feature Inventory Coverage Matrix
| # | Feature | Requirement | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Combination) | Tier 4 (Scenario) |
|---|---------|-------------|:----------------:|:-----------------:|:--------------------:|:-----------------:|
| 1 | Wails v2 Configuration & Build | ORIGINAL_REQUEST §R3 | 5 tests | 5 tests | ✓ | ✓ |
| 2 | Executable Size & RAM Efficiency | ORIGINAL_REQUEST §R3 | 5 tests | 5 tests | ✓ | ✓ |
| 3 | Library Data Loading (`LoadLibrary`) | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 4 | Library Data Saving (`SaveLibrary`) | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 5 | Data Persistence & Atomicity | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 6 | Thumbnail Import & Serving | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 7 | Thumbnail Deletion | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 8 | Steam Import API & Specs Parsing | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 9 | OS Integration (Browser & Clipboard) | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 10 | Frontend Bridge & UI State | ORIGINAL_REQUEST §R2 | 5 tests | 5 tests | ✓ | ✓ |
| 11 | Search & Filter Operations | Acceptance Criteria | 5 tests | 5 tests | ✓ | ✓ |
| 12 | Sort Operations (New, A-Z, Z-A) | Acceptance Criteria | 5 tests | 5 tests | ✓ | ✓ |
| 13 | Game CRUD (Add, Edit, Delete) | Acceptance Criteria | 5 tests | 5 tests | ✓ | ✓ |
| 14 | Project Cleanup & Hygiene | ORIGINAL_REQUEST §R3 | 5 tests | 5 tests | ✓ | ✓ |

## Test Architecture
- **Runner**: `tests/e2e/run_tests.ps1` (or Go-based test runner `tests/e2e/e2e_test.go`).
- **Pass/Fail Semantics**: Each test asserts expected vs actual state; exit code 0 on all tests passing, non-zero on any failure.
- **Artifacts Checked**:
  - Binary existence at `build/bin/GameLibrary.exe`, size `< 15,728,640 bytes`.
  - Database schema & contents at `%APPDATA%\libray-game\library.json`.
  - Thumbnail cache at `%APPDATA%\libray-game\thumbnails\`.
  - Absence of pruned Electron files (`main.js`, `preload.js`, `dist/`).
  - API method contract responses.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| S1 | Fresh App Install & First Run | F1, F3, F4, F5, F10 | App launches, creates default `%APPDATA%\libray-game` directory, generates sample games with thumbnails, renders library grid. |
| S2 | Existing Electron Data Migration | F3, F5, F6, F10, F12 | Existing user `library.json` containing `glib://thumb/` references loads seamlessly, images resolve via `/thumbnails/`, game cards render intact. |
| S3 | Steam Link Game Import & Save | F6, F8, F10, F13 | User inputs Steam URL `https://store.steampowered.com/app/304390/`, metadata & specs auto-fill, header image downloads, user enters Google Drive link and saves game. |
| S4 | Search, Filter, Sort & External Link Copy | F9, F11, F12 | User searches for game, sorts by A-Z, copies Google Drive link to clipboard (verifying toast & clipboard content), opens in browser. |
| S5 | Complete Game Lifecycle (Add, Edit, Delete) | F4, F5, F6, F7, F13 | User adds game with custom thumbnail, edits title/price, updates thumbnail (verifying obsolete thumbnail is unlinked), then deletes game (verifying record and image deleted). |
| S6 | Corrupted JSON Auto-Recovery | F3, F4, F5 | User writes corrupted non-JSON data to `library.json`. On start, app backs up corrupted file to `.rusak-<ts>`, creates fresh sample library, and continues operating without crashing. |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: >= 70 tests (14 features × 5 tests).
- **Tier 2 (Boundary & Corner Cases)**: >= 70 tests (14 features × 5 tests).
- **Tier 3 (Cross-Feature Combinations)**: >= 14 tests (pairwise feature interactions).
- **Tier 4 (Real-World Application Scenarios)**: >= 7 application scenarios.
- **Total Minimum Target**: >= 161 tests.

<!-- END SOURCE: TEST_INFRA.md -->
</details>
<details>
<summary>TEST_READY.md · 72 baris · disalin verbatim</summary>

<!-- BEGIN SOURCE: TEST_READY.md -->

# TEST_READY: Opaque-Box E2E Test Suite Publication

## Test Runner Command
To execute the complete E2E test suite across all 4 tiers:
```powershell
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1
```

To execute individual tiers:
```powershell
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Tier 1   # Tier 1: Feature Coverage (70 tests)
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Tier 2   # Tier 2: Boundary & Corner Cases (70 tests)
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Tier 3   # Tier 3: Pairwise Combinations (14 tests)
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Tier 4   # Tier 4: Real-World Scenarios (7 scenarios)
```

To filter specific tests by ID or name regex:
```powershell
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Filter "Steam"
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Filter "T3\."
```

---

## Test Suite Execution Summary
| Test Suite Tier | Total Tests | Passed | Failed | Pass Rate | Execution Time |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tier 1: Feature Coverage** | 70 | 70 | 0 | 100.0% | ~16.4s |
| **Tier 2: Boundary & Corner Cases** | 70 | 70 | 0 | 100.0% | ~4.5s |
| **Tier 3: Pairwise Combinations** | 14 | 14 | 0 | 100.0% | ~8.1s |
| **Tier 4: Real-World Scenarios** | 7 | 7 | 0 | 100.0% | ~1.0s |
| **TOTAL ACROSS ALL TIERS** | **161** | **161** | **0** | **100.0%** | **~32.6s** |

---

## Feature Checklist & Test Mapping
| # | Feature Name | Tier 1 (Features) | Tier 2 (Boundaries) | Tier 3 (Combos) | Tier 4 (Scenarios) | Total Tests | Status |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| F1 | Wails v2 Configuration & Build | T1.1.1–T1.1.5 (5) | T2.1.1–T2.1.5 (5) | T3.13 | S1 | 12 | PASS |
| F2 | Executable Size & RAM Efficiency | T1.2.1–T1.2.5 (5) | T2.2.1–T2.2.5 (5) | T3.13 | - | 11 | PASS |
| F3 | Library Data Loading (`LoadLibrary`) | T1.3.1–T1.3.5 (5) | T2.3.1–T2.3.5 (5) | T3.1, T3.3, T3.12 | S1, S2, S6, S7 | 16 | PASS |
| F4 | Library Data Saving (`SaveLibrary`) | T1.4.1–T1.4.5 (5) | T2.4.1–T2.4.5 (5) | T3.1, T3.2, T3.6 | S1, S5, S6, S7 | 16 | PASS |
| F5 | Data Persistence & Atomicity | T1.5.1–T1.5.5 (5) | T2.5.1–T2.5.5 (5) | T3.2, T3.3 | S1, S2, S5, S6 | 16 | PASS |
| F6 | Thumbnail Import & Serving | T1.6.1–T1.6.5 (5) | T2.6.1–T2.6.5 (5) | T3.4, T3.5, T3.12 | S2, S3, S5 | 15 | PASS |
| F7 | Thumbnail Deletion | T1.7.1–T1.7.5 (5) | T2.7.1–T2.7.5 (5) | T3.4, T3.9 | S5 | 13 | PASS |
| F8 | Steam Import API & Specs Parsing | T1.8.1–T1.8.5 (5) | T2.8.1–T2.8.5 (5) | T3.5, T3.6 | S3 | 13 | PASS |
| F9 | OS Integration (Browser & Clipboard) | T1.9.1–T1.9.5 (5) | T2.9.1–T2.9.5 (5) | T3.10, T3.11 | S4 | 13 | PASS |
| F10 | Frontend Bridge & UI State | T1.10.1–T1.10.5 (5) | T2.10.1–T2.10.5 (5) | T3.10, T3.11 | S1, S2, S3 | 15 | PASS |
| F11 | Search & Filter Operations | T1.11.1–T1.11.5 (5) | T2.11.1–T2.11.5 (5) | T3.7, T3.8 | S4, S7 | 14 | PASS |
| F12 | Sort Operations (New, A-Z, Z-A) | T1.12.1–T1.12.5 (5) | T2.12.1–T2.12.5 (5) | T3.7 | S2, S4, S7 | 14 | PASS |
| F13 | Game CRUD (Add, Edit, Delete) | T1.13.1–T1.13.5 (5) | T2.13.1–T2.13.5 (5) | T3.8, T3.9, T3.14 | S3, S5 | 15 | PASS |
| F14 | Project Cleanup & Hygiene | T1.14.1–T1.14.5 (5) | T2.14.1–T2.14.5 (5) | T3.14 | - | 11 | PASS |

---

## File Structure
```
tests/e2e/
├── run_tests.ps1           # Master test runner with color reporting & tier switches
├── test_utils.ps1          # Assertions, PE binary parser, and sandbox isolation helpers
├── tier1_features.ps1      # Tier 1: 70 feature verification tests
├── tier2_boundaries.ps1    # Tier 2: 70 boundary and corner case tests
├── tier3_combinations.ps1  # Tier 3: 14 pairwise interaction tests
└── tier4_scenarios.ps1     # Tier 4: 7 real-world end-to-end workflows
```

## Opaque-Box Verification Capabilities
1. **Binary Properties**: Validates PE executable signatures ("MZ", PE00), AMD64 architecture (0x8664), Windows GUI subsystem (suppressing console popup), and size strict threshold (< 15 MB).
2. **Filesystem & AppData**: Validates automatic directory initialization in `%APPDATA%\libray-game`, sample SVG generation, and hex-named thumbnail assets.
3. **Database Integrity & Atomicity**: Verifies `.tmp` file atomic write and rename strategy, and `.rusak-<ts>` corruption auto-recovery.
4. **Network & Steam API**: Verifies Steam Store API requests, English localization parameters, PC requirements HTML table parsing, and header image downloading.
5. **Project Hygiene**: Enforces absence of obsolete Electron files (`main.js`, `preload.js`, `dist/`), removal of Electron npm dependencies, and presence of Wails documentation.

<!-- END SOURCE: TEST_READY.md -->
</details>
<details>
<summary>qoder-store/project-build-verification-gotchas.md · dari memori Qoder, berkas aslinya dipertahankan· 64 baris · disalin verbatim</summary>

<!-- BEGIN SOURCE: qoder-store/project-build-verification-gotchas.md -->

---
name: project-build-verification-gotchas
description: Gotcha build/verifikasi Game Library: NSIS off-PATH, E2E wajib pwsh, assertion E2E terikat teks sumber Go, mutex instance tunggal, skrip screenshot harus SetProcessDPIAware, fokus jendela ditolak Windows
metadata:
  type: project
---

Hal-hal yang menghemat waktu saat build/verifikasi proyek Wails "Game Library" ini:

- **NSIS** dipasang via `winget install -e --id NSIS.NSIS` dan berada di
  `C:\Program Files (x86)\NSIS`. Shell yang sudah terbuka sebelum instal **tidak**
  melihatnya → `export PATH="$PATH:/c/Program Files (x86)/NSIS"` (atau setara PowerShell)
  sebelum `wails build -nsis`, kalau tidak Wails hanya mencetak "makensis not found"
  dan build tetap "sukses" tanpa installer.
- **Suite E2E wajib dijalankan dengan `pwsh` (PowerShell 7)**, bukan `powershell.exe` 5.1.
  Di 5.1 ada ~8 kegagalan palsu (`.Count` pada objek tunggal, variabel `$matches`)
  yang terlihat seperti regresi padahal bukan.
- **Assertion E2E memeriksa TEKS SUMBER Go**, bukan hanya perilaku. Helper
  `Get-GoSource` di `tests/e2e/test_utils.ps1` membaca seluruh `*.go` non-test di root.
  Jadi: memindahkan kode antar berkas relatif aman, tapi mengganti nama variabel/konstanta
  (`0755` → `0o755`, `trim(g.Title, 200)` → `maxLenTitle`, `randomBytes` → `buf`)
  membuat test gagal. **Why:** suite ini ditulis white-box saat migrasi Electron→Wails.
  **How to apply:** setiap refactor yang mengubah literal sumber, jalankan
  `pwsh -File tests/e2e/run_tests.ps1 -Tier all` dan perbarui polanya ke bentuk
  ekuivalen (jangan hapus test-nya).
- Berkas Go baru sebaiknya tetap di **root repo** — `//go:embed all:renderer` dan
  `Get-GoSource` sama-sama mengasumsikan backend di satu level itu.
- **Installer bersifat per-pengguna** (`%LOCALAPPDATA%\Programs\Game Library`), dan
  build portable maupun hasil instal memakai **mutex instance tunggal yang sama**
  (`com.daffa.libraygame`). Membuka pintasan saat instance lain masih hidup hanya
  memfokuskan jendela lama — ini tampak seperti "installer tidak jalan".
- `build/bin/` dan `build/windows/installer/tmp/` di-gitignore; `GameLibrary.exe`
  akan selalu muncul lagi setiap `npm run build`/`installer` karena NSIS membungkusnya.
  Gambar bukti (`build/bukti-*.png`) juga di-ignore.

**Mesin user (penting untuk UI & tangkapan layar)**
- Layar: **1920×1080 dengan scaling 125%** → area kerja efektif **1536×816 px logis**.
  Apa pun yang lebih tinggi dari ~800px akan terdorong Windows ke atas layar
  (inilah sebabnya jendela 880px sempat kehilangan title bar).
- Skrip PowerShell untuk screenshot **wajib memanggil `SetProcessDPIAware()`** lebih dulu.
  Tanpa itu proses DPI-unaware: `Screen::WorkingArea` melapor 1536×816 tapi
  `CopyFromScreen` mengambil pixel fisik → hanya ~80% kiri layar yang ter-capture dan
  tombol minimize/maximize/close di pojok kanan tidak pernah masuk frame. Saya sempat
  menyimpulkan salah "tombolnya hilang" karena ini, bukan karena aplikasinya.
- Windows menolak `SetForegroundWindow`/`SwitchToThisWindow` dari proses latar
  (focus-stealing prevention), apalagi saat user sedang aktif di jendela lain.
  Yang terbukti bekerja: tekan-lepas ALT via `keybd_event` sebelum `SetForegroundWindow`,
  atau minimalkan jendela ber-caption lain lalu **pulihkan di blok `finally`**
  (jangan memulihkan sebelum capture, kalau tidak jendela lain menimpa lagi).
  Skrip harus berhenti dengan error kalau `GetForegroundWindow()` tidak cocok —
  jangan pernah menghasilkan "bukti" dari jendela yang tertutup.

**NSIS / installer**
- `wails build -installscope user` sudah mengirim `-DREQUEST_EXECUTION_LEVEL=user`
  di command line, jadi di `project.nsi` nilai itu harus dibungkus `!ifndef` —
  `!define` polos membuat makensis gagal dengan "already defined".
- `PRODUCT_EXECUTABLE` default diturunkan dari **name** proyek (`libray-game.exe`),
  bukan `outputfilename` (`GameLibrary.exe`) → override lewat
  `!define INFO_PROJECTNAME`/`PRODUCT_EXECUTABLE` di `project.nsi`, kalau tidak
  pintasan Start Menu/Desktop menunjuk file yang tidak ada.
- `wails_tools.nsh` ditulis ulang Wails setiap build; semua kustomisasi hanya boleh
  di `project.nsi`, sebelum `!include`-nya.
- Artwork wizard NSIS harus BMP 24-bit dengan ukuran kaku: sidebar 164×314,
  header 150×57 — generatornya ada di repo (lihat `npm run assets:installer`).

<!-- END SOURCE: qoder-store/project-build-verification-gotchas.md -->
</details>
<!-- ARCHIVE-END -->
