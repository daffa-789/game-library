package main

import (
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Challenge 1: Concurrency & Race Conditions
// ---------------------------------------------------------------------------

func TestStress_Concurrency_RapidSaveAndLoad(t *testing.T) {
	app, tempDir := setupTestApp(t)

	const numGoroutines = 30
	const duration = 2 * time.Second

	var writeCount int64
	var readCount int64
	var writeErrors int64
	var readErrors int64

	stop := make(chan struct{})
	var wg sync.WaitGroup

	// Start writer goroutines
	for i := 0; i < numGoroutines/2; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			iter := 0
			for {
				select {
				case <-stop:
					return
				default:
					iter++
					// Generate a batch of games
					games := make([]Game, (iter%20)+1)
					for j := range games {
						games[j] = Game{
							ID:    fmt.Sprintf("worker-%d-game-%d", workerID, j),
							Title: fmt.Sprintf("Game Title %d-%d-%d", workerID, iter, j),
							Link:  fmt.Sprintf("https://drive.google.com/folder/%d-%d", workerID, j),
							Genre: "Action",
							Price: "Rp 100.000",
						}
					}
					if err := app.SaveLibrary(games); err != nil {
						atomic.AddInt64(&writeErrors, 1)
						t.Errorf("SaveLibrary error in worker %d: %v", workerID, err)
					} else {
						atomic.AddInt64(&writeCount, 1)
					}
					time.Sleep(2 * time.Millisecond)
				}
			}
		}(i)
	}

	// Start reader goroutines
	for i := 0; i < numGoroutines/2; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					games, err := app.LoadLibrary()
					if err != nil {
						atomic.AddInt64(&readErrors, 1)
						t.Errorf("LoadLibrary error in reader %d: %v", workerID, err)
					} else {
						atomic.AddInt64(&readCount, 1)
						// Verify games integrity: no nil/corrupted objects
						for _, g := range games {
							if g.ID == "" {
								t.Errorf("Reader %d found game with empty ID", workerID)
							}
						}
					}
					time.Sleep(2 * time.Millisecond)
				}
			}
		}(i)
	}

	time.Sleep(duration)
	close(stop)
	wg.Wait()

	t.Logf("Completed concurrency stress test: %d writes, %d reads, %d writeErrors, %d readErrors",
		atomic.LoadInt64(&writeCount), atomic.LoadInt64(&readCount),
		atomic.LoadInt64(&writeErrors), atomic.LoadInt64(&readErrors))

	if atomic.LoadInt64(&writeErrors) > 0 {
		t.Fatalf("encountered %d write errors during concurrency", atomic.LoadInt64(&writeErrors))
	}
	if atomic.LoadInt64(&readErrors) > 0 {
		t.Fatalf("encountered %d read errors during concurrency", atomic.LoadInt64(&readErrors))
	}

	// Verify no orphan .tmp files remain
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("failed to read dir: %v", err)
	}
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp-") {
			t.Errorf("found leftover temp file after concurrent ops: %s", e.Name())
		}
	}

	// Verify the final file is valid JSON
	finalGames, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("failed to load library after stress test: %v", err)
	}
	if len(finalGames) == 0 {
		t.Errorf("expected non-empty library after writes, got 0")
	}
}

func TestStress_Concurrency_SimultaneousBarrieredSaves(t *testing.T) {
	app, _ := setupTestApp(t)

	const numWorkers = 20
	var wg sync.WaitGroup
	startBarrier := make(chan struct{})

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			<-startBarrier
			games := []Game{
				{
					ID:    fmt.Sprintf("id-%d", id),
					Title: fmt.Sprintf("Simultaneous Game %d", id),
				},
			}
			if err := app.SaveLibrary(games); err != nil {
				t.Errorf("worker %d save failed: %v", id, err)
			}
		}(i)
	}

	// Release all workers simultaneously
	close(startBarrier)
	wg.Wait()

	// Verify final state
	loaded, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("failed to load after simultaneous saves: %v", err)
	}
	if len(loaded) != 1 {
		t.Errorf("expected 1 game in final state, got %d", len(loaded))
	}
	if !strings.HasPrefix(loaded[0].Title, "Simultaneous Game ") {
		t.Errorf("unexpected game title: %s", loaded[0].Title)
	}
}

// ---------------------------------------------------------------------------
// Challenge 2: Data Boundaries (5000 Cap, Field Lengths, Nil/Empty)
// ---------------------------------------------------------------------------

func TestStress_DataBoundaries_5000GamesCap(t *testing.T) {
	app, _ := setupTestApp(t)

	// 1. Exactly 5,000 games
	games5000 := make([]Game, 5000)
	for i := 0; i < 5000; i++ {
		games5000[i] = Game{
			ID:    fmt.Sprintf("game-%05d", i),
			Title: fmt.Sprintf("Game Title %05d", i),
			Genre: "RPG, Adventure",
			Price: "Rp 150.000",
			Specs: SpecsContainer{
				Min: SystemSpecs{OS: "Windows 10", CPU: "Quad Core", RAM: "8 GB"},
				Rec: SystemSpecs{OS: "Windows 11", CPU: "Octa Core", RAM: "16 GB"},
			},
		}
	}

	startSave := time.Now()
	err := app.SaveLibrary(games5000)
	saveDuration := time.Since(startSave)
	if err != nil {
		t.Fatalf("SaveLibrary failed for 5000 games: %v", err)
	}
	t.Logf("Time to save 5,000 games: %v", saveDuration)

	startLoad := time.Now()
	loaded5000, err := app.LoadLibrary()
	loadDuration := time.Since(startLoad)
	if err != nil {
		t.Fatalf("LoadLibrary failed for 5000 games: %v", err)
	}
	t.Logf("Time to load 5,000 games: %v", loadDuration)

	if len(loaded5000) != 5000 {
		t.Fatalf("expected 5000 games, got %d", len(loaded5000))
	}

	// 2. 5,001 games: should truncate to exactly 5,000
	games5001 := make([]Game, 5001)
	for i := 0; i < 5001; i++ {
		games5001[i] = Game{
			ID:    fmt.Sprintf("game-%05d", i),
			Title: fmt.Sprintf("Game Title %05d", i),
		}
	}

	if err := app.SaveLibrary(games5001); err != nil {
		t.Fatalf("SaveLibrary failed for 5001 games: %v", err)
	}

	loadedAfter5001, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary failed: %v", err)
	}
	if len(loadedAfter5001) != 5000 {
		t.Fatalf("expected 5000 games after saving 5001, got %d", len(loadedAfter5001))
	}
	// Verify last game is index 4999 (the 5000th game)
	if loadedAfter5001[4999].ID != "game-04999" {
		t.Errorf("expected 5000th game ID 'game-04999', got '%s'", loadedAfter5001[4999].ID)
	}

	// 3. 10,000 games: should truncate to exactly 5,000
	games10000 := make([]Game, 10000)
	for i := 0; i < 10000; i++ {
		games10000[i] = Game{
			ID:    fmt.Sprintf("game-%05d", i),
			Title: fmt.Sprintf("Game Title %05d", i),
		}
	}

	if err := app.SaveLibrary(games10000); err != nil {
		t.Fatalf("SaveLibrary failed for 10000 games: %v", err)
	}

	loadedAfter10000, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary failed: %v", err)
	}
	if len(loadedAfter10000) != 5000 {
		t.Fatalf("expected 5000 games after saving 10000, got %d", len(loadedAfter10000))
	}
}

func TestStress_DataBoundaries_FieldLengths(t *testing.T) {
	app, _ := setupTestApp(t)

	longString := func(n int, ch string) string {
		return strings.Repeat(ch, n)
	}

	oversizedGame := Game{
		ID:         longString(100, "i"),
		Title:      longString(500, "T"),
		Thumbnail:  longString(3000, "h"),
		Link:       longString(3000, "L"),
		Genre:      longString(200, "G"),
		Size:       longString(100, "S"),
		Price:      longString(100, "P"),
		SteamAppID: longString(50, "9"),
		Specs: SpecsContainer{
			Min: SystemSpecs{
				OS:      longString(600, "O"),
				CPU:     longString(600, "C"),
				RAM:     longString(600, "R"),
				GPU:     longString(600, "G"),
				DX:      longString(600, "D"),
				Net:     longString(600, "N"),
				Storage: longString(600, "S"),
				Sound:   longString(600, "A"),
				Notes:   longString(600, "M"),
			},
			Rec: SystemSpecs{
				OS:      longString(600, "o"),
				CPU:     longString(600, "c"),
				RAM:     longString(600, "r"),
				GPU:     longString(600, "g"),
				DX:      longString(600, "d"),
				Net:     longString(600, "n"),
				Storage: longString(600, "s"),
				Sound:   longString(600, "a"),
				Notes:   longString(600, "m"),
			},
		},
	}

	if err := app.SaveLibrary([]Game{oversizedGame}); err != nil {
		t.Fatalf("SaveLibrary failed with oversized fields: %v", err)
	}

	loaded, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary failed: %v", err)
	}
	if len(loaded) != 1 {
		t.Fatalf("expected 1 game, got %d", len(loaded))
	}

	g := loaded[0]
	if len(g.ID) != 64 {
		t.Errorf("expected ID capped at 64 chars, got %d", len(g.ID))
	}
	if len(g.Title) != 200 {
		t.Errorf("expected Title capped at 200 chars, got %d", len(g.Title))
	}
	if len(g.Thumbnail) != 2000 {
		t.Errorf("expected Thumbnail capped at 2000 chars, got %d", len(g.Thumbnail))
	}
	if len(g.Link) != 2000 {
		t.Errorf("expected Link capped at 2000 chars, got %d", len(g.Link))
	}
	if len(g.Genre) != 120 {
		t.Errorf("expected Genre capped at 120 chars, got %d", len(g.Genre))
	}
	if len(g.Size) != 60 {
		t.Errorf("expected Size capped at 60 chars, got %d", len(g.Size))
	}
	if len(g.Price) != 60 {
		t.Errorf("expected Price capped at 60 chars, got %d", len(g.Price))
	}
	if len(g.SteamAppID) != 20 {
		t.Errorf("expected SteamAppID capped at 20 chars, got %d", len(g.SteamAppID))
	}

	checkSpec := func(label string, s SystemSpecs) {
		if len(s.OS) != 400 {
			t.Errorf("%s OS length expected 400, got %d", label, len(s.OS))
		}
		if len(s.CPU) != 400 {
			t.Errorf("%s CPU length expected 400, got %d", label, len(s.CPU))
		}
		if len(s.RAM) != 400 {
			t.Errorf("%s RAM length expected 400, got %d", label, len(s.RAM))
		}
		if len(s.GPU) != 400 {
			t.Errorf("%s GPU length expected 400, got %d", label, len(s.GPU))
		}
		if len(s.DX) != 400 {
			t.Errorf("%s DX length expected 400, got %d", label, len(s.DX))
		}
		if len(s.Net) != 400 {
			t.Errorf("%s Net length expected 400, got %d", label, len(s.Net))
		}
		if len(s.Storage) != 400 {
			t.Errorf("%s Storage length expected 400, got %d", label, len(s.Storage))
		}
		if len(s.Sound) != 400 {
			t.Errorf("%s Sound length expected 400, got %d", label, len(s.Sound))
		}
		if len(s.Notes) != 400 {
			t.Errorf("%s Notes length expected 400, got %d", label, len(s.Notes))
		}
	}
	checkSpec("Min", g.Specs.Min)
	checkSpec("Rec", g.Specs.Rec)
}

func TestStress_DataBoundaries_NilAndEmptyInputs(t *testing.T) {
	app, _ := setupTestApp(t)

	// 1. Save nil slice
	if err := app.SaveLibrary(nil); err != nil {
		t.Fatalf("SaveLibrary(nil) failed: %v", err)
	}
	loadedNil, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary after nil failed: %v", err)
	}
	if len(loadedNil) != 0 {
		t.Errorf("expected 0 games after SaveLibrary(nil), got %d", len(loadedNil))
	}

	// 2. Save empty slice
	if err := app.SaveLibrary([]Game{}); err != nil {
		t.Fatalf("SaveLibrary([]Game{}) failed: %v", err)
	}
	loadedEmpty, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary after empty slice failed: %v", err)
	}
	if len(loadedEmpty) != 0 {
		t.Errorf("expected 0 games after SaveLibrary([]Game{}), got %d", len(loadedEmpty))
	}

	// 3. Save game with all blank/zero fields
	blankGame := Game{}
	if err := app.SaveLibrary([]Game{blankGame}); err != nil {
		t.Fatalf("SaveLibrary with blank game failed: %v", err)
	}
	loadedBlank, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary after blank game failed: %v", err)
	}
	if len(loadedBlank) != 1 {
		t.Fatalf("expected 1 game loaded, got %d", len(loadedBlank))
	}
	if loadedBlank[0].ID == "" {
		t.Errorf("expected generated UUID for game without ID")
	}
	if loadedBlank[0].CreatedAt == "" || loadedBlank[0].UpdatedAt == "" {
		t.Errorf("expected timestamps for blank game")
	}
}

func TestStress_DataBoundaries_SpecialCharactersAndUTF8(t *testing.T) {
	app, _ := setupTestApp(t)

	specialGame := Game{
		ID:    "special-utf8",
		Title: "🎮 Cyberpunk 2077: ゼルダの伝説 & 'quotes' \"double\" <script>alert(1)</script>",
		Link:  "https://drive.google.com/folder?q=test&foo=bar#hash",
		Genre: "Action / Adventure ⚔️ 🛡️",
		Price: "¥ 7,980 / Rp 800.000 / $59.99 €49.99",
		Specs: SpecsContainer{
			Min: SystemSpecs{
				OS:    "Windows 10 64-bit (日本語 OS)",
				Notes: "Line 1\nLine 2\r\nLine 3\tTabbed",
			},
		},
	}

	if err := app.SaveLibrary([]Game{specialGame}); err != nil {
		t.Fatalf("SaveLibrary failed with UTF-8 & special chars: %v", err)
	}

	loaded, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary failed: %v", err)
	}
	if len(loaded) != 1 {
		t.Fatalf("expected 1 game, got %d", len(loaded))
	}

	g := loaded[0]
	if g.Title != specialGame.Title {
		t.Errorf("Title corrupted! Expected '%s', got '%s'", specialGame.Title, g.Title)
	}
	if g.Genre != specialGame.Genre {
		t.Errorf("Genre corrupted! Expected '%s', got '%s'", specialGame.Genre, g.Genre)
	}
	if g.Price != specialGame.Price {
		t.Errorf("Price corrupted! Expected '%s', got '%s'", specialGame.Price, g.Price)
	}
}

// ---------------------------------------------------------------------------
// Challenge 3: Resilience Against File Corruption
// ---------------------------------------------------------------------------

func TestStress_Resilience_RandomBinaryNoise(t *testing.T) {
	app, tempDir := setupTestApp(t)
	libFile := filepath.Join(tempDir, "library.json")

	// Generate 4KB of random binary noise
	randomBytes := make([]byte, 4096)
	_, _ = rand.Read(randomBytes)

	if err := os.WriteFile(libFile, randomBytes, 0644); err != nil {
		t.Fatalf("failed to write random binary noise: %v", err)
	}

	games, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary errored on binary junk instead of recovering: %v", err)
	}
	if len(games) != 0 {
		t.Errorf("expected 0 games returned, got %d", len(games))
	}

	// Verify .rusak-* backup was created with exact contents
	entries, _ := os.ReadDir(tempDir)
	var backupFile string
	for _, e := range entries {
		if strings.Contains(e.Name(), ".rusak-") {
			backupFile = filepath.Join(tempDir, e.Name())
			break
		}
	}

	if backupFile == "" {
		t.Fatalf("no .rusak-* backup file found after corruption")
	}

	backupContent, err := os.ReadFile(backupFile)
	if err != nil {
		t.Fatalf("failed to read backup file: %v", err)
	}
	if len(backupContent) != len(randomBytes) {
		t.Errorf("backup file length mismatch: expected %d, got %d", len(randomBytes), len(backupContent))
	}
}

func TestStress_Resilience_TruncatedJSON(t *testing.T) {
	app, tempDir := setupTestApp(t)
	libFile := filepath.Join(tempDir, "library.json")

	// Incomplete JSON truncated midway
	incomplete := []byte(`{"games": [{"id": "game-1", "title": "Incomplete Game", "specs": {`)
	if err := os.WriteFile(libFile, incomplete, 0644); err != nil {
		t.Fatalf("failed to write incomplete JSON: %v", err)
	}

	games, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary should return nil error on corrupt JSON, got: %v", err)
	}
	if len(games) != 0 {
		t.Errorf("expected 0 games, got %d", len(games))
	}

	// Verify backup created
	entries, _ := os.ReadDir(tempDir)
	foundBackup := false
	for _, e := range entries {
		if strings.Contains(e.Name(), ".rusak-") {
			foundBackup = true
			break
		}
	}
	if !foundBackup {
		t.Errorf("expected .rusak-* backup for truncated JSON")
	}
}

func TestStress_Resilience_InvalidJSONStructures(t *testing.T) {
	cases := []struct {
		name    string
		content string
	}{
		{"StringInsteadOfArray", `{"games": "not an array"}`},
		{"BareArray", `[{"id": "1", "title": "Game 1"}]`},
		{"EmptyString", ``},
		{"WhitespaceOnly", `    `},
		{"ArrayOfNulls", `{"games": [null, null]}`},
		{"NumberRoot", `12345`},
		{"BooleanRoot", `true`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app, tempDir := setupTestApp(t)
			libFile := filepath.Join(tempDir, "library.json")

			if err := os.WriteFile(libFile, []byte(tc.content), 0644); err != nil {
				t.Fatalf("failed to write test case %s: %v", tc.name, err)
			}

			games, err := app.LoadLibrary()
			if err != nil {
				t.Errorf("case %s returned unexpected error: %v", tc.name, err)
			}
			// In all these malformed cases, it should return either empty games or handled gracefully without panic
			_ = games
		})
	}
}

func TestStress_Resilience_RapidCorruptionRepetitions(t *testing.T) {
	app, tempDir := setupTestApp(t)
	libFile := filepath.Join(tempDir, "library.json")

	// Corrupt multiple times with slight pauses to test timestamp uniqueness
	for i := 0; i < 5; i++ {
		_ = os.WriteFile(libFile, []byte(fmt.Sprintf("corrupt-%d-%d", i, time.Now().UnixNano())), 0644)
		games, err := app.LoadLibrary()
		if err != nil {
			t.Fatalf("LoadLibrary failed at repetition %d: %v", i, err)
		}
		if len(games) != 0 {
			t.Errorf("expected 0 games at repetition %d, got %d", i, len(games))
		}
		time.Sleep(5 * time.Millisecond)
	}

	// Verify 5 distinct backup files were created
	entries, _ := os.ReadDir(tempDir)
	backupCount := 0
	for _, e := range entries {
		if strings.Contains(e.Name(), ".rusak-") {
			backupCount++
		}
	}
	if backupCount != 5 {
		t.Errorf("expected 5 .rusak-* backup files, found %d", backupCount)
	}
}

func TestStress_Resilience_ReadOnlyFilePermission(t *testing.T) {
	app, tempDir := setupTestApp(t)
	libFile := filepath.Join(tempDir, "library.json")

	// Create a valid library file first
	initialGames := []Game{{ID: "init", Title: "Initial"}}
	if err := app.SaveLibrary(initialGames); err != nil {
		t.Fatalf("initial save failed: %v", err)
	}

	// Set file to read-only (0444)
	if err := os.Chmod(libFile, 0444); err != nil {
		t.Skipf("cannot set read-only permission on this filesystem: %v", err)
	}

	// Attempt to save new games - on Windows or read-only filesystems, this may fail or overwrite depending on OS ACLs
	newGames := []Game{{ID: "new", Title: "New Game"}}
	saveErr := app.SaveLibrary(newGames)

	// Clean up permissions so tempDir can be deleted by Cleanup
	_ = os.Chmod(libFile, 0666)

	// Verify that regardless of whether save succeeded or errored:
	// 1. App did NOT panic
	// 2. No orphan .tmp files remain
	entries, _ := os.ReadDir(tempDir)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".tmp-") {
			t.Errorf("found orphan .tmp file after read-only test: %s", e.Name())
		}
	}

	t.Logf("Read-only save returned: %v (as expected on OS permissions)", saveErr)
}

func TestStress_Resilience_UTF8MultiByteBoundaryTrimming(t *testing.T) {
	app, _ := setupTestApp(t)

	// Construct a string where cutting at byte 200 would fall in the middle of a 3-byte Japanese character
	// 66 Japanese characters = 198 bytes (each is 3 bytes).
	// Adding 1 more Japanese character (3 bytes) brings length to 201 bytes.
	// Cutting at 200 bytes would slice the 67th character at its 2nd byte!
	prefix := strings.Repeat("あ", 66) // 198 bytes
	full := prefix + "漢"              // 198 + 3 = 201 bytes

	testGame := Game{
		ID:    "utf8-boundary",
		Title: full,
	}

	err := app.SaveLibrary([]Game{testGame})
	if err != nil {
		t.Logf("SaveLibrary returned error on multibyte boundary: %v", err)
	}

	// Now try to load it back
	loaded, err := app.LoadLibrary()
	if err != nil {
		t.Fatalf("LoadLibrary failed after saving multibyte boundary title: %v", err)
	}

	if len(loaded) > 0 {
		t.Logf("Loaded title: '%s' (bytes: %d)", loaded[0].Title, len(loaded[0].Title))
	}
}
