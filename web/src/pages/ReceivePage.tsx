import ReceivePanel from '../components/ReceivePanel'

export default function ReceivePage() {
  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] font-semibold tracking-tight">Nhận USDC</h1>
        <p className="mt-0.5 text-[12px] text-[color:var(--muted)]">
          Quét QR hoặc chia sẻ địa chỉ ví của bạn
        </p>
      </header>
      <ReceivePanel />
    </div>
  )
}
