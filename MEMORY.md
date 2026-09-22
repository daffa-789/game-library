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
| Framework desktop | **Electron** (versi terbaru via npm, Node ≥ 18 punya `fetch` global) |
| UI | Vanilla HTML/CSS/JS — **tanpa build step, tanpa framework** |
| Penyimpanan | File JSON di AppData (bukan SQL — disengaja agar simpel & portabel) |
| Build installer | electron-builder (target: nsis + portable) |
| Node di mesin dev | v24.18.0 |

Perintah:
```bash
npm install        # sekali saja
npm start          # jalankan app (development)
npm run dist       # build installer ke folder dist/
npm run make-icon  # regenerasi assets/icon.ico dari assets/logo.svg
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
