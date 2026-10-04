// Toast.jsx
// Notifikasi bawah. Selalu terpasang di DOM supaya transisi CSS tetap jalan;
// hanya kelas "show" yang ditoggle, persis seperti perilaku lama.
export default function Toast({ toast }) {
  const msg = toast ? toast.msg : '';
  const cls = 'toast' + (toast && toast.show ? ' show' : '') + (toast && toast.error ? ' error' : '');
  return <div id="toast" className={cls}>{msg}</div>;
}
