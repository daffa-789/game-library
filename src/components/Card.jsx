// Card.jsx
// Satu kartu katalog. Dibungkus React.memo supaya kartu yang datanya tidak
// berubah tidak digambar ulang saat daftar difilter atau diketik.
import { memo } from 'react';
import { PLACEHOLDER_IMG } from '../constants';
import { thumbSrc } from '../api';
import { CopyIcon, TrashIcon } from '../icons';

function Card({ item, sub, selected, onSelect, onCopy, onDelete }) {
  const src = thumbSrc(item.thumbnail) || PLACEHOLDER_IMG;

  // Ganti ke placeholder kalau gambar gagal dimuat (sekali saja).
  const handleImgError = (e) => {
    if (e.currentTarget.src !== PLACEHOLDER_IMG) e.currentTarget.src = PLACEHOLDER_IMG;
  };

  return (
    <div className={`card${selected ? ' selected' : ''}`} onClick={() => onSelect(item.id)}>
      <div className="capsule">
        <img loading="lazy" decoding="async" alt={item.title || ''} src={src} onError={handleImgError} />
        <div className="cap-overlay">
          <div className="cap-actions">
            <button
              className="btn-copy"
              onClick={(e) => { e.stopPropagation(); onCopy(item.id); }}
            >
              <CopyIcon /> Copy Link
            </button>
            <button
              className="btn-card-del"
              title="Hapus dari library"
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      </div>
      <div className="card-title">{item.title || ''}</div>
      <div className="card-sub">{sub}</div>
    </div>
  );
}

export default memo(Card);
