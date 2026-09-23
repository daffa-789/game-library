package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
)

// ---------------------------------------------------------------------------
// Migrasi katalog lama
//
// Sebelum digabung, ada dua aplikasi terpisah yang masing-masing menyimpan
// katalognya sendiri: Game Library (%APPDATA%\libray-game) dan Software
// Library (%APPDATA%\software-library). Saat folder data gabungan pertama kali
// dibuat, keduanya diserap ke sini lengkap dengan file thumbnail-nya, jadi
// koleksi yang sudah ada tidak perlu diketik ulang.
//
// Sumber lama TIDAK diubah: file aslinya tetap di tempat sebagai cadangan.
// ---------------------------------------------------------------------------

// legacyDataDirNames nama folder di %APPDATA% yang datanya diserap ke katalog
// gabungan, urut prioritas.
var legacyDataDirNames = []string{"libray-game", "software-library"}

// legacyDataDirs menurunkan path absolut folder lama dari folder konfigurasi
// pengguna, tanpa memasukkan folder data gabungan itu sendiri.
func legacyDataDirs(configDir string) []string {
	out := make([]string, 0, len(legacyDataDirNames))
	for _, name := range legacyDataDirNames {
		if name == appDataDirName {
			continue
		}
		dir := filepath.Join(configDir, name)
		if _, err := os.Stat(dir); err == nil {
			out = append(out, dir)
		}
	}
	return out
}

// bootstrapLibrary membangun isi library.json pertama kali: hasil gabungan
// katalog lama, atau data contoh bila tidak ada yang bisa dimigrasi.
func (a *App) bootstrapLibrary() *LibraryData {
	data := &LibraryData{Games: []Game{}, Software: []Software{}}
	seenGames := map[string]bool{}
	seenSoftware := map[string]bool{}
	migrated := false

	for _, dir := range a.legacyDirs {
		legacy, ok := readLegacyLibrary(dir)
		if !ok {
			continue
		}
		for _, g := range legacy.Games {
			if g.Title == "" || seenGames[g.ID] {
				continue
			}
			seenGames[g.ID] = true
			data.Games = append(data.Games, g)
		}
		for _, s := range legacy.Software {
			if s.Title == "" || seenSoftware[s.ID] {
				continue
			}
			seenSoftware[s.ID] = true
			data.Software = append(data.Software, s)
		}
		if len(legacy.Games) > 0 || len(legacy.Software) > 0 {
			migrated = true
		}
		a.copyLegacyThumbs(dir)
	}

	if !migrated {
		return a.createSampleData()
	}

	if len(data.Games) > maxGames {
		data.Games = data.Games[:maxGames]
	}
	if len(data.Software) > maxSoftware {
		data.Software = data.Software[:maxSoftware]
	}
	normalizeGameThumbs(data.Games)
	normalizeSoftwareThumbs(data.Software)
	return data
}

// readLegacyLibrary membaca library.json dari folder aplikasi lama. Kegagalan
// apa pun dianggap "tidak ada data", bukan error yang menghentikan aplikasi.
func readLegacyLibrary(dir string) (*LibraryFile, bool) {
	path := filepath.Join(dir, "library.json")
	fi, err := os.Stat(path)
	if err != nil || fi.Size() == 0 || fi.Size() > maxLibraryFileBytes {
		return nil, false
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	var fileData LibraryFile
	if err := json.Unmarshal(content, &fileData); err != nil {
		return nil, false
	}
	return &fileData, true
}

// copyLegacyThumbs menyalin gambar dari folder thumbnails lama ke folder
// gabungan. File yang namanya sudah dipakai tidak ditimpa, dan file di luar
// whitelist ekstensi gambar dilewati.
func (a *App) copyLegacyThumbs(dir string) {
	srcDir := filepath.Join(dir, "thumbnails")
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || !allowedThumbExt[filepath.Ext(e.Name())] {
			continue
		}
		if fi, err := e.Info(); err != nil || fi.Size() == 0 || fi.Size() > maxThumbnailBytes {
			continue
		}
		dst := filepath.Join(a.thumbsDir, filepath.Base(e.Name()))
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		copyFile(filepath.Join(srcDir, e.Name()), dst)
	}
}

// copyFile menyalin satu file; gagal diam-diam karena thumbnail yang hilang
// hanya berarti kartu memakai placeholder.
func copyFile(src, dst string) {
	in, err := os.Open(src)
	if err != nil {
		return
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, io.LimitReader(in, maxThumbnailBytes+1)); err != nil {
		_ = os.Remove(dst)
	}
}
