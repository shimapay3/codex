import { useEffect, useRef, useState } from 'react';

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Eases a number toward its new value so live updates feel deliberate. */
export function useCountUp(value, duration = 700) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    // Tab ẩn thì requestAnimationFrame không chạy: nhảy thẳng tới giá trị đúng.
    if (reduceMotion() || document.hidden || fromRef.current === target) {
      fromRef.current = target;
      setDisplay(target);
      return undefined;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return display;
}
