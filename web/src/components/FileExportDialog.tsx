import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, FileCheck2, FolderDown, Loader2, ShieldAlert, X } from 'lucide-react'
import { copyToClipboard } from '../lib/format'
import { ExportRequest, finishFileExport, getExportRequest, getSaveMethod, saveExportFile, subscribeExport, verifyExportFile } from '../lib/fileExport'

function ExportDialog({ request }: { request: ExportRequest }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const method = getSaveMethod(request)

  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement as HTMLElement | null
    element.showModal()
    return () => {
      element.close()
      previousFocus?.focus()
    }
  }, [])

  const save = async (selectedMethod = method) => {
    setBusy(true)
    setError('')
    try {
      // No async work before this call: preserve the user's activation for Safari.
      const result = await saveExportFile(request, selectedMethod)
      setAttempted(true)
      if (result === 'saved') {
        finishFileExport(true)
        return
      }
      setStatus(result === 'shared'
        ? 'Đã đóng bảng lưu/chia sẻ. Chọn lại file đã lưu để xác minh; đóng bảng chia sẻ chưa chứng minh file đã được lưu.'
        : 'Đã yêu cầu trình duyệt tải file. Kiểm tra Tệp / Downloads rồi chọn lại file để xác minh.')
    } catch (err: any) {
      if (err?.name === 'AbortError') setStatus('Bạn đã huỷ lưu file. Chưa có backup được xác minh.')
      else setError('Không mở được chức năng lưu. Thử “Tải trực tiếp”; nếu vẫn bị chặn, mở ứng dụng trong Safari/Chrome và thử lại. Không gửi khoá qua tin nhắn.')
    } finally {
      setBusy(false)
    }
  }

  const verify = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      if (!await verifyExportFile(file, request)) {
        setError('File không khớp. Hãy chọn đúng file vừa lưu, không chọn file của ví khác.')
        return
      }
      finishFileExport(true)
    } catch {
      setError('Không đọc được file. Vui lòng chọn lại file đã lưu.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <dialog ref={dialog} aria-labelledby="file-export-title" aria-describedby="file-export-help"
      onCancel={(event) => { event.preventDefault(); if (!busy) finishFileExport(false) }}
      className="file-export-dialog w-[calc(100%-2rem)] max-w-md rounded-[28px] border border-[color:var(--border)] bg-[color:var(--bg-soft)] p-5 text-[color:var(--text)] shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-strong)]"><FolderDown size={22} className="text-[color:var(--accent)]" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="file-export-title" className="text-[16px] font-semibold">Lưu file an toàn</h2>
          <p className="mt-1 break-all text-[11px] text-[color:var(--muted)]">{request.filename}</p>
        </div>
        <button type="button" aria-label="Đóng lưu file" disabled={busy} onClick={() => finishFileExport(false)} className="rounded-xl p-2 hover:bg-[color:var(--surface)]"><X size={18} /></button>
      </div>
      <p id="file-export-help" className="text-[12px] leading-relaxed text-[color:var(--muted)]">
        {method === 'share' ? 'Trên iPhone/iPad: bấm Lưu vào Tệp, chọn “Lưu vào Tệp” (Save to Files), chọn thư mục rồi Lưu. Đây là file đính kèm, không phải nội dung tin nhắn.'
          : method === 'picker' ? 'Chọn thư mục trên thiết bị. Ứng dụng ghi file và đọc lại để kiểm tra nội dung.'
          : 'Bấm Tải file để lưu bằng trình quản lý tải xuống của trình duyệt. Trên iPhone/iPad, kiểm tra ứng dụng Tệp → Downloads.'}
      </p>
      {request.sensitive && <div className="mt-4 flex gap-2.5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-[12px] leading-relaxed">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
        <p><b>File chứa khoá khôi phục ví.</b> Ai có file có thể lấy toàn bộ tiền. Ưu tiên lưu “Trên iPhone của tôi” hoặc nơi riêng tư; không chọn người nhận, Telegram, email hay thư mục dùng chung. File không được ứng dụng gửi lên máy chủ.</p>
      </div>}
      <button type="button" disabled={busy} onClick={() => void save()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl accent-gradient py-3.5 text-[14px] font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" /> : <FolderDown size={17} />}
        {method === 'share' ? 'Lưu vào Tệp' : method === 'picker' ? 'Chọn nơi lưu file' : 'Tải file'}
      </button>
      {method !== 'download' && <button type="button" disabled={busy} onClick={() => void save('download')} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--border)] py-3 text-[12px] font-semibold"><Download size={15} /> Tải trực tiếp</button>}
      {status && <p role="status" className="mt-3 text-[12px] leading-relaxed text-[color:var(--muted)]">{status}</p>}
      {error && <p role="alert" className="mt-3 text-[12px] leading-relaxed">⚠ {error}</p>}
      {attempted && <div className="mt-4 rounded-2xl border border-[color:var(--border)] p-3">
        <p className="mb-2 text-[12px] leading-relaxed">Để xác minh đã lưu thành công, mở lại đúng file từ thiết bị. Việc kiểm tra chỉ diễn ra trên máy, không tải file lên mạng.</p>
        <input ref={input} type="file" className="hidden" aria-label="File vừa lưu để xác minh" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void verify(file) }} />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--surface-strong)] py-3 text-[12px] font-semibold"><FileCheck2 size={16} /> Chọn file đã lưu để kiểm tra</button>
      </div>}
      <details className="mt-4 text-[11px] text-[color:var(--muted)]">
        <summary className="cursor-pointer py-2">Xem / sao chép nội dung (không thay thế backup)</summary>
        <textarea aria-label="Nội dung file" readOnly value={request.content} autoComplete="off" spellCheck={false} className="mt-2 h-32 w-full resize-y rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 font-mono text-[11px] text-[color:var(--text)]" />
        <button type="button" onClick={async () => { try { await copyToClipboard(request.content); setCopied(true) } catch { setError('Không sao chép được. Chọn nội dung và sao chép thủ công.') } }} className="mt-2 flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] px-3 py-2 font-semibold">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Đã sao chép' : 'Sao chép nội dung'}</button>
      </details>
    </dialog>, document.body,
  )
}

export default function FileExportDialog() {
  const request = useSyncExternalStore(subscribeExport, getExportRequest)
  // Recreate per request so old file content/status never survives a new export.
  return request ? <ExportDialog key={request.id} request={request} /> : null
}
