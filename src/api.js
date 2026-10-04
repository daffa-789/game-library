// api.js
// Jembatan tipis ke window.softgame yang disediakan preload Electron. Tiap
// fungsi memakai implementasi asli bila ada, atau fallback aman supaya UI tidak
// crash ketika sebuah method belum tersedia.

const bridge = () => (typeof window !== 'undefined' && window.softgame ? window.softgame : {});
const has = (name) => typeof bridge()[name] === 'function';

// Panggil method bridge; kalau tidak ada, jalankan fallback.
function invoke(name, args, fallback) {
  if (has(name)) {
    try {
      return Promise.resolve(bridge()[name](...args));
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return fallback();
}

// ---- Katalog game ----
export function loadLibrary() {
  return invoke('loadLibrary', [], () => Promise.resolve([]));
}
export function saveLibrary(games) {
  return invoke('saveLibrary', [games], () => Promise.resolve());
}
export function steamSearch(term) {
  return invoke('steamSearch', [term], () => Promise.resolve([]));
}
export function steamImport(url) {
  return invoke('steamImport', [url], () => Promise.reject(new Error('Fitur impor Steam tidak tersedia.')));
}

// ---- Katalog software ----
export function loadSoftware() {
  return invoke('loadSoftware', [], () => Promise.resolve([]));
}
export function saveSoftware(items) {
  return invoke('saveSoftware', [items], () => Promise.resolve());
}
export function importSoftware(url) {
  return invoke('importSoftware', [url], () => Promise.reject(new Error('Fitur impor software tidak tersedia.')));
}

// ---- Dipakai kedua katalog ----
export function pickThumbnail() {
  return invoke('pickThumbnail', [], () => Promise.resolve(''));
}
export function saveThumbnail(ref, suggestedName) {
  return invoke('saveThumbnail', [ref, suggestedName], () => Promise.resolve(''));
}
export function deleteThumbnail(ref) {
  return invoke('deleteThumbnail', [ref], () => Promise.resolve());
}
export function openExternal(url) {
  return invoke('openExternal', [url], () => {
    if (typeof window !== 'undefined' && url) window.open(url, '_blank', 'noreferrer');
    return Promise.resolve();
  });
}
export function copyText(text) {
  return invoke('copyText', [text], () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) return navigator.clipboard.writeText(text);
    return Promise.resolve();
  });
}
export function restoreWindow() {
  return invoke('restoreWindow', [], () => Promise.resolve());
}

// Ubah referensi thumbnail lokal menjadi URL protokol Electron (thumb://local).
// Remote (http/https), data:, dan kosong dibiarkan apa adanya.
export function thumbSrc(ref) {
  const v = ref == null ? '' : String(ref);
  if (!v) return '';
  if (v.startsWith('/thumbnails/')) return 'thumb://local/' + v.slice('/thumbnails/'.length);
  if (v.startsWith('glib://thumb/')) return 'thumb://local/' + v.slice('glib://thumb/'.length);
  if (v.startsWith('slib://thumb/')) return 'thumb://local/' + v.slice('slib://thumb/'.length);
  return v;
}
