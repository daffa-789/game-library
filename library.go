package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ---------------------------------------------------------------------------
// Backend API: Library Persistence
//
// Desain:
//   - satu file JSON (library.json) sebagai sumber kebenaran, kompatibel dengan
//     skema lama hasil migrasi Electron;
//   - tulis atomik (tmp + rename) supaya proses lain tidak pernah melihat file
//     separuh tertulis;
//   - cache hasil parse di in-memory dengan fingerprint (mtime+size) supaya
//     LoadLibrary tidak selalu membaca dan unmarshal file dari disk.
// ---------------------------------------------------------------------------

func (a *App) LoadLibrary() ([]Game, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	fi, err := os.Stat(a.dataFile)
	if err != nil {
		if !os.IsNotExist(err) {
			return []Game{}, nil
		}
		// Database pertama kali: buat data contoh agar UI tidak kosong melompong.
		sample := a.createSampleData()
		if writeErr := a.writeLibraryLocked(sample); writeErr != nil {
			return sample, nil
		}
		return sample, nil
	}

	if fi.Size() > maxLibraryFileBytes {
		a.quarantineLibrary(fmt.Sprintf("ukuran file %d byte melewati batas", fi.Size()))
		return []Game{}, nil
	}

	finger := fingerprint(fi)
	if a.libraryCached && a.libraryFinger == finger {
		return a.libraryCache, nil
	}

	content, err := os.ReadFile(a.dataFile)
	if err != nil {
		return []Game{}, nil
	}

	var fileData LibraryFile
	if err := json.Unmarshal(content, &fileData); err != nil {
		a.quarantineLibrary("JSON tidak valid")
		return []Game{}, nil
	}

	games := fileData.Games
	if games == nil {
		games = []Game{}
	}
	normalizeThumbRefs(games)

	a.libraryCache = games
	a.libraryFinger = finger
	a.libraryCached = true

	return games, nil
}

func (a *App) SaveLibrary(games []Game) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if games == nil {
		games = []Game{}
	}
	if len(games) > maxGames {
		games = games[:maxGames]
	}

	// Satu timestamp untuk seluruh batch: lebih murah (time.Now + format 28
	// byte per game) dan membuat UpdatedAt konsisten dalam satu kali simpan.
	now := time.Now().UTC().Format(time.RFC3339Nano)
	sanitized := make([]Game, len(games))
	for i, g := range games {
		sanitized[i] = a.sanitizeGame(g, now)
	}
	normalizeThumbRefs(sanitized)

	return a.writeLibraryLocked(sanitized)
}

// writeLibraryLocked menulis slice games ke disk secara atomik lalu menyinkronkan
// cache. Panggil dengan a.mu sudah dipegang.
func (a *App) writeLibraryLocked(games []Game) error {
	if err := os.MkdirAll(a.dataDir, 0o755); err != nil {
		return fmt.Errorf("gagal menyiapkan folder data: %w", err)
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false) // judul game sering memakai & dan <; tidak perlu \u003c
	enc.SetIndent("", "  ")
	if err := enc.Encode(LibraryFile{Games: games}); err != nil {
		return fmt.Errorf("gagal memformat data JSON: %w", err)
	}

	tmpFile := fmt.Sprintf("%s.tmp-%d", a.dataFile, time.Now().UnixNano())
	if err := os.WriteFile(tmpFile, buf.Bytes(), 0o644); err != nil {
		return fmt.Errorf("gagal menulis file sementara: %w", err)
	}

	if err := replaceFile(tmpFile, a.dataFile); err != nil {
		_ = os.Remove(tmpFile)
		return fmt.Errorf("gagal menyimpan file database: %w", err)
	}

	// Sinkronkan cache langsung dari file hasil tulis supaya fingerprint benar.
	if fi, err := os.Stat(a.dataFile); err == nil {
		a.libraryCache = games
		a.libraryFinger = fingerprint(fi)
		a.libraryCached = true
	} else {
		a.libraryCached = false
		a.libraryFinger = ""
	}
	return nil
}

// replaceFile memindahkan src ke dst, dengan satu kali retry untuk kondisi
// Windows di mana antivirus masih menahan handle dst.
func replaceFile(src, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	if err := os.Remove(dst); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.Rename(src, dst)
}

// quarantineLibrary memindahkan file library yang tidak bisa dibaca ke
// .rusak-<timestamp> lalu menghapus cache.
func (a *App) quarantineLibrary(reason string) {
	backup := fmt.Sprintf("%s.rusak-%d", a.dataFile, time.Now().UnixMilli())
	if err := os.Rename(a.dataFile, backup); err != nil {
		// Gagal mengarsip tidak boleh menghentikan aplikasi; file tetap
		// dianggap tidak terpakai dan cache dibuang.
		_ = err
	}
	a.libraryCached = false
	a.libraryFinger = ""
	_ = reason // hanya untuk penamaan/debug; tidak ditampilkan ke pengguna
}

func fingerprint(fi os.FileInfo) string {
	return fmt.Sprintf("%d-%d", fi.ModTime().UnixNano(), fi.Size())
}

// normalizeThumbRefs mengubah referensi skema lama glib://thumb/<file> menjadi
// /thumbnails/<file> yang dipakai AssetServer.
func normalizeThumbRefs(games []Game) {
	for i := range games {
		ref := games[i].Thumbnail
		if len(ref) >= len(legacyThumbPrefix) && ref[:len(legacyThumbPrefix)] == legacyThumbPrefix {
			games[i].Thumbnail = thumbURLPrefix + trimThumbPrefix(ref)
		}
	}
}

// createSampleData membuat 2 game contoh (+ thumbnail SVG-nya) untuk library
// yang masih kosong.
func (a *App) createSampleData() []Game {
	svg := func(title, sub string) string {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a475e"/><stop offset="1" stop-color="#141d28"/></linearGradient></defs><rect width="460" height="215" fill="url(#g)"/><text x="230" y="115" font-family="Segoe UI, Arial" font-size="32" font-weight="700" fill="#e5e5e5" text-anchor="middle">` +
			title + `</text><text x="230" y="145" font-family="Segoe UI, Arial" font-size="13" fill="#8f98a0" text-anchor="middle">` + sub + `</text></svg>`
	}

	samples := []struct{ file, title, sub string }{
		{"sample-gta.svg", "GTA V", "Action, Open World"},
		{"sample-elden.svg", "ELDEN RING", "Action RPG, Souls-like"},
	}
	for _, s := range samples {
		_ = os.WriteFile(filepath.Join(a.thumbsDir, s.file), []byte(svg(s.title, s.sub)), 0o644)
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	return []Game{
		{
			ID:        "sample-1",
			Title:     "Grand Theft Auto V",
			Thumbnail: thumbURLPrefix + "sample-gta.svg",
			Link:      "https://drive.google.com/drive/folders/sample-gta-link",
			Genre:     "Action, Open World",
			Size:      "110 GB",
			Price:     "Rp 400.000",
			CreatedAt: now,
			UpdatedAt: now,
			Specs: SpecsContainer{
				Min: SystemSpecs{
					OS:      "Windows 10 64 Bit",
					CPU:     "Intel Core 2 Quad CPU Q6600 @ 2.40GHz",
					RAM:     "4 GB RAM",
					GPU:     "NVIDIA 9800 GT 1GB / AMD HD 4870 1GB",
					DX:      "Version 10",
					Storage: "110 GB",
				},
				Rec: SystemSpecs{
					OS:      "Windows 10 64 Bit",
					CPU:     "Intel Core i5 3470 @ 3.2GHz",
					RAM:     "8 GB RAM",
					GPU:     "NVIDIA GTX 660 2GB / AMD HD 7870 2GB",
					DX:      "Version 11",
					Storage: "110 GB",
				},
			},
		},
		{
			ID:        "sample-2",
			Title:     "ELDEN RING",
			Thumbnail: thumbURLPrefix + "sample-elden.svg",
			Link:      "https://drive.google.com/drive/folders/sample-elden-link",
			Genre:     "Action RPG, Souls-like",
			Size:      "60 GB",
			Price:     "Rp 599.000",
			CreatedAt: now,
			UpdatedAt: now,
			Specs: SpecsContainer{
				Min: SystemSpecs{
					OS:      "Windows 10",
					CPU:     "INTEL CORE I5-8400 or AMD RYZEN 3 3300X",
					RAM:     "12 GB RAM",
					GPU:     "NVIDIA GEFORCE GTX 1060 3 GB or AMD RADEON RX 580 4 GB",
					DX:      "Version 12",
					Storage: "60 GB",
				},
				Rec: SystemSpecs{
					OS:      "Windows 10/11",
					CPU:     "INTEL CORE I7-8700K or AMD RYZEN 5 3600X",
					RAM:     "16 GB RAM",
					GPU:     "NVIDIA GEFORCE GTX 1070 8 GB or AMD RADEON RX VEGA 56 8 GB",
					DX:      "Version 12",
					Storage: "60 GB",
				},
			},
		},
	}
}
