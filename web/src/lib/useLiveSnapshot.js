import { useEffect, useState } from 'react';

// Server đẩy một khung ít nhất mỗi 30s; quá 40s không có khung nghĩa là kênh đã chết.
const STALE_AFTER_MS = 40000;
const CHECK_EVERY_MS = 5000;

/**
 * Nhận snapshot qua server-sent events. Server giữ một kết nối tới nguồn gốc và
 * đẩy mọi thay đổi xuống, nên giao diện cập nhật tức thì mà không cần tự hỏi vòng.
 */
export function useLiveSnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState('connecting');

  useEffect(() => {
    let source = null;
    let lastFrameAt = Date.now();

    const open = () => {
      source = new EventSource('/api/stream');
      source.addEventListener('open', () => setConnection('open'));
      source.addEventListener('snapshot', (event) => {
        lastFrameAt = Date.now();
        try {
          setSnapshot(JSON.parse(event.data));
          setConnection('open');
        } catch {
          /* khung hỏng — khung kế tiếp sẽ thay thế */
        }
      });
      source.addEventListener('error', () => setConnection('error'));
    };

    const reconnect = () => {
      lastFrameAt = Date.now();
      source?.close();
      open();
    };

    const isStale = () => Date.now() - lastFrameAt > STALE_AFTER_MS;

    open();

    // Kênh có thể đứt lặng lẽ (proxy đổi, tab bị treo) mà không phát sự kiện lỗi.
    const watchdog = setInterval(() => {
      if (isStale()) {
        setConnection('error');
        reconnect();
      }
    }, CHECK_EVERY_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && isStale()) reconnect();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisible);
      source?.close();
    };
  }, []);

  return { snapshot, connection };
}
