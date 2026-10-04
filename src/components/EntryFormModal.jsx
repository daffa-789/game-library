// EntryFormModal.jsx
// Form tambah/edit yang dibangun dari deskriptor katalog: game dan software
// memakai modal yang sama, hanya field, blok spesifikasi, dan perilaku prefill
// yang berbeda. Nilai "pending" (thumbnail & steamAppId) hanya dikomit saat simpan.
import { useEffect, useRef, useState } from 'react';
import {
  CATALOGS,
  SPEC_FIELDS,
  SPEC_PLACEHOLDER,
  PLACEHOLDER_IMG,
  isStoredThumb,
  formFields,
  txt,
} from '../constants';
import { pickThumbnail, thumbSrc } from '../api';
import { CloseIcon, ImageIcon } from '../icons';

// Nilai awal field teks: dari entri lama (edit) atau hasil impor (prefill).
function initValues(def, item, prefill) {
  const base = item || {};
  const vals = {};
  for (const f of formFields(def)) vals[f.k] = txt(base[f.k]);
  // Prefill hanya dipakai saat menambah entri baru: hasil impor tidak boleh
  // menimpa data yang sudah tersimpan.
  if (!item && prefill) {
    for (const key of def.prefillFields) {
      if (!(key in vals) || !prefill[key]) continue;
      if (def.prefillOnlyWhenEmpty && vals[key].trim()) continue;
      vals[key] = txt(prefill[key]);
    }
  }
  return vals;
}

// Nilai awal spesifikasi (hanya katalog game).
function initSpecs(def, item, prefill) {
  const out = { min: {}, rec: {} };
  if (!def.hasSpecs) return out;
  const base = (item && item.specs) || {};
  for (const side of ['min', 'rec']) {
    const s = base[side] || {};
    for (const [key] of SPEC_FIELDS) out[side][key] = txt(s[key]);
  }
  if (!item && prefill && prefill.specs) {
    for (const side of ['min', 'rec']) {
      const s = prefill.specs[side] || {};
      for (const [key] of SPEC_FIELDS) out[side][key] = txt(s[key]);
    }
  }
  return out;
}

export default function EntryFormModal({ tab, item, prefill, onClose, onSave, onSaveImage, onToast }) {
  const def = CATALOGS[tab];
  const adding = !item;

  const [values, setValues] = useState(() => initValues(def, item, prefill));
  const [specs, setSpecs] = useState(() => initSpecs(def, item, prefill));
  const [pendingThumb, setPendingThumb] = useState(() =>
    adding ? txt(prefill && prefill.thumbnail) : txt(item && item.thumbnail));
  // steamAppId dari impor tidak pernah berubah selama modal terbuka; hanya
  // dipakai saat simpan lewat def.extraFields.
  const pendingSteamAppId = (adding && prefill && prefill.appId) ? prefill.appId : '';
  const [invalid, setInvalid] = useState({});
  const [thumbBroken, setThumbBroken] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputs = useRef({});

  // Reset status "gambar rusak" setiap thumbnail berganti.
  useEffect(() => { setThumbBroken(false); }, [pendingThumb]);

  // Fokus awal: ke link kalau baru di-prefill (judul sudah terisi), selain itu ke judul.
  useEffect(() => {
    const key = (adding && prefill) ? 'link' : 'title';
    const id = setTimeout(() => {
      const el = inputs.current[key];
      if (el) el.focus();
    }, 50);
    return () => clearTimeout(id);
  }, [adding, prefill]);

  const setField = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));
  const previewSrc = thumbBroken ? PLACEHOLDER_IMG : (thumbSrc(pendingThumb) || PLACEHOLDER_IMG);

  async function handlePick() {
    try {
      const ref = await pickThumbnail();
      if (ref) setPendingThumb(ref);
    } catch (err) {
      onToast('Gagal memuat gambar', true);
    }
  }

  async function handleSave() {
    if (busy) return;
    // Nilai field dirapikan (trim) persis seperti app.js lama.
    const vals = {};
    for (const f of formFields(def)) vals[f.k] = txt(values[f.k]).trim();

    // Field wajib ditandai di deskriptor: pesan error memakai labelnya sendiri.
    const nextInvalid = {};
    let firstInvalid = null;
    for (const f of formFields(def)) {
      if (f.req && !vals[f.k]) {
        nextInvalid[f.k] = true;
        if (!firstInvalid) firstInvalid = f;
      }
    }
    if (firstInvalid) {
      setInvalid(nextInvalid);
      const el = inputs.current[firstInvalid.k];
      if (el) el.focus();
      onToast(`${firstInvalid.l.replace(' *', '')} wajib diisi`, true);
      return;
    }
    setInvalid({});
    setBusy(true);
    // pendingThumb & pendingSteamAppId baru masuk ke entri di titik ini.
    const fields = { ...vals, thumbnail: pendingThumb, ...def.extraFields(pendingSteamAppId, item) };
    if (def.hasSpecs) {
      const trimmed = { min: {}, rec: {} };
      for (const side of ['min', 'rec']) {
        for (const [key] of SPEC_FIELDS) trimmed[side][key] = txt(specs[side] && specs[side][key]).trim();
      }
      fields.specs = trimmed;
    }
    try {
      await onSave({ tab, editingId: item ? item.id : null, fields, oldThumbnail: item ? item.thumbnail : '' });
    } finally {
      setBusy(false);
    }
  }

  // Satu field teks dari deskriptor. Field link jadi tombol Enter untuk simpan.
  function fieldNode(f) {
    return (
      <div className="field" key={f.k}>
        <label htmlFor={`f-${f.k}`}>{f.l}</label>
        <input
          id={`f-${f.k}`}
          type="text"
          placeholder={f.p}
          spellCheck="false"
          autoComplete="off"
          className={invalid[f.k] ? 'invalid' : undefined}
          value={values[f.k] || ''}
          ref={(el) => { inputs.current[f.k] = el; }}
          onChange={(e) => setField(f.k, e.target.value)}
          onKeyDown={f.k === 'link' ? (e) => { if (e.key === 'Enter') handleSave(); } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="modal" id="modal-form">
      <div className="modal-head">
        <h2 id="form-title">{(adding ? 'Tambah ' : 'Edit ') + def.nounCap}</h2>
        <button className="icon-btn" id="form-close" title="Tutup" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="modal-body">
        <div id="form-fields">
          {def.formRows.map((row, i) => (
            row.length === 1
              ? fieldNode(row[0])
              : <div className="frow two" key={`row-${i}`}>{row.map(fieldNode)}</div>
          ))}
        </div>

        <div className="field thumb-field">
          <label>Thumbnail</label>
          <div className="thumb-row">
            <img
              id="f-thumb-preview"
              alt="preview thumbnail"
              src={previewSrc}
              onError={() => setThumbBroken(true)}
            />
            <div className="thumb-actions">
              <button id="f-pick" className="btn ghost" onClick={handlePick}>
                <ImageIcon />
                Pilih Gambar dari Komputer…
              </button>
              <div className="thumb-mini">
                <button
                  id="f-thumb-save"
                  className="btn ghost small"
                  disabled={!isStoredThumb(pendingThumb)}
                  onClick={() => onSaveImage(pendingThumb, values.title || '')}
                >
                  Simpan Gambar
                </button>
                <button
                  id="f-thumb-clear"
                  className="btn ghost small"
                  onClick={() => setPendingThumb('')}
                >
                  Hapus Gambar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Editor spesifikasi hanya ada untuk katalog game. */}
        {def.hasSpecs && (
          <div className="spec-editor" id="form-specs">
            {['min', 'rec'].map((side) => (
              <div className="spec-col" key={side}>
                <h3>{side === 'min' ? 'MINIMUM' : 'RECOMMENDED'}</h3>
                <div>
                  {SPEC_FIELDS.map(([key, label]) => (
                    <div className="spec-field" key={key}>
                      <label>{label}</label>
                      <input
                        type="text"
                        spellCheck="false"
                        autoComplete="off"
                        placeholder={SPEC_PLACEHOLDER[key] || ''}
                        value={(specs[side] && specs[side][key]) || ''}
                        onChange={(e) => setSpecs((prev) => ({
                          ...prev,
                          [side]: { ...prev[side], [key]: e.target.value },
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="modal-foot">
        <button className="btn ghost" id="form-cancel" onClick={onClose}>Batal</button>
        <button className="btn green" id="form-save" onClick={handleSave} disabled={busy}>
          {'Simpan ' + def.nounCap}
        </button>
      </div>
    </div>
  );
}
