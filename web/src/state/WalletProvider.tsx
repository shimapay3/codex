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
  PasskeyRecord,
  assertPasskey,
  platformAuthenticatorAvailable,
  registerPasskey,
  verifyPrf,
} from '../lib/passkey'
import {
  DEFAULT_RPC_URL,
  PriceInfo,
  TxEntry,
  AirdropInfo,
  fetchPrice,
  fetchTokenHistory,
  fetchTransactionSummary,
  getSolBalance,
  getUsdcBalance,
  initAirdrop,
  fetchAirdropStatus,
  sendUsdc,
  USDC_DECIMALS_FALLBACK,
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
import { readLocal, writeLocal, removeLocal, StorageKeys } from '../lib/storage'
import { downloadBackup, uploadBackup } from '../lib/cloud'
import { useRealtime, PaymentEvent } from './useRealtime'
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
} from './vault'
import { hkdf, importAesKey, unwrapKey } from '../lib/crypto'

export const DEFAULT_PREFS: Prefs = {
  mode: 'dark',
  accentId: 'solana',
  accentColor: null,
  rpcUrl: DEFAULT_RPC_URL,
  priceEndpoint: '',
  autoLockMinutes: 5,
  fiat: 'both',
  notifications: true,
  sound: true,
  hideBalances: false,
}

export type Session = 'booting' | 'onboarding' | 'locked' | 'unlocked'

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
  passkeyRecord: PasskeyRecord | null
  pinEnabled: boolean
  platformAuthAvailable: boolean
  realtimeConnected: boolean
  backupAt: number | null
  backupBusy: boolean
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
  unlockWithPasskey: () => Promise<'unlocked' | 'pin-required'>
  unlockWithPin: (pin: string) => Promise<void>
  unlockWithSecret: (input: string) => Promise<void>
  confirmPasskey: () => Promise<void>
  enablePasskey: () => Promise<void>
  disablePasskey: () => Promise<void>
  setPin: (pin: string) => Promise<void>
  clearPin: () => Promise<void>
  lock: () => void
  completeOnboarding: () => void
  extendAutoLock: () => void
  backupNow: () => Promise<void>
  restoreFromCloud: (input: string) => Promise<number>
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

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>('booting')
  const [store, setStore] = useState<VaultStore | null>(null)
  const [vault, setVault] = useState<VaultData | null>(null)
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefsMirror)
  const [passkeyRecord, setPasskeyRecord] = useState<PasskeyRecord | null>(null)
  const [pinEnabled, setPinEnabled] = useState<boolean>(() => !!loadPinWrap())
  const [platformAuthAvailable, setPlatformAuthAvailable] = useState(false)
  const [price, setPrice] = useState<PriceInfo>({ usd: 1, vnd: 30000, source: 'fixed' })
  const [balance, setBalance] = useState<BalanceState>({
    usdc: 0,
    sol: 0,
    decimals: USDC_DECIMALS_FALLBACK,
    loading: false,
  })
  const [history, setHistory] = useState<TxEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [backupAt, setBackupAt] = useState<number | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
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
  const backupTimer = useRef<number | undefined>(undefined)
  const lastAirdropStatusRef = useRef<AirdropState['status']>('idle')

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
    const record = readLocal<PasskeyRecord | null>(StorageKeys.passkey, null)
    setPasskeyRecord(record)
    setPinEnabled(!!loadPinWrap())
    setSession(existing ? 'locked' : 'onboarding')
    void platformAuthenticatorAvailable().then(setPlatformAuthAvailable)
  }, [])

  // --- theme ----------------------------------------------------------------
  useEffect(() => {
    applyTheme(prefs.mode, prefs.accentId, prefs.accentColor || undefined)
    writeLocal(StorageKeys.prefs, prefs)
  }, [prefs])

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((current) => ({ ...current, ...patch }))
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
      setBackupAt(data.lastBackupAt)
      seenRef.current = new Set()
      return data
    },
    [],
  )

  // --- unlock paths ---------------------------------------------------------
  const unlockWithPasskey = useCallback(async (): Promise<'unlocked' | 'pin-required'> => {
    const current = loadStore()
    if (!current) throw new Error('Chưa có ví nào trên thiết bị này')
    const record = passkeyRecord || readLocal<PasskeyRecord | null>(StorageKeys.passkey, null)
    if (!record) throw new Error('Chưa thiết lập Passkey')

    primeAudio()
    const { prfBytes } = await assertPasskey(record)

    if (record.prf) {
      if (!prfBytes) throw new Error('Passkey không trả về khoá PRF')
      if (!(await verifyPrf(record, prfBytes))) {
        throw new Error('Passkey không khớp với ví này')
      }
      const kek = await importAesKey(await hkdf(prfBytes, PASSKEY_INFO))
      if (!current.passkeyWrap) throw new Error('Ví này chưa được bảo vệ bằng Passkey')
      const vaultKey = await unwrapKey(kek, current.passkeyWrap)
      await unlockWithData(vaultKey)
      ringSuccess()
      return 'unlocked'
    }

    // Without PRF the Passkey proves identity; the PIN releases the vault key.
    if (!loadPinWrap()) throw new Error('Thiết bị không hỗ trợ PRF — hãy mở khoá bằng khoá bí mật hoặc PIN')
    return 'pin-required'
  }, [passkeyRecord, unlockWithData])

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const wrap = loadPinWrap()
      if (!wrap) throw new Error('Chưa thiết lập mã PIN')
      try {
        const vaultKey = await openPinWrap(pin, wrap)
        await unlockWithData(vaultKey)
        ringSuccess()
      } catch {
        ringError()
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
      return wallet
    },
    [persist],
  )

  const createWallet = useCallback(
    async (input?: string, name?: string): Promise<WalletRecord> => {
      const currentVault = vaultRef.current
      const currentKey = vaultKeyRef.current

      // First wallet of a brand new install: bootstrap the encrypted vault.
      if (!currentVault || !currentKey) {
        const generated = Keypair.generate()
        const result: ImportResult = input?.trim()
          ? await importSecret(input)
          : {
              keypair: generated,
              kind: 'generated' as ImportResult['kind'],
              canonicalSecret: Array.from(generated.secretKey),
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
    },
    [persist],
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

  // --- SOL airdrop ----------------------------------------------------------
  const checkAirdrop = useCallback(
    async (address: string, rpcUrl: string) => {
      try {
        const info = await initAirdrop(address, rpcUrl)
        const status = (info.status === 'none' ? 'idle' : info.status) as AirdropState['status']
        lastAirdropStatusRef.current = status
        setAirdrop({
          status,
          payserver: info.payserver || null,
          signature: info.signature,
          error: info.error,
        })
        if (status === 'pending' || status === 'sending') {
          pushToast({ tone: 'info', title: 'Đang chờ airdrop SOL', body: 'Payserver sẽ chuyển 1 SOL phí gas' })
        }
      } catch {
        lastAirdropStatusRef.current = 'idle'
        setAirdrop({ status: 'idle', payserver: null, signature: null, error: null })
      }
    },
    [pushToast],
  )

  // Poll airdrop status while pending or sending.
  useEffect(() => {
    if (airdrop.status !== 'pending' && airdrop.status !== 'sending') return
    const wallet =
      vaultRef.current?.wallets.find((w) => w.id === vaultRef.current?.activeWalletId) ||
      vaultRef.current?.wallets[0]
    if (!wallet) return
    const timer = window.setInterval(async () => {
      const info = await fetchAirdropStatus(wallet.address)
      const status = (info.status === 'none' ? 'idle' : info.status) as AirdropState['status']
      if (status === lastAirdropStatusRef.current) return
      lastAirdropStatusRef.current = status
      setAirdrop({
        status,
        payserver: info.payserver || null,
        signature: info.signature,
        error: info.error,
      })
      if (status === 'confirmed') {
        if (prefs.sound) ringIncoming()
        vibrate([90, 60, 90])
        if (prefs.notifications) showSystemNotification('Đã nhận 1 SOL', 'Payserver đã chuyển SOL phí gas')
        pushToast({ tone: 'success', title: 'Đã nhận 1 SOL', body: 'Ví đã được nạp phí gas' })
        void refresh()
      } else if (status === 'error') {
        pushToast({ tone: 'error', title: 'Airdrop thất bại', body: info.error || 'Không nhận được SOL' })
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [airdrop.status, prefs.notifications, prefs.sound, pushToast, refresh])

  // Check airdrop when session unlocks or active wallet changes.
  useEffect(() => {
    if (session !== 'unlocked') return
    const wallet = activeWallet
    if (!wallet) return
    const rpcUrlNow = prefs.rpcUrl || DEFAULT_RPC_URL
    void checkAirdrop(wallet.address, rpcUrlNow)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeWallet?.id, prefs.rpcUrl])

  // --- realtime -------------------------------------------------------------
  const addresses = useMemo(() => (vault?.wallets || []).map((wallet) => wallet.address), [vault])
  const rpcUrl = prefs.rpcUrl || DEFAULT_RPC_URL

  const handleRealtime = useCallback(
    async (events: PaymentEvent[]) => {
      const wallet = vaultRef.current?.wallets[0]
      if (!wallet) return
      const rpcUrlNow = vaultRef.current?.prefs.rpcUrl || DEFAULT_RPC_URL
      const summaries: TxEntry[] = []
      for (const event of events.slice(0, 3)) {
        if (seenRef.current.has(event.signature)) continue
        seenRef.current.add(event.signature)
        const summary = await fetchTransactionSummary(rpcUrlNow, event.signature, event.address)
        if (summary && summary.direction === 'in' && summary.status === 'success') {
          summaries.push(summary)
        }
      }
      if (summaries.length) {
        announcePayment(summaries, events[0].address)
        void refreshHistory({ silent: true })
      }
    },
    [announcePayment, refreshHistory],
  )

  const { connected: realtimeConnected } = useRealtime({
    rpcUrl,
    addresses,
    enabled: session === 'unlocked' && addresses.length > 0,
    onPayment: handleRealtime,
  })

  // --- polling --------------------------------------------------------------
  useEffect(() => {
    if (session !== 'unlocked') return
    void refresh()
    const timer = window.setInterval(() => void refresh(), 25000)
    return () => window.clearInterval(timer)
  }, [session, activeWallet?.id, rpcUrl, refresh])

  useEffect(() => {
    if (session !== 'unlocked') return
    const load = () => void fetchPrice(prefs.priceEndpoint).then(setPrice)
    load()
    const timer = window.setInterval(load, 60000)
    return () => window.clearInterval(timer)
  }, [session, prefs.priceEndpoint])

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

  // --- cloud backup ---------------------------------------------------------
  const buildBackupPayload = useCallback(() => {
    const current = vaultRef.current
    if (!current) return null
    return {
      wallets: current.wallets,
      contacts: current.contacts,
      settings: { prefs: current.prefs },
      transactionMeta: current.txMeta,
      balanceSamples: current.samples,
    }
  }, [])

  const backupNow = useCallback(async () => {
    const current = vaultRef.current
    if (!current || !current.wallets.length) return
    const anchor = current.wallets[0]
    setBackupBusy(true)
    try {
      const payload = buildBackupPayload()
      if (!payload) return
      const updatedAt = await uploadBackup(anchor.address, Uint8Array.from(anchor.secret), payload)
      setBackupAt(updatedAt)
      await persist({ ...current, lastBackupAt: updatedAt, cloudBackup: true })
      pushToast({ tone: 'success', title: 'Đã sao lưu đám mây', body: `Ví ${anchor.name}` })
    } catch (error: any) {
      pushToast({ tone: 'error', title: 'Sao lưu thất bại', body: error?.message })
    } finally {
      setBackupBusy(false)
    }
  }, [buildBackupPayload, persist, pushToast])

  useEffect(() => {
    if (session !== 'unlocked' || !vault?.cloudBackup) return
    window.clearTimeout(backupTimer.current)
    backupTimer.current = window.setTimeout(() => {
      void backupNow()
    }, 4000)
    return () => window.clearTimeout(backupTimer.current)
  }, [session, vault?.contacts, vault?.wallets, vault?.txMeta, vault?.prefs, vault?.cloudBackup, backupNow])

  const restoreFromCloud = useCallback(
    async (input: string) => {
      const { keypair } = await importSecret(input)
      const address = keypair.publicKey.toBase58()
      const payload = await downloadBackup(address, keypair.secretKey)
      if (!payload) throw new Error('Không tìm thấy bản sao lưu cho khoá này')

      const vaultKey = newVaultKey()
      const wallets = (payload.wallets || []) as WalletRecord[]
      if (!wallets.length) throw new Error('Bản sao lưu không có ví nào')

      const data = emptyVault(loadPrefsMirror())
      data.wallets = wallets
      data.activeWalletId = wallets[0].id
      data.contacts = (payload.contacts || []) as Contact[]
      data.txMeta = (payload.transactionMeta || {}) as VaultData['txMeta']
      data.samples = (payload.balanceSamples || []) as BalanceSample[]
      data.cloudBackup = true
      data.lastBackupAt = payload.savedAt || Date.now()

      const created = await createVaultStore(wallets[0], vaultKey, data)
      for (const wallet of wallets.slice(1)) {
        const wrap = await buildKeyWrap(wallet.id, Uint8Array.from(wallet.secret), vaultKey)
        created.keyWraps[wallet.id] = wrap.envelope
      }
      created.index = wallets.map(toIndex)
      saveStore(created)
      setStore(created)
      vaultKeyRef.current = vaultKey
      setVault(data)
      vaultRef.current = data
      // Stay in 'onboarding' so the secure step is shown.
      seenRef.current = new Set()
      pushToast({
        tone: 'success',
        title: 'Đã khôi phục từ đám mây',
        body: `${wallets.length} ví đã được phục hồi`,
      })
      return wallets.length
    },
    [pushToast],
  )

  /**
   * Re-authorise a sensitive action (sending money) with the Passkey. No-ops
   * when the user has not enrolled one, so the wallet still works with a plain
   * secret key.
   */
  const confirmPasskey = useCallback(async () => {
    const record = passkeyRecord || readLocal<PasskeyRecord | null>(StorageKeys.passkey, null)
    if (!record) return
    primeAudio()
    const { prfBytes } = await assertPasskey(record)
    if (record.prf) {
      if (!prfBytes) throw new Error('Passkey không trả về khoá PRF')
      if (!(await verifyPrf(record, prfBytes))) throw new Error('Passkey không khớp với ví này')
    }
    ringUnlock()
  }, [passkeyRecord])

  // --- passkey / pin setup --------------------------------------------------
  const enablePasskey = useCallback(async () => {
    const current = loadStore()
    const key = vaultKeyRef.current
    if (!current || !key) throw new Error('Ví đang bị khoá')
    primeAudio()
    const label = `Cloud Pay · ${(vaultRef.current?.wallets[0]?.name || 'Ví')}`
    const { record, prfBytes } = await registerPasskey(label)

    if (!prfBytes && !loadPinWrap()) {
      throw new Error('Thiết bị không hỗ trợ PRF. Vui lòng đặt mã PIN trước khi bật Passkey.')
    }

    writeLocal(StorageKeys.passkey, record)
    setPasskeyRecord(record)

    if (prfBytes) {
      const kek = await importAesKey(await hkdf(prfBytes, PASSKEY_INFO))
      const { wrapKey } = await import('../lib/crypto')
      const wrapped = await wrapKey(kek, key)
      const updated: VaultStore = { ...current, passkeyWrap: wrapped }
      saveStore(updated)
      setStore(updated)
      pushToast({ tone: 'success', title: 'Đã bật Passkey', body: 'Bảo vệ bằng khoá phần cứng (PRF)' })
    } else {
      pushToast({
        tone: 'info',
        title: 'Passkey đã bật',
        body: 'Mở khoá bằng Passkey + mã PIN',
      })
    }
    ringSuccess()
  }, [pushToast])

  const disablePasskey = useCallback(async () => {
    const current = loadStore()
    removeLocal(StorageKeys.passkey)
    savePinWrap(null)
    setPasskeyRecord(null)
    setPinEnabled(false)
    if (current) {
      const { passkeyWrap, ...rest } = current
      saveStore(rest as VaultStore)
      setStore(rest as VaultStore)
    }
    pushToast({ tone: 'info', title: 'Đã tắt Passkey', body: 'Ví sẽ yêu cầu khoá bí mật khi mở lại' })
  }, [pushToast])

  const setPin = useCallback(
    async (pin: string) => {
      const key = vaultKeyRef.current
      if (!key) throw new Error('Ví đang bị khoá')
      if (!/^\d{6}$/.test(pin)) throw new Error('Mã PIN phải gồm 6 chữ số')
      const wrap = await setPinWrap(pin, key)
      savePinWrap(wrap)
      setPinEnabled(true)
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
    passkeyRecord,
    pinEnabled,
    platformAuthAvailable,
    realtimeConnected,
    backupAt,
    backupBusy,
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
    unlockWithPasskey,
    unlockWithPin,
    unlockWithSecret,
    confirmPasskey,
    enablePasskey,
    disablePasskey,
    setPin,
    clearPin,
    lock,
    completeOnboarding,
    extendAutoLock: extend,
    backupNow,
    restoreFromCloud,
    pushToast,
    dismissToast,
    exportSecrets,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
