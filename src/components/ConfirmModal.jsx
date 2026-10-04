// ConfirmModal.jsx
// Konfirmasi sebelum tindakan merusak (hapus entri).
export default function ConfirmModal({ title, message, onCancel, onConfirm }) {
  return (
    <div className="modal small" id="modal-confirm">
      <div className="modal-head">
        <h2 id="confirm-title">{title}</h2>
      </div>
      <div className="modal-body">
        <p className="hint" id="confirm-msg">{message}</p>
      </div>
      <div className="modal-foot">
        <button className="btn ghost" id="confirm-cancel" onClick={onCancel}>Batal</button>
        <button className="btn danger" id="confirm-ok" onClick={onConfirm}>Ya, Hapus</button>
      </div>
    </div>
  );
}
