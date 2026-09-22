'use strict';

/* ==========================================================================
   Game Library — logika UI (grid, pencarian, form, detail)
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

function getGame(id) {
  return state.games.find((g) => g.id === id) || null;
}

async function persist() {
  try {
    await window.api.saveLibrary(state.games);
  } catch (err) {
    toast('Gagal menyimpan data: ' + err.message, true);
  }
}

/* ==========================================================================
   Grid library
   ========================================================================== */

function sortedGames() {
  const q = state.query.trim().toLowerCase();
  let list = state.games.filter((g) => {
    if (!q) return true;
    return (
      (g.title || '').toLowerCase().includes(q) ||
      (g.genre || '').toLowerCase().includes(q)
    );
  });
  if (state.sort === 'az') {
    list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'id'));
  } else if (state.sort === 'za') {
    list = [...list].sort((a, b) => (b.title || '').localeCompare(a.title || '', 'id'));
  } else {
    list = [...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  return list;
}

function cardHtml(g) {
  const sub = [g.genre, g.size].filter(Boolean).join(' · ');
  return `
    <div class="card" data-id="${esc(g.id)}">
      <div class="capsule">
        <img loading="lazy" src="${esc(g.thumbnail || PLACEHOLDER_IMG)}" alt="${esc(g.title)}">
        <div class="cap-overlay">
          <div class="cap-actions">
            <button class="btn-copy" data-copy="${esc(g.id)}" title="Salin link download">${COPY_ICON} Copy Link</button>
            <button class="btn-card-del" data-del="${esc(g.id)}" title="Hapus game">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="card-title">${esc(g.title)}</div>
      <div class="card-sub">${esc(sub)}</div>
    </div>`;
}

function renderGrid() {
  const list = sortedGames();
  const grid = $('#grid');
  const empty = $('#empty');

  // Judul + hitungan ditulis sekali supaya span#lib-count tidak hilang dari DOM
  const q = state.query.trim();
  $('#lib-title').innerHTML =
    (q ? `Hasil untuk &ldquo;${esc(q)}&rdquo;` : 'Semua Game') +
    ` <span id="lib-count">${list.length} game</span>`;

  if (!state.games.length) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    $('#empty-title').textContent = 'Library masih kosong';
    $('#empty-sub').textContent = 'Tambahkan game pertama Anda beserta link download dan spesifikasinya.';
    $('#btn-empty-add').classList.remove('hidden');
    return;
  }

  if (!list.length) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    $('#empty-title').textContent = `Tidak ada hasil untuk "${state.query.trim()}"`;
    $('#empty-sub').textContent = 'Coba kata kunci lain, atau periksa ejaan judul game.';
    $('#btn-empty-add').classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.classList.remove('hidden');
  grid.innerHTML = list.map(cardHtml).join('');
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
    .map(([key, label]) => `
      <div class="req-row">
        <span class="req-lbl">${esc(label)}:</span>
        <span class="req-val">${esc(spec[key])}</span>
      </div>`);
  return rows.length
    ? rows.join('')
    : '<div class="req-empty">Belum diisi</div>';
}

function renderDetail() {
  const g = getGame(state.detailId);
  const view = $('#view-detail');
  if (!g) { showLibrary(); return; }

  const chips = [
    g.genre ? `<span class="chip">${esc(g.genre)}</span>` : '',
    g.size ? `<span class="chip">Ukuran: ${esc(g.size)}</span>` : '',
    g.price ? `<span class="chip accent">${esc(g.price)}</span>` : '',
  ].filter(Boolean).join('');

  const minSpec = g.specs && g.specs.min ? g.specs.min : null;
  const recSpec = g.specs && g.specs.rec ? g.specs.rec : null;
  const hasAnySpec = SPEC_FIELDS.some(([k]) =>
    (minSpec && minSpec[k]) || (recSpec && recSpec[k]));

  const sysreq = hasAnySpec ? `
    <div class="sysreq">
      <div class="req-col">
        <div class="req-head">MINIMUM:</div>
        ${reqRows(minSpec)}
      </div>
      <div class="req-col">
        <div class="req-head">RECOMMENDED:</div>
        ${reqRows(recSpec)}
      </div>
    </div>` : `
    <div class="sysreq"><div class="req-all-empty">Spesifikasi sistem belum diisi untuk game ini. Klik Edit untuk menambahkan.</div></div>`;

  view.innerHTML = `
    <div class="detail-hero">
      <div class="hero-bg" style="background-image:url('${esc(g.thumbnail || PLACEHOLDER_IMG)}')"></div>
      <button class="btn ghost d-back" id="d-back">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        Kembali
      </button>
      <div class="hero-content">
        <img class="hero-capsule" src="${esc(g.thumbnail || PLACEHOLDER_IMG)}" alt="${esc(g.title)}">
        <div class="hero-info">
          <h1>${esc(g.title)}</h1>
          <div class="chips">${chips}</div>
          <div class="dl-panel">
            <div class="dl-label">LINK DOWNLOAD GOOGLE DRIVE</div>
            <div class="dl-row">
              <div class="dl-link" title="${esc(g.link)}">${esc(g.link || '— belum ada link —')}</div>
              <button class="btn green big" id="d-copy">${LINK_ICON} Copy Link</button>
              <button class="btn ghost" id="d-open" ${g.link ? '' : 'disabled'}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                Buka di Browser
              </button>
            </div>
          </div>
          <div class="detail-actions">
            <button class="btn ghost" id="d-edit">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"></path></svg>
              Edit
            </button>
            <button class="btn danger" id="d-delete">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Hapus
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="detail-body">
      <h2 class="sec-title">System Requirements</h2>
      ${sysreq}
    </div>`;

  $('#d-back').addEventListener('click', showLibrary);
  $('#d-copy').addEventListener('click', () => copyGameLink(g.id));
  $('#d-open').addEventListener('click', () => { if (g.link) window.api.openExternal(g.link); });
  $('#d-edit').addEventListener('click', () => openForm(g));
  $('#d-delete').addEventListener('click', () => askDeleteGame(g.id));
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
        <input id="f-${side}-${key}" type="text" spellcheck="false" placeholder="${esc(specPlaceholder(key))}">
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
    if (prefill.thumbnail) {
      state.pendingThumb = prefill.thumbnail;
    }
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

async function saveGameFromForm() {
  clearInvalid();
  const title = $('#f-title').value.trim();
  const link = $('#f-link').value.trim();

  if (!title) { markInvalid('#f-title'); $('#f-title').focus(); toast('Judul game wajib diisi', true); return; }
  if (!link) { markInvalid('#f-link'); $('#f-link').focus(); toast('Link download wajib diisi', true); return; }

  const old = state.editingId ? getGame(state.editingId) : null;
  const thumb = state.pendingThumb || '';
  if (old && old.thumbnail && old.thumbnail.startsWith('glib://') && old.thumbnail !== thumb) {
    window.api.deleteThumbnail(old.thumbnail);
  }

  const now = new Date().toISOString();
  if (old) {
    Object.assign(old, {
      title, link,
      thumbnail: thumb,
      genre: $('#f-genre').value.trim(),
      price: $('#f-price').value.trim(),
      steamAppId: old.steamAppId || '',
      specs: readSpecsFromForm(),
      updatedAt: now,
    });
  } else {
    state.games.push({
      id: crypto.randomUUID(),
      title, link,
      thumbnail: thumb,
      genre: $('#f-genre').value.trim(),
      price: $('#f-price').value.trim(),
      steamAppId: state.pendingSteamAppId || '',
      specs: readSpecsFromForm(),
      createdAt: now,
      updatedAt: now,
    });
  }

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
    if (g.thumbnail && g.thumbnail.startsWith('glib://')) {
      window.api.deleteThumbnail(g.thumbnail);
    }
    state.games = state.games.filter((x) => x.id !== id);
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
  $('#steam-url').value = '';
  $('#steam-status').classList.add('hidden');
  $('#steam-status').textContent = '';
  $('#steam-fetch').disabled = false;
  $('#steam-fetch').textContent = 'Ambil Data Steam';
  openModal('modal-steam');
  setTimeout(() => $('#steam-url').focus(), 50);
}

async function fetchSteam() {
  const url = $('#steam-url').value.trim();
  if (!url) {
    $('#steam-status').textContent = 'Masukkan link Steam Store terlebih dahulu.';
    $('#steam-status').classList.remove('hidden');
    return;
  }

  const btn = $('#steam-fetch');
  btn.disabled = true;
  btn.textContent = 'Mengambil...';
  $('#steam-status').classList.add('hidden');

  try {
    const result = await window.api.steamImport(url);
    closeModal();
    openForm(null, result);
    toast('Data terisi otomatis — tinggal isi link Google Drive');
  } catch (err) {
    $('#steam-status').textContent = err.message || 'Gagal mengambil data dari Steam.';
    $('#steam-status').classList.remove('hidden');
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
    renderGrid();
  });
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderGrid();
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

  // Gambar gagal load -> placeholder (capture phase karena error tidak bubble)
  const imgErrorHandler = (e) => {
    if (e.target.tagName === 'IMG' && e.target.src !== PLACEHOLDER_IMG) {
      e.target.src = PLACEHOLDER_IMG;
    }
  };
  $('#grid').addEventListener('error', imgErrorHandler, true);
  $('#view-detail').addEventListener('error', imgErrorHandler, true);

  // Detail (dibind ulang tiap render di renderDetail)

  // Form
  $('#form-close').addEventListener('click', closeModal);
  $('#form-cancel').addEventListener('click', closeModal);
  $('#form-save').addEventListener('click', saveGameFromForm);
  $('#f-pick').addEventListener('click', async () => {
    try {
      const ref = await window.api.pickThumbnail();
      if (ref) {
        state.pendingThumb = ref;
        $('#f-thumburl').value = '';
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
  $('#modal-backdrop').addEventListener('click', closeModal);

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
    state.games = (await window.api.loadLibrary()) || [];
  } catch (err) {
    state.games = [];
    toast('Gagal memuat data library', true);
  }
  renderGrid();
}

init();
