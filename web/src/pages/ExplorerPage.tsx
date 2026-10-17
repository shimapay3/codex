import { useSearchParams } from 'react-router-dom'
import ExplorerFrame from '../components/ExplorerFrame'

export default function ExplorerPage() {
  const [params] = useSearchParams()
  const tx = params.get('tx') || ''

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] font-semibold tracking-tight">Kiểm tra giao dịch</h1>
        <p className="mt-0.5 text-[12px] text-[color:var(--muted)]">
          Explorer Solana gắn trực tiếp với Cloud Chain RPC
        </p>
      </header>
      <ExplorerFrame initialQuery={tx} />
    </div>
  )
}
