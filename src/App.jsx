// App.jsx
// Komponen akar: memegang dua katalog (game/software), state per tab
// (pencarian, urutan, filter, entri terpilih), modal, dan toast.
//
// Struktur state:
//   items  -> { game: Game[], software: Software[] }
//   ui     -> { game: {...}, software: {...} }  (query/sort/filterCat/selectedId)
//   tab    -> tab aktif
//   modal  -> null | { kind:'form'|'confirm'|'import', ... }
//   toast  -> null | { msg, error, show }
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { CATALOGS, isStoredThumb, txt } from './constants';
import Toolbar from './components/Toolbar.jsx';
import LibraryBar from './components/LibraryBar.jsx';
import Grid from './components/Grid.jsx';
import EmptyState from './components/EmptyState.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import EntryFormModal from './components/EntryFormModal.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import ImportModal from './components/ImportModal.jsx';
import Toast from './components/Toast.jsx';

const EMPTY_CATALOG_UI = { query: '', sort: 'new', filterCat: '', selectedId: null };

// id unik untuk entri baru (fallback kalau crypto.randomUUID tidak ada).
function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (err) { /* abaikan */ }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

// Urutan + filter yang terlihat di grid (logika sama dengan app.js lama).
function visibleItems(def, list, query, sort, filterCat) {
  const q = query.trim().toLowerCase();
  let out = list;
  if (q) out = out.filter((item) => def.haystack(item).map(txt).join('\u0000').toLowerCase().includes(q));
  if (def.categoryField && filterCat) {
    out = out.filter((item) => txt(item[def.categoryField]) === filterCat);
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

  if (sort === 'az') return [...out].sort(byTitle);
  if (sort === 'za') return [...out].sort((a, b) => -byTitle(a, b));
  if (sort === 'cat' && def.categoryField) return [...out].sort(byCategory);
  return [...out].sort((a, b) => txt(b.createdAt).localeCompare(txt(a.createdAt)));
}

export default function App() {
  const [items, setItems] = useState({ game: [], software: [] });
  const [ui, setUi] = useState({ game: { ...EMPTY_CATALOG_UI }, software: { ...EMPTY_CATALOG_UI } });
  const [tab, setTab] = useState('game');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const searchRef = useRef(null);
  const toastTimer = useRef(null);

  // Snapshot nilai terbaru untuk callback stabil (memo kartu tidak ikut berubah).
  const tabRef = useRef(tab); tabRef.current = tab;
  const uiRef = useRef(ui); uiRef.current = ui;
  const itemsRef = useRef(items); itemsRef.current = items;
  const modalRef = useRef(modal); modalRef.current = modal;

  const showToast = useCallback((msg, isError) => {
    setToast({ msg, error: !!isError, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((t) => (t ? { ...t, show: false } : t));
    }, 2600);
  }, []);

  const persist = useCallback(async (which, list) => {
    try {
      await (which === 'game' ? api.saveLibrary(list) : api.saveSoftware(list));
    } catch (err) {
      showToast('Gagal menyimpan data: ' + ((err && err.message) ? err.message : err), true);
    }
  }, [showToast]);

  // Hapus file thumbnail lama tanpa menunggu (api delete bersifat idempoten).
  const dropThumb = useCallback((ref) => {
    if (isStoredThumb(ref)) Promise.resolve(api.deleteThumbnail(ref)).catch(() => {});
  }, []);

  const patchUi = useCallback((partial) => {
    const t = tabRef.current;
    setUi((prev) => ({ ...prev, [t]: { ...prev[t], ...partial } }));
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  /* ---- Muat kedua katalog sekaligus ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [g, s] = await Promise.allSettled([api.loadLibrary(), api.loadSoftware()]);
      if (!alive) return;
      setItems({
        game: g.status === 'fulfilled' && Array.isArray(g.value) ? g.value : [],
        software: s.status === 'fulfilled' && Array.isArray(s.value) ? s.value : [],
      });
      if (g.status === 'rejected') showToast('Gagal memuat katalog Game', true);
      if (s.status === 'rejected') showToast('Gagal memuat katalog Software', true);
    })();
    return () => { alive = false; };
  }, [showToast]);

  /* ---- Turunan ---- */
  const def = CATALOGS[tab];
  const u = ui[tab];
  const tabItems = items[tab];

  // Daftar kategori di toolbar dibangun ulang dari data software.
  const categories = useMemo(() => {
    const field = CATALOGS.software.categoryField;
    if (!field) return [];
    const set = new Set(items.software.map((s) => txt(s[field]).trim()).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'id'));
  }, [items.software]);

  // Filter kategori yang sudah tidak ada lagi otomatis direset.
  useEffect(() => {
    setUi((prev) => {
      const fc = prev.software.filterCat;
      if (fc && !categories.includes(fc)) {
        return { ...prev, software: { ...prev.software, filterCat: '' } };
      }
      return prev;
    });
  }, [categories]);

  const list = useMemo(
    () => visibleItems(def, tabItems, u.query, u.sort, u.filterCat),
    [def, tabItems, u.query, u.sort, u.filterCat],
  );

  const selectedItem = useMemo(
    () => (u.selectedId ? tabItems.find((x) => x.id === u.selectedId) || null : null),
    [tabItems, u.selectedId],
  );

  /* ---- Aksi ---- */
  const switchTab = useCallback((key) => {
    if (CATALOGS[key]) setTab(key);
  }, []);

  // Klik kartu memilihnya; klik kartu terpilih lagi menutupnya (toggle).
  const handleSelect = useCallback((id) => {
    const t = tabRef.current;
    setUi((prev) => {
      const sel = prev[t].selectedId;
      return { ...prev, [t]: { ...prev[t], selectedId: sel === id ? null : id } };
    });
  }, []);

  const showLibrary = useCallback(() => patchUi({ selectedId: null }), [patchUi]);

  const copyLink = useCallback(async (id) => {
    const t = tabRef.current;
    const d = CATALOGS[t];
    const item = itemsRef.current[t].find((x) => x.id === id);
    if (!item) return;
    if (!item.link) {
      showToast(`${d.nounCap} ini belum punya link download`, true);
      return;
    }
    try {
      await api.copyText(item.link);
      showToast('Link download disalin! Siap dikirim ke pelanggan.');
    } catch (err) {
      showToast('Gagal menyalin link', true);
    }
  }, [showToast]);

  const saveThumbImage = useCallback(async (ref, title) => {
    if (!isStoredThumb(ref)) {
      showToast('Entri ini belum punya gambar tersimpan', true);
      return;
    }
    try {
      const dest = await api.saveThumbnail(ref, title);
      if (dest) showToast('Gambar disimpan');
    } catch (err) {
      showToast((err && err.message) ? err.message : 'Gagal menyimpan gambar', true);
    }
  }, [showToast]);

  const openForm = useCallback((t, item = null, prefill = null) => {
    setModal({ kind: 'form', tab: t, item, prefill });
  }, []);

  const openImport = useCallback(() => setModal({ kind: 'import', tab: tabRef.current }), []);

  const doDelete = useCallback(async (t, id) => {
    const d = CATALOGS[t];
    const item = itemsRef.current[t].find((x) => x.id === id);
    if (item) dropThumb(txt(item.thumbnail));
    const next = itemsRef.current[t].filter((x) => x.id !== id);
    setItems((prev) => ({ ...prev, [t]: next }));
    setUi((prev) => ({
      ...prev,
      [t]: { ...prev[t], selectedId: prev[t].selectedId === id ? null : prev[t].selectedId },
    }));
    closeModal();
    await persist(t, next);
    showToast(`${d.nounCap} dihapus dari library`);
  }, [dropThumb, persist, closeModal, showToast]);

  const askDelete = useCallback((id) => {
    const t = tabRef.current;
    const d = CATALOGS[t];
    const item = itemsRef.current[t].find((x) => x.id === id);
    if (!item) return;
    const extra = d.hasSpecs ? 'beserta link dan spesifikasinya' : 'beserta link download-nya';
    setModal({
      kind: 'confirm',
      title: `Hapus ${d.nounCap}?`,
      message: `"${txt(item.title)}" akan dihapus dari library ${extra}. Tindakan ini tidak bisa dibatalkan.`,
      onConfirm: () => doDelete(t, id),
    });
  }, [doDelete]);

  const handleFormSave = useCallback(async ({ tab: t, editingId, fields, oldThumbnail }) => {
    const now = new Date().toISOString();
    const current = itemsRef.current[t];
    let next;
    if (editingId) {
      next = current.map((x) => (x.id === editingId ? { ...x, ...fields, updatedAt: now } : x));
      if (oldThumbnail && oldThumbnail !== fields.thumbnail) dropThumb(oldThumbnail);
    } else {
      next = [...current, { id: newId(), createdAt: now, updatedAt: now, ...fields }];
    }
    setItems((prev) => ({ ...prev, [t]: next }));
    closeModal();
    await persist(t, next);
    showToast(editingId ? 'Perubahan tersimpan' : `"${fields.title}" ditambahkan ke katalog ${CATALOGS[t].nounCap}`);
  }, [dropThumb, persist, closeModal, showToast]);

  const handleImported = useCallback((t, result) => {
    setModal({ kind: 'form', tab: t, item: null, prefill: result });
    showToast(CATALOGS[t].import.okToast);
  }, [showToast]);

  /* ---- Keyboard global ---- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (modalRef.current) { closeModal(); return; }
        const t = tabRef.current;
        if (uiRef.current[t] && uiRef.current[t].selectedId) patchUi({ selectedId: null });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (searchRef.current) {
          searchRef.current.focus();
          searchRef.current.select();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal, patchUi]);

  /* ---- Render ---- */
  const counts = { game: items.game.length, software: items.software.length };
  const q = u.query.trim();
  const scope = def.categoryField && u.filterCat ? u.filterCat : def.heading;
  const head = q ? `Hasil untuk “${q}”` : scope;
  const countLabel = `${list.length} ${def.noun}`;
  const catalogEmpty = tabItems.length === 0;
  const noResults = !catalogEmpty && list.length === 0;

  return (
    <>
      <Toolbar
        tab={tab}
        onTab={switchTab}
        counts={counts}
        query={u.query}
        placeholder={def.searchPlaceholder}
        onQuery={(v) => patchUi({ query: v })}
        addLabel={def.addLabel}
        importLabel={def.import.button}
        onAdd={() => openForm(tab)}
        onImport={openImport}
        searchRef={searchRef}
      />

      {selectedItem ? (
        <DetailPanel
          item={selectedItem}
          def={def}
          onBack={showLibrary}
          onCopy={() => copyLink(selectedItem.id)}
          onOpen={() => { if (selectedItem.link) api.openExternal(selectedItem.link); }}
          onSite={(url) => api.openExternal(url)}
          onEdit={() => openForm(tab, selectedItem)}
          onDelete={() => askDelete(selectedItem.id)}
          onSaveImage={() => saveThumbImage(txt(selectedItem.thumbnail), selectedItem.title)}
        />
      ) : (
        <main id="view-library">
          <LibraryBar
            heading={head}
            count={countLabel}
            def={def}
            sort={u.sort}
            onSort={(v) => patchUi({ sort: v })}
            filterCat={u.filterCat}
            categories={categories}
            onFilterCat={(v) => patchUi({ filterCat: v })}
          />

          {catalogEmpty ? (
            <EmptyState
              title={`Katalog ${def.nounCap} masih kosong`}
              sub={def.emptySub}
              addLabel={def.emptyAddLabel}
              onAdd={() => openForm(tab)}
            />
          ) : noResults ? (
            <EmptyState
              title={`Tidak ada hasil untuk ${q ? `"${q}"` : `kategori "${u.filterCat}"`}`}
              sub="Coba kata kunci lain, kosongkan filter, atau periksa ejaan namanya."
            />
          ) : (
            <Grid
              items={list}
              def={def}
              selectedId={u.selectedId}
              onSelect={handleSelect}
              onCopy={copyLink}
              onDelete={askDelete}
            />
          )}
        </main>
      )}

      {modal && (
        <>
          <div id="modal-backdrop" onClick={closeModal} />
          {modal.kind === 'form' && (
            <EntryFormModal
              key={`form-${modal.tab}-${modal.item ? modal.item.id : 'new'}`}
              tab={modal.tab}
              item={modal.item}
              prefill={modal.prefill}
              onClose={closeModal}
              onSave={handleFormSave}
              onSaveImage={saveThumbImage}
              onToast={showToast}
            />
          )}
          {modal.kind === 'confirm' && (
            <ConfirmModal
              title={modal.title}
              message={modal.message}
              onCancel={closeModal}
              onConfirm={() => { const action = modal.onConfirm; closeModal(); if (action) action(); }}
            />
          )}
          {modal.kind === 'import' && (
            <ImportModal
              tab={modal.tab}
              onClose={closeModal}
              onImported={(result) => handleImported(modal.tab, result)}
            />
          )}
        </>
      )}

      <Toast toast={toast} />
    </>
  );
}
