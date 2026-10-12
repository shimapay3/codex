import { useState } from 'react'
import {
  BellRing,
  Check,
  CloudUpload,
  Copy,
  Download,
  Gauge,
  HardDriveDownload,
  KeyRound,
  Lock,
  Palette,
  Radio,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Volume2,
} from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { DEFAULT_RPC_URL, rpcFetch } from '../lib/solana'
import { copyToClipboard, downloadTextFile, formatVnd } from '../lib/format'
import { notificationsSupported, primeAudio, requestNotificationPermission, ringIncoming } from '../lib/notify'
import { shortAddress } from '../lib/crypto'
import { removeLocal } from '../lib/storage'
import {
  getTelegramDisplayName,
  getTelegramUsername,
  getTelegramUserIdString,
  getTelegramPhotoUrl,
  TELEGRAM_LOGO,
} from '../lib/telegram'

const LOCK_OPTIONS = [5, 10, 15, 20]

function Section({
  icon,
  title,
  children,
  hint,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <section className="rounded-[26px] glass p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl accent-gradient text-white">
          {icon}
        </span>
        <h3 className="text-[14px] font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
      {hint && <p className="mt-3 text-[10.5px] leading-relaxed text-[color:var(--muted)]">{hint}</p>}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12.5px] text-[color:var(--muted)]">{label}</span>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={[
        'relative h-7 w-12 shrink-0 rounded-full transition',
        value ? 'accent-gradient' : 'bg-[color:var(--surface-strong)]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all',
          value ? 'left-6' : 'left-1',
        ].join(' ')}
      />
    </button>
  )
}

export default function SettingsPanel({ onOpenTheme }: { onOpenTheme: () => void }) {
  const {
    prefs,
    setPrefs,
    price,
    pinEnabled,
    setPin,
    clearPin,
    lock,
    backupAt,
    backupBusy,
    backupNow,
    restoreFromCloud,
    wallets,
    activeWallet,
    exportSecrets,
    pushToast,
    pushToast: toast,
  } = useWallet()

  const tgName = getTelegramDisplayName()
  const tgUsername = getTelegramUsername()
  const tgId = getTelegramUserIdString()
  const tgPhoto = getTelegramPhotoUrl()
  const [tgCopied, setTgCopied] = useState(false)

  const [rpcDraft, setRpcDraft] = useState(prefs.rpcUrl)
  const [endpointDraft, setEndpointDraft] = useState(prefs.priceEndpoint)
  const [testing, setTesting] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [restoreDraft, setRestoreDraft] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const testRpc = async () => {
    setTesting(true)
    try {
      await rpcFetch(rpcDraft, 'getHealth', [], 10000)
      setPrefs({ rpcUrl: rpcDraft.trim() || DEFAULT_RPC_URL })
      pushToast({ tone: 'success', title: 'RPC hoạt động', body: rpcDraft })
    } catch (error: any) {
      pushToast({ tone: 'error', title: 'Không kết nối được RPC', body: error?.message })
    } finally {
      setTesting(false)
    }
  }

  const askNotifications = async () => {
    const granted = await requestNotificationPermission()
    setPrefs({ notifications: granted })
    pushToast({
      tone: granted ? 'success' : 'info',
      title: granted ? 'Đã bật thông báo đẩy' : 'Thông báo bị chặn',
      body: granted ? 'Bạn sẽ được báo ngay khi nhận USDC' : 'Hãy bật trong cài đặt trình duyệt',
    })
  }

  return (
    <div className="space-y-4">
      <Section icon={<Radio size={15} />} title="Mạng & RPC" hint="Thay đổi endpoint Cloud Chain bất cứ lúc nào. Mặc định: rpc.localusd.cloud.">
        <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3">
          <input
            value={rpcDraft}
            onChange={(event) => setRpcDraft(event.target.value)}
            spellCheck={false}
            className="w-full bg-transparent py-3 font-mono text-[12px] outline-none"
          />
          <button
            type="button"
            title="Khôi phục mặc định"
            onClick={() => {
              setRpcDraft(DEFAULT_RPC_URL)
              setPrefs({ rpcUrl: DEFAULT_RPC_URL })
            }}
            className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <button
          type="button"
          disabled={testing}
          onClick={testRpc}
          className="w-full rounded-2xl border border-[color:var(--border)] py-3 text-[13px] font-semibold disabled:opacity-60"
        >
          {testing ? 'Đang kiểm tra…' : 'Kiểm tra & lưu RPC'}
        </button>
      </Section>

      <Section
        icon={<Gauge size={15} />}
        title="Giá USDC"
        hint="USDC là stablecoin nên mặc định ≈ 1 USD · ≈ 30.000 ₫. Để trống để dùng tỷ giá cố định; hoặc trỏ tới một RPC/price endpoint trả JSON."
      >
        <div className="flex items-center justify-between rounded-2xl bg-[color:var(--surface)] px-3.5 py-3">
          <span className="text-[12px] text-[color:var(--muted)]">Tỷ giá đang dùng</span>
          <span className="text-right text-[12.5px] font-semibold">
            1 USDC ≈ {price.usd.toLocaleString('en-US', { maximumFractionDigits: 4 })} USD
            <br />
            <span className="font-normal text-[color:var(--muted)]">≈ {formatVnd(price.vnd)}</span>
          </span>
        </div>
        <input
          value={endpointDraft}
          onChange={(event) => setEndpointDraft(event.target.value)}
          placeholder="Để trống = giá cố định (mặc định)"
          spellCheck={false}
          className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[11.5px] outline-none focus:border-[color:var(--accent)]"
        />
        <Row label="Hiển thị quy đổi">
          <div className="flex gap-1.5">
            {(['both', 'usd', 'vnd'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPrefs({ fiat: option })}
                className={[
                  'rounded-xl px-2.5 py-1.5 text-[11px] font-semibold uppercase transition',
                  prefs.fiat === option ? 'accent-gradient text-white' : 'bg-[color:var(--surface)]',
                ].join(' ')}
              >
                {option === 'both' ? 'Cả hai' : option.toUpperCase()}
              </button>
            ))}
          </div>
        </Row>
        <button
          type="button"
          onClick={() => setPrefs({ priceEndpoint: endpointDraft.trim() })}
          className="w-full rounded-2xl border border-[color:var(--border)] py-3 text-[13px] font-semibold"
        >
          Lưu endpoint giá
        </button>
      </Section>

      <Section icon={<Palette size={15} />} title="Giao diện">
        <Row label={`Chế độ ${prefs.mode === 'dark' ? 'tối' : 'sáng'}`}>
          <button
            type="button"
            onClick={onOpenTheme}
            className="rounded-2xl accent-gradient px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-glow"
          >
            Đổi màu
          </button>
        </Row>
        <Row label="Ẩn số dư">
          <Toggle value={prefs.hideBalances} onChange={(value) => setPrefs({ hideBalances: value })} />
        </Row>
      </Section>

      <Section icon={<KeyRound size={15} />} title="Telegram & PIN" hint="Định danh Telegram là cơ sở bảo mật. Mã PIN 6 số khoá két ví trên thiết bị.">
        <div className="flex items-center gap-3 rounded-2xl bg-[color:var(--surface)] px-3.5 py-3">
          <img
            src={tgPhoto || TELEGRAM_LOGO}
            alt="Telegram"
            className="h-10 w-10 rounded-full ring-2 ring-[#229ED9]/40"
            onError={(e) => { ;(e.target as HTMLImageElement).src = TELEGRAM_LOGO }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{tgName}</p>
            <p className="truncate text-[11px] text-[color:var(--muted)]">{tgUsername || 'Object None'}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (tgId) {
                await copyToClipboard(tgId)
                setTgCopied(true)
                setTimeout(() => setTgCopied(false), 1600)
              }
            }}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-[color:var(--border)] px-2.5 py-1.5 text-[10.5px] font-semibold"
          >
            {tgCopied ? <Check size={12} /> : <Copy size={12} />}
            {tgId ? `ID: ${tgId}` : 'Object None'}
          </button>
        </div>

        <Row label="Mã PIN">
          <span className="text-[12px] font-semibold">{pinEnabled ? 'Đang bật' : 'Chưa đặt'}</span>
        </Row>
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            value={pinDraft}
            onChange={(event) => setPinDraft(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="PIN 6 số"
            className="flex-1 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3 text-center text-[15px] tracking-[0.35em] outline-none focus:border-[color:var(--accent)]"
          />
          <button
            type="button"
            disabled={pinDraft.length < 6}
            onClick={async () => {
              try {
                await setPin(pinDraft)
                setPinDraft('')
              } catch (error: any) {
                toast({ tone: 'error', title: 'PIN không hợp lệ', body: error?.message })
              }
            }}
            className="rounded-2xl border border-[color:var(--border)] px-4 text-[12.5px] font-semibold disabled:opacity-45"
          >
            Lưu PIN
          </button>
          {pinEnabled && (
            <button
              type="button"
              onClick={clearPin}
              className="rounded-2xl border border-[color:var(--border)] px-3 text-[12.5px] font-semibold text-[#ff8fa1]"
            >
              Xoá
            </button>
          )}
        </div>
      </Section>

      <Section icon={<Lock size={15} />} title="Tự động khoá" hint="Két tự khoá sau khoảng thời gian không thao tác và mở lại bằng mã PIN.">
        <div className="flex gap-2">
          {LOCK_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setPrefs({ autoLockMinutes: minutes })}
              className={[
                'flex-1 rounded-2xl py-2.5 text-[12.5px] font-semibold transition',
                prefs.autoLockMinutes === minutes ? 'accent-gradient text-white' : 'bg-[color:var(--surface)]',
              ].join(' ')}
            >
              {minutes} phút
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={lock}
          className="w-full rounded-2xl border border-[color:var(--border)] py-3 text-[13px] font-semibold"
        >
          Khoá ngay
        </button>
      </Section>

      <Section icon={<BellRing size={15} />} title="Thông báo đẩy realtime" hint="Khi USDC vào ví, thiết bị kêu chuông, rung và hiện thông báo hệ thống.">
        <Row label="Thông báo hệ thống">
          <Toggle
            value={prefs.notifications}
            onChange={(value) => {
              if (value && notificationsSupported()) void askNotifications()
              else setPrefs({ notifications: value })
            }}
          />
        </Row>
        <Row label="Âm thanh tiền vào">
          <Toggle value={prefs.sound} onChange={(value) => setPrefs({ sound: value })} />
        </Row>
        <button
          type="button"
          onClick={() => {
            primeAudio()
            ringIncoming()
            pushToast({ tone: 'payment', title: '+1.00 USDC đã nhận', body: '🎁 Quà tặng · Nghe thử chuông' })
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--border)] py-3 text-[13px] font-semibold"
        >
          <Volume2 size={15} /> Nghe thử chuông nhận tiền
        </button>
      </Section>

      <Section
        icon={<CloudUpload size={15} />}
        title="Sao lưu đám mây cá nhân"
        hint="Két được mã hoá bằng chính khoá bí mật của ví neo trước khi tải lên — máy chủ chỉ giữ ciphertext."
      >
        <Row label="Tự động sao lưu">
          <Toggle value={!!wallets.length} onChange={() => undefined} />
        </Row>
        <div className="rounded-2xl bg-[color:var(--surface)] px-3.5 py-3 text-[11.5px]">
          {backupAt
            ? `Bản sao lưu gần nhất: ${new Date(backupAt).toLocaleString('vi-VN')}`
            : 'Chưa có bản sao lưu nào'}
        </div>
        <button
          type="button"
          disabled={backupBusy}
          onClick={backupNow}
          className="w-full rounded-2xl accent-gradient py-3 text-[13px] font-semibold text-white shadow-glow disabled:opacity-60"
        >
          {backupBusy ? 'Đang sao lưu…' : 'Sao lưu ngay'}
        </button>
        <div className="space-y-2 rounded-2xl border border-[color:var(--border)] p-3">
          <p className="text-[11.5px] font-semibold">Khôi phục từ đám mây</p>
          <textarea
            value={restoreDraft}
            onChange={(event) => setRestoreDraft(event.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="Nhập khoá bí mật của ví đã sao lưu"
            className="w-full resize-none rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 font-mono text-[11.5px] outline-none focus:border-[color:var(--accent)]"
          />
          <button
            type="button"
            disabled={!restoreDraft.trim()}
            onClick={async () => {
              try {
                const count = await restoreFromCloud(restoreDraft)
                setRestoreDraft('')
                toast({ tone: 'success', title: `Đã khôi phục ${count} ví` })
              } catch (error: any) {
                toast({ tone: 'error', title: 'Khôi phục thất bại', body: error?.message })
              }
            }}
            className="w-full rounded-2xl border border-[color:var(--border)] py-3 text-[12.5px] font-semibold disabled:opacity-45"
          >
            Khôi phục
          </button>
        </div>
      </Section>

      <Section
        icon={<HardDriveDownload size={15} />}
        title="Xuất khoá bí mật"
        hint="Tải khoá bí mật về máy để cất giữ thủ công. Không chia sẻ với bất kỳ ai — ai có khoá là có ví."
      >
        {wallets.map((wallet) => (
          <div key={wallet.id} className="rounded-2xl border border-[color:var(--border)] p-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: wallet.tone }} />
              <span className="truncate text-[12.5px] font-semibold">{wallet.name}</span>
              <span className="ml-auto font-mono text-[10px] text-[color:var(--muted)]">
                {shortAddress(wallet.address, 4)}
              </span>
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await copyToClipboard(exportSecrets(wallet.id))
                    toast({ tone: 'info', title: 'Đã sao chép khoá bí mật' })
                  } catch (error: any) {
                    toast({ tone: 'error', title: 'Không xuất được', body: error?.message })
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border)] py-2.5 text-[11.5px] font-semibold"
              >
                <Copy size={13} /> Sao chép
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    downloadTextFile(
                      `cloudpay-${shortAddress(wallet.address, 4)}.json`,
                      exportSecrets(wallet.id),
                    )
                    toast({ tone: 'info', title: 'Đã tải khoá bí mật' })
                  } catch (error: any) {
                    toast({ tone: 'error', title: 'Không tải được', body: error?.message })
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl accent-gradient py-2.5 text-[11.5px] font-semibold text-white"
              >
                <Download size={13} /> Tải xuống
              </button>
            </div>
            {revealed === wallet.id && (
              <p className="mt-2 font-mono text-[10px] break-all text-[color:var(--muted)]">
                {exportSecrets(wallet.id)}
              </p>
            )}
            <button
              type="button"
              onClick={() => setRevealed(revealed === wallet.id ? null : wallet.id)}
              className="mt-2 text-[10.5px] font-semibold text-[color:var(--muted)] underline"
            >
              {revealed === wallet.id ? 'Ẩn' : 'Hiện khoá'}
            </button>
          </div>
        ))}
      </Section>

      <Section icon={<ShieldAlert size={15} />} title="Thiết bị này" hint="Xoá dữ liệu sẽ gỡ mọi ví khỏi thiết bị. Hãy chắc chắn bạn đã sao lưu khoá bí mật.">
        <Row label="Ví đang dùng">
          <span className="text-[12.5px] font-semibold">{activeWallet?.name}</span>
        </Row>
        <Row label="Telegram ID">
          <span className="text-[12.5px] font-semibold">{tgId || '—'}</span>
        </Row>
        <button
          type="button"
          onClick={() => setConfirmReset((value) => !value)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ff6b81]/40 py-3 text-[13px] font-semibold text-[#ff8fa1]"
        >
          <Trash2 size={15} /> Xoá dữ liệu trên thiết bị
        </button>
        {confirmReset && (
          <div className="space-y-2 rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 p-3">
            <p className="text-[11.5px] text-[#ff8fa1]">
              Toàn bộ ví, danh bạ và cài đặt trên thiết bị này sẽ bị xoá. Bản sao lưu đám mây vẫn giữ nguyên.
            </p>
            <button
              type="button"
              onClick={() => {
                removeLocal('vault.v1')
                removeLocal('pin.v1')
                removeLocal('pinEnabled.v1')
                removeLocal('localdata.v1')
                window.location.assign('/')
              }}
              className="w-full rounded-2xl bg-[#ff6b81] py-3 text-[13px] font-semibold text-white"
            >
              Tôi hiểu — xoá ngay
            </button>
          </div>
        )}
      </Section>

      <Section icon={<KeyRound size={15} />} title="Về ứng dụng">
        <p className="text-[11.5px] leading-relaxed text-[color:var(--muted)]">
          Cloud Pay Wallet · Cloud Chain · mạng Solana. Token duy nhất: <b>USDC</b> (đã xác minh). Mọi khoá
          bí mật được sinh và mã hoá ngay trên thiết bị; máy chủ chỉ đóng vai trò RPC proxy, thông báo
          realtime và lưu trữ bản sao lưu đã mã hoá.
        </p>
      </Section>
    </div>
  )
}
