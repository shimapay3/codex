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

  // In-app modal overlay — works in Telegram WebView and restricted browsers
  const overlay = document.createElement('div')
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif'

  const card = document.createElement('div')
  card.style.cssText =
    'background:#1a1a2e;color:#e0e0e0;border-radius:20px;padding:20px;max-width:460px;width:100%;max-height:85vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4)'

  const title = document.createElement('h3')
  title.textContent = '📄 ' + filename
  title.style.cssText = 'margin:0 0 8px;font-size:15px;font-weight:600;word-break:break-all'

  const hint = document.createElement('p')
  hint.textContent = 'Sao chép nội dung bên dưới hoặc bấm Tải xuống:'
  hint.style.cssText = 'margin:0 0 12px;font-size:12px;color:#999'

  const ta = document.createElement('textarea')
  ta.readOnly = true
  ta.value = content
  ta.style.cssText =
    'width:100%;height:180px;font-size:11px;font-family:monospace;border:1px solid #333;border-radius:10px;padding:10px;background:#111;color:#ccc;resize:vertical;box-sizing:border-box'

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:10px;margin-top:14px'

  const copyBtn = document.createElement('button')
  copyBtn.textContent = '📋 Sao chép'
  copyBtn.style.cssText =
    'flex:1;padding:12px;border:none;border-radius:12px;background:#333;color:#fff;font-size:13px;font-weight:600;cursor:pointer'

  const dlBtn = document.createElement('button')
  dlBtn.textContent = '⬇ Tải xuống'
  dlBtn.style.cssText =
    'flex:1;padding:12px;border:none;border-radius:12px;background:#22e07a;color:#fff;font-size:13px;font-weight:600;cursor:pointer'

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕ Đóng'
  closeBtn.style.cssText =
    'flex:1;padding:12px;border:none;border-radius:12px;background:#555;color:#fff;font-size:13px;font-weight:600;cursor:pointer'

  const cleanup = () => {
    if (overlay.parentNode) document.body.removeChild(overlay)
    URL.revokeObjectURL(url)
  }

  copyBtn.onclick = async () => {
    ta.select()
    try {
      await navigator.clipboard?.writeText(content)
    } catch {
      document.execCommand('copy')
    }
    copyBtn.textContent = '✅ Đã sao chép'
    setTimeout(() => (copyBtn.textContent = '📋 Sao chép'), 2000)
  }

  dlBtn.onclick = () => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  closeBtn.onclick = cleanup
  overlay.onclick = (e) => { if (e.target === overlay) cleanup() }

  btnRow.appendChild(copyBtn)
  btnRow.appendChild(dlBtn)
  btnRow.appendChild(closeBtn)
  card.appendChild(title)
  card.appendChild(hint)
  card.appendChild(ta)
  card.appendChild(btnRow)
  overlay.appendChild(card)
  document.body.appendChild(overlay)
}
