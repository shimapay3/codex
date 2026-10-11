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
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
}

export function formatVnd(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')} ₫`
}

export function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  return new Promise((resolve) => {
    const area = document.createElement('textarea')
    area.value = value
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand('copy')
    } catch {
      /* ignore */
    }
    document.body.removeChild(area)
    resolve()
  })
}

export function downloadTextFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
