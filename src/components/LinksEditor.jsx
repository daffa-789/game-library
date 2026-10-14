// LinksEditor.jsx
// Editor daftar link unduhan (mirror). Satu baris = satu layanan penyimpanan
// (Gofile, PixelDrain, Google Drive, MEGA, ...). Menambah, mengubah, dan
// menghapus baris semuanya dilakukan dari sini; hasilnya disimpan sebagai
// item.links (lihat cleanLinks di constants.js).
import { useMemo } from 'react';
import { MAX_LINKS, isValidLinkURL } from '../constants';
import { guessLinkLabel } from '../api';
import { AddIcon, TrashIcon } from '../icons';

// blankRow satu baris kosong yang siap diisi.
const blankRow = () => ({ label: '', url: '' });

export default function LinksEditor({ def, links, onChange, invalid, firstUrlRef, onEnter, onToast }) {
  // Selalu tampilkan minimal satu baris supaya URL bisa langsung ditempel
  // tanpa harus menekan "Tambah Link" lebih dulu.
  const rows = links && links.length ? links : [blankRow()];

  // URL yang muncul lebih dari sekali ditandai: backend membuang duplikat,
  // jadi lebih baik diperingatkan sebelum tersimpan.
  const duplicates = useMemo(() => {
    const count = new Map();
    for (const row of rows) {
      const key = String(row.url || '').trim().toLowerCase();
      if (!key) continue;
      count.set(key, (count.get(key) || 0) + 1);
    }
    return new Set([...count.entries()].filter(([, n]) => n > 1).map(([key]) => key));
  }, [rows]);

  function update(index, patch) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (rows.length >= MAX_LINKS) {
      if (onToast) onToast(`Maksimal ${MAX_LINKS} link per entri`, true);
      return;
    }
    onChange([...rows, blankRow()]);
  }

  function removeRow(index) {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length ? next : [blankRow()]);
  }

  // Label diisi otomatis dari URL (nama layanan) bila kolom label dikosongkan.
  async function autoLabel(index, row) {
    if (String(row.label || '').trim()) return;
    if (!isValidLinkURL(row.url)) return;
    try {
      const guess = await guessLinkLabel(row.url);
      if (guess) update(index, { label: guess });
    } catch (err) {
      /* label bersifat opsional; gagal menebak tidak perlu mengganggu */
    }
  }

  return (
    <div className="field links-field">
      <label id="f-links-label">{def.linkTitle} (bisa lebih dari satu)</label>

      <div className="links-editor" id="form-links">
        {rows.map((row, i) => {
          const key = String(row.url || '').trim().toLowerCase();
          const dup = !!key && duplicates.has(key);
          const bad = !!invalid && !isValidLinkURL(row.url);

          return (
            <div className="link-row" key={i}>
              <input
                className="link-label"
                type="text"
                spellCheck="false"
                autoComplete="off"
                placeholder={def.linkLabelPlaceholder}
                aria-label={`Nama layanan link ${i + 1}`}
                value={row.label || ''}
                onChange={(e) => update(i, { label: e.target.value })}
                onBlur={() => autoLabel(i, row)}
              />
              <input
                className={`link-url${bad ? ' invalid' : ''}${dup ? ' dup' : ''}`}
                type="text"
                spellCheck="false"
                autoComplete="off"
                placeholder={def.linkUrlPlaceholder}
                aria-label={`URL link ${i + 1}`}
                value={row.url || ''}
                ref={i === 0 ? firstUrlRef : undefined}
                onChange={(e) => update(i, { url: e.target.value })}
                onBlur={() => autoLabel(i, row)}
                onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
              />
              <button
                type="button"
                className="icon-btn link-del"
                title="Hapus link ini"
                aria-label={`Hapus link ${i + 1}`}
                onClick={() => removeRow(i)}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="links-foot">
        <button type="button" className="btn ghost small" id="f-link-add" onClick={addRow}>
          <AddIcon size={13} />
          Tambah Link
        </button>
        <span className="links-hint">{def.linksHint}</span>
      </div>
    </div>
  );
}
