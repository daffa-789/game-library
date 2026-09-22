package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setupTestApp(t *testing.T) (*App, string) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "libray-game-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(tempDir)
	})

	app := newAppWithDataDir(tempDir)
	return app, tempDir
}

func TestLoadLibrary_MissingFileCreatesSampleData(t *testing.T) {
	app, tempDir := setupTestApp(t)

	games, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary failed: %v", err)
	}

	if len(games) != 2 {
		t.Fatalf("expected 2 sample games, got %d", len(games))
	}

	if games[0].Title != "Grand Theft Auto V" {
		t.Errorf("expected first game 'Grand Theft Auto V', got '%s'", games[0].Title)
	}

	if games[1].Title != "ELDEN RING" {
		t.Errorf("expected second game 'ELDEN RING', got '%s'", games[1].Title)
	}

	// Verify sample files and library.json were written to disk
	libFile := filepath.Join(tempDir, "library.json")
	if _, err := os.Stat(libFile); os.IsNotExist(err) {
		t.Errorf("expected library.json to be created, but not found")
	}

	gtaFile := filepath.Join(tempDir, "thumbnails", "sample-gta.svg")
	if _, err := os.Stat(gtaFile); os.IsNotExist(err) {
		t.Errorf("expected sample-gta.svg to be created in thumbnails")
	}
}

func TestLoadLibrary_CorruptedFileBacksUpAndReturnsEmpty(t *testing.T) {
	app, tempDir := setupTestApp(t)

	libFile := filepath.Join(tempDir, "library.json")
	corruptContent := []byte("{ corrupted json content [")
	if err := os.WriteFile(libFile, corruptContent, 0644); err != nil {
		t.Fatalf("failed to write corrupted file: %v", err)
	}

	games, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("expected nil error on corrupted library, got: %v", err)
	}

	if len(games) != 0 {
		t.Errorf("expected empty games list on corrupt file, got %d", len(games))
	}

	// Verify backup file exists
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("failed to read temp dir: %v", err)
	}

	foundBackup := false
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".rusak-") {
			foundBackup = true
			break
		}
	}
	if !foundBackup {
		t.Errorf("expected a .rusak-* backup file to be created")
	}
}

func TestLoadLibrary_NormalizesLegacyThumbnails(t *testing.T) {
	app, tempDir := setupTestApp(t)

	legacyData := LibraryFile{
		Games: []Game{
			{
				ID:        "legacy-1",
				Title:     "Legacy Game",
				Thumbnail: "glib://thumb/legacy-cover.jpg",
			},
		},
	}
	dataBytes, _ := json.Marshal(legacyData)
	_ = os.WriteFile(filepath.Join(tempDir, "library.json"), dataBytes, 0644)

	games, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary failed: %v", err)
	}

	if len(games) != 1 {
		t.Fatalf("expected 1 game, got %d", len(games))
	}

	expectedThumb := "/thumbnails/legacy-cover.jpg"
	if games[0].Thumbnail != expectedThumb {
		t.Errorf("expected thumbnail '%s', got '%s'", expectedThumb, games[0].Thumbnail)
	}
}

func TestSaveLibrary_AtomicWriteAndSanitization(t *testing.T) {
	app, tempDir := setupTestApp(t)

	testGames := []Game{
		{
			Title: "Test Game Without ID",
			Genre: "Action",
			Specs: SpecsContainer{
				Min: SystemSpecs{
					OS:  "Windows 10",
					CPU: "Intel i5",
				},
			},
		},
	}

	err := app.SaveLibrary(testGames)
	if err != nil {
		t.Fatalf("SaveLibrary failed: %v", err)
	}

	loaded, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary failed after save: %v", err)
	}

	if len(loaded) != 1 {
		t.Fatalf("expected 1 game loaded, got %d", len(loaded))
	}

	saved := loaded[0]
	if saved.ID == "" {
		t.Errorf("expected auto-generated UUID for game with empty ID")
	}
	if saved.CreatedAt == "" {
		t.Errorf("expected CreatedAt timestamp to be populated")
	}
	if saved.UpdatedAt == "" {
		t.Errorf("expected UpdatedAt timestamp to be populated")
	}

	// Verify temporary files are not left behind
	entries, _ := os.ReadDir(tempDir)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp-") {
			t.Errorf("found leftover temp file: %s", e.Name())
		}
	}
}

func TestThumbnailHandler(t *testing.T) {
	app, tempDir := setupTestApp(t)

	// Create test thumbnail
	thumbPath := filepath.Join(tempDir, "thumbnails", "test-img.png")
	imgContent := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR...")
	if err := os.WriteFile(thumbPath, imgContent, 0644); err != nil {
		t.Fatalf("failed to create test image: %v", err)
	}

	handler := app.ThumbnailHandler()

	// 1. Success case: GET /thumbnails/test-img.png
	req := httptest.NewRequest(http.MethodGet, "/thumbnails/test-img.png", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected HTTP 200 for valid thumbnail, got %d", rr.Code)
	}
	if cc := rr.Header().Get("Cache-Control"); !strings.Contains(cc, "max-age=86400") {
		t.Errorf("expected Cache-Control header, got '%s'", cc)
	}

	// 2. Non-existent file: GET /thumbnails/missing.png
	reqNotFound := httptest.NewRequest(http.MethodGet, "/thumbnails/missing.png", nil)
	rrNotFound := httptest.NewRecorder()
	handler.ServeHTTP(rrNotFound, reqNotFound)

	if rrNotFound.Code != http.StatusNotFound {
		t.Errorf("expected HTTP 404 for missing thumbnail, got %d", rrNotFound.Code)
	}

	// 3. Method not allowed: POST /thumbnails/test-img.png
	reqMethod := httptest.NewRequest(http.MethodPost, "/thumbnails/test-img.png", nil)
	rrMethod := httptest.NewRecorder()
	handler.ServeHTTP(rrMethod, reqMethod)

	if rrMethod.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected HTTP 405 for POST request, got %d", rrMethod.Code)
	}

	// 4. Path traversal guard: GET /thumbnails/../../etc/passwd
	reqTraversal := httptest.NewRequest(http.MethodGet, "/thumbnails/../../etc/passwd", nil)
	rrTraversal := httptest.NewRecorder()
	handler.ServeHTTP(rrTraversal, reqTraversal)

	if rrTraversal.Code != http.StatusNotFound && rrTraversal.Code != http.StatusForbidden {
		t.Errorf("expected HTTP 404 or 403 for traversal attack, got %d", rrTraversal.Code)
	}
}

func TestDeleteThumbnail(t *testing.T) {
	app, tempDir := setupTestApp(t)

	thumbPath := filepath.Join(tempDir, "thumbnails", "del-img.png")
	if err := os.WriteFile(thumbPath, []byte("data"), 0644); err != nil {
		t.Fatalf("failed to create dummy file: %v", err)
	}

	// Delete using URL path
	err := app.DeleteThumbnail("/thumbnails/del-img.png")
	if err != nil {
		t.Fatalf("DeleteThumbnail returned unexpected error: %v", err)
	}

	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Errorf("expected thumbnail file to be deleted")
	}

	// Calling on non-existent or dangerous paths should not error or delete unauthorized files
	outsideFile := filepath.Join(tempDir, "safe.txt")
	_ = os.WriteFile(outsideFile, []byte("safe"), 0644)

	_ = app.DeleteThumbnail("/thumbnails/../safe.txt")
	if _, err := os.Stat(outsideFile); os.IsNotExist(err) {
		t.Errorf("file outside thumbnails directory was deleted!")
	}
}

func TestParseSysReq(t *testing.T) {
	app, _ := setupTestApp(t)

	rawHTML := `<strong>Minimum:</strong><br><ul class="bb_ul"><li><strong>OS *:</strong> Windows 10 64-bit<br></li><li><strong>Processor:</strong> Intel Core i5-2500K / AMD FX-6300<br></li><li><strong>Memory:</strong> 8 GB RAM<br></li><li><strong>Graphics:</strong> NVIDIA GeForce GTX 770 2GB / AMD Radeon R9 280 3GB<br></li><li><strong>DirectX:</strong> Version 11<br></li><li><strong>Network:</strong> Broadband Internet connection<br></li><li><strong>Storage:</strong> 150 GB available space<br></li><li><strong>Sound Card:</strong> Direct X Compatible</li><li><strong>Additional Notes:</strong> Broadband connection required</li></ul>`

	specs := app.parseSysReq(rawHTML)

	if !strings.Contains(specs.OS, "Windows 10") {
		t.Errorf("expected OS to contain 'Windows 10', got '%s'", specs.OS)
	}
	if !strings.Contains(specs.CPU, "Intel Core i5-2500K") {
		t.Errorf("expected CPU to contain 'Intel Core i5-2500K', got '%s'", specs.CPU)
	}
	if !strings.Contains(specs.RAM, "8 GB RAM") {
		t.Errorf("expected RAM to contain '8 GB RAM', got '%s'", specs.RAM)
	}
	if !strings.Contains(specs.GPU, "NVIDIA GeForce GTX 770") {
		t.Errorf("expected GPU to contain 'NVIDIA GeForce GTX 770', got '%s'", specs.GPU)
	}
	if !strings.Contains(specs.DX, "Version 11") {
		t.Errorf("expected DX to contain 'Version 11', got '%s'", specs.DX)
	}
	if !strings.Contains(specs.Net, "Broadband Internet") {
		t.Errorf("expected Net to contain 'Broadband Internet', got '%s'", specs.Net)
	}
	if !strings.Contains(specs.Storage, "150 GB") {
		t.Errorf("expected Storage to contain '150 GB', got '%s'", specs.Storage)
	}
	if !strings.Contains(specs.Sound, "Direct X Compatible") {
		t.Errorf("expected Sound to contain 'Direct X Compatible', got '%s'", specs.Sound)
	}
	if !strings.Contains(specs.Notes, "Broadband connection") {
		t.Errorf("expected Notes to contain 'Broadband connection', got '%s'", specs.Notes)
	}
}

func TestOpenExternal_Validation(t *testing.T) {
	app, _ := setupTestApp(t)

	if err := app.OpenExternal("invalid-url"); err == nil {
		t.Errorf("expected error for invalid URL 'invalid-url'")
	}

	if err := app.OpenExternal("ftp://example.com"); err == nil {
		t.Errorf("expected error for non-http/https URL")
	}

	if err := app.OpenExternal("https://google.com"); err != nil {
		t.Errorf("expected no error for valid https URL, got: %v", err)
	}
}

func TestSteamImport_InvalidURL(t *testing.T) {
	app, _ := setupTestApp(t)
	_, err := app.SteamImport("https://google.com/search")
	if err == nil {
		t.Errorf("expected error for non-steam URL")
	}
}

