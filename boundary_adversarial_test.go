package main

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// 1. Thumbnail Security & Path Traversal Tests
// ---------------------------------------------------------------------------

func TestAdversarial_ThumbnailPathTraversal(t *testing.T) {
	app, tempDir := setupTestApp(t)

	// Create a canary file OUTSIDE the thumbnails directory
	canaryPath := filepath.Join(tempDir, "canary_secret.txt")
	canaryContent := "CANARY_SECRET_DATA_DO_NOT_LEAK"
	if err := os.WriteFile(canaryPath, []byte(canaryContent), 0644); err != nil {
		t.Fatalf("failed to create canary file: %v", err)
	}

	// Create a valid thumbnail inside thumbnails directory
	validThumbPath := filepath.Join(tempDir, "thumbnails", "valid_test.png")
	validContent := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR_VALID_PNG_CONTENT")
	if err := os.WriteFile(validThumbPath, validContent, 0644); err != nil {
		t.Fatalf("failed to create valid thumbnail: %v", err)
	}

	// Create an SVG thumbnail
	svgThumbPath := filepath.Join(tempDir, "thumbnails", "test_vector.svg")
	svgContent := []byte("<svg xmlns=\"http://www.w3.org/2000/svg\"><text>Test</text></svg>")
	if err := os.WriteFile(svgThumbPath, svgContent, 0644); err != nil {
		t.Fatalf("failed to create SVG thumbnail: %v", err)
	}

	handler := app.ThumbnailHandler()

	// Legitimate access tests
	t.Run("ValidPNG_Returns200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/thumbnails/valid_test.png", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200 for valid thumbnail, got %d", rr.Code)
		}
		if !bytes.Equal(rr.Body.Bytes(), validContent) {
			t.Errorf("thumbnail body content mismatch")
		}
		if cc := rr.Header().Get("Cache-Control"); !strings.Contains(cc, "max-age=86400") {
			t.Errorf("missing or invalid Cache-Control: %s", cc)
		}
	})

	t.Run("ValidSVG_Returns200", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/thumbnails/test_vector.svg", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200 for valid SVG, got %d", rr.Code)
		}
	})

	// Adversarial traversal payloads
	traversalPayloads := []struct {
		name string
		url  string
	}{
		{"RelativeParent_Linux", "/thumbnails/../canary_secret.txt"},
		{"DeepRelative_Linux", "/thumbnails/../../canary_secret.txt"},
		{"RelativeParent_WinBackslash", "/thumbnails/..\\canary_secret.txt"},
		{"DeepRelative_WinBackslash", "/thumbnails/..\\..\\canary_secret.txt"},
		{"WindowsSystem32_Calc", "/thumbnails/../../windows/system32/calc.exe"},
		{"WindowsWinIni", "/thumbnails/..\\..\\..\\windows\\win.ini"},
		{"URLEncodedSlash", "/thumbnails/..%2fcanary_secret.txt"},
		{"DoubleURLEncoded", "/thumbnails/%252e%252e%252fcanary_secret.txt"},
		{"NullByte", "/thumbnails/valid_test.png%00canary_secret.txt"},
		{"SingleDot", "/thumbnails/."},
		{"DoubleDot", "/thumbnails/.."},
		{"TripleDot", "/thumbnails/..."},
		{"SlashOnly", "/thumbnails/"},
		{"MultipleSlashes", "/thumbnails////"},
		{"BackslashOnly", "/thumbnails\\\\"},
		{"NonExistentFile", "/thumbnails/definitely_not_found_12345.png"},
		{"WrongPrefix", "/assets/valid_test.png"},
		{"WrongPrefixRoot", "/valid_test.png"},
	}

	for _, tc := range traversalPayloads {
		t.Run("Traversal_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.url, nil)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			// MUST NOT return 200 OK
			if rr.Code == http.StatusOK {
				t.Fatalf("SECURITY VIOLATION: Traversal URL '%s' returned HTTP 200!", tc.url)
			}

			// MUST NOT leak canary contents
			if strings.Contains(rr.Body.String(), canaryContent) {
				t.Fatalf("SECURITY VIOLATION: Canary file contents leaked via '%s'!", tc.url)
			}

			// Must be either 404 NotFound or 403 Forbidden
			if rr.Code != http.StatusNotFound && rr.Code != http.StatusForbidden {
				t.Errorf("Expected 404 or 403 for '%s', got HTTP %d", tc.url, rr.Code)
			}
		})
	}

	// Method restriction tests
	disallowedMethods := []string{
		http.MethodPost,
		http.MethodPut,
		http.MethodDelete,
		http.MethodPatch,
		http.MethodHead,
		http.MethodOptions,
	}
	for _, method := range disallowedMethods {
		t.Run("Method_"+method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/thumbnails/valid_test.png", nil)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusMethodNotAllowed {
				t.Errorf("Expected 405 MethodNotAllowed for %s, got HTTP %d", method, rr.Code)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// 2. Thumbnail Deletion Security & Isolation Tests
// ---------------------------------------------------------------------------

func TestAdversarial_DeleteThumbnailRestricted(t *testing.T) {
	app, tempDir := setupTestApp(t)

	// Create critical external file outside thumbnails
	externalFile := filepath.Join(tempDir, "critical_file.txt")
	if err := os.WriteFile(externalFile, []byte("CRITICAL_SYSTEM_DATA"), 0644); err != nil {
		t.Fatalf("failed to create external file: %v", err)
	}

	// Create subfolder inside thumbnails
	subDir := filepath.Join(tempDir, "thumbnails", "subfolder")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("failed to create subfolder: %v", err)
	}

	// Create valid thumbnail
	validThumb := filepath.Join(tempDir, "thumbnails", "victim.png")
	if err := os.WriteFile(validThumb, []byte("THUMB_CONTENT"), 0644); err != nil {
		t.Fatalf("failed to create victim thumbnail: %v", err)
	}

	maliciousDeleteTargets := []string{
		"../../critical_file.txt",
		"..\\..\\critical_file.txt",
		"/thumbnails/../../critical_file.txt",
		"/thumbnails/../critical_file.txt",
		"glib://thumb/../../critical_file.txt",
		"glib://thumb/../critical_file.txt",
		".",
		"..",
		"/",
		"\\",
		"",
		"   ",
		"C:\\Windows\\win.ini",
		"C:/Windows/win.ini",
		"/thumbnails/",
		"glib://thumb/",
		"/thumbnails/subfolder", // Target directory inside thumbnails
	}

	for _, target := range maliciousDeleteTargets {
		t.Run("Delete_"+target, func(t *testing.T) {
			err := app.DeleteThumbnail(target)
			if err != nil {
				t.Errorf("DeleteThumbnail returned error: %v (expected graceful handling)", err)
			}

			// Verify external file was NOT deleted
			if _, statErr := os.Stat(externalFile); os.IsNotExist(statErr) {
				t.Fatalf("SECURITY VIOLATION: External file was deleted by DeleteThumbnail('%s')!", target)
			}

			// Verify thumbnails directory was NOT deleted
			thumbsDir := filepath.Join(tempDir, "thumbnails")
			if fi, statErr := os.Stat(thumbsDir); os.IsNotExist(statErr) || !fi.IsDir() {
				t.Fatalf("SECURITY VIOLATION: Thumbnails directory was deleted by DeleteThumbnail('%s')!", target)
			}

			// Verify subfolder was NOT deleted
			if fi, statErr := os.Stat(subDir); os.IsNotExist(statErr) || !fi.IsDir() {
				t.Fatalf("SECURITY VIOLATION: Subdirectory was deleted by DeleteThumbnail('%s')!", target)
			}
		})
	}

	// Verify valid deletion works
	t.Run("DeleteValidThumbnail", func(t *testing.T) {
		err := app.DeleteThumbnail("/thumbnails/victim.png")
		if err != nil {
			t.Errorf("DeleteThumbnail failed on valid thumbnail: %v", err)
		}
		if _, statErr := os.Stat(validThumb); !os.IsNotExist(statErr) {
			t.Errorf("Valid thumbnail was not deleted")
		}

		// Second delete must be idempotent
		err2 := app.DeleteThumbnail("/thumbnails/victim.png")
		if err2 != nil {
			t.Errorf("Second DeleteThumbnail call returned error: %v", err2)
		}
	})
}

// ---------------------------------------------------------------------------
// 3. Steam Import URL Edge Cases & API Boundaries
// ---------------------------------------------------------------------------

func TestAdversarial_SteamImportURLEdgeCases(t *testing.T) {
	app, _ := setupTestApp(t)

	malformedURLs := []struct {
		name string
		url  string
	}{
		{"EmptyString", ""},
		{"WhitespaceOnly", "   \t\n  "},
		{"RandomWebURL", "https://google.com"},
		{"MissingAppID", "https://store.steampowered.com/app/"},
		{"NonNumericAppID", "https://store.steampowered.com/app/grandtheftauto"},
		{"NegativeAppID", "https://store.steampowered.com/app/-123"},
		{"SQLInjectionNoDigits", "https://store.steampowered.com/app/' OR 1=1--"},
		{"XSSPayloadNoDigits", "https://store.steampowered.com/app/<script>alert(1)</script>"},
		{"SchemeOnly", "https://"},
		{"IncompleteDomain", "store.steampowered.com/games/123"},
	}

	for _, tc := range malformedURLs {
		t.Run("MalformedURL_"+tc.name, func(t *testing.T) {
			result, err := app.SteamImport(tc.url)
			if err == nil {
				t.Errorf("Expected error for URL '%s', got result: %+v", tc.url, result)
			}
			if result != nil {
				t.Errorf("Expected nil result for invalid URL, got: %+v", result)
			}
		})
	}
}

func TestAdversarial_SteamImportMockedResponses(t *testing.T) {
	app, tempDir := setupTestApp(t)

	// Mock Steam Store HTTP Server
	mockMux := http.NewServeMux()

	// 1. Game Not Found / success=false
	mockMux.HandleFunc("/api/notfound", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"999999": {"success": false}}`)
	})

	// 2. Empty PC requirements array `[]` (very common on Steam for macOS-only or unconfigured specs)
	mockMux.HandleFunc("/api/empty_reqs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{
			"100": {
				"success": true,
				"data": {
					"name": "Game With Empty Reqs Array",
					"header_image": "",
					"pc_requirements": [],
					"genres": [{"description": "Indie"}],
					"developers": ["Dev Team"],
					"release_date": {"date": "Jan 1, 2026"},
					"price_overview": {"final_formatted": "Free"}
				}
			}
		}`)
	})

	// 3. Free game without price_overview
	mockMux.HandleFunc("/api/free_game", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{
			"200": {
				"success": true,
				"data": {
					"name": "Free To Play Game",
					"header_image": "",
					"pc_requirements": {
						"minimum": "<li><strong>OS:</strong> Windows 10</li>"
					},
					"genres": [{"description": "Action"}],
					"developers": ["Valve"],
					"release_date": {"date": "Aug 21, 2012"}
				}
			}
		}`)
	})

	// 4. Server error 500
	mockMux.HandleFunc("/api/server_error", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	})

	// 5. Corrupted JSON response
	mockMux.HandleFunc("/api/corrupt_json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"invalid_json: [`)
	})

	server := httptest.NewServer(mockMux)
	defer server.Close()

	// Helper to execute request through mock by swapping client Transport
	customClient := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			// Rewrite steam request to mock server
			if strings.Contains(req.URL.String(), "appids=999999") {
				return http.Get(server.URL + "/api/notfound")
			}
			if strings.Contains(req.URL.String(), "appids=100") {
				return http.Get(server.URL + "/api/empty_reqs")
			}
			if strings.Contains(req.URL.String(), "appids=200") {
				return http.Get(server.URL + "/api/free_game")
			}
			if strings.Contains(req.URL.String(), "appids=500") {
				return http.Get(server.URL + "/api/server_error")
			}
			if strings.Contains(req.URL.String(), "appids=777") {
				return http.Get(server.URL + "/api/corrupt_json")
			}
			return http.DefaultTransport.RoundTrip(req)
		}),
	}
	app.client = customClient

	t.Run("SteamNotFound_ReturnsCleanError", func(t *testing.T) {
		res, err := app.SteamImport("https://store.steampowered.com/app/999999/nonexistent/")
		if err == nil {
			t.Errorf("Expected error for non-existent game, got result: %+v", res)
		}
		if !strings.Contains(err.Error(), "Data game tidak ditemukan di Steam") {
			t.Errorf("Expected 'Data game tidak ditemukan di Steam', got: %v", err)
		}
	})

	t.Run("SteamEmptyReqsArray_ParsesWithoutCrash", func(t *testing.T) {
		res, err := app.SteamImport("https://store.steampowered.com/app/100/test_game/")
		if err != nil {
			t.Fatalf("SteamImport failed on empty pc_requirements array: %v", err)
		}
		if res.Title != "Game With Empty Reqs Array" {
			t.Errorf("Unexpected title: %s", res.Title)
		}
		if res.Specs.Min.OS != "" {
			t.Errorf("Expected empty specs OS, got: %s", res.Specs.Min.OS)
		}
	})

	t.Run("SteamFreeGameWithoutPriceOverview", func(t *testing.T) {
		res, err := app.SteamImport("https://store.steampowered.com/app/200/free_game/")
		if err != nil {
			t.Fatalf("SteamImport failed on free game: %v", err)
		}
		if res.Price != "" {
			t.Errorf("Expected empty price string for missing price_overview, got '%s'", res.Price)
		}
		if res.Specs.Min.OS != "Windows 10" {
			t.Errorf("Expected OS 'Windows 10', got '%s'", res.Specs.Min.OS)
		}
	})

	t.Run("SteamServerError_ReturnsCleanError", func(t *testing.T) {
		_, err := app.SteamImport("https://store.steampowered.com/app/500/server_error/")
		if err == nil {
			t.Errorf("Expected error on Steam HTTP 500")
		}
		if !strings.Contains(err.Error(), "HTTP 500") {
			t.Errorf("Expected error mentioning HTTP 500, got: %v", err)
		}
	})

	t.Run("SteamCorruptedJSON_ReturnsCleanError", func(t *testing.T) {
		_, err := app.SteamImport("https://store.steampowered.com/app/777/corrupt/")
		if err == nil {
			t.Errorf("Expected error on corrupted Steam JSON response")
		}
	})

	_ = tempDir
}

type roundTripFunc func(req *http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

// ---------------------------------------------------------------------------
// 4. HTML Stripping & XSS Sanitization Tests
// ---------------------------------------------------------------------------

func TestAdversarial_HTMLStrippingAndXSS(t *testing.T) {
	app, _ := setupTestApp(t)

	xssCases := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "ScriptTagsWithContent",
			input:    "<script>alert('XSS')</script>Intel Core i7",
			expected: "alert('XSS')Intel Core i7",
		},
		{
			name:     "ScriptTagSrcOnly",
			input:    `<script src="https://attacker.com/hook.js"></script>`,
			expected: "",
		},
		{
			name:     "ImgOnError",
			input:    `<img src=x onerror="alert(1)">`,
			expected: "",
		},
		{
			name:     "SvgOnLoad",
			input:    `<svg/onload=alert(document.domain)>`,
			expected: "",
		},
		{
			name:     "IframeJavascript",
			input:    `<iframe src="javascript:alert(1)"></iframe>`,
			expected: "",
		},
		{
			name:     "AnchorWithJavascript",
			input:    `<a href="javascript:alert(1)">Click for RAM</a>`,
			expected: "Click for RAM",
		},
		{
			name:     "DeeplyNestedTags",
			input:    `<div><p><span><b><i>16 GB RAM</i></b></span></p></div>`,
			expected: "16 GB RAM",
		},
		{
			name:     "BrTagsToSpaces",
			input:    `DirectX 11<br>Broadband connection<br/>100 GB`,
			expected: "DirectX 11 Broadband connection 100 GB",
		},
		{
			name:     "HTMLEntitiesDecoded",
			input:    `Intel &amp; AMD &quot;Ryzen&quot; &lt;Fast&gt;`,
			expected: `Intel & AMD "Ryzen" <Fast>`,
		},
		{
			name:     "ConsecutiveSpacesCollapsed",
			input:    "   Windows    10      64-bit   \n\t  ",
			expected: "Windows 10 64-bit",
		},
	}

	for _, tc := range xssCases {
		t.Run("htmlToText_"+tc.name, func(t *testing.T) {
			output := app.htmlToText(tc.input)
			if output != tc.expected {
				t.Errorf("htmlToText failed.\nInput:    %s\nExpected: %s\nGot:      %s", tc.input, tc.expected, output)
			}
			// Verify NO HTML opening tags remain
			if strings.Contains(output, "<script") || strings.Contains(output, "<img") || strings.Contains(output, "<svg") || strings.Contains(output, "<iframe") {
				t.Fatalf("SECURITY VIOLATION: Dangerous HTML tags preserved in output: %s", output)
			}
		})
	}

	t.Run("htmlToText_Max400CharsCap", func(t *testing.T) {
		oversized := strings.Repeat("A", 600)
		output := app.htmlToText(oversized)
		if len(output) != 400 {
			t.Errorf("Expected truncated length 400, got %d", len(output))
		}
	})

	t.Run("parseSysReq_AdversarialHTML", func(t *testing.T) {
		maliciousSysReqHTML := `
			<ul>
				<li><strong>OS:</strong> <script>alert(1)</script>Windows 11<br></li>
				<li><strong>Processor:</strong> <img src=x onerror=alert(1)>AMD Ryzen 7 5800X</li>
				<li><strong>Memory:</strong> 32 GB RAM <!-- comment --></li>
				<li><strong>Graphics:</strong> NVIDIA RTX 3080 &amp; RTX 4080</li>
				<li><strong>DirectX:</strong> Version 12</li>
				<li><strong>Storage:</strong> 200 GB SSD</li>
				<li><strong>Sound Card:</strong> <a href="javascript:alert(1)">Realtek High Definition</a></li>
				<li><strong>Additional Notes:</strong> <b>Requires 64-bit processor</b></li>
			</ul>
		`
		specs := app.parseSysReq(maliciousSysReqHTML)

		if strings.Contains(specs.OS, "<script>") || strings.Contains(specs.OS, "</script>") {
			t.Errorf("specs.OS contains unstripped script tag: %s", specs.OS)
		}
		if !strings.Contains(specs.OS, "Windows 11") {
			t.Errorf("specs.OS does not contain 'Windows 11': %s", specs.OS)
		}
		if strings.Contains(specs.CPU, "<img") {
			t.Errorf("specs.CPU contains unstripped img tag: %s", specs.CPU)
		}
		if !strings.Contains(specs.CPU, "AMD Ryzen 7 5800X") {
			t.Errorf("specs.CPU does not contain processor name: %s", specs.CPU)
		}
		if specs.GPU != "NVIDIA RTX 3080 & RTX 4080" {
			t.Errorf("specs.GPU entity unescaping mismatch: got '%s'", specs.GPU)
		}
		if strings.Contains(specs.Sound, "<a") {
			t.Errorf("specs.Sound contains anchor tag: %s", specs.Sound)
		}
		if !strings.Contains(specs.Sound, "Realtek High Definition") {
			t.Errorf("specs.Sound content missing: %s", specs.Sound)
		}
		if strings.Contains(specs.Notes, "<b>") || strings.Contains(specs.Notes, "</b>") {
			t.Errorf("specs.Notes contains bold tag: %s", specs.Notes)
		}
	})
}

// ---------------------------------------------------------------------------
// 5. URL Opener Security & Scheme Restrictions
// ---------------------------------------------------------------------------

func TestAdversarial_OpenExternalSchemes(t *testing.T) {
	app, _ := setupTestApp(t)

	testCases := []struct {
		url       string
		shouldErr bool
		desc      string
	}{
		// Dangerous Schemes (MUST FAIL)
		{"javascript:alert(1)", true, "Javascript URI"},
		{"javascript://alert(1)", true, "Javascript URI with slashes"},
		{"file:///C:/Windows/win.ini", true, "Local file URI"},
		{"file://localhost/C$/Windows/System32", true, "Local UNC file URI"},
		{"powershell:Start-Process calc", true, "Powershell scheme"},
		{"cmd.exe /c calc", true, "Command line execution attempt"},
		{"data:text/html,<script>alert(1)</script>", true, "Data URI"},
		{"ftp://files.example.com", true, "FTP scheme"},
		{"ssh://root@192.168.1.1", true, "SSH scheme"},
		{"smb://attacker.com/share", true, "SMB UNC share scheme"},
		{"telnet://192.168.1.1", true, "Telnet scheme"},
		{"ms-settings:privacy", true, "Windows settings URI handler"},
		{"ms-msdt:/id PCWDiagnostic", true, "Follina MSDT URI handler"},
		{"calc.exe", true, "Raw executable name"},
		{"//evil.com", true, "Protocol-relative URL"},
		{"", true, "Empty URL"},
		{"    ", true, "Whitespace-only URL"},
		{"http", true, "Missing scheme separator"},
		{"https", true, "Missing scheme separator"},
		{"http:/example.com", true, "Missing double slash"},
		{"https:/example.com", true, "Missing double slash"},

		// Valid HTTP / HTTPS Schemes (MUST PASS)
		{"http://store.steampowered.com", false, "Standard HTTP URL"},
		{"https://store.steampowered.com/app/271590/", false, "Standard HTTPS URL"},
		{"https://drive.google.com/drive/folders/abcdef", false, "Google Drive link"},
		{"  https://google.com  ", false, "HTTPS with leading/trailing spaces"},
		{"HTTP://UPPERCASE.EXAMPLE.COM", false, "Uppercase HTTP"},
		{"HTTPS://UPPERCASE.EXAMPLE.COM/PATH?Q=1", false, "Uppercase HTTPS"},
		{"http://localhost:8080/path", false, "Localhost HTTP"},
	}

	for _, tc := range testCases {
		t.Run("Scheme_"+tc.desc, func(t *testing.T) {
			err := app.OpenExternal(tc.url)
			if tc.shouldErr && err == nil {
				t.Fatalf("SECURITY VIOLATION: Dangerous URL was accepted without error: '%s' (%s)", tc.url, tc.desc)
			}
			if !tc.shouldErr && err != nil {
				t.Errorf("Valid URL was rejected: '%s' (%s), err: %v", tc.url, tc.desc, err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// 6. SaveLibrary Sanitization & Limits
// ---------------------------------------------------------------------------

func TestAdversarial_SaveLibrarySanitization(t *testing.T) {
	app, _ := setupTestApp(t)

	t.Run("CapGamesAt5000", func(t *testing.T) {
		hugeList := make([]Game, 5500)
		for i := 0; i < 5500; i++ {
			hugeList[i] = Game{
				Title: fmt.Sprintf("Game %d", i),
				Link:  "https://test.com",
			}
		}

		err := app.SaveLibrary(hugeList)
		if err != nil {
			t.Fatalf("SaveLibrary failed: %v", err)
		}

		loaded, err := app.LoadLibrary()
		if err != nil {
			t.Fatalf("LoadLibrary failed: %v", err)
		}

		if len(loaded) != 5000 {
			t.Errorf("Expected games slice to be capped at 5000, got %d", len(loaded))
		}
	})

	t.Run("FieldLengthTruncation", func(t *testing.T) {
		oversizedGame := Game{
			Title:      strings.Repeat("T", 300), // limit 200
			Genre:      strings.Repeat("G", 200), // limit 120
			Size:       strings.Repeat("S", 100), // limit 60
			Price:      strings.Repeat("P", 100), // limit 60
			SteamAppID: strings.Repeat("1", 50),  // limit 20
			Specs: SpecsContainer{
				Min: SystemSpecs{
					OS: strings.Repeat("O", 500), // limit 400
				},
			},
		}

		err := app.SaveLibrary([]Game{oversizedGame})
		if err != nil {
			t.Fatalf("SaveLibrary failed: %v", err)
		}

		loaded, err := app.LoadLibrary()
		if err != nil || len(loaded) != 1 {
			t.Fatalf("LoadLibrary failed: %v", err)
		}

		g := loaded[0]
		if len(g.Title) > 200 {
			t.Errorf("Title not truncated: len=%d", len(g.Title))
		}
		if len(g.Genre) > 120 {
			t.Errorf("Genre not truncated: len=%d", len(g.Genre))
		}
		if len(g.Size) > 60 {
			t.Errorf("Size not truncated: len=%d", len(g.Size))
		}
		if len(g.Price) > 60 {
			t.Errorf("Price not truncated: len=%d", len(g.Price))
		}
		if len(g.SteamAppID) > 20 {
			t.Errorf("SteamAppID not truncated: len=%d", len(g.SteamAppID))
		}
		if len(g.Specs.Min.OS) > 400 {
			t.Errorf("Specs.Min.OS not truncated: len=%d", len(g.Specs.Min.OS))
		}
	})

	t.Run("UnicodeAndSpecialCharsPreserved", func(t *testing.T) {
		specialGame := Game{
			Title: "⚔️ The Witcher® 3: Wild Hunt™ — 100% Fun 🎮",
			Genre: "Action / RPG <Special & Quoted \"Text\">",
			Link:  "https://drive.google.com/test?param=1&flag=2",
			Specs: SpecsContainer{
				Min: SystemSpecs{
					Notes: "Requires 64-bit OS & 8GB+ RAM",
				},
			},
		}

		err := app.SaveLibrary([]Game{specialGame})
		if err != nil {
			t.Fatalf("SaveLibrary failed: %v", err)
		}

		loaded, err := app.LoadLibrary()
		if err != nil || len(loaded) != 1 {
			t.Fatalf("LoadLibrary failed: %v", err)
		}

		if loaded[0].Title != specialGame.Title {
			t.Errorf("Unicode title mismatch: got %s", loaded[0].Title)
		}
		if loaded[0].Genre != specialGame.Genre {
			t.Errorf("Genre with quotes/brackets mismatch: got %s", loaded[0].Genre)
		}
	})
}
