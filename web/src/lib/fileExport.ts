export type ExportRequest = {
  id: number
  filename: string
  content: string
  mime: string
  sensitive: boolean
}

export type SaveMethod = 'picker' | 'share' | 'download'
type FileHandle = {
  createWritable: () => Promise<{ write: (file: File) => Promise<void>; close: () => Promise<void> }>
  getFile: () => Promise<File>
}
type SaveWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileHandle> }

let nextId = 0
let current: ExportRequest | null = null
let resolveExport: ((verified: boolean) => void) | null = null
const listeners = new Set<() => void>()

export function subscribeExport(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function getExportRequest() { return current }

/** Export data stays in memory. Never send wallet backups to a server or Telegram bot. */
export function requestFileExport(filename: string, content: string, mime = 'application/json', sensitive = false): Promise<boolean> {
  finishFileExport(false)
  return new Promise((resolve) => {
    current = { id: ++nextId, filename, content, mime, sensitive }
    resolveExport = resolve
    listeners.forEach((listener) => listener())
  })
}

export function finishFileExport(verified: boolean) {
  const resolve = resolveExport
  current = null
  resolveExport = null
  resolve?.(verified)
  listeners.forEach((listener) => listener())
}

export function exportFile(request: ExportRequest): File {
  return new File([request.content], request.filename, { type: request.mime })
}

export function getSaveMethod(request: ExportRequest): SaveMethod {
  if ((window as SaveWindow).showSaveFilePicker) return 'picker'
  try {
    if (navigator.canShare?.({ files: [exportFile(request)] }) && navigator.share) return 'share'
  } catch { /* Unsupported file types use the browser download instead. */ }
  return 'download'
}

/** Call directly from the button gesture: native pickers/shares need transient user activation. */
export async function saveExportFile(request: ExportRequest, method: SaveMethod): Promise<'saved' | 'shared' | 'requested'> {
  const file = exportFile(request)
  if (method === 'picker') {
    const handle = await (window as SaveWindow).showSaveFilePicker!({ suggestedName: request.filename })
    const writable = await handle.createWritable()
    await writable.write(file)
    await writable.close()
    if ((await (await handle.getFile()).text()) !== request.content) throw new Error('File lưu không khớp nội dung. Vui lòng thử lại.')
    return 'saved'
  }
  if (method === 'share') {
    // Share a real FILE, not text or a remote URL. On iOS choose “Save to Files”.
    await navigator.share({ files: [file] })
    return 'shared'
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = request.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Leave enough time for Safari's download manager to read the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  return 'requested'
}

export async function verifyExportFile(file: File, request: ExportRequest): Promise<boolean> {
  if (file.size > new Blob([request.content]).size + 3) return false
  return (await file.text()).replace(/^\uFEFF/, '') === request.content
}
