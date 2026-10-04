// ---------------------------------------------------------------------------
// Katalog game bawaan
//
// 60 game Steam offline (single-player) - 20 judul untuk masing-masing tahun
// 2024, 2025, dan 2026 - ikut dibundel bersama cover aslinya di folder
// seedcovers/. Begitu aplikasi dipasang dan dijalankan pertama kali, tab Game
// sudah berisi katalog nyata lengkap dengan link Steam Store, bukan kartu
// contoh. Katalog software sengaja dibiarkan kosong dan diisi manual.
//
// Katalog ini tidak pernah menimpa entri buatan pengguna: penggabungan hanya
// menambah entri yang belum ada, dan entri bawaan yang dihapus pengguna
// dicatat di hidden-builtin.json supaya tidak muncul lagi.
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import { dataDir, thumbsDir, thumbRefPrefix, allowedThumbExt } from './paths.js'

// seedBuiltin mengaktifkan katalog bawaan. Dibuat konstanta supaya mudah
// dimatikan saat menelusuri masalah tanpa mengubah kode lain.
export const seedBuiltin = true

// builtinIDPrefix penanda entri bawaan. ID-nya deterministik
// (builtin-<steamAppId>) sehingga penggabungan aman diulang.
export const builtinIDPrefix = 'builtin-'

// hiddenBuiltinFile nama file di folder data yang berisi ID bawaan yang
// sengaja dihapus pengguna.
const hiddenBuiltinFile = 'hidden-builtin.json'

// maxThumbnailBytes batas ukuran satu file thumbnail.
const maxThumbnailBytes = 25 << 20 // 25 MiB

// builtinBaseTime dipakai sebagai CreatedAt entri bawaan supaya urutan kartu
// stabil: judul 2026 paling baru, lalu 2025, lalu 2024.
const builtinBaseTime = Date.UTC(2024, 0, 1, 0, 0, 0, 0)

// builtinCatalog 60 game offline populer, diurutkan 2024 -> 2025 -> 2026.
const builtinCatalog = [
	{
		appID: '2358720',
		title: 'Black Myth: Wukong',
		genre: 'Action, Adventure, RPG, Mythology, Action RPG',
		size: '',
		price: 'Rp 699 999',
		year: '2024',
	},
	{
		appID: '2379780',
		title: 'Balatro',
		genre: 'Casual, Indie, Strategy, Card Game, Roguelike Deckbuilder',
		size: '',
		price: 'Rp 104 799',
		year: '2024',
	},
	{
		appID: '2183900',
		title: 'Warhammer 40,000: Space Marine 2',
		genre: 'Action, Adventure, RPG, Warhammer 40K, Third-Person Shooter',
		size: '',
		price: 'Rp 152 250',
		year: '2024',
	},
	{
		appID: '1643320',
		title: 'S.T.A.L.K.E.R. 2: Heart of Chornobyl',
		genre: 'Action, Adventure, RPG, Open World, FPS',
		size: '',
		price: 'Rp 465 500',
		year: '2024',
	},
	{
		appID: '1203620',
		title: 'Enshrouded',
		genre: 'Action, Adventure, Indie, RPG, Early Access, Open World, Survival',
		size: '',
		price: 'Rp 349 999',
		year: '2024',
	},
	{
		appID: '1363080',
		title: 'Manor Lords',
		genre: 'Simulation, Strategy, Early Access, City Builder, Historical',
		size: '',
		price: 'Rp 194 999',
		year: '2024',
	},
	{
		appID: '2679460',
		title: 'Metaphor: ReFantazio',
		genre: 'Action, Adventure, RPG, JRPG, Turn-Based Combat',
		size: '',
		price: 'Rp 319 600',
		year: '2024',
	},
	{
		appID: '2161700',
		title: 'Persona 3 Reload',
		genre: 'Adventure, RPG, Strategy, JRPG, Anime',
		size: '',
		price: 'Rp 173 700',
		year: '2024',
	},
	{
		appID: '1809540',
		title: 'Nine Sols',
		genre: 'Action, Adventure, Indie, Metroidvania, Souls-like',
		size: '',
		price: 'Rp 122 999',
		year: '2024',
	},
	{
		appID: '1790600',
		title: 'DRAGON BALL: Sparking! ZERO',
		genre: 'Action, Anime, Multiplayer',
		size: '',
		price: 'Rp 359 400',
		year: '2024',
	},
	{
		appID: '1371980',
		title: 'No Rest for the Wicked',
		genre: 'Action, Adventure, RPG, Early Access, Open World, Souls-like',
		size: '',
		price: 'Rp 231 000',
		year: '2024',
	},
	{
		appID: '2677660',
		title: 'Indiana Jones and the Great Circle',
		genre: 'Action, Adventure, Action-Adventure, First-Person',
		size: '',
		price: 'Rp 599 999',
		year: '2024',
	},
	{
		appID: '2842040',
		title: 'Star Wars Outlaws',
		genre: 'Action, Adventure, Open World, Third Person',
		size: '',
		price: 'Rp 202 250',
		year: '2024',
	},
	{
		appID: '1934680',
		title: 'Age of Mythology: Retold',
		genre: 'Strategy, 3D, RTS',
		size: '',
		price: 'Rp 212 250',
		year: '2024',
	},
	{
		appID: '2198150',
		title: 'Tiny Glade',
		genre: 'Casual, Indie, Simulation, Building, Design & Illustration',
		size: '',
		price: 'Rp 104 799',
		year: '2024',
	},
	{
		appID: '2124490',
		title: 'SILENT HILL 2',
		genre: 'Action, Adventure, Psychological Horror, Horror',
		size: '',
		price: 'Rp 937 000',
		year: '2024',
	},
	{
		appID: '1601580',
		title: 'Frostpunk 2',
		genre: 'Simulation, Strategy, City Builder, Survival',
		size: '',
		price: 'Rp 152 549',
		year: '2024',
	},
	{
		appID: '1458140',
		title: 'Pacific Drive',
		genre: 'Action, Adventure, Indie, Racing, Simulation, Driving, Survival',
		size: '',
		price: 'Rp 81 179',
		year: '2024',
	},
	{
		appID: '813230',
		title: 'ANIMAL WELL',
		genre: 'Action, Adventure, Indie, Metroidvania, Exploration',
		size: '',
		price: 'Rp 147 700',
		year: '2024',
	},
	{
		appID: '2475490',
		title: 'Mouthwashing',
		genre: 'Adventure, Indie, Psychological Horror, Story Rich',
		size: '',
		price: 'Rp 80 499',
		year: '2024',
	},
	{
		appID: '1903340',
		title: 'Clair Obscur: Expedition 33',
		genre: 'Action, RPG, Turn-Based Combat, Story Rich',
		size: '',
		price: 'Rp 399 200',
		year: '2025',
	},
	{
		appID: '1771300',
		title: 'Kingdom Come: Deliverance II',
		genre: 'Action, Adventure, RPG, Medieval, Open World',
		size: '',
		price: 'Rp 256 400',
		year: '2025',
	},
	{
		appID: '2246340',
		title: 'Monster Hunter Wilds',
		genre: 'Action, Adventure, RPG, Hunting, Multiplayer',
		size: '',
		price: 'Rp 389 250',
		year: '2025',
	},
	{
		appID: '1145350',
		title: 'Hades II',
		genre: 'Action, Indie, RPG, Rogue-like, Rogue-lite',
		size: '',
		price: 'Rp 172 199',
		year: '2025',
	},
	{
		appID: '2592160',
		title: 'Dispatch',
		genre: 'Action, Adventure, Casual, Indie, Strategy',
		size: '',
		price: 'Rp 184 000',
		year: '2025',
	},
	{
		appID: '2623190',
		title: 'The Elder Scrolls IV: Oblivion Remastered',
		genre: 'RPG, Open World, Fantasy',
		size: '',
		price: 'Rp 489 300',
		year: '2025',
	},
	{
		appID: '1285190',
		title: 'Borderlands 4',
		genre: 'Action, Adventure, RPG',
		size: '',
		price: 'Rp 399 500',
		year: '2025',
	},
	{
		appID: '3017860',
		title: 'DOOM: The Dark Ages',
		genre: 'Action, FPS, Demons',
		size: '',
		price: 'Rp 349 500',
		year: '2025',
	},
	{
		appID: '3489700',
		title: 'Stellar Blade™',
		genre: 'Action, Adventure, RPG',
		size: '',
		price: 'Rp 588 930',
		year: '2025',
	},
	{
		appID: '3159330',
		title: 'Assassin’s Creed Shadows',
		genre: 'Action, Adventure, RPG',
		size: '',
		price: 'Rp 319 600',
		year: '2025',
	},
	{
		appID: '1941540',
		title: 'Mafia: The Old Country',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 342 000',
		year: '2025',
	},
	{
		appID: '2417610',
		title: 'METAL GEAR SOLID Δ: SNAKE EATER',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 588 000',
		year: '2025',
	},
	{
		appID: '1569580',
		title: 'Blue Prince',
		genre: 'Adventure, Indie, Strategy, Puzzle, Exploration',
		size: '',
		price: 'Rp 147 599',
		year: '2025',
	},
	{
		appID: '2627260',
		title: 'NINJA GAIDEN 4',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 449 999',
		year: '2025',
	},
	{
		appID: '1030300',
		title: 'Hollow Knight: Silksong',
		genre: 'Action, Adventure, Indie',
		size: '',
		price: 'Rp 165 999',
		year: '2025',
	},
	{
		appID: '1601570',
		title: 'The Alters',
		genre: 'Adventure',
		size: '',
		price: 'Rp 128 249',
		year: '2025',
	},
	{
		appID: '2947440',
		title: 'SILENT HILL f',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 1 004 000',
		year: '2025',
	},
	{
		appID: '2277560',
		title: 'WUCHANG: Fallen Feathers',
		genre: 'Action, Adventure, RPG',
		size: '',
		price: 'Rp 412 999',
		year: '2025',
	},
	{
		appID: '801800',
		title: 'Atomfall',
		genre: 'Action, Adventure, First-Person, Open World',
		size: '',
		price: 'Rp 150 399',
		year: '2025',
	},
	{
		appID: '2457220',
		title: 'Avowed',
		genre: 'RPG, Fantasy, First-Person',
		size: '',
		price: 'Rp 419 400',
		year: '2025',
	},
	{
		appID: '3321460',
		title: 'Crimson Desert Enhanced',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 799 000',
		year: '2026',
	},
	{
		appID: '3764200',
		title: 'Resident Evil Requiem',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 637 000',
		year: '2026',
	},
	{
		appID: '2288340',
		title: 'ACE COMBAT 8: WINGS OF THEVE',
		genre: 'Action',
		size: '',
		price: 'Rp 899 000',
		year: '2026',
	},
	{
		appID: '1962700',
		title: 'Subnautica 2',
		genre: 'Action, Adventure, Early Access',
		size: '',
		price: 'Rp 350 999',
		year: '2026',
	},
	{
		appID: '3280350',
		title: 'DEATH STRANDING 2: ON THE BEACH',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 823 200',
		year: '2026',
	},
	{
		appID: '2215200',
		title: 'LEGO® Batman™: Legacy of the Dark Knight',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 804 300',
		year: '2026',
	},
	{
		appID: '3357650',
		title: 'PRAGMATA',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 623 200',
		year: '2026',
	},
	{
		appID: '3681010',
		title: 'Nioh 3',
		genre: 'Action, RPG',
		size: '',
		price: 'Rp 538 650',
		year: '2026',
	},
	{
		appID: '2638890',
		title: 'Onimusha: Way of the Sword',
		genre: 'Action, Adventure, RPG',
		size: '',
		price: 'Rp 910 000',
		year: '2026',
	},
	{
		appID: '3669870',
		title: 'CONTROL Resonant',
		genre: 'Action, Adventure, RPG',
		size: '',
		price: 'Rp 699 999',
		year: '2026',
	},
	{
		appID: '3751950',
		title: 'Assassin\'s Creed Black Flag Resynced',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 611 100',
		year: '2026',
	},
	{
		appID: '2075800',
		title: 'STAR WARS Zero Company™',
		genre: 'Adventure, RPG, Simulation, Sports, Strategy',
		size: '',
		price: 'Rp 569 000',
		year: '2026',
	},
	{
		appID: '2584270',
		title: 'Mortal Shell II',
		genre: 'Action, RPG',
		size: '',
		price: 'Rp 563 999',
		year: '2026',
	},
	{
		appID: '1297900',
		title: 'Gothic 1 Remake',
		genre: 'Action, RPG',
		size: '',
		price: 'Rp 459 199',
		year: '2026',
	},
	{
		appID: '4225980',
		title: 'Trails in the Sky 2nd Chapter',
		genre: 'RPG, Adventure, JRPG',
		size: '',
		price: 'Rp 1 022 310',
		year: '2026',
	},
	{
		appID: '2852190',
		title: 'Monster Hunter Stories 3: Twisted Reflection',
		genre: 'Adventure, RPG',
		size: '',
		price: 'Rp 637 000',
		year: '2026',
	},
	{
		appID: '686060',
		title: 'Mewgenics',
		genre: 'Adventure, Indie, RPG, Simulation, Strategy',
		size: '',
		price: 'Rp 184 499',
		year: '2026',
	},
	{
		appID: '2129530',
		title: 'REANIMAL',
		genre: 'Adventure',
		size: '',
		price: 'Rp 224 999',
		year: '2026',
	},
	{
		appID: '2057760',
		title: 'Esoteric Ebb',
		genre: 'Indie, RPG',
		size: '',
		price: 'Rp 155 249',
		year: '2026',
	},
	{
		appID: '1636440',
		title: 'SILENT HILL: Townfall',
		genre: 'Action, Adventure',
		size: '',
		price: 'Rp 800 000',
		year: '2026',
	},
]

// builtinSteamURL membentuk link Steam Store dari appid.
export function builtinSteamURL(appID) {
  return `https://store.steampowered.com/app/${appID}/`
}

// seedCoversDir lokasi folder cover bawaan. Dihitung relatif terhadap modul ini
// (bukan app.getAppPath()) supaya tetap benar baik saat dev, saat dipaketkan
// ke dalam asar, maupun saat skrip utama dijalankan dari subfolder.
function seedCoversDir() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const fromModule = path.join(here, '..', '..', 'seedcovers')
  if (fs.existsSync(fromModule)) return fromModule
  return path.join(app.getAppPath(), 'seedcovers')
}

// materializeSeedCovers menyalin cover bawaan ke folder thumbnail. File yang
// sudah ada tidak ditimpa.
export function materializeSeedCovers() {
  let names
  try {
    names = fs.readdirSync(seedCoversDir())
  } catch {
    return
  }
  fs.mkdirSync(thumbsDir, { recursive: true })
  for (const name of names) {
    if (!allowedThumbExt.has(path.extname(name).toLowerCase())) continue
    const dst = path.join(thumbsDir, name)
    if (fs.existsSync(dst)) continue
    try {
      const raw = fs.readFileSync(path.join(seedCoversDir(), name))
      if (!raw.length || raw.length > maxThumbnailBytes) continue
      fs.writeFileSync(dst, raw)
    } catch {
      // Cover yang gagal disalin hanya berarti kartu memakai placeholder.
    }
  }
}

// builtinGames membangun entri Game dari katalog bawaan.
export function builtinGames() {
  materializeSeedCovers()

  return builtinCatalog.map((s, i) => {
    let genre = s.genre
    if (s.year) genre = `${genre} · ${s.year}`.trim()
    const created = new Date(builtinBaseTime + i * 1000).toISOString()
    return {
      id: builtinIDPrefix + s.appID,
      title: s.title,
      thumbnail: thumbRefPrefix + 'seed-' + s.appID + '.jpg',
      link: builtinSteamURL(s.appID),
      genre,
      size: s.size,
      price: s.price,
      steamAppId: s.appID,
      specs: s.specs || {
        min: { os: '', cpu: '', ram: '', gpu: '', dx: '', net: '', storage: '', sound: '', notes: '' },
        rec: { os: '', cpu: '', ram: '', gpu: '', dx: '', net: '', storage: '', sound: '', notes: '' },
      },
      createdAt: created,
      updatedAt: created,
    }
  })
}

// mergeBuiltinGames menambahkan entri bawaan yang belum ada di katalog.
// Mengembalikan true bila ada penambahan.
export function mergeBuiltinGames(data) {
  if (!data || !seedBuiltin) return false

  const hidden = loadHiddenBuiltin()
  const haveID = new Set()
  const haveAppID = new Set()
  for (const g of data.games) {
    haveID.add(g.id)
    if (g.steamAppId) haveAppID.add(g.steamAppId)
  }

  let added = false
  for (const g of builtinGames()) {
    if (hidden.has(g.id) || haveID.has(g.id) || haveAppID.has(g.steamAppId)) continue
    data.games.push(g)
    haveID.add(g.id)
    haveAppID.add(g.steamAppId)
    added = true
  }
  return added
}

// loadHiddenBuiltin membaca daftar ID bawaan yang dihapus pengguna.
export function loadHiddenBuiltin() {
  const out = new Set()
  let raw
  try {
    raw = fs.readFileSync(path.join(dataDir, hiddenBuiltinFile), 'utf8')
  } catch {
    return out
  }
  try {
    const ids = JSON.parse(raw)
    if (Array.isArray(ids)) ids.forEach((id) => out.add(id))
  } catch {
    // File rusak dianggap kosong; katalog bawaan digabung ulang.
  }
  return out
}

// recordHiddenBuiltin mencatat entri bawaan yang hilang setelah penyimpanan
// (artinya sengaja dihapus pengguna) supaya tidak ditambahkan ulang.
export function recordHiddenBuiltin(before, after) {
  if (!seedBuiltin) return

  const kept = new Set(after.map((g) => g.id))
  const hidden = loadHiddenBuiltin()
  let changed = false
  for (const g of before) {
    if (!String(g.id).startsWith(builtinIDPrefix) || kept.has(g.id) || hidden.has(g.id)) continue
    hidden.add(g.id)
    changed = true
  }
  if (!changed) return

  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(path.join(dataDir, hiddenBuiltinFile), JSON.stringify([...hidden]))
  } catch {
    // Gagal mencatat hanya berarti entri bawaan bisa muncul lagi nanti.
  }
}
