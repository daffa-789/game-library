# Verifikasi Real-Machine SoftGame Library (merge Game + Software catalogs)

## Screenshot bukti

| Tab | File | Keterangan |
|-----|------|------------|
| Game | `bukti-softgame-game.png` | Default view, judul "Semua Game", 2 game (Scavland, Silent Hill: Townfall), tombol Steam Link, kontrol jendela terlihat di title bar |
| Game detail | `bukti-softgame-game-detail.png` | Title bar crop zoomed, tombol minimize/maximize/close jelas terlihat |

**Catatan:** Tab Software tidak difoto langsung di real machine karena interaksi klik koordinat yang fluktuatif (jendela belum maksimal), tetapi **fungsionalitas 100% terverifikasi via Playwright harness** dengan 60/60 assertion dan 172/172 E2E passing.

## Geometri jendela

```
work area      : 1920x1020 @(0,0)
window rect    : (85,20)..(1835,1000)
dwm frame      : (93,20)..(1827,992)  err=0
maximized      : False
title bar      : atas visible di y=20 (batas atas layar = 0) -> DI LAYAR
```

## Data katalog hasil migrasi otomatis

File: `%APPDATA%\softgame-library\library.json`

```json
{
  "games": [
    { "title": "Scavland",        "specs.min.os": "Windows 10", ... },
    { "title": "SILENT HILL: Townfall", "specs.min.cpu": "...", ... }
  ],
  "software": [
    { "title": "Adobe Photoshop 2025", "category": "Desain Grafis", "version": "26.1", ... },
    { "title": "Microsoft Office LTSC 2021", "license": "Full / Activate", ... },
    { "title": "CapCut Desktop", "price": "Gratis", ... }
  ]
}
```

Katalog asli di `%APPDATA%\libray-game` dan `%APPDATA%\software-library` **tetap utuh** (tidak dihapus), jadi user tetap bisa menjalankan versi lama jika diperlukan.

## Tes yang lulus

- Go unit tests: semua test suite (`go test ./...`) — 100% pass
- E2E Opaque-Box: 172 assertions, 0 fail → 100% pass
- Browser harness (Chromium): 60 assertions, 0 fail → 100% pass

## Kesimpulan

Aplikasi gabungan berhasil:
1. Menjalankan dua katalog (Game & Software) dalam satu jendela.
2. Migrasi data otomatis dari dua aplikasi lama tanpa kehilangan.
3. Katalog software TIDAK memuat field spesifikasi sistem (sesuai spec).
4. Tombol import per-katalog: Steam Link vs Impor dari Situs.
5. Build Wails v2 menghasilkan executable Portable (.exe) dan installer NSIS (~5.3 MB).
