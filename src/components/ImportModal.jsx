// ImportModal.jsx
// Impor otomatis: Steam untuk game (dengan pencarian judul), halaman resmi
// untuk software. Hasil impor dikirim ke pemanggil untuk mengisi form entri.
import { useEffect, useRef, useState } from 'react';
import { CATALOGS } from '../constants';
import { steamSearch, steamImport, importSoftware, thumbSrc } from '../api';
import { CloseIcon } from '../icons';

export default function ImportModal({ tab, onClose, onImported }) {
  const def = CATALOGS[tab];
  const conf = def.import;
  const isSteam = conf.kind === 'steam';

  const [url, setUrl] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  // mode: null | 'search' | 'fetch' — mengunci tombol yang sedang bekerja.
  const [mode, setMode] = useState(null);

  const urlRef = useRef(null);
  useEffect(() => {
    const id = setTimeout(() => urlRef.current && urlRef.current.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  // Pencarian judul di Steam (jalur utama untuk game baru rilis).
  async function fetchSteamSearch() {
    const term = url.trim();
    if (!term) {
      setStatus('Ketik nama game dulu untuk dicari.');
      return;
    }
    setResults([]);
    setStatus('');
    setMode('search');
    try {
      const items = await steamSearch(term);
      setResults(Array.isArray(items) ? items : []);
      if (!items || !items.length) setStatus('Tidak ada hasil. Coba kata kunci lain.');
    } catch (err) {
      setStatus((err && err.message) ? err.message : 'Pencarian gagal. Coba lagi.');
    } finally {
      setMode(null);
    }
  }

  // Impor memakai URL/appid terpilih, lalu serahkan hasilnya ke pemanggil.
  async function runImport(value) {
    setMode('fetch');
    setStatus('');
    try {
      const result = isSteam ? await steamImport(value) : await importSoftware(value);
      onImported(result);
    } catch (err) {
      setStatus((err && err.message) ? err.message : conf.failToast);
      setMode(null);
    }
  }

  async function fetchImport() {
    const value = url.trim();
    if (!value) {
      setStatus(conf.needUrl);
      return;
    }
    // Kalau input bukan link (mis. user mengetik nama game), arahkan ke
    // pencarian — bukan error "link tidak dikenali".
    const looksLikeURL = /^https?:\/\//i.test(value) || /steampowered\.com/i.test(value);
    if (!looksLikeURL && isSteam) {
      fetchSteamSearch();
      return;
    }
    runImport(value);
  }

  function importByAppID(appId) {
    runImport(`https://store.steampowered.com/app/${appId}/`);
  }

  const searching = mode === 'search';
  const fetching = mode === 'fetch';

  return (
    <div className="modal small" id="modal-import">
      <div className="modal-head">
        <h2 id="import-title">{conf.title}</h2>
        <button className="icon-btn" id="import-close" title="Tutup" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="modal-body">
        <div className="field">
          <label id="import-label" htmlFor="import-url">{conf.label}</label>
          <input
            ref={urlRef}
            id="import-url"
            type="text"
            placeholder={conf.placeholder}
            spellCheck="false"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchImport(); }}
          />
        </div>

        {/* Petunjuk + tombol Cari hanya relevan untuk Steam. */}
        {isSteam && (
          <p id="import-hint" className="import-hint">
            Tempel link Steam Store, atau ketik <strong>nama game</strong> lalu tekan Cari untuk menemukan judul yang baru rilis.
          </p>
        )}

        {results.length > 0 && (
          <div id="import-results" className="import-results">
            {results.map((it) => (
              <button
                key={it.appId}
                type="button"
                className="import-result"
                onClick={() => importByAppID(it.appId)}
              >
                {it.thumbnail && <img src={thumbSrc(it.thumbnail)} alt="" loading="lazy" />}
                <span className="ir-body">
                  <span className="ir-title">{it.title}</span>
                  <span className="ir-meta">AppID {it.appId}</span>
                </span>
                {it.price && <span className="ir-price">{it.price}</span>}
              </button>
            ))}
          </div>
        )}

        {status && <p id="import-status" className="error-text">{status}</p>}
      </div>

      <div className="modal-foot">
        {isSteam && (
          <button className="btn ghost" id="import-search" disabled={searching} onClick={fetchSteamSearch}>
            {searching ? 'Mencari...' : 'Cari'}
          </button>
        )}
        <button className="btn ghost" id="import-cancel" onClick={onClose}>Batal</button>
        <button className="btn green" id="import-fetch" disabled={fetching} onClick={fetchImport}>
          {fetching ? 'Mengambil...' : conf.fetchLabel}
        </button>
      </div>
    </div>
  );
}
