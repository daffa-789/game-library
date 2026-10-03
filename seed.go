package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Katalog game bawaan
//
// 60 game Steam offline (single-player) - 20 judul untuk masing-masing tahun
// 2024, 2025, dan 2026 - ikut tersemat di dalam binary beserta cover aslinya.
// Tujuannya: begitu aplikasi dipasang dan dijalankan pertama kali, tab Game
// sudah berisi katalog nyata lengkap dengan link Steam Store, bukan kartu
// contoh. Katalog software sengaja dibiarkan kosong dan diisi manual.
//
// Katalog ini tidak pernah menimpa entri buatan pengguna: penggabungan hanya
// menambah entri yang belum ada, dan entri bawaan yang dihapus pengguna
// dicatat di hidden-builtin.json supaya tidak muncul lagi.
// ---------------------------------------------------------------------------

//go:embed all:seedcovers
var seedCovers embed.FS

// builtinIDPrefix penanda entri bawaan. ID-nya deterministik
// (builtin-<steamAppId>) sehingga penggabungan aman diulang.
const builtinIDPrefix = "builtin-"

// hiddenBuiltinFile nama file di folder data yang berisi ID bawaan yang
// sengaja dihapus pengguna.
const hiddenBuiltinFile = "hidden-builtin.json"

// builtinBaseTime dipakai sebagai CreatedAt entri bawaan supaya urutan kartu
// stabil: judul 2026 paling baru, lalu 2025, lalu 2024.
var builtinBaseTime = time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

type seedEntry struct {
	AppID string
	Title string
	Genre string
	Size  string
	Price string
	Year  string
	Specs SpecsContainer
}

// builtinCatalog 60 game offline populer, diurutkan 2024 -> 2025 -> 2026.
var builtinCatalog = []seedEntry{
	{
		AppID: "2358720",
		Title: "Black Myth: Wukong",
		Genre: "Action, Adventure, RPG, Mythology, Action RPG",
		Size:  "",
		Price: "Rp 699 999",
		Year:  "2024",
	},
	{
		AppID: "2379780",
		Title: "Balatro",
		Genre: "Casual, Indie, Strategy, Card Game, Roguelike Deckbuilder",
		Size:  "",
		Price: "Rp 104 799",
		Year:  "2024",
	},
	{
		AppID: "2183900",
		Title: "Warhammer 40,000: Space Marine 2",
		Genre: "Action, Adventure, RPG, Warhammer 40K, Third-Person Shooter",
		Size:  "",
		Price: "Rp 152 250",
		Year:  "2024",
	},
	{
		AppID: "1643320",
		Title: "S.T.A.L.K.E.R. 2: Heart of Chornobyl",
		Genre: "Action, Adventure, RPG, Open World, FPS",
		Size:  "",
		Price: "Rp 465 500",
		Year:  "2024",
	},
	{
		AppID: "1203620",
		Title: "Enshrouded",
		Genre: "Action, Adventure, Indie, RPG, Early Access, Open World, Survival",
		Size:  "",
		Price: "Rp 349 999",
		Year:  "2024",
	},
	{
		AppID: "1363080",
		Title: "Manor Lords",
		Genre: "Simulation, Strategy, Early Access, City Builder, Historical",
		Size:  "",
		Price: "Rp 194 999",
		Year:  "2024",
	},
	{
		AppID: "2679460",
		Title: "Metaphor: ReFantazio",
		Genre: "Action, Adventure, RPG, JRPG, Turn-Based Combat",
		Size:  "",
		Price: "Rp 319 600",
		Year:  "2024",
	},
	{
		AppID: "2161700",
		Title: "Persona 3 Reload",
		Genre: "Adventure, RPG, Strategy, JRPG, Anime",
		Size:  "",
		Price: "Rp 173 700",
		Year:  "2024",
	},
	{
		AppID: "1809540",
		Title: "Nine Sols",
		Genre: "Action, Adventure, Indie, Metroidvania, Souls-like",
		Size:  "",
		Price: "Rp 122 999",
		Year:  "2024",
	},
	{
		AppID: "1790600",
		Title: "DRAGON BALL: Sparking! ZERO",
		Genre: "Action, Anime, Multiplayer",
		Size:  "",
		Price: "Rp 359 400",
		Year:  "2024",
	},
	{
		AppID: "1371980",
		Title: "No Rest for the Wicked",
		Genre: "Action, Adventure, RPG, Early Access, Open World, Souls-like",
		Size:  "",
		Price: "Rp 231 000",
		Year:  "2024",
	},
	{
		AppID: "2677660",
		Title: "Indiana Jones and the Great Circle",
		Genre: "Action, Adventure, Action-Adventure, First-Person",
		Size:  "",
		Price: "Rp 599 999",
		Year:  "2024",
	},
	{
		AppID: "2842040",
		Title: "Star Wars Outlaws",
		Genre: "Action, Adventure, Open World, Third Person",
		Size:  "",
		Price: "Rp 202 250",
		Year:  "2024",
	},
	{
		AppID: "1934680",
		Title: "Age of Mythology: Retold",
		Genre: "Strategy, 3D, RTS",
		Size:  "",
		Price: "Rp 212 250",
		Year:  "2024",
	},
	{
		AppID: "2198150",
		Title: "Tiny Glade",
		Genre: "Casual, Indie, Simulation, Building, Design & Illustration",
		Size:  "",
		Price: "Rp 104 799",
		Year:  "2024",
	},
	{
		AppID: "2124490",
		Title: "SILENT HILL 2",
		Genre: "Action, Adventure, Psychological Horror, Horror",
		Size:  "",
		Price: "Rp 937 000",
		Year:  "2024",
	},
	{
		AppID: "1601580",
		Title: "Frostpunk 2",
		Genre: "Simulation, Strategy, City Builder, Survival",
		Size:  "",
		Price: "Rp 152 549",
		Year:  "2024",
	},
	{
		AppID: "1458140",
		Title: "Pacific Drive",
		Genre: "Action, Adventure, Indie, Racing, Simulation, Driving, Survival",
		Size:  "",
		Price: "Rp 81 179",
		Year:  "2024",
	},
	{
		AppID: "813230",
		Title: "ANIMAL WELL",
		Genre: "Action, Adventure, Indie, Metroidvania, Exploration",
		Size:  "",
		Price: "Rp 147 700",
		Year:  "2024",
	},
	{
		AppID: "2475490",
		Title: "Mouthwashing",
		Genre: "Adventure, Indie, Psychological Horror, Story Rich",
		Size:  "",
		Price: "Rp 80 499",
		Year:  "2024",
	},
	{
		AppID: "1903340",
		Title: "Clair Obscur: Expedition 33",
		Genre: "Action, RPG, Turn-Based Combat, Story Rich",
		Size:  "",
		Price: "Rp 399 200",
		Year:  "2025",
	},
	{
		AppID: "1771300",
		Title: "Kingdom Come: Deliverance II",
		Genre: "Action, Adventure, RPG, Medieval, Open World",
		Size:  "",
		Price: "Rp 256 400",
		Year:  "2025",
	},
	{
		AppID: "2246340",
		Title: "Monster Hunter Wilds",
		Genre: "Action, Adventure, RPG, Hunting, Multiplayer",
		Size:  "",
		Price: "Rp 389 250",
		Year:  "2025",
	},
	{
		AppID: "1145350",
		Title: "Hades II",
		Genre: "Action, Indie, RPG, Rogue-like, Rogue-lite",
		Size:  "",
		Price: "Rp 172 199",
		Year:  "2025",
	},
	{
		AppID: "2592160",
		Title: "Dispatch",
		Genre: "Action, Adventure, Casual, Indie, Strategy",
		Size:  "",
		Price: "Rp 184 000",
		Year:  "2025",
	},
	{
		AppID: "2623190",
		Title: "The Elder Scrolls IV: Oblivion Remastered",
		Genre: "RPG, Open World, Fantasy",
		Size:  "",
		Price: "Rp 489 300",
		Year:  "2025",
	},
	{
		AppID: "1285190",
		Title: "Borderlands 4",
		Genre: "Action, Adventure, RPG",
		Size:  "",
		Price: "Rp 399 500",
		Year:  "2025",
	},
	{
		AppID: "3017860",
		Title: "DOOM: The Dark Ages",
		Genre: "Action, FPS, Demons",
		Size:  "",
		Price: "Rp 349 500",
		Year:  "2025",
	},
	{
		AppID: "3489700",
		Title: "Stellar Blade™",
		Genre: "Action, Adventure, RPG",
		Size:  "",
		Price: "Rp 588 930",
		Year:  "2025",
	},
	{
		AppID: "3159330",
		Title: "Assassin’s Creed Shadows",
		Genre: "Action, Adventure, RPG",
		Size:  "",
		Price: "Rp 319 600",
		Year:  "2025",
	},
	{
		AppID: "1941540",
		Title: "Mafia: The Old Country",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 342 000",
		Year:  "2025",
	},
	{
		AppID: "2417610",
		Title: "METAL GEAR SOLID Δ: SNAKE EATER",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 588 000",
		Year:  "2025",
	},
	{
		AppID: "1569580",
		Title: "Blue Prince",
		Genre: "Adventure, Indie, Strategy, Puzzle, Exploration",
		Size:  "",
		Price: "Rp 147 599",
		Year:  "2025",
	},
	{
		AppID: "2627260",
		Title: "NINJA GAIDEN 4",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 449 999",
		Year:  "2025",
	},
	{
		AppID: "1030300",
		Title: "Hollow Knight: Silksong",
		Genre: "Action, Adventure, Indie",
		Size:  "",
		Price: "Rp 165 999",
		Year:  "2025",
	},
	{
		AppID: "1601570",
		Title: "The Alters",
		Genre: "Adventure",
		Size:  "",
		Price: "Rp 128 249",
		Year:  "2025",
	},
	{
		AppID: "2947440",
		Title: "SILENT HILL f",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 1 004 000",
		Year:  "2025",
	},
	{
		AppID: "2277560",
		Title: "WUCHANG: Fallen Feathers",
		Genre: "Action, Adventure, RPG",
		Size:  "",
		Price: "Rp 412 999",
		Year:  "2025",
	},
	{
		AppID: "801800",
		Title: "Atomfall",
		Genre: "Action, Adventure, First-Person, Open World",
		Size:  "",
		Price: "Rp 150 399",
		Year:  "2025",
	},
	{
		AppID: "2457220",
		Title: "Avowed",
		Genre: "RPG, Fantasy, First-Person",
		Size:  "",
		Price: "Rp 419 400",
		Year:  "2025",
	},
	{
		AppID: "3321460",
		Title: "Crimson Desert Enhanced",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 799 000",
		Year:  "2026",
	},
	{
		AppID: "3764200",
		Title: "Resident Evil Requiem",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 637 000",
		Year:  "2026",
	},
	{
		AppID: "2288340",
		Title: "ACE COMBAT 8: WINGS OF THEVE",
		Genre: "Action",
		Size:  "",
		Price: "Rp 899 000",
		Year:  "2026",
	},
	{
		AppID: "1962700",
		Title: "Subnautica 2",
		Genre: "Action, Adventure, Early Access",
		Size:  "",
		Price: "Rp 350 999",
		Year:  "2026",
	},
	{
		AppID: "3280350",
		Title: "DEATH STRANDING 2: ON THE BEACH",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 823 200",
		Year:  "2026",
	},
	{
		AppID: "2215200",
		Title: "LEGO® Batman™: Legacy of the Dark Knight",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 804 300",
		Year:  "2026",
	},
	{
		AppID: "3357650",
		Title: "PRAGMATA",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 623 200",
		Year:  "2026",
	},
	{
		AppID: "3681010",
		Title: "Nioh 3",
		Genre: "Action, RPG",
		Size:  "",
		Price: "Rp 538 650",
		Year:  "2026",
	},
	{
		AppID: "2638890",
		Title: "Onimusha: Way of the Sword",
		Genre: "Action, Adventure, RPG",
		Size:  "",
		Price: "Rp 910 000",
		Year:  "2026",
	},
	{
		AppID: "3669870",
		Title: "CONTROL Resonant",
		Genre: "Action, Adventure, RPG",
		Size:  "",
		Price: "Rp 699 999",
		Year:  "2026",
	},
	{
		AppID: "3751950",
		Title: "Assassin's Creed Black Flag Resynced",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 611 100",
		Year:  "2026",
	},
	{
		AppID: "2075800",
		Title: "STAR WARS Zero Company™",
		Genre: "Adventure, RPG, Simulation, Sports, Strategy",
		Size:  "",
		Price: "Rp 569 000",
		Year:  "2026",
	},
	{
		AppID: "2584270",
		Title: "Mortal Shell II",
		Genre: "Action, RPG",
		Size:  "",
		Price: "Rp 563 999",
		Year:  "2026",
	},
	{
		AppID: "1297900",
		Title: "Gothic 1 Remake",
		Genre: "Action, RPG",
		Size:  "",
		Price: "Rp 459 199",
		Year:  "2026",
	},
	{
		AppID: "4225980",
		Title: "Trails in the Sky 2nd Chapter",
		Genre: "RPG, Adventure, JRPG",
		Size:  "",
		Price: "Rp 1 022 310",
		Year:  "2026",
	},
	{
		AppID: "2852190",
		Title: "Monster Hunter Stories 3: Twisted Reflection",
		Genre: "Adventure, RPG",
		Size:  "",
		Price: "Rp 637 000",
		Year:  "2026",
	},
	{
		AppID: "686060",
		Title: "Mewgenics",
		Genre: "Adventure, Indie, RPG, Simulation, Strategy",
		Size:  "",
		Price: "Rp 184 499",
		Year:  "2026",
	},
	{
		AppID: "2129530",
		Title: "REANIMAL",
		Genre: "Adventure",
		Size:  "",
		Price: "Rp 224 999",
		Year:  "2026",
	},
	{
		AppID: "2057760",
		Title: "Esoteric Ebb",
		Genre: "Indie, RPG",
		Size:  "",
		Price: "Rp 155 249",
		Year:  "2026",
	},
	{
		AppID: "1636440",
		Title: "SILENT HILL: Townfall",
		Genre: "Action, Adventure",
		Size:  "",
		Price: "Rp 800 000",
		Year:  "2026",
	},
}

// builtinSteamURL membentuk link Steam Store dari appid.
func builtinSteamURL(appID string) string {
	return "https://store.steampowered.com/app/" + appID + "/"
}

// builtinGames membangun entri Game dari katalog bawaan. Cover yang tersemat
// disalin lebih dulu ke folder thumbnail supaya bisa disajikan AssetServer.
func (a *App) builtinGames() []Game {
	a.materializeSeedCovers()

	out := make([]Game, 0, len(builtinCatalog))
	for i, s := range builtinCatalog {
		genre := s.Genre
		if s.Year != "" {
			genre = strings.TrimSpace(genre + " \u00b7 " + s.Year)
		}
		created := builtinBaseTime.Add(time.Duration(i) * time.Second).Format(time.RFC3339Nano)
		out = append(out, Game{
			ID:         builtinIDPrefix + s.AppID,
			Title:      s.Title,
			Thumbnail:  thumbURLPrefix + "seed-" + s.AppID + ".jpg",
			Link:       builtinSteamURL(s.AppID),
			Genre:      genre,
			Size:       s.Size,
			Price:      s.Price,
			SteamAppID: s.AppID,
			Specs:      s.Specs,
			CreatedAt:  created,
			UpdatedAt:  created,
		})
	}
	return out
}

// materializeSeedCovers menyalin cover bawaan yang tersemat ke folder
// thumbnail. File yang sudah ada tidak ditimpa.
func (a *App) materializeSeedCovers() {
	entries, err := fs.ReadDir(seedCovers, "seedcovers")
	if err != nil {
		return
	}
	_ = os.MkdirAll(a.thumbsDir, 0o755)
	for _, e := range entries {
		if e.IsDir() || !allowedThumbExt[strings.ToLower(filepath.Ext(e.Name()))] {
			continue
		}
		dst := filepath.Join(a.thumbsDir, e.Name())
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		raw, err := seedCovers.ReadFile("seedcovers/" + e.Name())
		if err != nil || len(raw) == 0 || len(raw) > maxThumbnailBytes {
			continue
		}
		_ = os.WriteFile(dst, raw, 0o644)
	}
}

// mergeBuiltinGames menambahkan entri bawaan yang belum ada di katalog.
// Mengembalikan true bila ada penambahan. Panggil dengan a.mu dipegang.
func (a *App) mergeBuiltinGames(data *LibraryData) bool {
	if data == nil || !a.seedBuiltin {
		return false
	}
	hidden := a.loadHiddenBuiltin()
	haveID := make(map[string]bool, len(data.Games))
	haveAppID := make(map[string]bool, len(data.Games))
	for _, g := range data.Games {
		haveID[g.ID] = true
		if g.SteamAppID != "" {
			haveAppID[g.SteamAppID] = true
		}
	}

	added := false
	for _, g := range a.builtinGames() {
		if hidden[g.ID] || haveID[g.ID] || haveAppID[g.SteamAppID] {
			continue
		}
		data.Games = append(data.Games, g)
		haveID[g.ID] = true
		haveAppID[g.SteamAppID] = true
		added = true
	}
	return added
}

// loadHiddenBuiltin membaca daftar ID bawaan yang dihapus pengguna.
func (a *App) loadHiddenBuiltin() map[string]bool {
	out := map[string]bool{}
	content, err := os.ReadFile(filepath.Join(a.dataDir, hiddenBuiltinFile))
	if err != nil {
		return out
	}
	var ids []string
	if err := json.Unmarshal(content, &ids); err != nil {
		return out
	}
	for _, id := range ids {
		out[id] = true
	}
	return out
}

// recordHiddenBuiltin mencatat entri bawaan yang hilang setelah penyimpanan
// (artinya sengaja dihapus pengguna) supaya tidak ditambahkan ulang.
func (a *App) recordHiddenBuiltin(before, after []Game) {
	if !a.seedBuiltin {
		return
	}
	kept := make(map[string]bool, len(after))
	for _, g := range after {
		kept[g.ID] = true
	}

	hidden := a.loadHiddenBuiltin()
	changed := false
	for _, g := range before {
		if !strings.HasPrefix(g.ID, builtinIDPrefix) || kept[g.ID] || hidden[g.ID] {
			continue
		}
		hidden[g.ID] = true
		changed = true
	}
	if !changed {
		return
	}

	ids := make([]string, 0, len(hidden))
	for id := range hidden {
		ids = append(ids, id)
	}
	raw, err := json.Marshal(ids)
	if err != nil {
		return
	}
	_ = os.MkdirAll(a.dataDir, 0o755)
	_ = os.WriteFile(filepath.Join(a.dataDir, hiddenBuiltinFile), raw, 0o644)
}
