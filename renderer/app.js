'use strict';

/* ==========================================================================
   Game Library — logika UI (grid, pencarian, form, detail)

   Catatan performa (hasil perombakan):
   - Grid dirender ulang secara inkremental (keyed reconciliation): kartu yang
     sudah ada dipakai kembali, jadi gambar tidak di-decode ulang dan halaman
     tidak berkedip setiap kali user mengetik di kotak pencarian.
   - Pencarian memakai indeks haystack lower-case yang di-cache per game.
   - Render dikumpulkan (coalesce) per animation frame, maksimal 1x/frame.
   - Detail view memakai event delegation, jadi listener tidak menumpuk.
   ========================================================================== */

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

const state = {
  games: [],
  query: '',
  sort: 'new',
  editingId: null,
  pendingThumb: '',
  pendingSteamAppId: '',
  detailId: null,
  confirmAction: null,
};

const $ = (sel) => document.querySelector(sel);
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

// Index id -> game, dibuat ulang hanya saat isi library berubah (getGame O(1)).
let gameIndex = new Map();
function reindexGames() {
  gameIndex = new Map(state.games.map((g) => [g.id, g]));
}

function getGame(id) {
  return gameIndex.get(id) || null;
}

async function persist() {
  try {
    await window.api.saveLibrary(state.games);
  } catch (err) {
    toast('Gagal menyimpan data: ' + (err && err.message ? err.message : err), true);
  }
}

function setGames(games) {
  state.games = Array.isArray(games) ? games : [];
  reindexGames();
}

/* ==========================================================================
   Grid library — render inkremental
   ========================================================================== */

// haystack pencarian yang di-cache: key = "title\0genre"
const hayCache = new Map();
function haystack(g) {
  const key = (g.title || '') + '\u0000' + (g.genre || '');
  const hit = hayCache.get(g.id);
  if (hit && hit.k === key) return hit.h;
  const h = key.toLowerCase();
  hayCache.set(g.id, { k: key, h });
  return h;
}

function visibleGames() {
  const q = state.query.trim().toLowerCase();
  let list = state.games;
  if (q) list = list.filter((g) => haystack(g).includes(q));

  const sort = state.sort;
  if (sort === 'az' || sort === 'za') {
    const dir = sort === 'az' ? 1 : -1;
    list = [...list].sort((a, b) =>
      dir * String(a.title || '').localeCompare(String(b.title || ''), 'id'));
  } else {
    list = [...list].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  return list;
}

// Cetakan kartu dibuat sekali di DOM (tanpa parsing HTML per kartu).
let cardTemplate = null;
function cardNode() {
  if (!cardTemplate) {
    cardTemplate = document.createElement('div');
    cardTemplate.className = 'card';
    cardTemplate.innerHTML =
      '<div class="capsule">' +
      '<img loading="lazy" decoding="async" alt="">' +
      '<div class="cap-overlay"><div class="cap-actions">' +
      `<button class="btn-copy">${COPY_ICON} Copy Link</button>` +
      `<button class="btn-card-del" title="Hapus game">${TRASH_ICON}</button>` +
      '</div></div></div>' +
      '<div class="card-title"></div>' +
      '<div class="card-sub"></div>';
  }
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

// Signature isi kartu: kalau sama, DOM tidak disentuh sama sekali.
function cardSig(g) {
  return (g.title || '') + '\u0001' + (g.genre || '') + '\u0001' + (g.size || '') +
    '\u0001' + (g.thumbnail || '') + '\u0001' + (g.price || '');
}

// id -> { nodes, sig }
const renderedCards = new Map();

// Kartu yang keluar dari layar (karena filter) tidak dibuang, tapi masuk ke
// kolam ini supaya pencarian berikutnya tinggal memakai ulang node, bukan
// membuat 600 elemen baru lagi.
const cardPool = [];
const CARD_POOL_MAX = 800;

function recycle(entry) {
  entry.nodes.el.remove();
  entry.nodes.img.removeAttribute('data-fallback');
  if (cardPool.length < CARD_POOL_MAX) cardPool.push(entry.nodes);
}

function cardNode() {
  const pooled = cardPool.pop();
  if (pooled) {
    pooled.el.removeAttribute('data-id');
    return pooled;
  }
  if (!cardTemplate) {
    cardTemplate = document.createElement('div');
    cardTemplate.className = 'card';
    cardTemplate.innerHTML =
      '<div class="capsule">' +
      '<img loading="lazy" decoding="async" alt="">' +
      '<div class="cap-overlay"><div class="cap-actions">' +
      `<button class="btn-copy">${COPY_ICON} Copy Link</button>` +
      `<button class="btn-card-del" title="Hapus game">${TRASH_ICON}</button>` +
      '</div></div></div>' +
      '<div class="card-title"></div>' +
      '<div class="card-sub"></div>';
  }
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

function paintCard(entry, g) {
  const { nodes } = entry;
  const thumb = g.thumbnail || PLACEHOLDER_IMG;
  if (nodes.img.getAttribute('src') !== thumb) {
    delete nodes.img.dataset.fallback; // src baru: boleh jatuh ke placeholder lagi
    nodes.img.src = thumb;
  }
  nodes.img.alt = g.title || '';
  nodes.el.dataset.id = g.id;
  nodes.copy.dataset.copy = g.id;
  nodes.del.dataset.del = g.id;
  nodes.title.textContent = g.title || '';
  const sub = [g.genre, g.size].filter(Boolean).join(' · ');
  nodes.sub.textContent = sub;
}

function syncGridHeader(list) {
  const q = state.query.trim();
  const title = (q ? `Hasil untuk “${q}”` : 'Semua Game') +
    ` ${list.length} game`;
  const el = $('#lib-title');
  // Tulis sekali lewat textContent + span count agar #lib-count tetap ada.
  if (el.dataset.cache === title) return;
  el.dataset.cache = title;
  el.replaceChildren(
    document.createTextNode(q ? `Hasil untuk “${q}” ` : 'Semua Game '),
    Object.assign(document.createElement('span'), { id: 'lib-count', textContent: `${list.length} game` }),
  );
}

function renderGrid() {
  const grid = $('#grid');
  const empty = $('#empty');
  const list = visibleGames();

  syncGridHeader(list);

  if (!state.games.length || !list.length) {
    for (const entry of renderedCards.values()) recycle(entry);
    grid.replaceChildren();
    renderedCards.clear();
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    if (!state.games.length) {
      $('#empty-title').textContent = 'Library masih kosong';
      $('#empty-sub').textContent = 'Tambahkan game pertama Anda beserta link download dan spesifikasinya.';
      $('#btn-empty-add').classList.remove('hidden');
    } else {
      $('#empty-title').textContent = `Tidak ada hasil untuk "${state.query.trim()}"`;
      $('#empty-sub').textContent = 'Coba kata kunci lain, atau periksa ejaan judul game.';
      $('#btn-empty-add').classList.add('hidden');
    }
    return;
  }

  empty.classList.add('hidden');
  grid.classList.remove('hidden');

  // 1. Buat / perbarui kartu yang isinya berubah.
  const wanted = new Set();
  for (const g of list) {
    wanted.add(g.id);
    let entry = renderedCards.get(g.id);
    if (!entry) {
      const nodes = cardNode();
      entry = { nodes, sig: '' };
      renderedCards.set(g.id, entry);
    }
    const sig = cardSig(g);
    if (entry.sig !== sig) {
      paintCard(entry, g);
      entry.sig = sig;
    }
  }

  // 2. Buang kartu yang tidak lagi terlihat (masuk ke kolam, bukan dihancurkan).
  for (const [id, entry] of renderedCards) {
    if (!wanted.has(id)) {
      recycle(entry);
      renderedCards.delete(id);
    }
  }

  // 3. Susun ulang urutan dengan perpindahan minimum (insertBefore hanya bila
  //    posisi sudah salah).
  let ref = grid.firstChild;
  for (const g of list) {
    const el = renderedCards.get(g.id).nodes.el;
    if (el !== ref) {
      grid.insertBefore(el, ref || null);
    } else {
      ref = ref.nextSibling;
      continue;
    }
    ref = el.nextSibling;
  }

  // 4. Setelah penyusunan, semua kartu aktif berada di depan; sisa simpul di
  //    ekor yang bukan milik kita (mis. ditulis kode lain) dibuang.
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

async function copyGameLink(id) {
  const g = getGame(id);
  if (!g) return;
  if (!g.link) {
    toast('Game ini belum punya link download', true);
    return;
  }
  try {
    await window.api.copyText(g.link);
    toast('Link download disalin! Siap dikirim ke pelanggan.');
  } catch (err) {
    toast('Gagal menyalin link', true);
  }
}

/* ==========================================================================
   Detail view
   ========================================================================== */

function reqRows(spec) {
  const rows = SPEC_FIELDS
    .filter(([key]) => (spec && spec[key] ? String(spec[key]).trim() : false))
    .map(([key, label]) => {
      const row = document.createElement('div');
      row.className = 'req-row';
      const lbl = document.createElement('span');
      lbl.className = 'req-lbl';
      lbl.textContent = `${label}:`;
      const val = document.createElement('span');
      val.className = 'req-val';
      val.textContent = spec[key];
      row.append(lbl, val);
      return row;
    });
  if (!rows.length) {
    const none = document.createElement('div');
    none.className = 'req-empty';
    none.textContent = 'Belum diisi';
    return [none];
  }
  return rows;
}

function specColumn(headText, spec) {
  const col = document.createElement('div');
  col.className = 'req-col';
  const head = document.createElement('div');
  head.className = 'req-head';
  head.textContent = headText;
  col.append(head, ...reqRows(spec));
  return col;
}

function renderDetail() {
  const g = getGame(state.detailId);
  const view = $('#view-detail');
  if (!g) { showLibrary(); return; }

  const chips = [
    g.genre ? ['chip', g.genre] : null,
    g.size ? ['chip', `Ukuran: ${g.size}`] : null,
    g.price ? ['chip accent', g.price] : null,
  ].filter(Boolean);

  const minSpec = g.specs && g.specs.min ? g.specs.min : null;
  const recSpec = g.specs && g.specs.rec ? g.specs.rec : null;
  const hasAnySpec = SPEC_FIELDS.some(([k]) => (minSpec && minSpec[k]) || (recSpec && recSpec[k]));
  const thumb = g.thumbnail || PLACEHOLDER_IMG;

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
      <img class="hero-capsule" src="${esc(thumb)}" alt="${esc(g.title)}" decoding="async">
      <div class="hero-info">
        <h1></h1>
        <div class="chips"></div>
        <div class="dl-panel">
          <div class="dl-label">LINK DOWNLOAD GOOGLE DRIVE</div>
          <div class="dl-row">
            <div class="dl-link"></div>
            <button class="btn green big" id="d-copy" data-action="copy">${LINK_ICON} Copy Link</button>
            <button class="btn ghost" id="d-open" data-action="open">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
              Buka di Browser
            </button>
          </div>
        </div>
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
  hero.querySelector('h1').textContent = g.title || '';

  const chipsWrap = hero.querySelector('.chips');
  for (const [cls, text] of chips) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    chipsWrap.append(span);
  }

  const dlLink = hero.querySelector('.dl-link');
  dlLink.textContent = g.link || '— belum ada link —';
  dlLink.title = g.link || '';
  hero.querySelector('#d-open').disabled = !g.link;

  const body = document.createElement('div');
  body.className = 'detail-body';
  const secTitle = document.createElement('h2');
  secTitle.className = 'sec-title';
  secTitle.textContent = 'System Requirements';
  const sysreq = document.createElement('div');
  sysreq.className = 'sysreq';
  if (hasAnySpec) {
    sysreq.append(specColumn('MINIMUM:', minSpec), specColumn('RECOMMENDED:', recSpec));
  } else {
    const none = document.createElement('div');
    none.className = 'req-all-empty';
    none.textContent = 'Spesifikasi sistem belum diisi untuk game ini. Klik Edit untuk menambahkan.';
    sysreq.append(none);
  }
  body.append(secTitle, sysreq);

  frag.append(hero, body);
  view.replaceChildren(frag);
}

function showDetail(id) {
  state.detailId = id;
  renderDetail();
  $('#view-library').classList.add('hidden');
  $('#view-detail').classList.remove('hidden');
  $('#view-detail').scrollTop = 0;
  window.scrollTo(0, 0);
}

function showLibrary() {
  state.detailId = null;
  $('#view-detail').classList.add('hidden');
  $('#view-library').classList.remove('hidden');
  renderGrid();
}

/* ==========================================================================
   Form tambah / edit
   ========================================================================== */

function buildSpecInputs() {
  for (const side of ['min', 'rec']) {
    const wrap = $(`#f-spec-${side}`);
    wrap.innerHTML = SPEC_FIELDS.map(([key, label]) => `
      <div class="spec-field">
        <label>${esc(label)}</label>
        <input id="f-${side}-${key}" type="text" spellcheck="false" autocomplete="off" placeholder="${esc(specPlaceholder(key))}">
      </div>`).join('');
  }
}

function specPlaceholder(key) {
  const p = {
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
  return p[key] || '';
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
    const s = (specs && specs[side]) || {};
    for (const [key] of SPEC_FIELDS) $(`#f-${side}-${key}`).value = s[key] || '';
  }
}

function openForm(game, prefill) {
  state.editingId = game ? game.id : null;
  state.pendingSteamAppId = '';
  state.pendingThumb = game ? game.thumbnail || '' : '';
  $('#form-title').textContent = game ? 'Edit Game' : 'Tambah Game';
  $('#f-title').value = game ? game.title || '' : '';
  $('#f-link').value = game ? game.link || '' : '';
  $('#f-genre').value = game ? game.genre || '' : '';
  $('#f-price').value = game ? game.price || '' : '';
  fillSpecInputs(game ? game.specs : null);

  // Prefill dari Steam (hanya saat tambah game baru)
  if (!game && prefill) {
    if (prefill.title) $('#f-title').value = prefill.title;
    if (prefill.genre) $('#f-genre').value = prefill.genre;
    if (prefill.price) $('#f-price').value = prefill.price;
    if (prefill.thumbnail) state.pendingThumb = prefill.thumbnail;
    if (prefill.specs) fillSpecInputs(prefill.specs);
    if (prefill.appId) state.pendingSteamAppId = prefill.appId;
  }

  updateThumbPreview();
  clearInvalid();
  openModal('modal-form');
  // Fokuskan ke field link kalau prefill (karena judul sudah terisi)
  setTimeout(() => $(prefill ? '#f-link' : '#f-title').focus(), 50);
}

function updateThumbPreview() {
  $('#f-thumb-preview').src = state.pendingThumb || PLACEHOLDER_IMG;
}

function clearInvalid() {
  document.querySelectorAll('.field input.invalid').forEach((el) => el.classList.remove('invalid'));
}

function markInvalid(sel) {
  $(sel).classList.add('invalid');
}

// Hapus file thumbnail lama tanpa menunggu (api delete bersifat idempoten).
function dropThumbFile(ref) {
  if (ref && (ref.startsWith('/thumbnails/') || ref.startsWith('glib://'))) {
    Promise.resolve(window.api.deleteThumbnail(ref)).catch(() => {});
  }
}

async function saveGameFromForm() {
  clearInvalid();
  const title = $('#f-title').value.trim();
  const link = $('#f-link').value.trim();

  if (!title) { markInvalid('#f-title'); $('#f-title').focus(); toast('Judul game wajib diisi', true); return; }
  if (!link) { markInvalid('#f-link'); $('#f-link').focus(); toast('Link download wajib diisi', true); return; }

  const old = state.editingId ? getGame(state.editingId) : null;
  const thumb = state.pendingThumb || '';
  if (old && old.thumbnail && old.thumbnail !== thumb) dropThumbFile(old.thumbnail);

  const now = new Date().toISOString();
  const fields = {
    title, link,
    thumbnail: thumb,
    genre: $('#f-genre').value.trim(),
    price: $('#f-price').value.trim(),
    specs: readSpecsFromForm(),
  };

  if (old) {
    Object.assign(old, fields, {
      steamAppId: old.steamAppId || '',
      updatedAt: now,
    });
  } else {
    state.games.push(Object.assign({
      id: crypto.randomUUID(),
      steamAppId: state.pendingSteamAppId || '',
      createdAt: now,
      updatedAt: now,
    }, fields));
  }
  reindexGames();

  await persist();
  closeModal();
  renderGrid();
  toast(old ? 'Perubahan tersimpan' : `"${title}" ditambahkan ke library`);
}

/* ==========================================================================
   Hapus game
   ========================================================================== */

function askDeleteGame(id) {
  const g = getGame(id);
  if (!g) return;
  $('#confirm-msg').textContent = `"${g.title}" akan dihapus dari library beserta link dan spesifikasinya. Tindakan ini tidak bisa dibatalkan.`;
  state.confirmAction = async () => {
    dropThumbFile(g.thumbnail);
    setGames(state.games.filter((x) => x.id !== id));
    hayCache.delete(id);
    await persist();
    closeModal();
    showLibrary();
    toast('Game dihapus dari library');
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
  state.confirmAction = null;
}

function isModalOpen() {
  return !$('#modal-backdrop').classList.contains('hidden');
}

/* ==========================================================================
   Steam Link — impor data otomatis dari Steam Store
   ========================================================================== */

function openSteamModal() {
  const urlEl = $('#steam-url');
  urlEl.value = '';
  const status = $('#steam-status');
  status.classList.add('hidden');
  status.textContent = '';
  const btn = $('#steam-fetch');
  btn.disabled = false;
  btn.textContent = 'Ambil Data Steam';
  openModal('modal-steam');
  setTimeout(() => urlEl.focus(), 50);
}

async function fetchSteam() {
  const url = $('#steam-url').value.trim();
  const status = $('#steam-status');
  const btn = $('#steam-fetch');
  if (!url) {
    status.textContent = 'Masukkan link Steam Store terlebih dahulu.';
    status.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mengambil...';
  status.classList.add('hidden');

  try {
    const result = await window.api.steamImport(url);
    closeModal();
    openForm(null, result);
    toast('Data terisi otomatis — tinggal isi link Google Drive');
  } catch (err) {
    status.textContent = (err && err.message) || 'Gagal mengambil data dari Steam.';
    status.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Ambil Data Steam';
  }
}

/* ==========================================================================
   Bind events
   ========================================================================== */

function bindEvents() {
  // Header
  $('#btn-steam').addEventListener('click', openSteamModal);
  $('#btn-add').addEventListener('click', () => openForm(null));
  $('#btn-empty-add').addEventListener('click', () => openForm(null));
  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value;
    scheduleRender(); // digabung per frame, tidak reflow tiap ketikan
  });
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    scheduleRender();
  });

  // Grid: klik kartu -> detail, klik copy -> salin link, klik hapus -> konfirmasi
  $('#grid').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      e.stopPropagation();
      askDeleteGame(delBtn.dataset.del);
      return;
    }
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      e.stopPropagation();
      copyGameLink(copyBtn.dataset.copy);
      return;
    }
    const card = e.target.closest('.card');
    if (card) showDetail(card.dataset.id);
  });

  // Detail: satu listener untuk semua tombol (delegation, tidak didaftarkan ulang)
  $('#view-detail').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const g = getGame(state.detailId);
    if (!g) return;
    switch (btn.dataset.action) {
      case 'back': showLibrary(); break;
      case 'copy': copyGameLink(g.id); break;
      case 'open': if (g.link) window.api.openExternal(g.link); break;
      case 'edit': openForm(g); break;
      case 'delete': askDeleteGame(g.id); break;
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
  $('#form-save').addEventListener('click', saveGameFromForm);
  $('#f-pick').addEventListener('click', async () => {
    try {
      const ref = await window.api.pickThumbnail();
      if (ref) {
        state.pendingThumb = ref;
        updateThumbPreview();
      }
    } catch (err) {
      toast('Gagal memuat gambar', true);
    }
  });
  $('#f-thumb-clear').addEventListener('click', () => {
    state.pendingThumb = '';
    updateThumbPreview();
  });
  $('#f-thumb-preview').addEventListener('error', () => {
    if ($('#f-thumb-preview').src !== PLACEHOLDER_IMG) updateThumbPreview();
  });
  $('#f-thumb-preview').src = PLACEHOLDER_IMG;

  // Konfirmasi
  $('#confirm-cancel').addEventListener('click', closeModal);
  $('#confirm-ok').addEventListener('click', () => {
    const action = state.confirmAction;
    closeModal();
    if (action) action();
  });

  // Steam modal
  $('#steam-close').addEventListener('click', closeModal);
  $('#steam-cancel').addEventListener('click', closeModal);
  $('#steam-fetch').addEventListener('click', fetchSteam);
  $('#steam-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchSteam();
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
      saveGameFromForm();
    }
  });
}

/* ==========================================================================
   Init
   ========================================================================== */

async function init() {
  buildSpecInputs();
  bindEvents();
  try {
    setGames((await window.api.loadLibrary()) || []);
  } catch (err) {
    setGames([]);
    toast('Gagal memuat data library', true);
  }
  renderGrid();
}

init();
