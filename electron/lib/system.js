// ---------------------------------------------------------------------------
// Backend API: Integrasi Sistem (Browser & Clipboard)
// ---------------------------------------------------------------------------
import { shell, clipboard } from 'electron'

// openExternal hanya mengizinkan skema http/https supaya aplikasi tidak pernah
// jadi jalan masuk untuk meluncurkan protokol berbahaya dari data yang diimpor.
export async function openExternal(urlStr) {
  const trimmed = String(urlStr ?? '').trim()
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('URL tidak valid')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL tidak valid')
  }
  if (!parsed.hostname) throw new Error('URL tidak valid')
  await shell.openExternal(parsed.toString())
}

export function copyText(text) {
  clipboard.writeText(String(text ?? ''))
}
