import SendForm from '../components/SendForm'

export default function SendPage() {
  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] font-semibold tracking-tight">Gửi USDC</h1>
        <p className="mt-0.5 text-[12px] text-[color:var(--muted)]">
          Ký bằng Passkey · MEMO nổi bật · xác nhận tức thì
        </p>
      </header>
      <SendForm />
    </div>
  )
}
