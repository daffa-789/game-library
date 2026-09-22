package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// ---------------------------------------------------------------------------
// Backend API: Impor Steam
// ---------------------------------------------------------------------------

const maxSteamResponseBytes = 8 << 20 // 8 MiB jauh di atas ukuran appdetails

var (
	steamURLRe = regexp.MustCompile(`store\.steampowered\.com/app/(\d+)`)
	steamLiRe  = regexp.MustCompile(`(?i)<li[^>]*>\s*<strong[^>]*>\s*([^:<>]+?)\s*:?\s*</strong>([\s\S]*?)</li>`)
	// Steam kadang menulis system requirement sebagai <h4><strong>OS:</strong>
	// Windows 10</h4>, bukan <li>. Dipakai sebagai cadangan per label.
	steamH4Re  = regexp.MustCompile(`(?i)<h4[^>]*>\s*<strong[^>]*>\s*([^:<>]+?)\s*:?\s*</strong>([\s\S]*?)</h4>`)
	steamBrRe  = regexp.MustCompile(`(?i)<br\s*/?>`)
	steamTagRe = regexp.MustCompile(`<[^>]+>`)
	steamSpcRe = regexp.MustCompile(`\s+`)
	steamLbl   = map[string]string{
		"os":               "os",
		"processor":        "cpu",
		"memory":           "ram",
		"graphics":         "gpu",
		"directx":          "dx",
		"storage":          "storage",
		"network":          "net",
		"sound card":       "sound",
		"additional notes": "notes",
	}
	steamImageHostSuffixes = []string{"steampowered.com", "steamstatic.com", "steamcommunity.com"}
)

func (a *App) SteamImport(urlStr string) (*SteamImportResult, error) {
	m := steamURLRe.FindStringSubmatch(urlStr)
	if len(m) < 2 {
		return nil, fmt.Errorf("Link tidak dikenali. Gunakan link seperti https://store.steampowered.com/app/271590/")
	}
	appID := m[1]

	apiURL := fmt.Sprintf("https://store.steampowered.com/api/appdetails?appids=%s&l=english", appID)
	req, cancel, err := a.newRequest(http.MethodGet, apiURL, steamAPITimeout)
	if err != nil {
		return nil, err
	}
	defer cancel()
	req.Header.Set("Accept", "application/json")

	res, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Gagal menghubungi Steam Store: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gagal menghubungi Steam Store (HTTP %d)", res.StatusCode)
	}

	var root map[string]struct {
		Success bool            `json:"success"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, maxSteamResponseBytes)).Decode(&root); err != nil {
		return nil, fmt.Errorf("Gagal membaca respons Steam: %w", err)
	}

	entry, ok := root[appID]
	if !ok || !entry.Success || len(entry.Data) == 0 {
		return nil, fmt.Errorf("Data game tidak ditemukan di Steam. Cek lagi link-nya.")
	}

	var detail struct {
		Name           string          `json:"name"`
		HeaderImage    string          `json:"header_image"`
		PCRequirements json.RawMessage `json:"pc_requirements"`
		Genres         []struct {
			Description string `json:"description"`
		} `json:"genres"`
		Developers  []string `json:"developers"`
		ReleaseDate struct {
			Date string `json:"date"`
		} `json:"release_date"`
		PriceOverview struct {
			FinalFormatted string `json:"final_formatted"`
		} `json:"price_overview"`
	}
	if err := json.Unmarshal(entry.Data, &detail); err != nil {
		return nil, fmt.Errorf("Format data Steam tidak dikenali: %w", err)
	}

	// pc_requirements bisa berupa object atau array kosong [] (sering terjadi).
	var minSpecs, recSpecs SystemSpecs
	if trimmed := bytes.TrimSpace(detail.PCRequirements); len(trimmed) > 0 && trimmed[0] == '{' {
		var parsed struct {
			Minimum     string `json:"minimum"`
			Recommended string `json:"recommended"`
		}
		if err := json.Unmarshal(detail.PCRequirements, &parsed); err == nil {
			minSpecs = a.parseSysReq(parsed.Minimum)
			recSpecs = a.parseSysReq(parsed.Recommended)
		}
	}

	genres := make([]string, 0, len(detail.Genres))
	for _, g := range detail.Genres {
		if g.Description != "" {
			genres = append(genres, g.Description)
		}
	}

	result := &SteamImportResult{
		AppID:       appID,
		Title:       detail.Name,
		Genre:       strings.Join(genres, ", "),
		Developer:   strings.Join(detail.Developers, ", "),
		ReleaseDate: detail.ReleaseDate.Date,
		Price:       detail.PriceOverview.FinalFormatted,
		Specs:       SpecsContainer{Min: minSpecs, Rec: recSpecs},
	}

	if detail.HeaderImage != "" {
		result.Thumbnail = a.downloadSteamImage(appID, detail.HeaderImage)
	}

	return result, nil
}

// newRequest membangun request dengan deadline: context jendela Wails (kalau
// sudah ada) ditambah timeout operasi. Cancel harus dipanggil pemanggil lewat
// defer agar tidak ada context yang bocor.
func (a *App) newRequest(method, endpoint string, timeout time.Duration) (*http.Request, contextCancel, error) {
	ctx, cancel := a.requestCtx(timeout)
	req, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		cancel()
		return nil, func() {}, err
	}
	req.Header.Set("User-Agent", steamUserAgent)
	return req, cancel, nil
}

// contextCancel alias kecil supaya signature tetap terbaca.
type contextCancel = func()

// downloadSteamImage menyimpan gambar header Steam ke folder thumbnails.
// Mengembalikan "" bila gambar tidak bisa diambil — impor tetap boleh lanjut
// tanpa thumbnail.
func (a *App) downloadSteamImage(appID, imgURL string) string {
	dest, ok := a.steamImageDest(appID, imgURL)
	if !ok {
		return ""
	}

	req, cancel, err := a.newRequest(http.MethodGet, imgURL, steamImageTimeout)
	if err != nil {
		return ""
	}
	defer cancel()

	res, err := a.client.Do(req)
	if err != nil {
		return ""
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return ""
	}
	if ct := res.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(strings.ToLower(ct), "image/") {
		return ""
	}
	if res.ContentLength > maxThumbnailBytes {
		return ""
	}

	out, err := os.Create(dest)
	if err != nil {
		return ""
	}
	defer out.Close()

	written, err := io.Copy(out, io.LimitReader(res.Body, maxThumbnailBytes+1))
	if err != nil || written == 0 || written > maxThumbnailBytes {
		_ = os.Remove(dest)
		return ""
	}

	return thumbURLPrefix + filepath.Base(dest)
}

// steamImageDest memvalidasi URL gambar (https + host milik Valve + ekstensi
// gambar yang diizinkan) lalu menentukan path tujuan yang belum dipakai.
func (a *App) steamImageDest(appID, imgURL string) (string, bool) {
	u, err := url.Parse(imgURL)
	if err != nil || !strings.EqualFold(u.Scheme, "https") {
		return "", false
	}
	host := strings.ToLower(u.Hostname())
	trusted := false
	for _, suffix := range steamImageHostSuffixes {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			trusted = true
			break
		}
	}
	if !trusted {
		return "", false
	}

	ext := strings.ToLower(filepath.Ext(u.Path))
	if ext == "" {
		ext = ".jpg"
	}
	if !allowedThumbExt[ext] {
		return "", false
	}

	name, err := a.newThumbName(ext)
	if err != nil {
		return "", false
	}
	return filepath.Join(a.thumbsDir, fmt.Sprintf("steam-%s-%s", appID, name)), true
}

// ---------------------------------------------------------------------------
// Parsing spesifikasi sistem
// ---------------------------------------------------------------------------

func (a *App) parseSysReq(rawHTML string) SystemSpecs {
	dict := make(map[string]string, len(steamLbl))

	fill := func(re *regexp.Regexp) {
		for _, m := range re.FindAllStringSubmatch(rawHTML, -1) {
			if len(m) < 3 {
				continue
			}
			key := strings.ToLower(strings.TrimRight(strings.TrimSpace(m[1]), "* :"))
			target, known := steamLbl[key]
			if !known || dict[target] != "" {
				continue // label tidak dikenal / sudah terisi format utama
			}
			if text := a.htmlToText(m[2]); text != "" {
				dict[target] = text
			}
		}
	}

	// Prioritas format <li>, lalu <h4> untuk label yang masih kosong.
	fill(steamLiRe)
	fill(steamH4Re)

	return SystemSpecs{
		OS:      dict["os"],
		CPU:     dict["cpu"],
		RAM:     dict["ram"],
		GPU:     dict["gpu"],
		DX:      dict["dx"],
		Net:     dict["net"],
		Storage: dict["storage"],
		Sound:   dict["sound"],
		Notes:   dict["notes"],
	}
}

// htmlToText mengubah potongan HTML system requirement menjadi teks biasa.
// Urutan step penting: <br> → spasi, buang tag, baru decode entity (supaya
// "&lt;Fast&gt;" menjadi "<Fast>" dan tidak ikut terbuang sebagai tag).
func (a *App) htmlToText(s string) string {
	s = steamBrRe.ReplaceAllString(s, " ")
	s = steamTagRe.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = steamSpcRe.ReplaceAllString(s, " ")
	return truncateUTF8(strings.TrimSpace(s), 400)
}

// truncateUTF8 memotong string hingga <= limit byte tanpa memecah rune, sehingga
// teks multi-byte (CJK / emoji) tidak berubah menjadi karakter rusak.
func truncateUTF8(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	for limit > 0 && !utf8.RuneStart(s[limit]) {
		limit--
	}
	return s[:limit]
}
