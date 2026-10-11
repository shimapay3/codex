import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, QrCode, Share2, ShieldCheck } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { copyToClipboard, downloadTextFile } from '../lib/format'
import UsdcAvatar from './UsdcAvatar'
import { USDC_MINT } from '../lib/solana'

/**
 * Receive screen: QR + address so a sender can scan in one step. The QR holds
 * the wallet address, the same value shown underneath for manual entry.
 */
export default function ReceivePanel() {
  const { activeWallet, pushToast, prefs } = useWallet()
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const address = activeWallet?.address || ''

  useEffect(() => {
    if (!address) return
    let cancelled = false
    QRCode.toDataURL(address, {
      width: 720,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#05060f', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQr(url)
      })
      .catch(() => setQr(null))
    return () => {
      cancelled = true
    }
  }, [address])

  const shareText = useMemo(
    () => `Ví Cloud Pay của tôi (Cloud Chain)\n${address}\nChỉ gửi USDC trên mạng Cloud Chain.`,
    [address],
  )

  const handleCopy = async () => {
    await copyToClipboard(address)
    setCopied(true)
    pushToast({ tone: 'success', title: 'Đã sao chép địa chỉ ví' })
    setTimeout(() => setCopied(false), 1600)
  }

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Địa chỉ ví Cloud Pay', text: shareText })
        return
      }
    } catch {
      /* user dismissed the sheet */
    }
    await copyToClipboard(shareText)
    pushToast({ tone: 'info', title: 'Đã sao chép nội dung chia sẻ' })
  }

  if (!activeWallet) return null

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[28px] glass-strong p-5 shadow-card">
        <div
          aria-hidden
          className="absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />
        <div className="relative flex items-center gap-3">
          <UsdcAvatar size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">Nhận USDC</p>
            <p className="truncate text-[11.5px] text-[color:var(--muted)]">
              {activeWallet.name} · Cloud Chain
            </p>
          </div>
          <span className="rounded-full bg-[color:var(--surface)] px-2.5 py-1 text-[10.5px] font-semibold text-[color:var(--muted)]">
            Mạng Solana
          </span>
        </div>

        <div className="relative mt-5 flex justify-center">
          <div className="relative overflow-hidden rounded-3xl bg-white p-3 shadow-glow">
            {qr ? (
              <img src={qr} alt="QR địa chỉ ví" className="h-[228px] w-[228px] rounded-2xl" />
            ) : (
              <div className="skeleton flex h-[228px] w-[228px] items-center justify-center rounded-2xl">
                <QrCode size={38} className="text-slate-400" />
              </div>
            )}
            <span className="absolute inset-0 rounded-3xl ring-1 ring-black/5" />
          </div>
        </div>

        <div className="relative mt-5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            Địa chỉ ví
          </p>
          <p className="break-all font-mono text-[12.5px] leading-relaxed">{address}</p>
        </div>

        <div className="relative mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex flex-col items-center gap-1.5 rounded-2xl accent-gradient px-2 py-3 text-[11.5px] font-semibold text-white shadow-glow"
          >
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? 'Đã chép' : 'Sao chép'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-[color:var(--border)] px-2 py-3 text-[11.5px] font-semibold"
          >
            <Share2 size={17} />
            Chia sẻ
          </button>
          <button
            type="button"
            onClick={() => {
              downloadTextFile(
                'cloudpay-qr.txt',
                `Cloud Chain address: ${address}\nToken: USDC (${USDC_MINT})\n`,
                'text/plain',
              )
            }}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-[color:var(--border)] px-2 py-3 text-[11.5px] font-semibold"
          >
            <Download size={17} />
            Lưu QR
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#22e07a]" />
        <p className="text-[11.5px] leading-relaxed text-[color:var(--muted)]">
          Chỉ gửi <span className="font-semibold text-[color:var(--text)]">USDC</span> trên mạng Cloud Chain
          tới địa chỉ này. Khi tiền vào ví, ứng dụng sẽ kêu chuông, rung và hiện thông báo hệ thống ngay
          lập tức{prefs.notifications ? '' : ' (hãy bật thông báo trong Cài đặt)'}.
        </p>
      </div>
    </div>
  )
}
