import { useState } from 'react'
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { WalletRecord } from '../state/vault'
import { downloadTextFile } from '../lib/format'
import SpaceBackdrop from './SpaceBackdrop'

export default function WalletBackupGate({ wallet }: { wallet: WalletRecord }) {
  const { exportSecrets, confirmWalletBackup } = useWallet()
  const [verified, setVerified] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return <>
    <SpaceBackdrop />
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-[28px] glass-strong p-5">
        <ShieldCheck size={36} className="mb-4 text-[color:var(--accent)]" />
        <h1 className="text-[21px] font-semibold">Bắt buộc sao lưu ví</h1>
        <p className="mt-2 text-[13px] text-[color:var(--muted)]">Ví “{wallet.name}” đã được tạo/nhập. Lưu và kiểm tra file backup trước khi tiếp tục.</p>
        <p className="mt-3 break-all rounded-2xl bg-[color:var(--surface)] p-3 font-mono text-[11px]">{wallet.address}</p>
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[color:var(--border)] p-3 text-[12px] leading-relaxed">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
          <p><b>QUAN TRỌNG:</b> Mất khoá hoặc xoá dữ liệu khi chưa backup có thể mất ví và tiền vĩnh viễn. File chứa khoá bí mật khôi phục được cả ví tạo từ passphrase. PIN/Telegram không thay thế backup. Không đóng ứng dụng trước khi lưu file. Không chia sẻ file cho bất kỳ ai.</p>
        </div>
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true)
          setError('')
          try {
            const saved = await downloadTextFile(`cloudpay-${wallet.address}.json`, exportSecrets(wallet.id), 'application/json', true)
            if (saved) setVerified(true)
          } catch { setError('Không xuất được backup. Vui lòng thử lại.') }
          finally { setBusy(false) }
        }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl accent-gradient py-3.5 text-[13px] font-semibold text-white disabled:opacity-50"><Download size={16} />{verified ? 'Lưu lại file backup' : '1. Lưu & kiểm tra file backup'}</button>
        {verified && <p role="status" className="mt-3 flex items-center gap-2 text-[12px]"><ShieldCheck size={16} /> File backup đã được đọc lại và khớp nội dung.</p>}
        <label className="mt-4 flex items-start gap-3 text-[12px] leading-relaxed">
          <input type="checkbox" checked={acknowledged} disabled={!verified} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
          <span>Tôi đã lưu backup ở nơi an toàn và hiểu rằng mất file/khoá có thể mất toàn bộ tiền.</span>
        </label>
        {error && <p role="alert" className="mt-3 text-[12px]">{error}</p>}
        <button type="button" disabled={!verified || !acknowledged || busy} onClick={async () => {
          setBusy(true)
          try { await confirmWalletBackup(wallet.id) }
          catch { setError('Chưa lưu được trạng thái backup. Vui lòng thử lại.'); setBusy(false) }
        }} className="mt-5 w-full rounded-2xl border border-[color:var(--border)] py-3.5 text-[13px] font-semibold disabled:opacity-40">2. Tôi đã backup — tiếp tục</button>
      </div>
    </main>
  </>
}
