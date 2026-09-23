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
//   - satu file JSON (library.json) dengan dua katalog: "games" dan "software";
//     file lama yang hanya punya "games" tetap terbaca tanpa konversi;
//   - tulis atomik (tmp + rename) supaya proses lain tidak pernah melihat file
//     separuh tertulis;
//   - cache hasil parse di in-memory dengan fingerprint (mtime+size) supaya
//     LoadLibrary / LoadSoftware tidak selalu membaca dan unmarshal dari disk.
// ---------------------------------------------------------------------------

func (a *App) LoadLibrary() ([]Game, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	data, err := a.loadLocked()
	if err != nil {
		return []Game{}, err
	}
	return data.Games, nil
}

func (a *App) LoadSoftware() ([]Software, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	data, err := a.loadLocked()
	if err != nil {
		return []Software{}, err
	}
	return data.Software, nil
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
	// byte per entri) dan membuat UpdatedAt konsisten dalam satu kali simpan.
	now := time.Now().UTC().Format(time.RFC3339Nano)
	sanitized := make([]Game, len(games))
	for i, g := range games {
		sanitized[i] = a.sanitizeGame(g, now)
	}
	normalizeGameThumbs(sanitized)

	data, err := a.loadLocked()
	if err != nil {
		return err
	}
	data.Games = sanitized
	return a.writeLibraryLocked(data)
}

func (a *App) SaveSoftware(items []Software) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if items == nil {
		items = []Software{}
	}
	if len(items) > maxSoftware {
		items = items[:maxSoftware]
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	sanitized := make([]Software, len(items))
	for i, s := range items {
		sanitized[i] = a.sanitizeSoftware(s, now)
	}
	normalizeSoftwareThumbs(sanitized)

	data, err := a.loadLocked()
	if err != nil {
		return err
	}
	data.Software = sanitized
	return a.writeLibraryLocked(data)
}

// loadLocked membaca katalog dari disk (lewat cache bila masih valid). File
// yang belum ada dibangun dari hasil migrasi aplikasi lama, atau dari data
// contoh bila tidak ada apa pun untuk dimigrasi. Panggil dengan a.mu dipegang.
func (a *App) loadLocked() (*LibraryData, error) {
	fi, err := os.Stat(a.dataFile)
	if err != nil {
		if !os.IsNotExist(err) {
			return &LibraryData{Games: []Game{}, Software: []Software{}}, nil
		}
		data := a.bootstrapLibrary()
		if writeErr := a.writeLibraryLocked(data); writeErr != nil {
			a.libraryCache = data
			a.libraryCached = false
		}
		return data, nil
	}

	if fi.Size() > maxLibraryFileBytes {
		a.quarantineLibrary(fmt.Sprintf("ukuran file %d byte melewati batas", fi.Size()))
		return &LibraryData{Games: []Game{}, Software: []Software{}}, nil
	}

	finger := fingerprint(fi)
	if a.libraryCached && a.libraryFinger == finger && a.libraryCache != nil {
		return a.libraryCache, nil
	}

	content, err := os.ReadFile(a.dataFile)
	if err != nil {
		return &LibraryData{Games: []Game{}, Software: []Software{}}, nil
	}

	var fileData LibraryFile
	if err := json.Unmarshal(content, &fileData); err != nil {
		a.quarantineLibrary("JSON tidak valid")
		return &LibraryData{Games: []Game{}, Software: []Software{}}, nil
	}

	data := &LibraryData{Games: fileData.Games, Software: fileData.Software}
	if data.Games == nil {
		data.Games = []Game{}
	}
	if data.Software == nil {
		data.Software = []Software{}
	}
	normalizeGameThumbs(data.Games)
	normalizeSoftwareThumbs(data.Software)

	a.libraryCache = data
	a.libraryFinger = finger
	a.libraryCached = true

	return data, nil
}

// writeLibraryLocked menulis seluruh katalog ke disk secara atomik lalu
// menyinkronkan cache. Panggil dengan a.mu sudah dipegang.
func (a *App) writeLibraryLocked(data *LibraryData) error {
	if err := os.MkdirAll(a.dataDir, 0o755); err != nil {
		return fmt.Errorf("gagal menyiapkan folder data: %w", err)
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false) // judul sering memakai & dan <; tidak perlu \u003c
	enc.SetIndent("", "  ")
	if data.Games == nil {
		data.Games = []Game{}
	}
	if data.Software == nil {
		data.Software = []Software{}
	}
	if err := enc.Encode(LibraryFile{Games: data.Games, Software: data.Software}); err != nil {
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
		a.libraryCache = data
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
	a.libraryCache = nil
	a.libraryCached = false
	a.libraryFinger = ""
	_ = reason // hanya untuk penamaan/debug; tidak ditampilkan ke pengguna
}

func fingerprint(fi os.FileInfo) string {
	return fmt.Sprintf("%d-%d", fi.ModTime().UnixNano(), fi.Size())
}

// normalizeGameThumbs mengubah referensi skema lama glib://thumb/<file> menjadi
// /thumbnails/<file> yang dipakai AssetServer.
func normalizeGameThumbs(games []Game) {
	for i := range games {
		ref := games[i].Thumbnail
		if hasKnownThumbPrefix(ref) {
			games[i].Thumbnail = thumbURLPrefix + trimThumbPrefix(ref)
		}
	}
}

// normalizeSoftwareThumbs sama seperti normalizeGameThumbs, untuk katalog
// software (termasuk hasil salinan dari aplikasi Software Library lama).
func normalizeSoftwareThumbs(items []Software) {
	for i := range items {
		ref := items[i].Thumbnail
		if hasKnownThumbPrefix(ref) {
			items[i].Thumbnail = thumbURLPrefix + trimThumbPrefix(ref)
		}
	}
}

// createSampleData mengisi library.json pertama dengan 2 game + 3 software
// contoh (+ thumbnail SVG-nya) supaya tampilan pertama langsung menjelaskan
// cara pakai aplikasi.
func (a *App) createSampleData() *LibraryData {
	svg := func(title, sub string) string {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a475e"/><stop offset="1" stop-color="#141d28"/></linearGradient></defs><rect width="460" height="215" fill="url(#g)"/><text x="230" y="115" font-family="Segoe UI, Arial" font-size="32" font-weight="700" fill="#e5e5e5" text-anchor="middle">` +
			title + `</text><text x="230" y="145" font-family="Segoe UI, Arial" font-size="13" fill="#8f98a0" text-anchor="middle">` + sub + `</text></svg>`
	}

	samples := []struct{ file, title, sub string }{
		{"sample-gta.svg", "GTA V", "Action, Open World"},
		{"sample-elden.svg", "ELDEN RING", "Action RPG, Souls-like"},
		{"sample-photoshop.svg", "PHOTOSHOP 2025", "Desain Grafis"},
		{"sample-office.svg", "OFFICE 2021", "Produktivitas"},
		{"sample-capcut.svg", "CAPCUT DESKTOP", "Editing Video"},
	}
	for _, s := range samples {
		_ = os.WriteFile(filepath.Join(a.thumbsDir, s.file), []byte(svg(s.title, s.sub)), 0o644)
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	return &LibraryData{
		Games: []Game{
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
		},
		Software: []Software{
			{
				ID:        "sample-sw-1",
				Title:     "Adobe Photoshop 2025",
				Thumbnail: thumbURLPrefix + "sample-photoshop.svg",
				Link:      "https://drive.google.com/drive/folders/contoh-link-ps",
				Website:   "https://www.adobe.com/products/photoshop.html",
				Category:  "Desain Grafis",
				Version:   "26.1",
				License:   "Trial 7 hari",
				Platform:  "Windows 10/11",
				Size:      "4 GB",
				Price:     "Rp 75.000",
				CreatedAt: now,
				UpdatedAt: now,
			},
			{
				ID:        "sample-sw-2",
				Title:     "Microsoft Office LTSC 2021",
				Thumbnail: thumbURLPrefix + "sample-office.svg",
				Link:      "https://drive.google.com/drive/folders/contoh-link-office",
				Website:   "https://learn.microsoft.com/office/",
				Category:  "Produktivitas & Perkantoran",
				Version:   "LTSC 2021",
				License:   "Full / Activate",
				Platform:  "Windows 10/11",
				Size:      "4 GB",
				Price:     "Rp 60.000",
				CreatedAt: now,
				UpdatedAt: now,
			},
			{
				ID:        "sample-sw-3",
				Title:     "CapCut Desktop",
				Thumbnail: thumbURLPrefix + "sample-capcut.svg",
				Link:      "https://drive.google.com/drive/folders/contoh-link-capcut",
				Website:   "https://www.capcut.com/",
				Category:  "Editing Video",
				Version:   "5.1",
				License:   "Gratis",
				Platform:  "Windows 10/11",
				Size:      "1,2 GB",
				Price:     "Gratis",
				CreatedAt: now,
				UpdatedAt: now,
			},
		},
	}
}
