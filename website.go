package main

import (
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ---------------------------------------------------------------------------
// Backend API: Impor software dari situs resminya
//
// Halaman produk software tidak punya API seragam seperti Steam, jadi yang
// dibaca adalah metadata publik yang hampir selalu ada: Open Graph / meta tag.
// Kebutuhan sistem TIDAK dibaca — katalog software disimpan tanpa spesifikasi.
// Semua nilai hanya dipakai sebagai prefill; user tetap memeriksa form sebelum
// menyimpan.
// ---------------------------------------------------------------------------

var (
	metaTagRe     = regexp.MustCompile(`(?is)<meta\b[^>]*>`)
	titleTagRe    = regexp.MustCompile(`(?is)<title[^>]*>([\s\S]*?)</title>`)
	attrRe        = regexp.MustCompile(`(?is)(property|name|content)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))`)
	versionRe     = regexp.MustCompile(`(?i)\b(?:version|versie|versi|ver\.?|v)\s*[:=]?\s*(\d+(?:\.\d+){1,3})`)
	versionWordRe = regexp.MustCompile(`^\d+(\.\d+)+$`)
	tagRe         = regexp.MustCompile(`<[^>]+>`)
	spaceRe       = regexp.MustCompile(`\s+`)
	scriptStyleRe = regexp.MustCompile(`(?is)<(?:script|style)[^>]*>[\s\S]*?</(?:script|style)>`)
)

// ruleSet adalah satu kandidat tebakan: cocok bila salah satu needle muncul
// sebagai kata utuh.
type ruleSet struct {
	res   []*regexp.Regexp
	value string
}

type ruleInput struct {
	needles []string
	value   string
}

func buildRules(in []ruleInput) []ruleSet {
	out := make([]ruleSet, 0, len(in))
	for _, r := range in {
		sets := make([]*regexp.Regexp, 0, len(r.needles))
		for _, n := range r.needles {
			sets = append(sets, regexp.MustCompile(`(?i)`+wordPattern(n)))
		}
		out = append(out, ruleSet{res: sets, value: r.value})
	}
	return out
}

// wordPattern membungkus needle dengan \b hanya di sisi yang berupa word char,
// supaya needle seperti "c++" atau "100% free" tetap bisa dicocokkan.
func wordPattern(needle string) string {
	prefix, suffix := `\b`, `\b`
	if len(needle) > 0 {
		first, _ := utf8.DecodeRuneInString(needle)
		if !unicode.IsLetter(first) && !unicode.IsDigit(first) {
			prefix = ``
		}
		last, _ := utf8.DecodeLastRuneInString(needle)
		if !unicode.IsLetter(last) && !unicode.IsDigit(last) {
			suffix = ``
		}
	}
	return prefix + regexp.QuoteMeta(needle) + suffix
}

func matchAny(rules []ruleSet, hay string) string {
	for _, rule := range rules {
		for _, re := range rule.res {
			if re.MatchString(hay) {
				return rule.value
			}
		}
	}
	return ""
}

// categoryRules menebak kategori software dari kata kunci pada judul, metadata,
// dan nama situs. Urutan penting: aturan pertama yang cocok menang.
var categoryRules = buildRules([]ruleInput{
	{[]string{"photo editor", "photoshop", "illustrator", "graphic design", "coreldraw", "figma", "canva", "design software"}, "Desain Grafis"},
	{[]string{"video editor", "video editing", "premiere", "after effects", "capcut", "davinci resolve", "filmora", "obs studio"}, "Editing Video"},
	{[]string{"audio editor", "music production", "fl studio", "ableton", "audacity"}, "Audio & Musik"},
	{[]string{"office suite", "word processor", "spreadsheet", "libreoffice", "microsoft office", "pdf editor"}, "Produktivitas & Perkantoran"},
	{[]string{"antivirus", "internet security", "cleaner", "optimizer", "defender", "malware"}, "Keamanan"},
	{[]string{"download manager", "archiver", "7-zip", "winrar", "file manager", "uninstaller"}, "Utilitas"},
	{[]string{"code editor", "ide", "visual studio", "vscode", "intellij", "programming"}, "Pemrograman"},
	{[]string{"3d modeling", "blender", "autocad", "sketchup", "solidworks", "cad"}, "3D & CAD"},
	{[]string{"browser", "media player", "vlc", "vpn", "remote desktop", "teamviewer", "anydesk"}, "Internet & Jaringan"},
	{[]string{"game engine", "unity", "unreal engine", "godot"}, "Game Development"},
	{[]string{"driver", "firmware", "hardware monitor"}, "Driver & Hardware"},
	{[]string{"accounting", "kasir", "point of sale", "pos"}, "Bisnis & Keuangan"},
})

// licenseRules menebak skema lisensi dari kata kunci halaman.
var licenseRules = buildRules([]ruleInput{
	{[]string{"open source", "free and open"}, "Open Source"},
	{[]string{"free download", "download free", "100% free", "gratis"}, "Gratis"},
	{[]string{"free trial", "trial version", "30-day trial", "coba gratis"}, "Trial"},
	{[]string{"freemium", "free version"}, "Freemium"},
	{[]string{"buy now", "pricing", "subscription", "license key", "berbayar"}, "Berbayar"},
})

// platformRules menebak platform yang didukung dari teks halaman.
var platformRules = []struct {
	re       *regexp.Regexp
	platform string
}{
	{regexp.MustCompile(`(?i)\bwindows\b`), "Windows"},
	{regexp.MustCompile(`(?i)\bmac ?os\b`), "macOS"},
	{regexp.MustCompile(`(?i)\blinux\b`), "Linux"},
	{regexp.MustCompile(`(?i)\bandroid\b`), "Android"},
	{regexp.MustCompile(`(?i)\bios\b`), "iOS"},
}

// ImportSoftware membaca halaman resmi `urlStr` dan mengembalikan data yang
// bisa dipakai untuk mengisi form tambah software.
func (a *App) ImportSoftware(urlStr string) (*SoftwareImportResult, error) {
	endpoint, err := normalizePageURL(urlStr)
	if err != nil {
		return nil, err
	}

	req, cancel, err := a.newRequest(http.MethodGet, endpoint, apiTimeout)
	if err != nil {
		return nil, err
	}
	defer cancel()
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	res, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Gagal menghubungi situs: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("Situs menolak permintaan otomatis (HTTP %d). Isi form manual ya.", res.StatusCode)
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Halaman tidak tersedia (HTTP %d)", res.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, maxPageBytes))
	if err != nil {
		return nil, fmt.Errorf("Gagal membaca halaman: %w", err)
	}
	page := string(body)

	metas := parseMetaTags(page)
	title := firstNonEmpty(metas["og:title"], metas["twitter:title"], cleanTitle(firstMatch(titleTagRe, page)))
	summary := firstNonEmpty(metas["og:description"], metas["twitter:description"], metas["description"])
	siteName := firstNonEmpty(metas["og:site_name"], metas["application-name"], metas["author"])
	hay := strings.ToLower(title + " " + summary + " " + siteName + " " + metas["keywords"])

	result := &SoftwareImportResult{
		Title:    truncateUTF8(cleanTitle(title), maxLenTitle),
		Category: matchAny(categoryRules, hay),
		License:  matchAny(licenseRules, hay),
		Platform: guessPlatform(hay),
		Version:  truncateUTF8(guessVersion(page, title, summary), maxLenVersion),
		Website:  truncateUTF8(endpoint, maxLenRef),
	}

	if img := firstNonEmpty(metas["og:image"], metas["twitter:image"]); img != "" {
		result.Thumbnail = a.downloadThumb(img)
	}

	if result.Title == "" && result.Thumbnail == "" && result.Category == "" {
		return nil, fmt.Errorf("Halaman tidak punya metadata yang bisa dibaca. Coba link halaman download-nya, atau isi manual.")
	}
	return result, nil
}

// normalizePageURL memastikan yang diakses benar-benar URL http/https dan tidak
// membawa kredensial di dalamnya.
func normalizePageURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("Link belum diisi.")
	}
	if !strings.Contains(trimmed, "://") {
		trimmed = "https://" + trimmed
	}
	u, err := url.Parse(trimmed)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", fmt.Errorf("Link tidak valid. Contoh: https://www.example.com/product")
	}
	if u.User != nil {
		return "", fmt.Errorf("Link dengan akun/password tidak dipakai.")
	}
	return u.String(), nil
}

// parseMetaTags mengumpulkan <meta property|name → content>. Key selalu
// lower-case.
func parseMetaTags(page string) map[string]string {
	out := map[string]string{}
	for _, tag := range metaTagRe.FindAllString(page, -1) {
		var name, content string
		for _, m := range attrRe.FindAllStringSubmatch(tag, -1) {
			key := strings.ToLower(m[1])
			val := firstNonEmpty(m[3], m[4], m[5])
			switch key {
			case "property", "name":
				name = strings.ToLower(strings.TrimSpace(val))
			case "content":
				content = val
			}
		}
		if name != "" && strings.TrimSpace(content) != "" {
			out[name] = html.UnescapeString(content)
		}
	}
	return out
}

// firstMatch mengembalikan grup tertangkap pertama dari regex, atau "".
func firstMatch(re *regexp.Regexp, s string) string {
	m := re.FindStringSubmatch(s)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// cleanTitle membuang tag + entity dan memotong imbuhan situs ("Nama | Vendor")
// lalu merapikan whitespace. Tanda hubung sengaja tidak dipotong karena banyak
// nama software memakainya ("Office 2021 - Professional").
func cleanTitle(s string) string {
	s = html.UnescapeString(s)
	s = tagRe.ReplaceAllString(s, " ")
	if parts := strings.Split(s, "|"); len(parts) > 1 {
		// Bagian paling kiri biasanya nama produk; sisanya branding.
		s = parts[0]
	}
	return spaceRe.ReplaceAllString(strings.TrimSpace(s), " ")
}

// guessVersion mencari nomor versi eksplisit ("Version: 5.1.2") di teks halaman
// atau deskripsi, lalu jatuh ke angka bergaya versi yang menempel di judul.
func guessVersion(page, title, summary string) string {
	for _, src := range []string{cleanText(page), summary} {
		if m := versionRe.FindStringSubmatch(src); len(m) > 1 {
			return m[1]
		}
	}
	for _, word := range strings.Fields(title) {
		if versionWordRe.MatchString(word) {
			return word
		}
	}
	return ""
}

// cleanText mereduksi HTML menjadi teks biasa ber-baris, dipakai untuk
// pencocokan teks halaman.
func cleanText(s string) string {
	s = scriptStyleRe.ReplaceAllString(s, " ")
	s = tagRe.ReplaceAllString(s, "\n")
	s = html.UnescapeString(s)
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		lines[i] = spaceRe.ReplaceAllString(strings.TrimSpace(line), " ")
	}
	return strings.Join(lines, "\n")
}

// guessPlatform menyusun daftar platform yang disebut di halaman, tanpa duplikat.
func guessPlatform(hay string) string {
	found := make([]string, 0, len(platformRules))
	for _, rule := range platformRules {
		if !rule.re.MatchString(hay) {
			continue
		}
		dup := false
		for _, p := range found {
			if p == rule.platform {
				dup = true
				break
			}
		}
		if !dup {
			found = append(found, rule.platform)
		}
	}
	return strings.Join(found, ", ")
}

// ---------------------------------------------------------------------------
// Unduh thumbnail
// ---------------------------------------------------------------------------

// contentExtThumb memetakan content-type gambar ke ekstensi whitelist.
var contentExtThumb = map[string]string{
	"image/png":                ".png",
	"image/jpeg":               ".jpg",
	"image/jpg":                ".jpg",
	"image/webp":               ".webp",
	"image/gif":                ".gif",
	"image/svg+xml":            ".svg",
	"image/bmp":                ".bmp",
	"image/x-icon":             ".ico",
	"image/vnd.microsoft.icon": ".ico",
}

// thumbDest adalah pasangan path tujuan + URL sumber yang sudah tervalidasi.
type thumbDest struct {
	path string
	url  string
}

// downloadThumb menyimpan gambar dari halaman resmi ke folder thumbnails.
// Mengembalikan "" bila gambar tidak bisa diambil — impor tetap boleh lanjut
// tanpa thumbnail.
func (a *App) downloadThumb(imgURL string) string {
	dest, ext, ok := a.thumbTarget(imgURL)
	if !ok {
		return ""
	}

	req, cancel, err := a.newRequest(http.MethodGet, dest.url, imageTimeout)
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
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0]))
	if ext == "" {
		ext = contentExtThumb[contentType]
	}
	// Ekstensi ditentukan dari Content-Type bila URL tidak jelas: nama file di
	// disk tidak boleh berbohong soal isinya.
	if ext == "" || !strings.HasPrefix(contentType, "image/") {
		return ""
	}
	if res.ContentLength > maxThumbnailBytes {
		return ""
	}

	// Ekstensi hasil negosiasi mungkin berbeda dari tebakan URL → ganti nama.
	if strings.ToLower(filepath.Ext(dest.path)) != ext {
		dest.path = strings.TrimSuffix(dest.path, filepath.Ext(dest.path)) + ext
	}

	out, err := os.Create(dest.path)
	if err != nil {
		return ""
	}
	defer out.Close()

	written, err := io.Copy(out, io.LimitReader(res.Body, maxThumbnailBytes+1))
	if err != nil || written == 0 || written > maxThumbnailBytes {
		_ = os.Remove(dest.path)
		return ""
	}
	return thumbURLPrefix + filepath.Base(dest.path)
}

// thumbTarget memvalidasi URL gambar (skema, host, ekstensi) lalu menentukan
// path tujuan yang aman di dalam folder thumbnails.
func (a *App) thumbTarget(imgURL string) (thumbDest, string, bool) {
	u, err := url.Parse(strings.TrimSpace(imgURL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return thumbDest{}, "", false
	}
	host := strings.ToLower(u.Hostname())
	if !strings.Contains(host, ".") {
		return thumbDest{}, "", false
	}

	ext := strings.ToLower(filepath.Ext(u.Path))
	if !allowedThumbExt[ext] {
		ext = "" // biarkan ditentukan dari Content-Type nanti
	}

	name, err := a.newThumbName(ext)
	if err != nil {
		return thumbDest{}, "", false
	}
	// Nama file hanya boleh berisi karakter aman supaya selalu lolos
	// safeThumbPath saat thumbnail nanti dibaca/dihapus.
	safeHost := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		return '-'
	}, host)
	if len(safeHost) > 32 {
		safeHost = safeHost[:32]
	}
	return thumbDest{
		path: filepath.Join(a.thumbsDir, fmt.Sprintf("web-%s-%s", safeHost, name)),
		url:  u.String(),
	}, ext, true
}
