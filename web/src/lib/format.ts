import { requestFileExport } from './fileExport'

export function relativeTime(timestamp?: number | null): string {
  if (!timestamp) return 'Vừa xong'
  const diff = Date.now() - timestamp * 1000
  const minute = 60000
  const hour = 3600000
  const day = 86400000
  if (diff < minute) return 'Vừa xong'
  if (diff < hour) return `${Math.floor(diff / minute)} phút trước`
  if (diff < day) return `${Math.floor(diff / hour)} giờ trước`
  if (diff < day * 7) return `${Math.floor(diff / day)} ngày trước`
  return new Date(timestamp * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

export function fullDateTime(timestamp?: number | null): string {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatUsd(value: number): string {
  return `${value.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
}

export function formatVnd(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')} (₫/∞)`
}

export async function copyToClipboard(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }
  } catch { /* Try a local selection if clipboard permissions were denied. */ }
  const area = document.createElement('textarea')
  area.value = value
  const container = document.querySelector('dialog[open]') || document.body
  container.appendChild(area)
  area.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Trình duyệt chặn sao chép')
  } finally {
    area.remove()
  }
}

/** Resolves true only after reading back a saved file with matching contents. */
export function downloadTextFile(filename: string, content: string, mime = 'application/json', sensitive = false): Promise<boolean> {
  return requestFileExport(filename, content, mime, sensitive)
}
