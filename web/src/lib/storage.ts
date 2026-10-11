const PREFIX = 'cloudpay.'

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — the app keeps working in memory */
  }
}

export function removeLocal(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

export const StorageKeys = {
  vault: 'vault.v1',
  passkey: 'passkey.v1',
  pinWrap: 'pin.v1',
  pinEnabled: 'pinEnabled.v1',
  prefs: 'prefs.v1',
  localData: 'localdata.v1',
} as const
