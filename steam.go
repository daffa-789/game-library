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
	// steamURLRe menerima bentuk link Steam Store yang umum dipakai orang:
	//   https://store.steampowered.com/app/1636440
	//   https://store.steampowered.com/app/1636440/SILENT_HILL_Townfall/
	//   https://store.steampowered.com/app/1636440?snr=1_7_7_151_150_1
	//   store.steampowered.com/app/1636440/  (tanpa skema)
	// Tanda "/" setelah angka tidak diwajibkan, supaya link tanpa slug tetap
	// kebaca. Host boleh punya subdomain lain (mis. regional store).
	steamURLRe = regexp.MustCompile(`(?i)(?:store\.steampowered\.com|steampowered\.com)/app/(\d+)`)
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

// steamDetailsEntry satu nilai di dalam objek respons appdetails. Key objeknya
// adalah appid yang diminta, tapi Steam kadang memakai id internal yang berbeda
// (lihat catatan di SteamImport), jadi key tidak boleh dijadikan satu-satunya
// cara menemukan entri.
type steamDetailsEntry struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
}

// singleSteamEntry mengambil satu-satunya entri dari respons appdetails apa pun
// key-nya. Request kita selalu meminta tepat satu appid, jadi entry tunggal
// yang ada di respons pasti milik appid itu — walau key JSON-nya lain.
// Iterasi map sengaja tidak kita buat deterministik: kalau ada lebih dari satu
// entri, kita tidak menebak-nebak dan mengembalikan false.
func singleSteamEntry(root map[string]steamDetailsEntry) (steamDetailsEntry, bool) {
	if len(root) != 1 {
		return steamDetailsEntry{}, false
	}
	for _, entry := range root {
		return entry, true
	}
	return steamDetailsEntry{}, false
}

// ---------------------------------------------------------------------------
// Pencarian Steam: menyelesaikan nama game / link non-app menjadi appid
// ---------------------------------------------------------------------------

// maxSteamSearchResults batas hasil yang dikembalikan ke UI.
const maxSteamSearchResults = 25

// SteamSearchResult satu kandidat hasil pencarian Steam Store.
type SteamSearchResult struct {
	AppID     string `json:"appId"`
	Title     string `json:"title"`
	Thumbnail string `json:"thumbnail"`
	Price     string `json:"price"`
}

// SteamSearch mencari game di katalog Steam Store berdasarkan kata kunci.
// Dipakai supaya game yang baru rilis tetap bisa ditemukan tanpa harus tahu
// appid-nya lebih dulu; setelah user memilih, alur lanjut ke SteamImport.
func (a *App) SteamSearch(term string) ([]SteamSearchResult, error) {
	query := strings.TrimSpace(term)
	if query == "" {
		return nil, fmt.Errorf("Kata kunci pencarian belum diisi.")
	}
	if utf8.RuneCountInString(query) > 120 {
		return nil, fmt.Errorf("Kata kunci terlalu panjang.")
	}

	apiURL := "https://store.steampowered.com/api/storesearch/?" +
		url.Values{
			"term": {query},
			"l":    {"english"},
			"cc":   {steamStoreRegion},
		}.Encode()

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

	var payload struct {
		Items []struct {
			Type string      `json:"type"`
			ID   json.Number `json:"id"`
			Name string      `json:"name"`
			// tiny_image dipakai sebagai thumbnail kandidat: kandidat hasil
			// pencarian tidak perlu mengunduh gambar ke disk, cukup URL-nya.
			TinyImage string `json:"tiny_image"`
			Price     struct {
				FinalFormatted string `json:"final_formatted"`
			} `json:"price"`
		} `json:"items"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, maxSteamResponseBytes)).Decode(&payload); err != nil {
		return nil, fmt.Errorf("Gagal membaca hasil pencarian Steam: %w", err)
	}

	out := make([]SteamSearchResult, 0, len(payload.Items))
	for _, it := range payload.Items {
		// Hanya "app" yang bisa dibuka appdetails — skip bundle/package/dlc
		// yang tipenya lain supaya user tidak diarahkan ke alur buntu.
		if it.Type != "" && it.Type != "app" {
			continue
		}
		id := it.ID.String()
		if id == "" || id == "0" || strings.TrimSpace(it.Name) == "" {
			continue
		}
		out = append(out, SteamSearchResult{
			AppID:     id,
			Title:     truncateUTF8(strings.TrimSpace(it.Name), maxLenTitle),
			Thumbnail: it.TinyImage,
			Price:     strings.TrimSpace(it.Price.FinalFormatted),
		})
		if len(out) >= maxSteamSearchResults {
			break
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("Game \"%s\" tidak ditemukan di Steam. Coba kata kunci lain.", query)
	}
	return out, nil
}

func (a *App) SteamImport(urlStr string) (*SteamImportResult, error) {
	m := steamURLRe.FindStringSubmatch(urlStr)
	if len(m) < 2 {
		return nil, fmt.Errorf("Link tidak dikenali. Gunakan link seperti https://store.steampowered.com/app/271590/")
	}
	appID := m[1]

	detail, err := a.fetchSteamDetails(appID)
	if err != nil {
		return nil, err
	}

	// Payload membawa steam_appid sendiri. Kalau ada, itulah id yang benar
	// untuk disimpan (bisa berbeda dari appid di link, mis. link lama/redirect).
	// Kalau tidak ada, pakai appid dari link.
	resolvedID := appID
	if id := detail.SteamAppID.String(); id != "" && id != "0" {
		resolvedID = id
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
		AppID:       resolvedID,
		Title:       detail.Name,
		Genre:       strings.Join(genres, ", "),
		Developer:   strings.Join(detail.Developers, ", "),
		ReleaseDate: detail.ReleaseDate.Date,
		Price:       detail.PriceOverview.FinalFormatted,
		Specs:       SpecsContainer{Min: minSpecs, Rec: recSpecs},
	}

	if detail.HeaderImage != "" {
		result.Thumbnail = a.downloadSteamImage(resolvedID, detail.HeaderImage)
	}

	return result, nil
}

// steamDetail adalah field appdetails yang kita pakai. Dipisah jadi type
// tersendiri supaya fetchSteamDetails bisa dipakai ulang untuk fallback region.
type steamDetail struct {
	SteamAppID     json.Number     `json:"steam_appid"`
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

// fetchSteamDetails mengambil detail satu game dari appdetails. Region store
// dikirim agar harga cocok dengan negara user; kalau region itu tidak punya
// harga (beberapa judul regional-restricted), sekali lagi dicoba tanpa cc
// supaya impor tetap menghasilkan data selengkap mungkin.
func (a *App) fetchSteamDetails(appID string) (steamDetail, error) {
	detail, err := a.requestSteamDetails(appID, steamStoreRegion)
	if err == nil && detail.PriceOverview.FinalFormatted != "" {
		return detail, nil
	}

	// Coba lagi dengan region global (tanpa cc) bila percobaan pertama gagal
	// atau tidak membawa harga.
	fallback, fbErr := a.requestSteamDetails(appID, "")
	if fbErr != nil {
		// Kalau percobaan pertama sudah berhasil (hanya tanpa harga), tetap
		// pakai itu — impor tanpa harga lebih baik daripada gagal total.
		if err == nil {
			return detail, nil
		}
		return steamDetail{}, err
	}
	if err == nil && fallback.PriceOverview.FinalFormatted == "" {
		return detail, nil // hasil pertama lebih lengkap (punya harga region)
	}
	return fallback, nil
}

// requestSteamDetails satu panggilan appdetails untuk satu appid dan satu
// region ("" berarti pakai region default Steam).
func (a *App) requestSteamDetails(appID, region string) (steamDetail, error) {
	params := url.Values{"appids": {appID}, "l": {"english"}}
	if region != "" {
		params.Set("cc", region)
	}
	apiURL := "https://store.steampowered.com/api/appdetails?" + params.Encode()

	req, cancel, err := a.newRequest(http.MethodGet, apiURL, steamAPITimeout)
	if err != nil {
		return steamDetail{}, err
	}
	defer cancel()
	req.Header.Set("Accept", "application/json")

	res, err := a.client.Do(req)
	if err != nil {
		return steamDetail{}, fmt.Errorf("Gagal menghubungi Steam Store: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return steamDetail{}, fmt.Errorf("Gagal menghubungi Steam Store (HTTP %d)", res.StatusCode)
	}

	var root map[string]steamDetailsEntry
	if err := json.NewDecoder(io.LimitReader(res.Body, maxSteamResponseBytes)).Decode(&root); err != nil {
		return steamDetail{}, fmt.Errorf("Gagal membaca respons Steam: %w", err)
	}

	// Steam tidak selalu mengembalikan data di bawah key = appid yang diminta.
	// Contoh nyata: appdetails?appids=1636440 (SILENT HILL: Townfall) menjawab
	// key "5124800", dan appids=570 (Dota 2) menjawab key "2120612". Isi
	// payload-nya tetap benar, hanya key JSON-nya yang memakai id internal.
	// Jadi urutannya: coba key yang diminta lebih dulu (perilaku lama tetap
	// jalan + kompatibel dengan test), baru jatuh ke entry tunggal apa pun.
	entry, ok := root[appID]
	if !ok {
		entry, ok = singleSteamEntry(root)
	}
	if !ok || !entry.Success || len(entry.Data) == 0 {
		return steamDetail{}, fmt.Errorf("Data game tidak ditemukan di Steam. Cek lagi link-nya.")
	}

	var detail steamDetail
	if err := json.Unmarshal(entry.Data, &detail); err != nil {
		return steamDetail{}, fmt.Errorf("Format data Steam tidak dikenali: %w", err)
	}
	return detail, nil
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
	req.Header.Set("User-Agent", importUserAgent)
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

	written, copyErr := io.Copy(out, io.LimitReader(res.Body, maxThumbnailBytes+1))
	// Handle harus ditutup sebelum Remove: Windows menolak menghapus file yang
	// masih terbuka, dan sisa unduhan gagal akan tertinggal selamanya.
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil || written == 0 || written > maxThumbnailBytes {
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
