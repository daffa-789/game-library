package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
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
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------------------------------------------------------------------------
// Data Models (100% Compatible with library.json)
// ---------------------------------------------------------------------------

type SystemSpecs struct {
	OS      string `json:"os"`
	CPU     string `json:"cpu"`
	RAM     string `json:"ram"`
	GPU     string `json:"gpu"`
	DX      string `json:"dx"`
	Net     string `json:"net"`
	Storage string `json:"storage"`
	Sound   string `json:"sound"`
	Notes   string `json:"notes"`
}

type SpecsContainer struct {
	Min SystemSpecs `json:"min"`
	Rec SystemSpecs `json:"rec"`
}

type Game struct {
	ID         string         `json:"id"`
	Title      string         `json:"title"`
	Thumbnail  string         `json:"thumbnail"`
	Link       string         `json:"link"`
	Genre      string         `json:"genre"`
	Size       string         `json:"size"`
	Price      string         `json:"price"`
	SteamAppID string         `json:"steamAppId"`
	Specs      SpecsContainer `json:"specs"`
	CreatedAt  string         `json:"createdAt"`
	UpdatedAt  string         `json:"updatedAt"`
}

type LibraryFile struct {
	Games []Game `json:"games"`
}

type SteamImportResult struct {
	AppID       string         `json:"appId"`
	Title       string         `json:"title"`
	Thumbnail   string         `json:"thumbnail"`
	Genre       string         `json:"genre"`
	Developer   string         `json:"developer"`
	ReleaseDate string         `json:"releaseDate"`
	Price       string         `json:"price"`
	Specs       SpecsContainer `json:"specs"`
}

// ---------------------------------------------------------------------------
// App Struct & Lifecycle
// ---------------------------------------------------------------------------

type App struct {
	ctx       context.Context
	mu        sync.Mutex
	dataDir   string
	dataFile  string
	thumbsDir string
	client    *http.Client
}

func NewApp() *App {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = os.Getenv("APPDATA")
		if configDir == "" {
			configDir = "."
		}
	}
	dataDir := filepath.Join(configDir, "libray-game")
	return newAppWithDataDir(dataDir)
}

func newAppWithDataDir(dataDir string) *App {
	thumbsDir := filepath.Join(dataDir, "thumbnails")
	dataFile := filepath.Join(dataDir, "library.json")

	_ = os.MkdirAll(thumbsDir, 0755)

	return &App{
		dataDir:   dataDir,
		dataFile:  dataFile,
		thumbsDir: thumbsDir,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) RestoreWindow() {
	if a.ctx != nil {
		runtime.WindowUnminimise(a.ctx)
		runtime.Show(a.ctx)
	}
}

// ---------------------------------------------------------------------------
// Thumbnail HTTP Handler (Mounted on AssetServer.Handler)
// ---------------------------------------------------------------------------

func (a *App) ThumbnailHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.EqualFold(r.Method, http.MethodGet) {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		path := r.URL.Path
		if !strings.HasPrefix(path, "/thumbnails/") {
			http.NotFound(w, r)
			return
		}

		filename := strings.TrimPrefix(path, "/thumbnails/")
		baseName := filepath.Base(filepath.Clean(filename))
		if baseName == "." || baseName == ".." || baseName == "/" || baseName == "\\" {
			http.NotFound(w, r)
			return
		}

		targetPath := filepath.Join(a.thumbsDir, baseName)
		cleanThumbs := filepath.Clean(a.thumbsDir)
		if !strings.HasPrefix(filepath.Clean(targetPath), cleanThumbs) {
			http.Error(w, "Access denied", http.StatusForbidden)
			return
		}

		fi, err := os.Stat(targetPath)
		if err != nil || fi.IsDir() {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.ServeFile(w, r, targetPath)
	})
}

// ---------------------------------------------------------------------------
// Backend API: Library Persistence
// ---------------------------------------------------------------------------

func (a *App) LoadLibrary() ([]Game, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	_ = os.MkdirAll(a.thumbsDir, 0755)

	if _, err := os.Stat(a.dataFile); os.IsNotExist(err) {
		sample := a.createSampleData()
		_ = a.saveFileAtomic(sample)
		return sample, nil
	}

	content, err := os.ReadFile(a.dataFile)
	if err != nil {
		return []Game{}, nil
	}

	var fileData LibraryFile
	if err := json.Unmarshal(content, &fileData); err != nil {
		// Backup corrupted file
		corruptBackup := fmt.Sprintf("%s.rusak-%d", a.dataFile, time.Now().UnixMilli())
		_ = os.Rename(a.dataFile, corruptBackup)
		return []Game{}, nil
	}

	if fileData.Games == nil {
		fileData.Games = []Game{}
	}

	// Normalize legacy glib://thumb/ refs to /thumbnails/
	for i := range fileData.Games {
		g := &fileData.Games[i]
		if strings.HasPrefix(g.Thumbnail, "glib://thumb/") {
			g.Thumbnail = "/thumbnails/" + strings.TrimPrefix(g.Thumbnail, "glib://thumb/")
		}
	}

	return fileData.Games, nil
}

func (a *App) SaveLibrary(games []Game) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if games == nil {
		games = []Game{}
	}
	if len(games) > 5000 {
		games = games[:5000]
	}

	sanitized := make([]Game, len(games))
	for i, g := range games {
		sanitized[i] = a.sanitizeGame(g)
	}

	return a.saveFileAtomic(sanitized)
}

func (a *App) saveFileAtomic(games []Game) error {
	_ = os.MkdirAll(a.dataDir, 0755)

	fileData := LibraryFile{Games: games}
	bytes, err := json.MarshalIndent(fileData, "", "  ")
	if err != nil {
		return fmt.Errorf("gagal memformat data JSON: %w", err)
	}

	tmpFile := fmt.Sprintf("%s.tmp-%d", a.dataFile, time.Now().UnixNano())
	if err := os.WriteFile(tmpFile, bytes, 0644); err != nil {
		return fmt.Errorf("gagal menulis file sementara: %w", err)
	}

	if err := os.Rename(tmpFile, a.dataFile); err != nil {
		_ = os.Remove(a.dataFile)
		if err := os.Rename(tmpFile, a.dataFile); err != nil {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("gagal menyimpan file database: %w", err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Backend API: Thumbnail Management & Native Dialogs
// ---------------------------------------------------------------------------

func (a *App) PickThumbnail() (string, error) {
	if a.ctx == nil {
		return "", nil
	}
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Pilih Gambar Thumbnail",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Gambar (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.svg;*.bmp)",
				Pattern:     "*.png;*.jpg;*.jpeg;*.webp;*.gif;*.svg;*.bmp",
			},
		},
	})
	if err != nil || filePath == "" {
		return "", nil
	}

	srcFile, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("gagal membuka gambar sumber: %w", err)
	}
	defer srcFile.Close()

	ext := strings.ToLower(filepath.Ext(filePath))
	if ext == "" {
		ext = ".png"
	}

	randomBytes := make([]byte, 10)
	_, _ = rand.Read(randomBytes)
	destName := hex.EncodeToString(randomBytes) + ext
	destPath := filepath.Join(a.thumbsDir, destName)

	dstFile, err := os.Create(destPath)
	if err != nil {
		return "", fmt.Errorf("gagal menyimpan gambar thumbnail: %w", err)
	}
	defer dstFile.Close()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		_ = os.Remove(destPath)
		return "", fmt.Errorf("gagal menyalin file thumbnail: %w", err)
	}

	return "/thumbnails/" + destName, nil
}

func (a *App) DeleteThumbnail(ref string) error {
	ref = strings.TrimPrefix(ref, "glib://thumb/")
	ref = strings.TrimPrefix(ref, "/thumbnails/")
	name := filepath.Base(filepath.Clean(ref))
	if name == "" || name == "." || name == ".." || name == "/" || name == "\\" {
		return nil
	}

	targetPath := filepath.Join(a.thumbsDir, name)
	cleanThumbs := filepath.Clean(a.thumbsDir)
	if strings.HasPrefix(filepath.Clean(targetPath), cleanThumbs) {
		fi, err := os.Stat(targetPath)
		if err == nil && !fi.IsDir() {
			_ = os.Remove(targetPath)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Backend API: OS Integration (Browser & Clipboard)
// ---------------------------------------------------------------------------

func (a *App) OpenExternal(urlStr string) error {
	trimmed := strings.TrimSpace(urlStr)
	if !strings.HasPrefix(strings.ToLower(trimmed), "http://") && !strings.HasPrefix(strings.ToLower(trimmed), "https://") {
		return fmt.Errorf("URL tidak valid")
	}
	if a.ctx != nil {
		runtime.BrowserOpenURL(a.ctx, trimmed)
	}
	return nil
}

func (a *App) CopyText(text string) error {
	if a.ctx != nil {
		return runtime.ClipboardSetText(a.ctx, text)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Backend API: Steam Import
// ---------------------------------------------------------------------------

var (
	steamURLRe  = regexp.MustCompile(`store\.steampowered\.com/app/(\d+)`)
	steamLiRe   = regexp.MustCompile(`(?i)<li>\s*<strong>\s*([^:<>]+?)\s*:?\s*</strong>([\s\S]*?)</li>`)
	steamBrRe   = regexp.MustCompile(`(?i)<br\s*/?>`)
	steamTagRe  = regexp.MustCompile(`<[^>]+>`)
	steamSpcRe  = regexp.MustCompile(`\s+`)
	steamLblMap = map[string]string{
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
)

func (a *App) SteamImport(urlStr string) (*SteamImportResult, error) {
	m := steamURLRe.FindStringSubmatch(urlStr)
	if len(m) < 2 {
		return nil, fmt.Errorf("Link tidak dikenali. Gunakan link seperti https://store.steampowered.com/app/271590/")
	}
	appID := m[1]

	apiURL := fmt.Sprintf("https://store.steampowered.com/api/appdetails?appids=%s&l=english", appID)
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GameLibrary/1.0")

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
	if err := json.NewDecoder(res.Body).Decode(&root); err != nil {
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
		Developers []string `json:"developers"`
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

	// Parse PC requirements (handling object vs empty array)
	var minSpecs, recSpecs SystemSpecs
	pcReqsTrimmed := bytes.TrimSpace(detail.PCRequirements)
	if len(pcReqsTrimmed) > 0 && pcReqsTrimmed[0] == '{' {
		var reqs struct {
			Minimum     string `json:"minimum"`
			Recommended string `json:"recommended"`
		}
		if err := json.Unmarshal(detail.PCRequirements, &reqs); err == nil {
			minSpecs = a.parseSysReq(reqs.Minimum)
			recSpecs = a.parseSysReq(reqs.Recommended)
		}
	}

	// Download header image to local thumbnail
	thumbnailURL := ""
	if detail.HeaderImage != "" {
		thumbnailURL = a.downloadSteamImage(appID, detail.HeaderImage)
	}

	var genres []string
	for _, g := range detail.Genres {
		if g.Description != "" {
			genres = append(genres, g.Description)
		}
	}

	return &SteamImportResult{
		AppID:       appID,
		Title:       detail.Name,
		Thumbnail:   thumbnailURL,
		Genre:       strings.Join(genres, ", "),
		Developer:   strings.Join(detail.Developers, ", "),
		ReleaseDate: detail.ReleaseDate.Date,
		Price:       detail.PriceOverview.FinalFormatted,
		Specs: SpecsContainer{
			Min: minSpecs,
			Rec: recSpecs,
		},
	}, nil
}

func (a *App) downloadSteamImage(appID, imgURL string) string {
	u, err := url.Parse(imgURL)
	if err != nil {
		return ""
	}
	ext := strings.ToLower(filepath.Ext(u.Path))
	if ext == "" {
		ext = ".jpg"
	}

	randBytes := make([]byte, 4)
	_, _ = rand.Read(randBytes)
	fileName := fmt.Sprintf("steam-%s-%s%s", appID, hex.EncodeToString(randBytes), ext)
	destPath := filepath.Join(a.thumbsDir, fileName)

	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imgURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 GameLibrary/1.0")

	res, err := a.client.Do(req)
	if err != nil || res.StatusCode != http.StatusOK {
		return ""
	}
	defer res.Body.Close()

	out, err := os.Create(destPath)
	if err != nil {
		return ""
	}
	defer out.Close()

	_, err = io.Copy(out, res.Body)
	if err != nil {
		_ = os.Remove(destPath)
		return ""
	}

	return "/thumbnails/" + fileName
}

func (a *App) parseSysReq(rawHTML string) SystemSpecs {
	dict := make(map[string]string)
	matches := steamLiRe.FindAllStringSubmatch(rawHTML, -1)
	for _, m := range matches {
		if len(m) >= 3 {
			key := strings.ToLower(strings.TrimRight(strings.TrimSpace(m[1]), "* :"))
			if target, ok := steamLblMap[key]; ok {
				dict[target] = a.htmlToText(m[2])
			}
		}
	}
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

func (a *App) htmlToText(s string) string {
	s = steamBrRe.ReplaceAllString(s, " ")
	s = steamTagRe.ReplaceAllString(s, "")
	s = html.UnescapeString(s)
	s = steamSpcRe.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)
	if len(s) > 400 {
		s = s[:400]
	}
	return s
}

// ---------------------------------------------------------------------------
// Helpers & Sanitization
// ---------------------------------------------------------------------------

func (a *App) sanitizeGame(g Game) Game {
	trim := func(s string, limit int) string {
		s = strings.TrimSpace(s)
		if len(s) > limit {
			return s[:limit]
		}
		return s
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if g.ID == "" {
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		b[6] = (b[6] & 0x0f) | 0x40 // UUID v4
		b[8] = (b[8] & 0x3f) | 0x80
		g.ID = fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
	}
	if g.CreatedAt == "" {
		g.CreatedAt = now
	}
	g.UpdatedAt = now

	g.ID = trim(g.ID, 64)
	g.Title = trim(g.Title, 200)
	g.Thumbnail = trim(g.Thumbnail, 2000)
	g.Link = trim(g.Link, 2000)
	g.Genre = trim(g.Genre, 120)
	g.Size = trim(g.Size, 60)
	g.Price = trim(g.Price, 60)
	g.SteamAppID = trim(g.SteamAppID, 20)

	sanSpec := func(s SystemSpecs) SystemSpecs {
		return SystemSpecs{
			OS:      trim(s.OS, 400),
			CPU:     trim(s.CPU, 400),
			RAM:     trim(s.RAM, 400),
			GPU:     trim(s.GPU, 400),
			DX:      trim(s.DX, 400),
			Net:     trim(s.Net, 400),
			Storage: trim(s.Storage, 400),
			Sound:   trim(s.Sound, 400),
			Notes:   trim(s.Notes, 400),
		}
	}
	g.Specs.Min = sanSpec(g.Specs.Min)
	g.Specs.Rec = sanSpec(g.Specs.Rec)
	return g
}

func (a *App) createSampleData() []Game {
	gtaSVG := `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a475e"/><stop offset="1" stop-color="#141d28"/></linearGradient></defs><rect width="460" height="215" fill="url(#g)"/><text x="230" y="115" font-family="Segoe UI, Arial" font-size="32" font-weight="700" fill="#e5e5e5" text-anchor="middle">GTA V</text><text x="230" y="145" font-family="Segoe UI, Arial" font-size="13" fill="#8f98a0" text-anchor="middle">Action, Open World</text></svg>`
	eldenSVG := `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a475e"/><stop offset="1" stop-color="#141d28"/></linearGradient></defs><rect width="460" height="215" fill="url(#g)"/><text x="230" y="115" font-family="Segoe UI, Arial" font-size="32" font-weight="700" fill="#e5e5e5" text-anchor="middle">ELDEN RING</text><text x="230" y="145" font-family="Segoe UI, Arial" font-size="13" fill="#8f98a0" text-anchor="middle">Action RPG, Souls-like</text></svg>`

	_ = os.WriteFile(filepath.Join(a.thumbsDir, "sample-gta.svg"), []byte(gtaSVG), 0644)
	_ = os.WriteFile(filepath.Join(a.thumbsDir, "sample-elden.svg"), []byte(eldenSVG), 0644)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	return []Game{
		{
			ID:        "sample-1",
			Title:     "Grand Theft Auto V",
			Thumbnail: "/thumbnails/sample-gta.svg",
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
			Thumbnail: "/thumbnails/sample-elden.svg",
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
