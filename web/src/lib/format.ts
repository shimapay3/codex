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
  return `${Math.round(value).toLocaleString('vi-VN')} (₫/∞)`
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
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Try popup approach — works in restricted browsers / Telegram WebView
  const popup = window.open('', '_blank')
  if (popup) {
    popup.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;padding:24px;max-width:600px;margin:0 auto;text-align:center}
        .btn{display:inline-block;padding:12px 28px;border-radius:12px;background:#22e07a;color:#fff;text-decoration:none;font-weight:600;font-size:15px;margin:12px 0}
        textarea{width:100%;height:200px;margin-top:12px;font-size:11px;font-family:monospace;border:1px solid #ddd;border-radius:8px;padding:8px;resize:vertical}
        p{color:#666;font-size:13px}
      </style></head><body>
      <h3>📄 ${filename}</h3>
      <a class="btn" href="${url}" download="${filename}">⬇ Tải xuống file</a>
      <p>Nếu nút trên không hoạt động, hãy sao chép nội dung bên dưới:</p>
      <textarea readonly onclick="this.select()">${escaped}</textarea>
      </body></html>`)
    popup.document.close()
    // Auto-trigger download in popup
    const link = popup.document.createElement('a')
    link.href = url
    link.download = filename
    popup.document.body.appendChild(link)
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
    return
  }

  // Fallback: in-page download
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
