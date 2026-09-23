'use strict';

/* ==========================================================================
   SoftGame Library — logika UI untuk dua katalog (tab Game & Software)

   Kedua tab memakai mesin yang sama: satu grid, satu form, satu modal impor,
   satu halaman detail. Yang berbeda hanya deskriptor katalognya (field form,
   kolom pencarian, chip detail, tombol impornya), jadi tidak ada logika render
   yang diduplikasi.

   Catatan performa (hasil perombakan):
   - Grid dirender inkremental (keyed reconciliation): kartu dipakai kembali,
     jadi gambar tidak di-decode ulang dan halaman tidak berkedip saat mengetik.
   - Pindah tab tidak menghancurkan kartu: node tiap katalog disimpan di map-
     nya sendiri, tinggal dipindah kembali ke grid saat tabnya aktif.
   - Pencarian memakai indeks haystack lower-case yang di-cache per entri.
   - Render dikumpulkan (coalesce) per animation frame, maksimal 1x/frame.
   - Detail view memakai event delegation, jadi listener tidak menumpuk.
   ========================================================================== */

// Spesifikasi sistem hanya ada di katalog game. Entri software disimpan tanpa
// spesifikasi apa pun: yang ditanyakan pembeli adalah versi, lisensi, platform,
// ukuran, dan harganya.
const SPEC_FIELDS = [
  ['os', 'OS'],
  ['cpu', 'Processor'],
  ['ram', 'Memory (RAM)'],
  ['gpu', 'Graphics (GPU)'],
  ['dx', 'DirectX'],
  ['net', 'Network'],
  ['storage', 'Storage'],
  ['sound', 'Sound Card'],
  ['notes', 'Additional Notes'],
];

const SPEC_PLACEHOLDER = {
  os: 'mis. Windows 10 64-bit',
  cpu: 'mis. Intel Core i5-7500 | AMD Ryzen 5 1400',
  ram: 'mis. 8 GB RAM',
  gpu: 'mis. NVIDIA GTX 1060 3GB | AMD RX 580 4GB',
  dx: 'mis. Version 9.0c',
  net: 'mis. Broadband Internet connection',
  storage: 'mis. 90 GB available space',
  sound: 'mis. DirectX compatible sound card',
  notes: 'opsional — catatan tambahan',
};

const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 215">` +
  `<rect width="460" height="215" fill="#1c2a3a"/>` +
  `<text x="230" y="103" font-family="Segoe UI,Arial" font-size="19" fill="#55677a" text-anchor="middle">Tidak ada gambar</text>` +
  `<text x="230" y="127" font-family="Segoe UI,Arial" font-size="12" fill="#3d4d5e" text-anchor="middle">Tambahkan thumbnail lewat tombol Edit</text>` +
  `</svg>`
);

const COPY_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const LINK_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
const EXTERNAL_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`;

/* ==========================================================================
   Deskriptor katalog — satu-satunya tempat perbedaan Game vs Software
   ========================================================================== */

const CATALOGS = {
  game: {
    key: 'game',
    noun: 'game',
    nounCap: 'Game',
    heading: 'Semua Game',
    searchPlaceholder: 'Cari judul game...  (Ctrl+F)',
    addLabel: 'Tambah Game',
    emptySub: 'Tambahkan game pertama Anda beserta link download dan spesifikasinya.',
    emptyAddLabel: '+ Tambah Game Pertama',
    load: () => window.api.loadLibrary(),
    save: (items) => window.api.saveLibrary(items),
    formRows: [
      [
        { k: 'title', l: 'Judul Game *', p: 'mis. Grand Theft Auto V', req: true },
        { k: 'link', l: 'Link Download (Google Drive) *', p: 'https://drive.google.com/file/d/...', req: true },
      ],
      [
        { k: 'genre', l: 'Genre', p: 'mis. Action, RPG' },
        { k: 'price', l: 'Harga', p: 'mis. Rp 25.000' },
      ],
    ],
    specs: SPEC_FIELDS,
    linkLabel: 'LINK DOWNLOAD GOOGLE DRIVE',
    categoryField: null,
    sortOptions: [['new', 'Terbaru'], ['az', 'Judul A–Z'], ['za', 'Judul Z–A']],
    haystack: (g) => [g.title, g.genre],
    cardSub: (g) => [g.genre, g.size].filter(Boolean).join(' · '),
    cardSig: (g) => [g.title, g.genre, g.size, g.thumbnail, g.price],
    chips: (g) => [
      g.genre ? ['chip', g.genre] : null,
      g.size ? ['chip', `Ukuran: ${g.size}`] : null,
      g.price ? ['chip accent', g.price] : null,
    ].filter(Boolean),
    detailPanel: (g) => {
      const min = g.specs && g.specs.min ? g.specs.min : null;
      const rec = g.specs && g.specs.rec ? g.specs.rec : null;
      const filled = SPEC_FIELDS.some(([k]) => (min && min[k]) || (rec && rec[k]));
      if (!filled) {
        return {
          title: 'System Requirements',
          empty: 'Spesifikasi sistem belum diisi untuk game ini. Klik Edit untuk menambahkan.',
        };
      }
      return {
        title: 'System Requirements',
        fields: SPEC_FIELDS,
        columns: [['MINIMUM:', min], ['RECOMMENDED:', rec]],
      };
    },
    websiteField: null,
    prefillFields: ['title', 'genre', 'price'],
    prefillOnlyWhenEmpty: false,
    applyPrefill: (st, prefill) => {
      if (prefill.thumbnail) st.pendingThumb = prefill.thumbnail;
      fillSpecInputs(prefill.specs);
      if (prefill.appId) st.pendingSteamAppId = prefill.appId;
    },
    extraFields: (st, old) => ({ steamAppId: st.pendingSteamAppId || txt(old && old.steamAppId) }),
    import: {
      button: 'Steam Link',
      title: 'Impor dari Steam',
      label: 'Link halaman Steam Store',
      placeholder: 'https://store.steampowered.com/app/271590/',
      fetchLabel: 'Ambil Data Steam',
      needUrl: 'Masukkan link Steam Store terlebih dahulu.',
      okToast: 'Data terisi otomatis — tinggal isi link Google Drive',
      failToast: 'Gagal mengambil data dari Steam.',
      run: (url) => window.api.steamImport(url),
    },
  },

  software: {
    key: 'software',
    noun: 'software',
    nounCap: 'Software',
    heading: 'Semua Software',
    searchPlaceholder: 'Cari nama software, kategori, versi...  (Ctrl+F)',
    addLabel: 'Tambah Software',
    emptySub: 'Tambahkan software pertama Anda beserta link download-nya — tanpa spesifikasi.',
    emptyAddLabel: '+ Tambah Software Pertama',
    load: () => window.api.loadSoftware(),
    save: (items) => window.api.saveSoftware(items),
    formRows: [
      [
        { k: 'title', l: 'Nama Software *', p: 'mis. Adobe Photoshop 2025', req: true },
        { k: 'link', l: 'Link Download *', p: 'https://drive.google.com/file/d/...', req: true },
      ],
      [
        { k: 'website', l: 'Situs Resmi', p: 'https://www.adobe.com/products/photoshop.html' },
      ],
      [
        { k: 'category', l: 'Kategori', p: 'mis. Desain Grafis' },
        { k: 'version', l: 'Versi', p: 'mis. 26.1 atau LTSC 2021' },
      ],
      [
        { k: 'license', l: 'Lisensi', p: 'mis. Trial, Full, Portable, Gratis' },
        { k: 'platform', l: 'Platform', p: 'mis. Windows 10/11' },
      ],
      [
        { k: 'size', l: 'Ukuran File', p: 'mis. 4 GB' },
        { k: 'price', l: 'Harga', p: 'mis. Rp 75.000' },
      ],
    ],
    specs: null,
    linkLabel: 'LINK DOWNLOAD',
    categoryField: 'category',
    sortOptions: [['new', 'Terbaru'], ['az', 'Nama A–Z'], ['za', 'Nama Z–A'], ['cat', 'Kategori']],
    haystack: (s) => [s.title, s.category, s.version, s.license, s.platform, s.website],
    cardSub: (s) => [s.category, s.version, s.size].filter(Boolean).join(' · '),
    cardSig: (s) => [s.title, s.category, s.version, s.size, s.thumbnail, s.price],
    chips: (s) => [
      s.category ? ['chip', s.category] : null,
      s.version ? ['chip', `Versi ${s.version}`] : null,
      s.license ? ['chip', s.license] : null,
      s.platform ? ['chip', s.platform] : null,
      s.size ? ['chip', `Ukuran: ${s.size}`] : null,
      s.price ? ['chip accent', s.price] : null,
    ].filter(Boolean),
    detailPanel: (s) => ({
      title: 'Informasi Software',
      rows: [
        ['Kategori', s.category],
        ['Versi', s.version],
        ['Lisensi', s.license],
        ['Platform', s.platform],
        ['Ukuran File', s.size],
      ].filter(([, v]) => v && String(v).trim()),
    }),
    websiteField: 'website',
    prefillFields: ['title', 'category', 'version', 'license', 'platform', 'website'],
    prefillOnlyWhenEmpty: true,
    applyPrefill: (st, prefill) => {
      if (prefill.thumbnail) st.pendingThumb = prefill.thumbnail;
    },
    extraFields: () => ({}),
    import: {
      button: 'Impor dari Situs',
      title: 'Impor dari Situs Resmi',
      label: 'Link halaman resmi software',
      placeholder: 'https://www.example.com/product',
      fetchLabel: 'Ambil Data',
      needUrl: 'Masukkan link halaman software terlebih dahulu.',
      okToast: 'Data terisi otomatis — tinggal isi link download',
      failToast: 'Gagal mengambil data dari situs.',
      run: (url) => window.api.importSoftware(url),
    },
  },
};

/* ==========================================================================
   State
   ========================================================================== */

// State per katalog: pencarian, urutan, filter, dan kartu yang sudah dirender
// berdiri sendiri, jadi berpindah tab tidak mengacaukan posisi user.
function newCatalogState(def) {
  return {
    def,
    items: [],
    index: new Map(),
    query: '',
    sort: 'new',
    filterCat: '',
    cards: new Map(), // id -> { nodes, sig }
    editingId: null,
    pendingThumb: '',
    pendingSteamAppId: '',
  };
}

const stores = {};
for (const [key, def] of Object.entries(CATALOGS)) stores[key] = newCatalogState(def);

let active = 'game';
let detailId = null;
let confirmAction = null;

const ui = () => stores[active];
const cur = () => stores[active].def;

const $ = (sel) => document.querySelector(sel);
const txt = (v) => (v == null ? '' : String(v));
const dflt = (v, d) => (v ? v : d);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/* ==========================================================================
   Util
   ========================================================================== */

let toastTimer = null;
function toast(msg, isError) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function reindex(st) {
  st.index = new Map(st.items.map((item) => [item.id, item]));
}

// Lookup O(1); katalog diidentifikasi lewat tab-nya, bukan lewat id, jadi id
// yang sama di dua katalog tetap aman.
function getItem(cat, id) {
  const st = stores[cat];
  return st ? (st.index.get(id) || null) : null;
}

async function persist(st) {
  try {
    await st.def.save(st.items);
  } catch (err) {
    toast('Gagal menyimpan data: ' + (err && err.message ? err.message : err), true);
  }
}

function setItems(st, items) {
  st.items = Array.isArray(items) ? items : [];
  reindex(st);
  if (st.def.categoryField) rebuildCategoryFilter(st);
  updateTabCounts();
}

function updateTabCounts() {
  for (const key of Object.keys(stores)) {
    const el = $(`#count-${key}`);
    if (el) el.textContent = stores[key].items.length ? String(stores[key].items.length) : '';
  }
}

/* ==========================================================================
   Grid library — render inkremental
   ========================================================================== */

// Pemisah internal untuk signature teks (hindari tabrakan antar field).
const HAY_SEP = '\u0000';
const SIG_SEP = '\u0001';

// Haystack pencarian di-cache per entri; signature field ikut disimpan supaya
// entri yang diedit tidak memakai indeks basi.
const hayCache = new Map();
function haystack(st, item) {
  const key = st.def.haystack(item).map(txt).join(HAY_SEP);
  const hit = hayCache.get(item.id);
  if (hit && hit.k === key) return hit.h;
  const h = key.toLowerCase();
  hayCache.set(item.id, { k: key, h });
  return h;
}

// Urutan + filter yang terlihat di grid, semuanya per katalog.
function visibleItems(st) {
  const q = st.query.trim().toLowerCase();
  const def = st.def;
  let list = st.items;
  if (q) list = list.filter((item) => haystack(st, item).includes(q));
  if (def.categoryField && st.filterCat) {
    list = list.filter((item) => txt(item[def.categoryField]) === st.filterCat);
  }

  const byTitle = (a, b) => txt(a.title).localeCompare(txt(b.title), 'id');
  const catOf = (item) => {
    const v = txt(item[def.categoryField]).trim();
    return v.length ? v : '\uffff';
  };
  const byCategory = (a, b) => {
    const c = catOf(a).localeCompare(catOf(b), 'id');
    return c === 0 ? byTitle(a, b) : c;
  };

  if (st.sort === 'az') return [...list].sort(byTitle);
  if (st.sort === 'za') return [...list].sort((a, b) => -byTitle(a, b));
  if (st.sort === 'cat' && def.categoryField) return [...list].sort(byCategory);
  return [...list].sort((a, b) => txt(b.createdAt).localeCompare(txt(a.createdAt)));
}

// Daftar kategori di toolbar dibangun ulang setiap kali katalog software berubah.
function rebuildCategoryFilter(st) {
  const field = st.def.categoryField;
  const sel = $('#filter-cat');
  if (!sel || !field) return;
  const cats = [...new Set(st.items.map((item) => txt(item[field]).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id'));
  if (st.filterCat && !cats.includes(st.filterCat)) st.filterCat = '';

  const frag = document.createDocumentFragment();
  const all = new Option('Semua kategori', '');
  all.selected = st.filterCat === '';
  frag.append(all);
  for (const c of cats) {
    const opt = new Option(c, c);
    opt.selected = c === st.filterCat;
    frag.append(opt);
  }
  sel.replaceChildren(frag);
}

// Cetakan kartu dibuat sekali di DOM (tanpa parsing HTML per kartu).
let cardTemplate = null;
function buildCardTemplate() {
  cardTemplate = document.createElement('div');
  cardTemplate.className = 'card';
  cardTemplate.innerHTML =
    '<div class="capsule">' +
    '<img loading="lazy" decoding="async" alt="">' +
    '<div class="cap-overlay"><div class="cap-actions">' +
    `<button class="btn-copy">${COPY_ICON} Copy Link</button>` +
    `<button class="btn-card-del" title="Hapus dari library">${TRASH_ICON}</button>` +
    '</div></div></div>' +
    '<div class="card-title"></div>' +
    '<div class="card-sub"></div>';
}

function cardNode() {
  const pooled = cardPool.pop();
  if (pooled) {
    pooled.el.removeAttribute('data-id');
    return pooled;
  }
  if (!cardTemplate) buildCardTemplate();
  const el = cardTemplate.cloneNode(true);
  return {
    el,
    img: el.querySelector('img'),
    copy: el.querySelector('.btn-copy'),
    del: el.querySelector('.btn-card-del'),
    title: el.querySelector('.card-title'),
    sub: el.querySelector('.card-sub'),
  };
}

// Kartu yang keluar dari layar (karena filter) tidak dibuang, tapi masuk ke
// kolam ini supaya pencarian berikutnya memakai ulang node, bukan membuat
// ratusan elemen baru. Kolam dipakai bersama oleh kedua tab.
const cardPool = [];
const CARD_POOL_MAX = 800;

function recycle(entry) {
  entry.nodes.el.remove();
  entry.nodes.img.removeAttribute('data-fallback');
  if (cardPool.length < CARD_POOL_MAX) cardPool.push(entry.nodes);
}

// Signature isi kartu: kalau sama, DOM tidak disentuh sama sekali.
function cardSig(def, item) {
  return def.cardSig(item).map(txt).join(SIG_SEP);
}

function paintCard(entry, def, item) {
  const { nodes } = entry;
  const thumb = dflt(item.thumbnail, PLACEHOLDER_IMG);
  if (nodes.img.getAttribute('src') !== thumb) {
    delete nodes.img.dataset.fallback; // src baru: boleh jatuh ke placeholder lagi
    nodes.img.src = thumb;
  }
  nodes.img.alt = txt(item.title);
  nodes.el.dataset.id = item.id;
  nodes.copy.dataset.copy = item.id;
  nodes.del.dataset.del = item.id;
  nodes.title.textContent = txt(item.title);
  nodes.sub.textContent = def.cardSub(item);
}

function syncGridHeader(st, list) {
  const def = st.def;
  const q = st.query.trim();
  const scope = def.categoryField && st.filterCat ? st.filterCat : def.heading;
  const head = q ? `Hasil untuk “${q}”` : scope;
  const count = `${list.length} ${def.noun}`;
  const el = $('#lib-title');
  if (el.dataset.cache === active + head + count) return;
  el.dataset.cache = active + head + count;
  el.replaceChildren(
    document.createTextNode(head + ' '),
    Object.assign(document.createElement('span'), { id: 'lib-count', textContent: count }),
  );
}

// Katalog yang sedang menempati grid. Saat tab berganti, node lama dilepas ke
// map miliknya (tidak dihancurkan) supaya kembali ke tab sebelumnya tidak
// butuh menggambar ulang dari nol.
let gridOwner = null;

function renderGrid() {
  const st = ui();
  const def = st.def;
  const grid = $('#grid');
  const empty = $('#empty');
  const list = visibleItems(st);

  if (gridOwner !== active) {
    grid.replaceChildren();
    gridOwner = active;
  }
  syncGridHeader(st, list);

  if (!st.items.length) {
    $('#empty-title').textContent = `Katalog ${def.nounCap} masih kosong`;
    $('#empty-sub').textContent = def.emptySub;
    $('#btn-empty-add').textContent = def.emptyAddLabel;
    $('#btn-empty-add').classList.remove('hidden');
  } else if (!list.length) {
    const what = st.query.trim() ? `"${st.query.trim()}"` : `kategori "${st.filterCat}"`;
    $('#empty-title').textContent = `Tidak ada hasil untuk ${what}`;
    $('#empty-sub').textContent = 'Coba kata kunci lain, kosongkan filter, atau periksa ejaan namanya.';
    $('#btn-empty-add').classList.add('hidden');
  }

  if (!st.items.length || !list.length) {
    for (const entry of st.cards.values()) recycle(entry);
    st.cards.clear();
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.classList.remove('hidden');

    // 1. Buat / perbarui kartu yang isinya berubah.
  const wanted = new Set();
  for (const item of list) {
    wanted.add(item.id);
    let entry = st.cards.get(item.id);
    if (!entry) {
      entry = { nodes: cardNode(), sig: '' };
      st.cards.set(item.id, entry);
    }
    const sig = cardSig(def, item);
    if (entry.sig !== sig) {
      paintCard(entry, def, item);
      entry.sig = sig;
    }
  }

  // 2. Buang kartu yang tidak lagi terlihat (masuk ke kolam, bukan dihancurkan).
  for (const [id, entry] of st.cards) {
    if (!wanted.has(id)) {
      recycle(entry);
      st.cards.delete(id);
    }
  }

  // 3. Susun ulang urutan dengan perpindahan minimum (insertBefore hanya bila
  //    posisi sudah salah).
  let ref = grid.firstChild;
  for (const item of list) {
    const el = st.cards.get(item.id).nodes.el;
    if (el !== ref) {
      grid.insertBefore(el, ref || null);
    } else {
      ref = ref.nextSibling;
      continue;
    }
    ref = el.nextSibling;
  }

  // 4. Setelah penyusunan, semua kartu aktif berada di depan; sisa simpul di
  //    ekor yang bukan milik kita dibuang.
  let tail = grid.lastElementChild;
  while (tail && !wanted.has(tail.dataset.id)) {
    tail.remove();
    tail = grid.lastElementChild;
  }
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  // requestAnimationFrame menggabungkan beberapa ketikan menjadi 1 render.
  // setTimeout jadi jaring pengaman kalau rAF di-throttle (jendela di-minimize
  // atau tidak terlihat), agar tampilan tidak pernah tertahan.
  const fire = () => {
    if (!renderQueued) return;
    renderQueued = false;
    renderGrid();
  };
  requestAnimationFrame(fire);
  setTimeout(fire, 32);
}

async function copyLink(cat, id) {
  const st = stores[cat];
  const item = st && st.index.get(id);
  if (!item) return;
  if (!item.link) {
    toast(`${st.def.nounCap} ini belum punya link download`, true);
    return;
  }
  try {
    await window.api.copyText(item.link);
    toast('Link download disalin! Siap dikirim ke pelanggan.');
  } catch (err) {
    toast('Gagal menyalin link', true);
  }
}

/* ==========================================================================
   Tab katalog
   ========================================================================== */

function buildSortOptions(st) {
  const sel = $('#sort');
  sel.replaceChildren(...st.def.sortOptions.map(([value, label]) => {
    const opt = new Option(label, value);
    opt.selected = value === st.sort;
    return opt;
  }));
}

// Semua elemen yang teks/opsinya berbeda antar katalog diseragamkan di sini.
function syncTabChrome() {
  const st = ui();
  const def = st.def;

  for (const btn of document.querySelectorAll('#tabs .tab')) {
    const on = btn.dataset.tab === active;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  }

  const search = $('#search');
  search.value = st.query;
  search.placeholder = def.searchPlaceholder;
  $('#btn-add-label').textContent = def.addLabel;
  $('#btn-import-label').textContent = def.import.button;
  $('#lib-title').dataset.cache = '';
  $('#filter-cat-wrap').classList.toggle('hidden', !def.categoryField);
  buildSortOptions(st);
}

function setTab(key) {
  if (!stores[key] || key === active) return;
  active = key;
  detailId = null;
  $('#view-detail').classList.add('hidden');
  $('#view-library').classList.remove('hidden');
  syncTabChrome();
  renderGrid();
}

/* ==========================================================================
   Detail view
   ========================================================================== */

function reqRow(label, value) {
  const row = document.createElement('div');
  row.className = 'req-row';
  const lbl = document.createElement('span');
  lbl.className = 'req-lbl';
  lbl.textContent = `${label}:`;
  const val = document.createElement('span');
  val.className = 'req-val';
  val.textContent = value;
  row.append(lbl, val);
  return row;
}

// Satu kolom spesifikasi (minimum / recommended). Baris kosong tetap ditampilkan
// supaya tinggi kedua kolom sejajar dan user sadar fieldnya belum diisi.
function specColumn(headText, spec, fields) {
  const col = document.createElement('div');
  col.className = 'req-col';
  const head = document.createElement('div');
  head.className = 'req-head';
  head.textContent = headText;
  const rows = fields
    .filter(([key]) => txt(spec && spec[key]).trim())
    .map(([key, label]) => reqRow(label, spec[key]));
  if (!rows.length) {
    const none = document.createElement('div');
    none.className = 'req-empty';
    none.textContent = 'Belum diisi';
    rows.push(none);
  }
  col.append(head, ...rows);
  return col;
}

// Panel di bawah link download: game menampilkan spesifikasi, software
// menampilkan ringkasan metadata (tanpa spesifikasi).
function detailPanelNode(panel) {
  const wrap = document.createElement('div');
  wrap.className = 'sysreq';

  if (panel.columns) {
    for (const [head, spec] of panel.columns) wrap.append(specColumn(head, spec, panel.fields));
    return wrap;
  }
  if (panel.empty) {
    const none = document.createElement('div');
    none.className = 'req-all-empty';
    none.textContent = panel.empty;
    wrap.append(none);
    return wrap;
  }
  const col = document.createElement('div');
  col.className = 'req-col';
  wrap.classList.add('single');
  if (!panel.rows.length) {
    const none = document.createElement('div');
    none.className = 'req-all-empty';
    none.textContent = 'Metadata software belum diisi lengkap. Klik Edit untuk menambahkan.';
    wrap.append(none);
    return wrap;
  }
  col.append(...panel.rows.map(([label, value]) => reqRow(label, value)));
  wrap.append(col);
  return wrap;
}

function renderDetail() {
  const def = cur();
  const item = getItem(active, detailId);
  const view = $('#view-detail');
  if (!item) { showLibrary(); return; }

  const chips = def.chips(item);
  const thumb = dflt(item.thumbnail, PLACEHOLDER_IMG);
  const site = def.websiteField ? txt(item[def.websiteField]).trim() : '';

  const frag = document.createDocumentFragment();

  const hero = document.createElement('div');
  hero.className = 'detail-hero';
  hero.innerHTML = `
    <div class="hero-bg"></div>
    <button class="btn ghost d-back" id="d-back" data-action="back">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      Kembali
    </button>
    <div class="hero-content">
      <img class="hero-capsule" src="${esc(thumb)}" alt="${esc(item.title)}" decoding="async">
      <div class="hero-info">
        <h1></h1>
        <div class="chips"></div>
        <div class="dl-panel">
          <div class="dl-label">${esc(def.linkLabel)}</div>
          <div class="dl-row">
            <div class="dl-link"></div>
            <button class="btn green big" id="d-copy" data-action="copy">${LINK_ICON} Copy Link</button>
            <button class="btn ghost" id="d-open" data-action="open">
              ${EXTERNAL_ICON}
              Buka di Browser
            </button>
          </div>
        </div>
        ${site ? '<div class="site-row"><span class="site-label">Situs resmi</span>' +
          '<a class="site-link" id="d-site" data-action="site" href="#" rel="noreferrer"></a></div>' : ''}
        <div class="detail-actions">
          <button class="btn ghost" id="d-edit" data-action="edit">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>
            Edit
          </button>
          <button class="btn danger" id="d-delete" data-action="delete">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Hapus
          </button>
        </div>
      </div>
    </div>`;
  hero.querySelector('.hero-bg').style.backgroundImage = `url('${thumb}')`;
  hero.querySelector('h1').textContent = txt(item.title);

  const chipsWrap = hero.querySelector('.chips');
  for (const [cls, text] of chips) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    chipsWrap.append(span);
  }

  const dlLink = hero.querySelector('.dl-link');
  dlLink.textContent = txt(item.link) ? item.link : '— belum ada link —';
  dlLink.title = txt(item.link);
  hero.querySelector('#d-open').disabled = !item.link;

  if (site) {
    const el = hero.querySelector('#d-site');
    el.textContent = site;
    el.href = site;
  }

  const panel = def.detailPanel(item);
  const body = document.createElement('div');
  body.className = 'detail-body';
  const secTitle = document.createElement('h2');
  secTitle.className = 'sec-title';
  secTitle.textContent = panel.title;
  body.append(secTitle, detailPanelNode(panel));

  frag.append(hero, body);
  view.replaceChildren(frag);
}

function showDetail(id) {
  detailId = id;
  renderDetail();
  $('#view-library').classList.add('hidden');
  $('#view-detail').classList.remove('hidden');
  $('#view-detail').scrollTop = 0;
  window.scrollTo(0, 0);
}

function showLibrary() {
  detailId = null;
  $('#view-detail').classList.add('hidden');
  $('#view-library').classList.remove('hidden');
  renderGrid();
}

/* ==========================================================================
   Form tambah / edit — dibangun dari deskriptor katalog
   ========================================================================== */

const formFields = (def) => def.formRows.flat();

function fieldNode(f) {
  return `<div class="field">
    <label for="f-${f.k}">${esc(f.l)}</label>
    <input id="f-${f.k}" type="text" placeholder="${esc(f.p)}" spellcheck="false" autocomplete="off">
  </div>`;
}

function buildFormFields(def) {
  $('#form-fields').innerHTML = def.formRows.map((row) => (
    row.length === 1
      ? fieldNode(row[0])
      : `<div class="frow two">${row.map(fieldNode).join('')}</div>`
  )).join('');
}

// Editor spesifikasi hanya ada untuk katalog game.
function buildSpecInputs() {
  for (const side of ['min', 'rec']) {
    $(`#f-spec-${side}`).innerHTML = SPEC_FIELDS.map(([key, label]) => `
      <div class="spec-field">
        <label>${esc(label)}</label>
        <input id="f-${side}-${key}" type="text" spellcheck="false" autocomplete="off" placeholder="${esc(dflt(SPEC_PLACEHOLDER[key], ''))}">
      </div>`).join('');
  }
}

function readSpecsFromForm() {
  const read = (side) => {
    const out = {};
    for (const [key] of SPEC_FIELDS) out[key] = $(`#f-${side}-${key}`).value.trim();
    return out;
  };
  return { min: read('min'), rec: read('rec') };
}

function fillSpecInputs(specs) {
  for (const side of ['min', 'rec']) {
    const s = (specs && specs[side]) ? specs[side] : {};
    for (const [key] of SPEC_FIELDS) $(`#f-${side}-${key}`).value = txt(s[key]);
  }
}

function updateThumbPreview() {
  $('#f-thumb-preview').src = dflt(ui().pendingThumb, PLACEHOLDER_IMG);
}

function clearInvalid() {
  document.querySelectorAll('.field input.invalid').forEach((el) => el.classList.remove('invalid'));
}

function markInvalid(sel) {
  $(sel).classList.add('invalid');
}

function openForm(item, prefill) {
  const st = ui();
  const def = st.def;
  const adding = !item;

  st.editingId = adding ? null : item.id;
  st.pendingSteamAppId = '';
  st.pendingThumb = adding ? '' : txt(item.thumbnail);

  buildFormFields(def);
  $('#form-title').textContent = (adding ? 'Tambah ' : 'Edit ') + def.nounCap;
  $('#form-save').textContent = 'Simpan ' + def.nounCap;
  $('#form-specs').classList.toggle('hidden', !def.specs);

  const base = adding ? {} : item;
  for (const f of formFields(def)) $(`#f-${f.k}`).value = txt(base[f.k]);
  if (def.specs) fillSpecInputs(base.specs);

  // Prefill hanya dipakai saat menambah entri baru: hasil impor tidak boleh
  // menimpa data yang sudah tersimpan.
  if (adding && prefill) {
    for (const key of def.prefillFields) {
      const el = $(`#f-${key}`);
      if (!el || !prefill[key]) continue;
      if (def.prefillOnlyWhenEmpty && el.value.trim()) continue;
      el.value = prefill[key];
    }
    def.applyPrefill(st, prefill);
  }

  updateThumbPreview();
  clearInvalid();
  openModal('modal-form');
  // Fokuskan ke field link kalau prefill (karena namanya sudah terisi).
  setTimeout(() => $(adding && prefill ? '#f-link' : '#f-title').focus(), 50);
}

// Hapus file thumbnail lama tanpa menunggu (api delete bersifat idempoten).
function dropThumbFile(ref) {
  if (ref && (ref.startsWith('/thumbnails/') || ref.startsWith('glib://') || ref.startsWith('slib://'))) {
    Promise.resolve(window.api.deleteThumbnail(ref)).catch(() => {});
  }
}

async function saveFromForm() {
  clearInvalid();
  const st = ui();
  const def = st.def;
  const values = {};
  for (const f of formFields(def)) values[f.k] = $(`#f-${f.k}`).value.trim();

  // Field wajib ditandai di deskriptor: pesan error memakai labelnya sendiri.
  for (const f of formFields(def)) {
    if (!f.req) continue;
    if (values[f.k]) continue;
    markInvalid(`#f-${f.k}`);
    $(`#f-${f.k}`).focus();
    toast(`${f.l.replace(' *', '')} wajib diisi`, true);
    return;
  }

  const old = st.editingId ? getItem(active, st.editingId) : null;
  const thumb = st.pendingThumb;
  if (old && old.thumbnail && old.thumbnail !== thumb) dropThumbFile(old.thumbnail);

  const now = new Date().toISOString();
  const fields = Object.assign({}, values, { thumbnail: thumb }, def.extraFields(st, old));
  if (def.specs) fields.specs = readSpecsFromForm();

  if (old) {
    Object.assign(old, fields, { updatedAt: now });
  } else {
    const fresh = Object.assign({ id: crypto.randomUUID(), createdAt: now, updatedAt: now }, fields);
    st.items.push(fresh);
    reindex(st);
  }
  if (def.categoryField) rebuildCategoryFilter(st);
  updateTabCounts();

  await persist(st);
  closeModal();
  renderGrid();
  toast(old ? 'Perubahan tersimpan'
    : `"${values.title}" ditambahkan ke katalog ${def.nounCap}`);
}

/* ==========================================================================
   Hapus entri (dedikasi per katalog hanya pada teks konfirmasinya)
   ========================================================================== */

function askDelete(id) {
  const def = cur();
  const item = getItem(active, id);
  if (!item) return;
  const extra = def.specs ? 'beserta link dan spesifikasinya' : 'beserta link download-nya';
  $('#confirm-title').textContent = `Hapus ${def.nounCap}?`;
  $('#confirm-msg').textContent = `"${txt(item.title)}" akan dihapus dari library ${extra}. Tindakan ini tidak bisa dibatalkan.`;
  confirmAction = async () => {
    dropThumbFile(txt(item.thumbnail));
    const st = stores[active];
    setItems(st, st.items.filter((x) => x.id !== id));
    hayCache.delete(id);
    await persist(st);
    closeModal();
    showLibrary();
    toast(`${def.nounCap} dihapus dari library`);
  };
  openModal('modal-confirm');
}

/* ==========================================================================
   Modal & toast helpers
   ========================================================================== */

function openModal(id) {
  $('#modal-backdrop').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  $('#' + id).classList.remove('hidden');
}

function closeModal() {
  $('#modal-backdrop').classList.add('hidden');
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  confirmAction = null;
}

function isModalOpen() {
  return !$('#modal-backdrop').classList.contains('hidden');
}

/* ==========================================================================
   Impor otomatis — Steam untuk game, halaman resmi untuk software
   ========================================================================== */

function openImportModal() {
  const conf = cur().import;
  const urlEl = $('#import-url');
  urlEl.value = '';
  urlEl.placeholder = conf.placeholder;
  $('#import-title').textContent = conf.title;
  $('#import-label').textContent = conf.label;
  const status = $('#import-status');
  status.classList.add('hidden');
  status.textContent = '';
  const btn = $('#import-fetch');
  btn.disabled = false;
  btn.textContent = conf.fetchLabel;
  openModal('modal-import');
  setTimeout(() => urlEl.focus(), 50);
}

async function fetchImport() {
  const def = cur();
  const conf = def.import;
  const url = $('#import-url').value.trim();
  const status = $('#import-status');
  const btn = $('#import-fetch');
  if (!url) {
    status.textContent = conf.needUrl;
    status.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mengambil...';
  status.classList.add('hidden');

  try {
    const result = await conf.run(url);
    closeModal();
    openForm(null, result);
    toast(conf.okToast);
  } catch (err) {
    status.textContent = (err && err.message) ? err.message : conf.failToast;
    status.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = conf.fetchLabel;
  }
}

/* ==========================================================================
   Bind events
   ========================================================================== */

function bindEvents() {
  // Tab katalog
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) setTab(btn.dataset.tab);
  });

  // Header
  $('#btn-import').addEventListener('click', openImportModal);
  $('#btn-add').addEventListener('click', () => openForm(null));
  $('#btn-empty-add').addEventListener('click', () => openForm(null));
  $('#search').addEventListener('input', (e) => {
    ui().query = e.target.value;
    scheduleRender(); // digabung per frame, tidak reflow tiap ketikan
  });
  $('#sort').addEventListener('change', (e) => {
    ui().sort = e.target.value;
    scheduleRender();
  });
  $('#filter-cat').addEventListener('change', (e) => {
    const st = ui();
    st.filterCat = e.target.value;
    rebuildCategoryFilter(st);
    scheduleRender();
  });

  // Grid: klik kartu -> detail, klik copy -> salin link, klik hapus -> konfirmasi
  $('#grid').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      e.stopPropagation();
      askDelete(delBtn.dataset.del);
      return;
    }
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      e.stopPropagation();
      copyLink(active, copyBtn.dataset.copy);
      return;
    }
    const card = e.target.closest('.card');
    if (card) showDetail(card.dataset.id);
  });

  // Detail: satu listener untuk semua tombol (delegation, tidak didaftarkan ulang)
  $('#view-detail').addEventListener('click', (e) => {
    const item = getItem(active, detailId);
    if (!item) return;
    const siteBtn = e.target.closest('[data-action="site"]');
    if (siteBtn) {
      e.preventDefault();
      if (item.website) window.api.openExternal(item.website);
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'back': showLibrary(); break;
      case 'copy': copyLink(active, item.id); break;
      case 'open': if (item.link) window.api.openExternal(item.link); break;
      case 'edit': openForm(item); break;
      case 'delete': askDelete(item.id); break;
    }
  });

  // Gambar gagal load -> placeholder (capture phase karena error tidak bubble)
  const imgErrorHandler = (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || img.dataset.fallback) return;
    img.dataset.fallback = '1';
    img.src = PLACEHOLDER_IMG;
  };
  $('#grid').addEventListener('error', imgErrorHandler, true);
  $('#view-detail').addEventListener('error', imgErrorHandler, true);

  // Form
  $('#form-close').addEventListener('click', closeModal);
  $('#form-cancel').addEventListener('click', closeModal);
  $('#form-save').addEventListener('click', saveFromForm);
  $('#f-pick').addEventListener('click', async () => {
    try {
      const ref = await window.api.pickThumbnail();
      if (ref) {
        ui().pendingThumb = ref;
        updateThumbPreview();
      }
    } catch (err) {
      toast('Gagal memuat gambar', true);
    }
  });
  $('#f-thumb-clear').addEventListener('click', () => {
    ui().pendingThumb = '';
    updateThumbPreview();
  });
  $('#f-thumb-preview').addEventListener('error', () => {
    if ($('#f-thumb-preview').src !== PLACEHOLDER_IMG) updateThumbPreview();
  });
  $('#f-thumb-preview').src = PLACEHOLDER_IMG;

  // Konfirmasi hapus
  $('#confirm-cancel').addEventListener('click', closeModal);
  $('#confirm-ok').addEventListener('click', () => {
    const action = confirmAction;
    closeModal();
    if (action) action();
  });

  // Modal impor
  $('#import-close').addEventListener('click', closeModal);
  $('#import-cancel').addEventListener('click', closeModal);
  $('#import-fetch').addEventListener('click', fetchImport);
  $('#import-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchImport();
  });

  // Backdrop klik -> tutup modal
  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isModalOpen()) closeModal();
      else if (!$('#view-detail').classList.contains('hidden')) showLibrary();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      $('#search').focus();
      $('#search').select();
    }
    if (e.key === 'Enter' && e.target && e.target.id === 'f-link') {
      saveFromForm();
    }
  });
}

/* ==========================================================================
   Init — kedua katalog dimuat sekaligus (satu file JSON, dua slice)
   ========================================================================== */

async function loadStore(key) {
  const st = stores[key];
  try {
    const items = await st.def.load();
    setItems(st, Array.isArray(items) ? items : []);
  } catch (err) {
    setItems(st, []);
    toast(`Gagal memuat katalog ${st.def.nounCap}`, true);
  }
}

async function init() {
  buildSpecInputs();
  bindEvents();
  syncTabChrome();
  await Promise.all(Object.keys(stores).map(loadStore));
  renderGrid();
}

init();
