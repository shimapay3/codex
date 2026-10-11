import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { clearStore, emptyStore, readStore, writeStore } from './storage.js';

// Trạng thái ứng dụng:
//   loading -> đang mở két
//   error   -> không giải mã được (két hỏng / thiếu khóa)
//   setup   -> chưa có phương thức mở khóa (passkey/PIN)
//   locked  -> đã có phương thức, đang khóa
//   ready   -> đã mở khóa

const VaultContext = createContext(null);

export function VaultProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [store, setStore] = useState(null);
  const [error, setError] = useState('');
  const hydratedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    readStore()
      .then((loaded) => {
        if (!alive) return;
        const data = loaded ?? emptyStore();
        hydratedRef.current = true;
        setStore(data);
        setStatus(data.auth ? 'locked' : 'setup');
        if (!loaded) writeStore(data).catch(() => {});
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || String(err));
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Mọi thay đổi đều được mã hóa lại và ghi vào localStorage.
  useEffect(() => {
    if (!hydratedRef.current || !store) return;
    writeStore(store).catch(() => {});
  }, [store]);

  useEffect(() => {
    if (!store?.theme) return;
    document.documentElement.dataset.theme = store.theme;
  }, [store?.theme]);

  const patch = useCallback((changes) => {
    setStore((prev) => (prev ? { ...prev, ...changes } : prev));
  }, []);

  const completeSetup = useCallback(({ auth, autoLockMs, theme }) => {
    setStore((prev) => ({ ...(prev ?? emptyStore()), auth, autoLockMs, theme }));
    setStatus('ready');
  }, []);

  const unlock = useCallback(() => setStatus('ready'), []);
  const lock = useCallback(() => setStatus('locked'), []);

  const setTheme = useCallback((theme) => patch({ theme }), [patch]);
  const setAutoLock = useCallback((autoLockMs) => patch({ autoLockMs }), [patch]);

  const addEntry = useCallback(
    (entry) => setStore((prev) => ({ ...prev, entries: [...prev.entries, entry] })),
    [],
  );
  const updateEntry = useCallback(
    (id, changes) =>
      setStore((prev) => ({
        ...prev,
        entries: prev.entries.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      })),
    [],
  );
  const deleteEntry = useCallback(
    (id) =>
      setStore((prev) => ({
        ...prev,
        entries: prev.entries.filter((item) => item.id !== id),
      })),
    [],
  );

  const resetVault = useCallback(() => {
    clearStore();
    setStore(emptyStore());
    setStatus('setup');
  }, []);

  const value = useMemo(
    () => ({
      status,
      error,
      data: store ?? emptyStore(),
      unlocked: status === 'ready',
      completeSetup,
      unlock,
      lock,
      setTheme,
      setAutoLock,
      addEntry,
      updateEntry,
      deleteEntry,
      resetVault,
    }),
    [
      status,
      error,
      store,
      completeSetup,
      unlock,
      lock,
      setTheme,
      setAutoLock,
      addEntry,
      updateEntry,
      deleteEntry,
      resetVault,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault phải dùng bên trong VaultProvider.');
  return context;
}
