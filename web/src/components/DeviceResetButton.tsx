import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'

export default function DeviceResetButton({ label = 'Xoá dữ liệu trên thiết bị' }: { label?: string }) {
  const { resetDevice, pushToast } = useWallet()
  const [confirm, setConfirm] = useState(false)
  return <div className="space-y-2">
    <button type="button" aria-expanded={confirm} onClick={() => setConfirm(!confirm)}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ff6b81]/40 py-3 text-[13px] font-semibold text-[color:var(--text)]">
      <Trash2 size={15} /> {confirm ? 'Huỷ xoá dữ liệu' : label}
    </button>
    {confirm && <div className="space-y-3 rounded-2xl border border-[#ff6b81]/40 bg-[color:var(--surface)] p-3">
      <p className="text-[12px] leading-relaxed">
        Toàn bộ ví, khoá bí mật đã mã hoá, PIN, danh bạ và cài đặt của ứng dụng trên thiết bị sẽ bị xoá.
        <b className="mt-1 block">⚠ Chỉ tiếp tục khi bạn đã lưu và kiểm tra file backup của TẤT CẢ ví.</b>
        Không có backup có thể mất quyền truy cập ví vĩnh viễn. Tiền trên blockchain và dữ liệu đồng bộ đám mây không bị xoá; giới hạn ví/airdrop theo định danh vẫn giữ nguyên.
      </p>
      <button type="button" onClick={() => {
        try { resetDevice() }
        catch { pushToast({ tone: 'error', title: 'Chưa xoá được dữ liệu', body: 'Trình duyệt chặn bộ nhớ. Vui lòng thử lại.' }) }
      }} className="w-full rounded-2xl bg-[#ff6b81] px-3 py-3 text-[13px] font-semibold text-[#10142c]">
        Tôi đã backup — xoá toàn bộ dữ liệu
      </button>
    </div>}
  </div>
}
