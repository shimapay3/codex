import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Keypair } from '@solana/web3.js'
import { ImportResult, importSecret, secretToBase58 } from '../lib/crypto'
import {
  DEFAULT_RPC_URL,
  PriceInfo,
  TxEntry,
  fetchTokenHistory,
  getSolBalance,
  getUsdcBalance,
  requestAirdrop,
  checkAirdropEligibility,
  fetchAirdropStatus,
  transferSol,
  sendUsdc,
  USDC_DECIMALS_FALLBACK,
  MAX_WALLETS,
  getWalletCount,
  registerWalletWithServer,
  fetchUserCloudData,
  pushUserCloudData,
} from '../lib/solana'
import {
  primeAudio,
  ringError,
  ringIncoming,
  ringSuccess,
  ringUnlock,
  showSystemNotification,
  vibrate,
} from '../lib/notify'
import { applyTheme } from '../lib/theme'
import { readLocal, writeLocal, removeLocal, StorageKeys, getOrCreateDeviceId } from '../lib/storage'
import { getTelegramUser, getTelegramUserIdString, telegramReady, isTelegramWebApp, type TelegramUser } from '../lib/telegram'
import { useRealtimePoll, type SyncResponse } from './useRealtimePoll'
import { useAutoLock } from './useAutoLock'
import {
  BalanceSample,
  Contact,
  Prefs,
  VaultData,
  VaultStore,
  WalletRecord,
  buildKeyWrap,
  createVaultStore,
  decryptVaultData,
  emptyVault,
  encryptVaultData,
  loadPinWrap,
  loadStore,
  newVaultKey,
  openPinWrap,
  savePinWrap,
  saveStore,
  syncIndex,
  toneForIndex,
  toIndex,
  unwrapVaultKeyWithSecret,
  setPinWrap,
  getPinLockoutRemaining,
  recordPinFailure,
  resetPinAttempts,
} from './vault'
export const DEFAULT_PREFS: Prefs = {
  mode: 'dark',
  accentId: 'solana',
  accentColor: null,
  rpcUrl: DEFAULT_RPC_URL,
  priceEndpoint: '',
  autoLockMinutes: 15,
  fiat: 'both',
  notifications: true,
  sound: true,
  hideBalances: false,
}

export type Session = 'booting' | 'onboarding' | 'locked' | 'unlocked'

export type PaymentEvent = {
  address: string
  signature: string
  slot: number
  blockTime: number | null
  memo: string | null
}

export type Toast = {
  id: string
  tone: 'success' | 'error' | 'info' | 'payment'
  title: string
  body?: string
  signature?: string
  createdAt: number
}

export type BalanceState = { usdc: number; sol: number; decimals: number; loading: boolean }

export type AirdropState = {
  status: 'idle' | 'pending' | 'sending' | 'confirmed' | 'error'
  payserver: string | null
  signature: string | null
  error: string | null
}

const PASSKEY_INFO = 'cloudpay.passkey.v1'

type WalletContextValue = {
  session: Session
  wallets: WalletRecord[]
  activeWallet: WalletRecord | null
  contacts: Contact[]
  txMeta: VaultData['txMeta']
  samples: BalanceSample[]
  prefs: Prefs
  price: PriceInfo
  balance: BalanceState
  history: TxEntry[]
  historyLoading: boolean
  toasts: Toast[]
  telegramUser: TelegramUser | null
  pinEnabled: boolean
  realtimeConnected: boolean
  autoLockSeconds: number | null
  lastPayment: PaymentEvent | null
  airdrop: AirdropState
  refresh: () => Promise<void>
  setPrefs: (patch: Partial<Prefs>) => void
  createWallet: (input?: string, name?: string) => Promise<WalletRecord>
  importResultToWallet: (result: ImportResult, name: string) => Promise<WalletRecord>
  setActiveWallet: (id: string) => Promise<void>
  renameWallet: (id: string, name: string) => Promise<void>
  removeWallet: (id: string) => Promise<void>
  saveContacts: (contacts: Contact[]) => Promise<void>
  saveTxMeta: (signature: string, meta: NonNullable<VaultData['txMeta'][string]>) => Promise<void>
  send: (params: {
    to: string
    amount: number
    memo: string
    category?: string
    wish?: string
  }) => Promise<string>
  sendSol: (params: { to: string; amount: number; memo?: string }) => Promise<string>
  unlockWithPin: (pin: string) => Promise<void>
  unlockWithSecret: (input: string) => Promise<void>
  setPin: (pin: string) => Promise<void>
  clearPin: () => Promise<void>
  lock: () => void
  completeOnboarding: () => void
  extendAutoLock: () => void
  pushToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => void
  dismissToast: (id: string) => void
  exportSecrets: (walletId?: string) => string
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet phải nằm trong WalletProvider')
  return context
}

function loadPrefsMirror(): Prefs {
  const prefs = { ...DEFAULT_PREFS, ...readLocal<Partial<Prefs>>(StorageKeys.prefs, {}) }
  if (prefs.rpcUrl === 'https://rpc.dolaxanh.com') prefs.rpcUrl = DEFAULT_RPC_URL
  return prefs
}

/** Poll airdrop status until confirmed or error (max 90s). */
async function waitForAirdrop(address: string, timeoutMs = 90000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const info = await fetchAirdropStatus(address)
    if (info.status === 'confirmed') return true
    if (info.status === 'error') throw new Error(info.error || 'Airdrop thất bại')
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error('Airdrop quá hạn — vui lòng thử lại')
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>('booting')
  const [store, setStore] = useState<VaultStore | null>(null)
  const [vault, setVault] = useState<VaultData | null>(null)
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefsMirror)
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null)
  const [pinEnabled, setPinEnabled] = useState<boolean>(() => !!loadPinWrap())
  const [price, setPrice] = useState<PriceInfo>({ usd: 1, vnd: 300000, source: 'fixed' })
  const [balance, setBalance] = useState<BalanceState>({
    usdc: 0,
    sol: 0,
    decimals: USDC_DECIMALS_FALLBACK,
    loading: false,
  })
  const [history, setHistory] = useState<TxEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [lastPayment, setLastPayment] = useState<PaymentEvent | null>(null)
  const [airdrop, setAirdrop] = useState<AirdropState>({
    status: 'idle',
    payserver: null,
    signature: null,
    error: null,
  })

  const vaultKeyRef = useRef<Uint8Array | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const bootedRef = useRef(false)
  const lastAirdropStatusRef = useRef<AirdropState['status']>('idle')
  const lastCloudUpdateRef = useRef<number | null>(null)

  const vaultRef = useRef<VaultData | null>(null)
  vaultRef.current = vault

  // --- toasts ---------------------------------------------------------------
  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (toast: Omit<Toast, 'id' | 'createdAt'>) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const entry: Toast = { ...toast, id, createdAt: Date.now() }
      setToasts((current) => [entry, ...current].slice(0, 4))
      window.setTimeout(() => dismissToast(id), toast.tone === 'error' ? 9000 : 6500)
    },
    [dismissToast],
  )

  // --- boot -----------------------------------------------------------------
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    const existing = loadStore()
    setStore(existing)
    setPinEnabled(!!loadPinWrap())
    setSession(existing ? 'locked' : 'onboarding')
    telegramReady()
    setTelegramUser(getTelegramUser())
  }, [])

  // --- refresh Telegram user info (avatar, name, username) -----------------
  // Telegram profile data can change between sessions. Refresh on visibility
  // change and every 30s while the app is open so the header always shows the
  // latest avatar/name/username.
  useEffect(() => {
    const refreshTg = () => setTelegramUser(getTelegramUser())
    document.addEventListener('visibilitychange', refreshTg)
    const timer = window.setInterval(refreshTg, 30000)
    return () => {
      document.removeEventListener('visibilitychange', refreshTg)
      window.clearInterval(timer)
    }
  }, [])

  // --- theme ----------------------------------------------------------------
  useEffect(() => {
    applyTheme(prefs.mode, prefs.accentId, prefs.accentColor || undefined)
    writeLocal(StorageKeys.prefs, prefs)
  }, [prefs])

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((current) => {
      const next = { ...current, ...patch }
      // Push prefs to cloud when inside Telegram so settings survive restarts
      const tgId = getTelegramUserIdString()
      if (tgId) {
        lastCloudUpdateRef.current = Date.now()
        void pushUserCloudData(tgId, { prefs: next })
      }
      return next
    })
  }, [])

  // --- vault persistence ----------------------------------------------------
  const persist = useCallback(
    async (next: VaultData) => {
      const key = vaultKeyRef.current
      setVault(next)
      vaultRef.current = next
      setPrefsState((current) => ({ ...current, ...next.prefs }))
      if (!key) return
      const envelope = await encryptVaultData(key, next)
      const current = loadStore()
      if (!current) return
      const updated = syncIndex({ ...current, envelope }, next)
      saveStore(updated)
      setStore(updated)
    },
    [],
  )

  const unlockWithData = useCallback(
    async (vaultKey: Uint8Array) => {
      const current = loadStore()
      if (!current) throw new Error('Không tìm thấy dữ liệu ví trên thiết bị này')
      const data = await decryptVaultData(vaultKey, current.envelope)
      vaultKeyRef.current = vaultKey
      setVault(data)
      vaultRef.current = data
      setPrefsState((present) => ({ ...present, ...data.prefs }))
      setSession('unlocked')
      seenRef.current = new Set()

      // Cloud sync: when inside Telegram, fetch contacts/prefs/samples from
      // the server so they follow the user across devices/browsers.
      const tgId = getTelegramUserIdString()
      if (tgId) {
        try {
          const cloud = await fetchUserCloudData(tgId)
          if (cloud) {
            lastCloudUpdateRef.current = cloud.updatedAt ?? Date.now()
            let merged = data
            let changed = false

            // Merge contacts — union by address, prefer local favorites
            if (cloud.contacts.length > 0) {
              const localByAddr = new Map(data.contacts.map((c) => [c.address, c]))
              const cloudByAddr = new Map(cloud.contacts.map((c) => [c.address, c]))
              const mergedContacts = [...localByAddr.values()]
              for (const [addr, cloudContact] of cloudByAddr) {
                if (!localByAddr.has(addr)) {
                  mergedContacts.push(cloudContact)
                  changed = true
                }
              }
              if (changed) {
                merged = { ...merged, contacts: mergedContacts }
              }
            }

            // Merge samples — union by timestamp, keep all
            if (cloud.samples.length > 0) {
              const localTimes = new Set(data.samples.map((s) => s.t))
              const newSamples = cloud.samples.filter((s) => !localTimes.has(s.t))
              if (newSamples.length > 0) {
                const allSamples = [...merged.samples, ...newSamples].sort((a, b) => a.t - b.t).slice(-400)
                merged = { ...merged, samples: allSamples }
                changed = true
              }
            }

            // Merge prefs — cloud prefs override local when cloud is newer
            if (cloud.prefs && typeof cloud.prefs === 'object') {
              const cloudPrefs = cloud.prefs as Partial<Prefs>
              merged = { ...merged, prefs: { ...merged.prefs, ...cloudPrefs } }
              setPrefsState((present) => ({ ...present, ...merged.prefs }))
              changed = true
            }

            if (changed) {
              setVault(merged)
              vaultRef.current = merged
              const envelope = await encryptVaultData(vaultKey, merged)
              const existing = loadStore()
              if (existing) saveStore({ ...existing, envelope })
              // Push merged data back to cloud
              void pushUserCloudData(tgId, { contacts: merged.contacts, samples: merged.samples, prefs: merged.prefs })
            }

            // Push current data to cloud if cloud was empty
            if (cloud.contacts.length === 0 && data.contacts.length > 0) {
              void pushUserCloudData(tgId, { contacts: data.contacts, samples: data.samples, prefs: data.prefs })
            }

            // Always push prefs to cloud if cloud had none
            if (!cloud.prefs) {
              void pushUserCloudData(tgId, { prefs: data.prefs })
            }
          }
        } catch {
          /* cloud sync failure is non-fatal */
        }
      }

      return data
    },
    [],
  )

  // --- unlock paths ---------------------------------------------------------
  const unlockWithPin = useCallback(
    async (pin: string) => {
      // Rate-limit PIN attempts to prevent brute-forcing the 6-digit code.
      const lockoutMs = getPinLockoutRemaining()
      if (lockoutMs > 0) {
        const seconds = Math.ceil(lockoutMs / 1000)
        throw new Error(`PIN bị khoá, thử lại sau ${seconds} giây`)
      }
      const wrap = loadPinWrap()
      if (!wrap) throw new Error('Chưa thiết lập mã PIN')
      try {
        const vaultKey = await openPinWrap(pin, wrap)
        await unlockWithData(vaultKey)
        ringSuccess()
        resetPinAttempts()
      } catch {
        ringError()
        const result = recordPinFailure()
        if (result.locked) {
          const seconds = Math.ceil(result.remainingMs / 1000)
          throw new Error(`Mã PIN không đúng. PIN bị khoá ${seconds} giây.`)
        }
        throw new Error('Mã PIN không đúng')
      }
    },
    [unlockWithData],
  )

  const unlockWithSecret = useCallback(
    async (input: string) => {
      const current = loadStore()
      if (!current) throw new Error('Chưa có dữ liệu ví trên thiết bị này')
      const { keypair, kind } = await importSecret(input)
      const vaultKey = await unwrapVaultKeyWithSecret(current, keypair.secretKey)
      if (!vaultKey) {
        throw new Error('Khoá bí mật này không thuộc ví nào trong ứng dụng')
      }
      await unlockWithData(vaultKey)
      ringSuccess()
      pushToast({
        tone: 'success',
        title: 'Đã mở khoá ví',
        body: kind === 'passphrase' ? 'Bằng passphrase' : 'Bằng khoá bí mật',
      })
    },
    [pushToast, unlockWithData],
  )

  // --- wallet management ----------------------------------------------------
  const importResultToWallet = useCallback(
    async (result: ImportResult, name: string): Promise<WalletRecord> => {
      const currentVault = vaultRef.current
      const currentKey = vaultKeyRef.current
      if (!currentVault || !currentKey) throw new Error('Ví đang bị khoá')

      // Reject duplicate wallet address
      const newAddress = result.keypair.publicKey.toBase58()
      if (currentVault.wallets.some((w) => w.address === newAddress)) {
        throw new Error('Ví với địa chỉ này đã tồn tại')
      }
      // Enforce wallet limit: max MAX_WALLETS per device (client + server).
      if (currentVault.wallets.length >= MAX_WALLETS) {
        throw new Error(`Đã đạt giới hạn ${MAX_WALLETS} ví cho thiết bị này`)
      }
      const deviceId = getOrCreateDeviceId()
      const info = await getWalletCount(deviceId)
      if (!info.canCreate) {
        throw new Error(`Đã đạt giới hạn ${MAX_WALLETS} ví cho thiết bị này`)
      }

      const wallet: WalletRecord = {
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: name || `Ví ${currentVault.wallets.length + 1}`,
        address: result.keypair.publicKey.toBase58(),
        secret: result.canonicalSecret,
        createdAt: Date.now(),
        tone: toneForIndex(currentVault.wallets.length),
      }

      const wrap = await buildKeyWrap(wallet.id, Uint8Array.from(wallet.secret), currentKey)

      const existing = loadStore()
      if (existing) {
        const updated: VaultStore = {
          ...existing,
          keyWraps: { ...existing.keyWraps, [wallet.id]: wrap.envelope },
        }
        saveStore(updated)
        setStore(updated)
      }

      const next: VaultData = {
        ...currentVault,
        wallets: [...currentVault.wallets, wallet],
        activeWalletId: wallet.id,
      }
      await persist(next)
      // Register with server for limit enforcement (fire-and-forget).
      void registerWalletWithServer(deviceId, wallet.address)
      return wallet
    },
    [persist],
  )

  const createWallet = useCallback(
    async (input?: string, name?: string): Promise<WalletRecord> => {
      const currentVault = vaultRef.current
      const currentKey = vaultKeyRef.current
      const inTelegram = isTelegramWebApp()
      const tgId = getTelegramUserIdString()

      // First wallet of a brand new install: bootstrap the encrypted vault.
      if (!currentVault || !currentKey) {
        // Check server-side wallet limit before creating the first wallet.
        const deviceId = getOrCreateDeviceId()
        const info = await getWalletCount(deviceId)
        if (!info.canCreate) {
          throw new Error(`Đã đạt giới hạn ${MAX_WALLETS} ví cho thiết bị này`)
        }

        const generated = Keypair.generate()
        const result: ImportResult = input?.trim()
          ? await importSecret(input)
          : {
              keypair: generated,
              kind: 'generated' as ImportResult['kind'],
              canonicalSecret: Array.from(generated.secretKey),
            }

        // Telegram: request 10 SOL airdrop before creating the wallet.
        // Airdrop must succeed before the wallet is created.
        if (inTelegram && tgId && !input?.trim()) {
          const eligibility = await checkAirdropEligibility(tgId)
          if (!eligibility.canReceive) {
            throw new Error(
              `Đã đạt giới hạn airdrop ${eligibility.limit} SOL trong ${eligibility.windowDays} ngày. ` +
              `Đã nhận ${eligibility.received} SOL, còn ${eligibility.remaining} SOL.`,
            )
          }
          const airdropRes = await requestAirdrop(result.keypair.publicKey.toBase58(), tgId)
          if (airdropRes.status === 'error') {
            throw new Error(airdropRes.error || 'Airdrop thất bại — không thể tạo ví')
          }
          if (airdropRes.status === 'pending' || airdropRes.status === 'sending') {
            pushToast({ tone: 'info', title: 'Đang chờ airdrop 10 SOL…', body: 'Vui lòng đợi giao dịch xác nhận' })
            await waitForAirdrop(result.keypair.publicKey.toBase58())
            pushToast({ tone: 'success', title: 'Đã nhận 10 SOL', body: 'Airdrop thành công — ví đã có phí gas' })
          }
        }

        const vaultKey = newVaultKey()
        const wallet: WalletRecord = {
          id: `w-${Date.now()}`,
          name: name?.trim() || 'Ví chính',
          address: result.keypair.publicKey.toBase58(),
          secret: result.canonicalSecret,
          createdAt: Date.now(),
          tone: toneForIndex(0),
        }
        const data = emptyVault(loadPrefsMirror())
        data.wallets = [wallet]
        data.activeWalletId = wallet.id
        const created = await createVaultStore(wallet, vaultKey, data)
        saveStore(created)
        setStore(created)
        vaultKeyRef.current = vaultKey
        setVault(data)
        vaultRef.current = data
        // Register with server for limit enforcement (fire-and-forget).
        void registerWalletWithServer(deviceId, wallet.address)
        // Stay in 'onboarding' so the secure step is shown.
        return wallet
      }

      let result: ImportResult
      if (input?.trim()) {
        result = await importSecret(input)
      } else {
        const keypair = Keypair.generate()
        result = {
          keypair,
          kind: 'generated' as ImportResult['kind'],
          canonicalSecret: Array.from(keypair.secretKey),
        }
      }

      // Telegram: transfer SOL from existing wallet to new wallet before creating.
      // Transfer 10 SOL / total wallets (including the new one).
      if (inTelegram && tgId && !input?.trim() && currentVault.wallets.length > 0) {
        const totalAfter = currentVault.wallets.length + 1
        const transferAmount = 10 / totalAfter
        const rpcUrlNow = currentVault.prefs.rpcUrl || DEFAULT_RPC_URL

        // Find the wallet with the most SOL.
        const solBalances = await Promise.all(
          currentVault.wallets.map(async (w) => ({
            wallet: w,
            sol: await getSolBalance(rpcUrlNow, w.address),
          })),
        )
        const richest = solBalances.sort((a, b) => b.sol - a.sol)[0]

        if (richest && richest.sol > transferAmount + 0.01) {
          try {
            const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(richest.wallet.secret))
            await transferSol(rpcUrlNow, fromKeypair, result.keypair.publicKey.toBase58(), transferAmount)
            pushToast({ tone: 'success', title: `Đã chuyển ${transferAmount.toFixed(4)} SOL sang ví mới` })
          } catch {
            // Transfer failed — request airdrop from backend.
            const eligibility = await checkAirdropEligibility(tgId)
            if (!eligibility.canReceive) {
              pushToast({
                tone: 'error',
                title: 'Giới hạn airdrop',
                body: `Đã nhận ${eligibility.received}/${eligibility.limit} SOL trong ${eligibility.windowDays} ngày`,
              })
            } else {
              await requestAirdrop(result.keypair.publicKey.toBase58(), tgId, rpcUrlNow)
              pushToast({ tone: 'info', title: 'Đang chờ airdrop SOL…' })
              await waitForAirdrop(result.keypair.publicKey.toBase58())
            }
          }
        } else {
          // Not enough SOL — request airdrop from backend.
          const eligibility = await checkAirdropEligibility(tgId)
          if (!eligibility.canReceive) {
            pushToast({
              tone: 'error',
              title: 'Giới hạn airdrop',
              body: `Đã nhận ${eligibility.received}/${eligibility.limit} SOL trong ${eligibility.windowDays} ngày`,
            })
          } else {
            await requestAirdrop(result.keypair.publicKey.toBase58(), tgId, rpcUrlNow)
            pushToast({ tone: 'info', title: 'Đang chờ airdrop SOL…' })
            await waitForAirdrop(result.keypair.publicKey.toBase58())
          }
        }
      }

      const wallet = await importResultToWallet(result, name || '')
      pushToast({
        tone: 'success',
        title: 'Đã thêm ví',
        body: wallet.address,
      })

      return wallet
    },
    [importResultToWallet, pushToast],
  )

  const setActiveWallet = useCallback(
    async (id: string) => {
      const current = vaultRef.current
      if (!current || current.activeWalletId === id) return
      setBalance((state) => ({ ...state, loading: true }))
      setHistory([])
      await persist({ ...current, activeWalletId: id })
      seenRef.current = new Set()

      // Check SOL balance of the newly active wallet — request airdrop if low.
      const wallet = current.wallets.find((w) => w.id === id)
      if (wallet && isTelegramWebApp()) {
        const tgId = getTelegramUserIdString()
        const rpcUrlNow = current.prefs.rpcUrl || DEFAULT_RPC_URL
        try {
          const sol = await getSolBalance(rpcUrlNow, wallet.address)
          if (sol < 0.05 && tgId) {
            const eligibility = await checkAirdropEligibility(tgId)
            if (eligibility.canReceive) {
              pushToast({ tone: 'info', title: 'SOL thấp', body: 'Đang yêu cầu airdrop SOL…' })
              void requestAirdrop(wallet.address, tgId, rpcUrlNow).then(() => {
                void waitForAirdrop(wallet.address).then(() => {
                  pushToast({ tone: 'success', title: 'Đã nhận SOL', body: 'Ví đã được nạp phí gas' })
                }).catch(() => undefined)
              }).catch(() => undefined)
            } else {
              pushToast({
                tone: 'error',
                title: 'Giới hạn airdrop',
                body: `Đã nhận ${eligibility.received}/${eligibility.limit} SOL trong ${eligibility.windowDays} ngày`,
              })
            }
          }
        } catch {
          /* ignore balance check failure */
        }
      }
    },
    [persist, pushToast],
  )

  const renameWallet = useCallback(
    async (id: string, name: string) => {
      const current = vaultRef.current
      if (!current) return
      await persist({
        ...current,
        wallets: current.wallets.map((wallet) =>
          wallet.id === id ? { ...wallet, name: name.trim() || wallet.name } : wallet,
        ),
      })
    },
    [persist],
  )

  const removeWallet = useCallback(
    async (id: string) => {
      const current = vaultRef.current
      if (!current || current.wallets.length <= 1) {
        throw new Error('Cần giữ lại ít nhất một ví')
      }
      const wallets = current.wallets.filter((wallet) => wallet.id !== id)
      const existing = loadStore()
      if (existing) {
        const wraps = { ...existing.keyWraps }
        delete wraps[id]
        const updated: VaultStore = { ...existing, keyWraps: wraps }
        saveStore(updated)
        setStore(updated)
      }
      await persist({
        ...current,
        wallets,
        activeWalletId: current.activeWalletId === id ? wallets[0].id : current.activeWalletId,
      })
    },
    [persist],
  )

  // --- contacts & metadata --------------------------------------------------
  const saveContacts = useCallback(
    async (contacts: Contact[]) => {
      const current = vaultRef.current
      if (!current) return
      await persist({ ...current, contacts })
      // Push to cloud when inside Telegram
      const tgId = getTelegramUserIdString()
      if (tgId) {
        lastCloudUpdateRef.current = Date.now()
        void pushUserCloudData(tgId, { contacts })
      }
    },
    [persist],
  )

  const saveTxMeta = useCallback(
    async (signature: string, meta: NonNullable<VaultData['txMeta'][string]>) => {
      const current = vaultRef.current
      if (!current) return
      await persist({ ...current, txMeta: { ...current.txMeta, [signature]: meta } })
    },
    [persist],
  )

  // --- balances, history, price --------------------------------------------
  const activeWallet = useMemo(
    () => vault?.wallets.find((wallet) => wallet.id === vault.activeWalletId) || vault?.wallets[0] || null,
    [vault],
  )

  const refreshBalance = useCallback(async () => {
    const current = vaultRef.current
    const wallet = current?.wallets.find((w) => w.id === current.activeWalletId) || current?.wallets[0]
    if (!wallet) return
    const rpcUrl = current?.prefs.rpcUrl || DEFAULT_RPC_URL
    setBalance((state) => ({ ...state, loading: true }))
    try {
      const [usdc, sol] = await Promise.all([
        getUsdcBalance(rpcUrl, wallet.address),
        getSolBalance(rpcUrl, wallet.address),
      ])
      setBalance({ usdc: usdc.amount, sol, decimals: usdc.decimals, loading: false })

      const previous = vaultRef.current
      if (previous) {
        const samples = [...previous.samples]
        const last = samples[samples.length - 1]
        if (!last || Math.abs(last.amount - usdc.amount) > 1e-9 || Date.now() - last.t > 60000) {
          samples.push({ t: Date.now(), amount: usdc.amount })
          const trimmed = samples.slice(-400)
          const next = { ...previous, samples: trimmed }
          const key = vaultKeyRef.current
          setVault(next)
          vaultRef.current = next
          if (key) {
            const envelope = await encryptVaultData(key, next)
            const existing = loadStore()
            if (existing) saveStore({ ...existing, envelope })
          }
        }
      }
    } catch {
      setBalance((state) => ({ ...state, loading: false }))
    }
  }, [])

  const announcePayment = useCallback(
    (entries: TxEntry[], address: string) => {
      const entry = entries[0]
      const amount = entry.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })
      const body = entry.memo || `Từ ${entry.counterparty?.slice(0, 6) || 'địa chỉ khác'}…`
      setLastPayment({
        address,
        signature: entry.signature,
        slot: entry.slot,
        blockTime: entry.blockTime,
        memo: entry.memo || null,
      })
      if (prefs.sound) ringIncoming()
      vibrate([90, 60, 90])
      if (prefs.notifications) {
        showSystemNotification(`+${amount} USDC đã nhận`, body, entry.signature)
      }
      pushToast({
        tone: 'payment',
        title: `+${amount} USDC đã nhận`,
        body,
        signature: entry.signature,
      })
    },
    [prefs.notifications, prefs.sound, pushToast],
  )

  const refreshHistory = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const current = vaultRef.current
      const wallet = current?.wallets.find((w) => w.id === current.activeWalletId) || current?.wallets[0]
      if (!wallet) return
      const rpcUrl = current?.prefs.rpcUrl || DEFAULT_RPC_URL
      if (!options.silent) setHistoryLoading(true)
      try {
        const entries = await fetchTokenHistory(rpcUrl, wallet.address)
        setHistory(entries)

        const first = seenRef.current.size === 0
        const fresh = entries.filter(
          (entry) => entry.direction === 'in' && entry.status === 'success' && !seenRef.current.has(entry.signature),
        )
        entries.forEach((entry) => seenRef.current.add(entry.signature))
        if (!first && fresh.length) announcePayment(fresh, wallet.address)
      } catch {
        /* keep the previous list on failure */
      } finally {
        setHistoryLoading(false)
      }
    },
    [announcePayment],
  )

  const refresh = useCallback(async () => {
    await Promise.all([refreshBalance(), refreshHistory({ silent: true })])
  }, [refreshBalance, refreshHistory])

  // --- SOL airdrop status (handled by /api/sync poll) -----------------------
  // Airdrop status is included in the /api/sync response, so no separate
  // polling effect is needed. The sync callback updates the airdrop state
  // and shows toasts when the status changes.

  // --- realtime (unified 5s poll) ------------------------------------------
  const activeAddress = activeWallet?.address ?? null
  const rpcUrl = prefs.rpcUrl || DEFAULT_RPC_URL

  const handleRealtimePoll = useCallback(
    (data: SyncResponse) => {
      // Update balances
      setBalance({
        usdc: data.usdcBalance,
        sol: data.solBalance,
        decimals: data.decimals || USDC_DECIMALS_FALLBACK,
        loading: false,
      })

      // Update price
      if (data.price) {
        setPrice(data.price)
      }

      // Update airdrop status from sync
      if (data.airdrop) {
        const newStatus = (data.airdrop.status === 'none' ? 'idle' : data.airdrop.status) as AirdropState['status']
        const prevStatus = lastAirdropStatusRef.current
        if (newStatus !== prevStatus) {
          lastAirdropStatusRef.current = newStatus
          setAirdrop({
            status: newStatus,
            payserver: null,
            signature: data.airdrop.signature,
            error: data.airdrop.error,
          })
          if (newStatus === 'confirmed' && prevStatus !== 'idle') {
            if (prefs.sound) ringIncoming()
            vibrate([90, 60, 90])
            if (prefs.notifications) showSystemNotification('Đã nhận SOL', 'Payserver đã chuyển SOL phí gas')
            pushToast({ tone: 'success', title: 'Đã nhận SOL', body: 'Ví đã được nạp phí gas' })
          } else if (newStatus === 'error' && prevStatus !== 'idle') {
            pushToast({ tone: 'error', title: 'Airdrop thất bại', body: data.airdrop.error || 'Không nhận được SOL' })
          }
        }
      }

      // Update history
      if (data.transactions.length) {
        setHistory(data.transactions)
        const first = seenRef.current.size === 0
        const fresh = data.transactions.filter(
          (entry) => entry.direction === 'in' && entry.status === 'success' && !seenRef.current.has(entry.signature),
        )
        data.transactions.forEach((entry) => seenRef.current.add(entry.signature))
        if (!first && fresh.length) {
          announcePayment(fresh, activeWallet?.address || '')
        }
      }

      // Update balance samples
      const previous = vaultRef.current
      if (previous) {
        const samples = [...previous.samples]
        const last = samples[samples.length - 1]
        if (!last || Math.abs(last.amount - data.usdcBalance) > 1e-9 || Date.now() - last.t > 60000) {
          samples.push({ t: Date.now(), amount: data.usdcBalance })
          const trimmed = samples.slice(-400)
          const next = { ...previous, samples: trimmed }
          const key = vaultKeyRef.current
          setVault(next)
          vaultRef.current = next
          if (key) {
            void encryptVaultData(key, next).then((envelope) => {
              const existing = loadStore()
              if (existing) saveStore({ ...existing, envelope })
            })
          }
        }
      }
    },
    [announcePayment, activeWallet?.address, prefs.notifications, prefs.sound, pushToast],
  )

  useRealtimePoll({
    rpcUrl,
    address: activeAddress,
    priceEndpoint: prefs.priceEndpoint,
    enabled: session === 'unlocked' && !!activeAddress,
    onResult: handleRealtimePoll,
  })

  const realtimeConnected = session === 'unlocked' && !!activeAddress

  // --- periodic cloud data sync (contacts, prefs) ---------------------------
  // Cloud data (contacts, settings) is polled every 15 s so changes made on
  // another device appear without restarting the app.  The initial sync runs
  // 5 s after unlock; a visibility-change listener triggers an immediate
  // refresh when the user returns to the app.
  useEffect(() => {
    if (session !== 'unlocked') return
    const tgId = getTelegramUserIdString()
    if (!tgId) return

    let cancelled = false

    const syncCloud = async () => {
      if (cancelled) return
      try {
        const cloud = await fetchUserCloudData(tgId)
        if (!cloud || cancelled) return

        // Skip when cloud data hasn't changed since the last sync
        if (cloud.updatedAt && lastCloudUpdateRef.current && cloud.updatedAt <= lastCloudUpdateRef.current) return
        lastCloudUpdateRef.current = cloud.updatedAt

        const current = vaultRef.current
        if (!current) return

        let merged = current
        let changed = false

        // Contacts: cloud is source of truth — replace local with cloud when different
        if (cloud.contacts.length > 0 || current.contacts.length > 0) {
          const localByAddr = new Map(current.contacts.map((c) => [c.address, c]))
          let contactsChanged = current.contacts.length !== cloud.contacts.length
          if (!contactsChanged) {
            for (const cc of cloud.contacts) {
              const lc = localByAddr.get(cc.address)
              if (!lc || lc.name !== cc.name || (lc.note || '') !== (cc.note || '') || !!lc.favorite !== !!cc.favorite) {
                contactsChanged = true
                break
              }
            }
          }
          if (contactsChanged) {
            merged = { ...merged, contacts: cloud.contacts }
            changed = true
          }
        }

        // Merge prefs — apply cloud prefs when any value differs from local
        if (cloud.prefs && typeof cloud.prefs === 'object') {
          const cloudPref = cloud.prefs as Partial<Prefs>
          const prefChanged = (Object.keys(cloudPref) as (keyof Prefs)[]).some(
            (key) => cloudPref[key] !== merged.prefs[key],
          )
          if (prefChanged) {
            merged = { ...merged, prefs: { ...merged.prefs, ...cloudPref } }
            setPrefsState((present) => ({ ...present, ...merged.prefs }))
            changed = true
          }
        }

        if (changed && !cancelled) {
          setVault(merged)
          vaultRef.current = merged
          const key = vaultKeyRef.current
          if (key) {
            const envelope = await encryptVaultData(key, merged)
            const existing = loadStore()
            if (existing) saveStore({ ...existing, envelope })
          }
        }
      } catch {
        /* non-fatal */
      }
    }

    const initialTimer = window.setTimeout(syncCloud, 5000)
    const intervalTimer = window.setInterval(syncCloud, 15000)
    document.addEventListener('visibilitychange', syncCloud)

    return () => {
      cancelled = true
      window.clearTimeout(initialTimer)
      window.clearInterval(intervalTimer)
      document.removeEventListener('visibilitychange', syncCloud)
    }
  }, [session])

  // --- auto-balance SOL across wallets (Telegram only) ---------------------
  useEffect(() => {
    if (session !== 'unlocked' || !isTelegramWebApp()) return
    const tgId = getTelegramUserIdString()
    const timer = window.setInterval(async () => {
      const current = vaultRef.current
      if (!current || current.wallets.length < 2) return
      const rpcUrlNow = current.prefs.rpcUrl || DEFAULT_RPC_URL
      try {
        const balances = await Promise.all(
          current.wallets.map(async (w) => ({
            wallet: w,
            sol: await getSolBalance(rpcUrlNow, w.address),
          })),
        )
        const poorest = balances.filter((b) => b.sol < 0.05).sort((a, b) => a.sol - b.sol)[0]
        if (!poorest) return
        const richest = balances.sort((a, b) => b.sol - a.sol)[0]
        if (!richest || richest.sol < 0.1 || richest.wallet.id === poorest.wallet.id) {
          // No wallet has enough to share — request airdrop from backend.
          if (tgId) {
            const eligibility = await checkAirdropEligibility(tgId)
            if (eligibility.canReceive) {
              void requestAirdrop(poorest.wallet.address, tgId, rpcUrlNow).catch(() => undefined)
            }
          }
          return
        }
        const transferAmount = Math.min(0.05, (richest.sol - 0.05) / 2)
        if (transferAmount <= 0.001) return
        const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(richest.wallet.secret))
        await transferSol(rpcUrlNow, fromKeypair, poorest.wallet.address, transferAmount)
      } catch {
        /* ignore balance errors */
      }
    }, 60000)
    return () => window.clearInterval(timer)
  }, [session])

  // --- initial load on unlock / wallet switch ---
  useEffect(() => {
    if (session !== 'unlocked') return
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeWallet?.id, rpcUrl])

  // --- price (handled by /api/sync poll) ------------------------------------
  // Price is included in the /api/sync response, so no separate polling
  // effect is needed. The sync callback updates the price state.

  // --- auto lock ------------------------------------------------------------
  const lock = useCallback(() => {
    vaultKeyRef.current = null
    setVault(null)
    vaultRef.current = null
    setHistory([])
    setLastPayment(null)
    setAirdrop({ status: 'idle', payserver: null, signature: null, error: null })
    lastAirdropStatusRef.current = 'idle'
    setSession('locked')
  }, [])

  const completeOnboarding = useCallback(() => {
    setSession('unlocked')
  }, [])

  const { secondsLeft, extend, lockNow } = useAutoLock({
    enabled: session === 'unlocked',
    minutes: prefs.autoLockMinutes,
    onLock: lock,
    onExtend: () => undefined,
  })

  // --- pin setup --------------------------------------------------
  const setPin = useCallback(
    async (pin: string) => {
      const key = vaultKeyRef.current
      if (!key) throw new Error('Ví đang bị khoá')
      if (!/^\d{6}$/.test(pin)) throw new Error('Mã PIN phải gồm đúng 6 chữ số')
      const wrap = await setPinWrap(pin, key)
      savePinWrap(wrap)
      setPinEnabled(true)
      resetPinAttempts()
      pushToast({ tone: 'success', title: 'Đã thiết lập mã PIN' })
    },
    [pushToast],
  )

  const clearPin = useCallback(async () => {
    savePinWrap(null)
    setPinEnabled(false)
    pushToast({ tone: 'info', title: 'Đã xoá mã PIN' })
  }, [pushToast])

  // --- sending --------------------------------------------------------------
  const send = useCallback(
    async (params: { to: string; amount: number; memo: string; category?: string; wish?: string }) => {
      const current = vaultRef.current
      const wallet = current?.wallets.find((w) => w.id === current.activeWalletId) || current?.wallets[0]
      if (!current || !wallet) throw new Error('Chưa chọn ví')

      const rpcUrlNow = current.prefs.rpcUrl || DEFAULT_RPC_URL
      const keypair = Keypair.fromSecretKey(Uint8Array.from(wallet.secret))

      try {
        const { signature } = await sendUsdc({
          rpcUrl: rpcUrlNow,
          from: keypair,
          to: params.to.trim(),
          amount: params.amount,
          memo: params.memo,
          decimals: balance.decimals || USDC_DECIMALS_FALLBACK,
        })

        const meta = { ...current.txMeta }
        meta[signature] = {
          category: params.category || 'pay',
          wish: params.wish || '',
          note: params.memo,
        }
        await persist({ ...current, txMeta: meta })

        if (prefs.sound) ringSuccess()
        vibrate([60, 40, 120])
        if (prefs.notifications) {
          showSystemNotification(
            'Chuyển tiền thành công',
            `${params.amount} USDC · ${params.memo || 'không ghi chú'}`,
            signature,
          )
        }
        pushToast({
          tone: 'success',
          title: 'Chuyển tiền thành công',
          body: `${params.amount} USDC đã gửi`,
          signature,
        })
        void refresh()
        return signature
      } catch (error: any) {
        if (prefs.sound) ringError()
        vibrate(220)
        const message = error?.message || 'Giao dịch thất bại'
        pushToast({ tone: 'error', title: 'Chuyển tiền thất bại', body: message })
        throw new Error(message)
      }
    },
    [balance.decimals, persist, prefs.notifications, prefs.sound, pushToast, refresh],
  )

  // --- send SOL -------------------------------------------------------------
  const sendSol = useCallback(
    async (params: { to: string; amount: number; memo?: string }) => {
      const current = vaultRef.current
      const wallet = current?.wallets.find((w) => w.id === current.activeWalletId) || current?.wallets[0]
      if (!current || !wallet) throw new Error('Chưa chọn ví')

      const rpcUrlNow = current.prefs.rpcUrl || DEFAULT_RPC_URL
      const keypair = Keypair.fromSecretKey(Uint8Array.from(wallet.secret))

      try {
        const signature = await transferSol(rpcUrlNow, keypair, params.to.trim(), params.amount, params.memo)

        if (prefs.sound) ringSuccess()
        vibrate([60, 40, 120])
        if (prefs.notifications) {
          showSystemNotification(
            'Chuyển SOL thành công',
            `${params.amount} SOL · ${params.memo || 'không ghi chú'}`,
            signature,
          )
        }
        pushToast({
          tone: 'success',
          title: 'Chuyển SOL thành công',
          body: `${params.amount} SOL đã gửi`,
          signature,
        })
        void refresh()
        return signature
      } catch (error: any) {
        if (prefs.sound) ringError()
        vibrate(220)
        const message = error?.message || 'Giao dịch thất bại'
        pushToast({ tone: 'error', title: 'Chuyển SOL thất bại', body: message })
        throw new Error(message)
      }
    },
    [prefs.notifications, prefs.sound, pushToast, refresh],
  )

  const exportSecrets = useCallback(
    (walletId?: string) => {
      const current = vaultRef.current
      if (!current) throw new Error('Ví đang bị khoá')
      const wallet = walletId
        ? current.wallets.find((w) => w.id === walletId)
        : current.wallets.find((w) => w.id === current.activeWalletId)
      if (!wallet) throw new Error('Không tìm thấy ví')
      return JSON.stringify(
        {
          address: wallet.address,
          name: wallet.name,
          secretKey: wallet.secret,
          base58: secretToBase58(Keypair.fromSecretKey(Uint8Array.from(wallet.secret))),
        },
        null,
        2,
      )
    },
    [],
  )

  const value: WalletContextValue = {
    session,
    wallets: vault?.wallets || [],
    activeWallet,
    contacts: vault?.contacts || [],
    txMeta: vault?.txMeta || {},
    samples: vault?.samples || [],
    prefs,
    price,
    balance,
    history,
    historyLoading,
    toasts,
    telegramUser,
    pinEnabled,
    realtimeConnected,
    autoLockSeconds: secondsLeft,
    lastPayment,
    airdrop,
    refresh,
    setPrefs,
    createWallet,
    importResultToWallet,
    setActiveWallet,
    renameWallet,
    removeWallet,
    saveContacts,
    saveTxMeta,
    send,
    sendSol,
    unlockWithPin,
    unlockWithSecret,
    setPin,
    clearPin,
    lock,
    completeOnboarding,
    extendAutoLock: extend,
    pushToast,
    dismissToast,
    exportSecrets,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
