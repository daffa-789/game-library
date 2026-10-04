// DetailPanel.jsx
// Halaman detail entri: hero dengan cover + aksi link, lalu panel bawah yang
// berbeda antara game (tabel spesifikasi) dan software (ringkasan metadata).
import { PLACEHOLDER_IMG, isStoredThumb, txt } from '../constants';
import { thumbSrc } from '../api';
import { BackIcon, LinkIcon, ExternalIcon, SaveIcon, EditIcon, TrashIcon } from '../icons';

// Satu baris label/nilai spesifikasi.
function ReqRow({ label, value }) {
  return (
    <div className="req-row">
      <span className="req-lbl">{label}:</span>
      <span className="req-val">{value}</span>
    </div>
  );
}

// Satu kolom spesifikasi (MINIMUM / RECOMMENDED). Baris kosong tidak ditampilkan;
// kalau seluruh kolom kosong, tampilkan penanda "Belum diisi".
function SpecColumn({ head, spec, fields }) {
  const rows = fields.filter(([key]) => txt(spec && spec[key]).trim());
  return (
    <div className="req-col">
      <div className="req-head">{head}</div>
      {rows.length ? (
        rows.map(([key, label]) => <ReqRow key={key} label={label} value={spec[key]} />)
      ) : (
        <div className="req-empty">Belum diisi</div>
      )}
    </div>
  );
}

// Isi panel bawah, mengikuti bentuk objek dari def.detailPanel(item).
function PanelBody({ panel }) {
  if (panel.columns) {
    return (
      <div className="sysreq">
        {panel.columns.map(([head, spec]) => (
          <SpecColumn key={head} head={head} spec={spec} fields={panel.fields} />
        ))}
      </div>
    );
  }
  if (panel.empty) {
    return (
      <div className="sysreq">
        <div className="req-all-empty">{panel.empty}</div>
      </div>
    );
  }
  if (!panel.rows || !panel.rows.length) {
    return (
      <div className="sysreq single">
        <div className="req-all-empty">Metadata software belum diisi lengkap. Klik Edit untuk menambahkan.</div>
      </div>
    );
  }
  return (
    <div className="sysreq single">
      <div className="req-col">
        {panel.rows.map(([label, value]) => (
          <ReqRow key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

export default function DetailPanel({ item, def, onBack, onCopy, onOpen, onSite, onEdit, onDelete, onSaveImage }) {
  const chips = def.chips(item);
  const src = thumbSrc(item.thumbnail) || PLACEHOLDER_IMG;
  const site = def.websiteField ? txt(item[def.websiteField]).trim() : '';
  const panel = def.detailPanel(item);

  const handleImgError = (e) => {
    if (e.currentTarget.src !== PLACEHOLDER_IMG) e.currentTarget.src = PLACEHOLDER_IMG;
  };

  return (
    <section id="view-detail">
      <div className="detail-hero">
        <div className="hero-bg" style={{ backgroundImage: `url('${src}')` }} />
        <button className="btn ghost d-back" id="d-back" onClick={onBack}>
          <BackIcon />
          Kembali
        </button>

        <div className="hero-content">
          <img className="hero-capsule" src={src} alt={txt(item.title)} decoding="async" onError={handleImgError} />
          <div className="hero-info">
            <h1>{txt(item.title)}</h1>

            <div className="chips">
              {chips.map(([cls, text], i) => (
                <span key={i} className={cls}>{text}</span>
              ))}
            </div>

            <div className="dl-panel">
              <div className="dl-label">{def.linkLabel}</div>
              <div className="dl-row">
                <div className="dl-link" title={txt(item.link)}>
                  {txt(item.link) ? item.link : '— belum ada link —'}
                </div>
                <button className="btn green big" id="d-copy" onClick={onCopy}>
                  <LinkIcon /> Copy Link
                </button>
                <button className="btn ghost" id="d-open" onClick={onOpen} disabled={!item.link}>
                  <ExternalIcon />
                  Buka di Browser
                </button>
              </div>
            </div>

            {site && (
              <div className="site-row">
                <span className="site-label">Situs resmi</span>
                <a
                  className="site-link"
                  id="d-site"
                  href="#"
                  rel="noreferrer"
                  onClick={(e) => { e.preventDefault(); onSite(site); }}
                >
                  {site}
                </a>
              </div>
            )}

            <div className="detail-actions">
              <button className="btn ghost" id="d-save-img" onClick={onSaveImage} disabled={!isStoredThumb(txt(item.thumbnail))}>
                <SaveIcon />
                Simpan Gambar
              </button>
              <button className="btn ghost" id="d-edit" onClick={onEdit}>
                <EditIcon />
                Edit
              </button>
              <button className="btn danger" id="d-delete" onClick={onDelete}>
                <TrashIcon size={14} />
                Hapus
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="detail-body">
        <h2 className="sec-title">{panel.title}</h2>
        <PanelBody panel={panel} />
      </div>
    </section>
  );
}
