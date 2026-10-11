import { useEffect } from 'react';

// Tự khóa ứng dụng sau khi không thao tác trong `ms` mili-giây.
// Tab bị ẩn: ghi lại thời điểm rời tab; quay lại mà đã quá hạn thì khóa luôn.
export function useIdleLock({ enabled, ms, onLock }) {
  useEffect(() => {
    if (!enabled || !ms) return undefined;

    const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'focus'];
    let timer = null;
    let leftAt = null;

    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onLock, ms);
    };

    const handleActivity = () => {
      if (document.visibilityState !== 'visible') return;
      arm();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        leftAt = Date.now();
        if (timer) clearTimeout(timer);
        timer = null;
      } else if (leftAt && Date.now() - leftAt >= ms) {
        leftAt = null;
        onLock();
      } else {
        leftAt = null;
        arm();
      }
    };

    ACTIVITY.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibility);
    arm();

    return () => {
      if (timer) clearTimeout(timer);
      ACTIVITY.forEach((event) => window.removeEventListener(event, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, ms, onLock]);
}
