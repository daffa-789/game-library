// Skrip verifikasi sementara: dijalankan sebagai skrip utama Electron
// (`electron scripts/verify.mjs`) dengan folder data dialihkan ke direktori
// sementara supaya data asli pengguna tidak tersentuh.
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'softgame-verify-'))
process.env.SOFTGAME_DATA_DIR = tmp

const failures = []
function check(name, cond, extra = '') {
  if (cond) console.log(`  OK   ${name}`)
  else {
    console.log(`  FAIL ${name} ${extra}`)
    failures.push(name)
  }
}

app.whenReady().then(async () => {
  console.log(`folder data uji: ${tmp}\n`)

  const store = await import('../electron/lib/store.js')
  const seed = await import('../electron/lib/seed.js')
  const thumbs = await import('../electron/lib/thumbnails.js')
  const sanitize = await import('../electron/lib/sanitize.js')

  // ---- katalog bawaan ----
  const games = await store.loadLibrary()
  check('60 game bawaan', games.length === 60, `dapat ${games.length}`)

  const years = {}
  let linkOK = true
  let thumbOK = true
  let coverOK = true
  for (const g of games) {
    const y = (g.genre.split('\u00b7')[1] || '').trim()
    years[y] = (years[y] || 0) + 1
    if (g.link !== `https://store.steampowered.com/app/${g.steamAppId}/`) linkOK = false
    if (g.thumbnail !== `/thumbnails/seed-${g.steamAppId}.jpg`) thumbOK = false
    if (!fs.existsSync(path.join(tmp, 'thumbnails', `seed-${g.steamAppId}.jpg`))) coverOK = false
  }
  check('distribusi 20/20/20', years['2024'] === 20 && years['2025'] === 20 && years['2026'] === 20, JSON.stringify(years))
  check('semua link Steam Store benar', linkOK)
  check('semua referensi thumbnail benar', thumbOK)
  check('60 cover tersalin ke folder thumbnails', coverOK)

  const software = await store.loadSoftware()
  check('3 software contoh', software.length === 3, `dapat ${software.length}`)

  // ---- muat ulang tidak menggandakan ----
  const again = await store.loadLibrary()
  check('muat ulang tetap 60', again.length === 60, `dapat ${again.length}`)

  // ---- entri pengguna aman ----
  const userEntry = {
    id: 'user-1',
    title: 'Game Saya',
    thumbnail: '',
    link: 'https://example.com/x',
    genre: 'Test',
    size: '',
    price: '',
    steamAppId: '',
    specs: { min: {}, rec: {} },
    createdAt: '',
    updatedAt: '',
  }
  await store.saveLibrary([userEntry, ...again])
  const afterAdd = await store.loadLibrary()
  check('tambah entri pengguna -> 61', afterAdd.length === 61, `dapat ${afterAdd.length}`)

  // ---- hapus entri bawaan tidak muncul lagi ----
  const removedId = 'builtin-2358720'
  await store.saveLibrary(afterAdd.filter((g) => g.id !== removedId))
  const hiddenRaw = fs.readFileSync(path.join(tmp, 'hidden-builtin.json'), 'utf8')
  check('hidden-builtin.json mencatat entri yang dihapus', JSON.parse(hiddenRaw).includes(removedId))

  const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'library.json'), 'utf8'))
  const fresh = { games: onDisk.games, software: onDisk.software }
  const before = fresh.games.length
  const added = seed.mergeBuiltinGames(fresh)
  check('gabung ulang tidak mengembalikan entri yang dihapus', added === false && fresh.games.length === before)

  // ---- gerbang keamanan path ----
  check('traversal ditolak', thumbs.safeThumbPath('/thumbnails/../../library.json') === null)
  check('path absolut ditolak', thumbs.safeThumbPath('C:/Windows/system32/evil.jpg') === null)
  check('ekstensi non-gambar ditolak', thumbs.safeThumbPath('/thumbnails/evil.exe') === null)
  check('nama polos diterima', thumbs.safeThumbPath('/thumbnails/seed-2358720.jpg') !== null)
  check('skema lama dinormalisasi', thumbs.trimThumbPrefix('glib://thumb/abc.png') === 'abc.png')

  // ---- sanitasi ----
  const long = 'x'.repeat(500)
  const s = sanitize.sanitizeGame({ title: long, specs: {} }, 'now')
  check('judul dipotong ke 200', s.title.length === 200, `dapat ${s.title.length}`)
  check('id dibuat otomatis', !!s.id)

  console.log(`\n${failures.length ? `GAGAL: ${failures.length} pemeriksaan` : 'SEMUA PEMERIKSAAN LULUS'}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  app.exit(failures.length ? 1 : 0)
})
