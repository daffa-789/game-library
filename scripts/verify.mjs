// Skrip verifikasi backend: dijalankan sebagai skrip utama Electron
// (`npm run verify`) dengan folder data dialihkan ke direktori sementara
// supaya data asli pengguna tidak tersentuh.
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

// tulisLibrary menulis library.json langsung ke disk (mensimulasikan file yang
// sudah ada dari versi sebelumnya) tanpa lewat store, supaya jalur "baca file
// lama" ikut teruji.
function tulisLibrary(games, software) {
  fs.mkdirSync(tmp, { recursive: true })
  fs.writeFileSync(path.join(tmp, 'library.json'), JSON.stringify({ games, software }, null, 2))
}

app.whenReady().then(async () => {
  console.log(`folder data uji: ${tmp}\n`)

  const store = await import('../electron/lib/store.js')
  const links = await import('../electron/lib/links.js')
  const thumbs = await import('../electron/lib/thumbnails.js')
  const sanitize = await import('../electron/lib/sanitize.js')

  // ---- katalog dimulai kosong (tanpa game bawaan / data contoh) ----
  const games = await store.loadLibrary()
  check('katalog game dimulai kosong', games.length === 0, `dapat ${games.length}`)

  const software = await store.loadSoftware()
  check('katalog software dimulai kosong', software.length === 0, `dapat ${software.length}`)

  check('library.json dibuat saat pertama kali dibuka', fs.existsSync(path.join(tmp, 'library.json')))
  check('folder thumbnails dibuat', fs.existsSync(path.join(tmp, 'thumbnails')))
  check('tidak ada lagi hidden-builtin.json', !fs.existsSync(path.join(tmp, 'hidden-builtin.json')))

  const kosong = JSON.parse(fs.readFileSync(path.join(tmp, 'library.json'), 'utf8'))
  check('file awal berisi dua katalog kosong', Array.isArray(kosong.games) && kosong.games.length === 0 && kosong.software.length === 0)

  // ---- muat ulang tetap kosong (tidak menggandakan apa pun) ----
  const again = await store.loadLibrary()
  check('muat ulang tetap kosong', again.length === 0, `dapat ${again.length}`)

  // ---- entri pengguna dengan banyak mirror ----
  const now = new Date().toISOString()
  const entry = {
    id: 'user-1',
    title: 'Game Saya',
    thumbnail: '',
    links: [
      { label: 'Gofile', url: 'https://gofile.io/d/abc' },
      { label: '', url: 'https://pixeldrain.com/u/xyz' }, // label diisi otomatis
      { label: 'Drive', url: 'https://gofile.io/d/abc' }, // duplikat -> dibuang
      { label: 'Buruk', url: 'javascript:alert(1)' }, // skema terlarang -> dibuang
      { label: 'TanpaSkema', url: 'mega.nz/file/AAA' }, // https:// ditambahkan
    ],
    genre: 'Test',
    size: '',
    price: '',
    steamAppId: '',
    specs: { min: {}, rec: {} },
    createdAt: now,
    updatedAt: now,
  }
  await store.saveLibrary([entry])

  const afterAdd = await store.loadLibrary()
  check('entri pengguna tersimpan', afterAdd.length === 1, `dapat ${afterAdd.length}`)

  const saved = afterAdd[0]
  check('duplikat & skema terlarang dibuang', saved.links.length === 3, `dapat ${saved.links.length}`)
  check('label kosong diisi otomatis', saved.links[1].label === 'PixelDrain', `dapat ${saved.links[1].label}`)
  check('URL tanpa skema dinormalkan', saved.links[2].url === 'https://mega.nz/file/AAA', `dapat ${saved.links[2].url}`)
  check('field link = mirror pertama', saved.link === 'https://gofile.io/d/abc', `dapat ${saved.link}`)

  const diDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'library.json'), 'utf8'))
  check('daftar mirror ikut tertulis ke disk', Array.isArray(diDisk.games[0].links) && diDisk.games[0].links.length === 3)

  // ---- kompatibilitas: entri lama yang hanya punya satu `link` ----
  const lama = { ...entry, id: 'lama-1', title: 'Entri Lama' }
  delete lama.links
  lama.link = 'https://drive.google.com/file/d/old/view'
  tulisLibrary([...diDisk.games, lama], diDisk.software)

  const reloaded = await store.loadLibrary()
  const old = reloaded.find((g) => g.id === 'lama-1')
  check(
    'field link lama diturunkan menjadi links',
    !!old && old.links.length === 1 && old.links[0].url === 'https://drive.google.com/file/d/old/view',
    JSON.stringify(old && old.links),
  )
  check('label entri lama dikenali sebagai Google Drive', !!old && old.links[0].label === 'Google Drive', old && old.links[0].label)

  // ---- pembersihan entri bawaan/contoh dari versi lama ----
  tulisLibrary(
    [
      ...reloaded,
      {
        id: 'builtin-2358720',
        title: 'Black Myth: Wukong',
        thumbnail: '/thumbnails/seed-2358720.jpg',
        link: 'https://store.steampowered.com/app/2358720/',
        genre: 'Action · 2024',
        size: '',
        price: '',
        steamAppId: '2358720',
        specs: { min: {}, rec: {} },
        createdAt: now,
        updatedAt: now,
      },
    ],
    [
      {
        id: 'sample-sw-1',
        title: 'Adobe Photoshop 2025',
        thumbnail: '/thumbnails/sample-photoshop.svg',
        link: 'https://drive.google.com/drive/folders/contoh',
        links: [],
        website: '',
        category: 'Desain Grafis',
        version: '26.1',
        license: '',
        platform: '',
        size: '',
        price: '',
        createdAt: now,
        updatedAt: now,
      },
    ],
  )

  const purged = await store.loadLibrary()
  check('entri bawaan "builtin-*" dibersihkan', !purged.some((g) => g.id.startsWith('builtin-')), `sisa ${purged.length}`)
  check('entri pengguna tetap ada setelah pembersihan', purged.some((g) => g.id === 'user-1'))

  const purgedSw = await store.loadSoftware()
  check('entri contoh "sample-*" dibersihkan', !purgedSw.some((s) => s.id.startsWith('sample-')), `sisa ${purgedSw.length}`)

  const purgedFile = JSON.parse(fs.readFileSync(path.join(tmp, 'library.json'), 'utf8'))
  check('hasil pembersihan ditulis kembali ke disk', !purgedFile.games.some((g) => g.id.startsWith('builtin-')))

  // ---- helper link ----
  check('tebak label Gofile', links.serviceLabel('https://gofile.io/d/x') === 'Gofile')
  check('tebak label PixelDrain', links.serviceLabel('https://pixeldrain.com/u/x') === 'PixelDrain')
  check('tebak label Google Drive', links.serviceLabel('https://drive.google.com/file/d/x/view') === 'Google Drive')
  check('tebak label MEGA', links.serviceLabel('https://mega.nz/file/x') === 'MEGA')
  check('URL tanpa skema diterima', links.normalizeLinkURL('gofile.io/d/x') === 'https://gofile.io/d/x')
  check('skema terlarang ditolak', links.normalizeLinkURL('javascript:alert(1)') === '')
  check(
    'jumlah mirror dibatasi',
    links.normalizeLinkList(Array.from({ length: 40 }, (_, i) => ({ url: `https://contoh.example/${i}` }))).length === links.maxLinks,
  )

  // ---- gerbang keamanan path ----
  check('traversal ditolak', thumbs.safeThumbPath('/thumbnails/../../library.json') === null)
  check('path absolut ditolak', thumbs.safeThumbPath('C:/Windows/system32/evil.jpg') === null)
  check('ekstensi non-gambar ditolak', thumbs.safeThumbPath('/thumbnails/evil.exe') === null)
  check('nama polos diterima', thumbs.safeThumbPath('/thumbnails/cover.png') !== null)
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
