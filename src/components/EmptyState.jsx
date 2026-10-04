// EmptyState.jsx
// Keadaan kosong: dipakai untuk katalog yang benar-benar kosong (dengan tombol
// tambah) maupun untuk pencarian/filter yang tidak menemukan hasil.
export default function EmptyState({ title, sub, addLabel, onAdd }) {
  return (
    <div id="empty" className="empty">
      <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="#3d5a75" strokeWidth="2.5" strokeLinecap="round">
        <rect x="6" y="18" width="52" height="30" rx="10" />
        <line x1="18" y1="28" x2="18" y2="38" />
        <line x1="13" y1="33" x2="23" y2="33" />
        <circle cx="42" cy="30" r="2.6" fill="#3d5a75" stroke="none" />
        <circle cx="49" cy="36" r="2.6" fill="#3d5a75" stroke="none" />
      </svg>
      <h3 id="empty-title">{title}</h3>
      <p id="empty-sub">{sub}</p>
      {onAdd && (
        <button id="btn-empty-add" className="btn green" onClick={onAdd}>
          {addLabel}
        </button>
      )}
    </div>
  );
}
