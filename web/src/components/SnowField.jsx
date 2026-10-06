import { useEffect, useRef } from 'react';

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Soft drifting snow, drawn on a fixed canvas behind the content. */
export default function SnowField({ active }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ flakes: [], width: 0, height: 0, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const state = stateRef.current;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    const spawn = (anywhere) => ({
      x: Math.random() * state.width,
      y: anywhere ? Math.random() * state.height : -12,
      r: (Math.random() * 1.9 + 0.7) * state.dpr,
      vy: (Math.random() * 0.45 + 0.22) * state.dpr,
      vx: (Math.random() - 0.5) * 0.28 * state.dpr,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.008 + Math.random() * 0.018,
      swayAmp: (Math.random() * 0.6 + 0.3) * state.dpr,
      alpha: 0.3 + Math.random() * 0.45,
    });

    const resize = () => {
      state.dpr = Math.min(2, window.devicePixelRatio || 1);
      state.width = window.innerWidth;
      state.height = window.innerHeight;
      canvas.width = state.width * state.dpr;
      canvas.height = state.height * state.dpr;
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;

      const count = Math.min(
        110,
        Math.max(28, Math.round((state.width * state.height) / (26000 * state.dpr))),
      );
      state.flakes = Array.from({ length: count }, () => spawn(true));
    };

    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (!active || reduceMotion()) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const flake of state.flakes) {
        flake.sway += flake.swaySpeed;
        flake.x += flake.vx + Math.sin(flake.sway) * flake.swayAmp * 0.06;
        flake.y += flake.vy;
        if (flake.y > state.height * state.dpr + 12 || flake.x < -14 || flake.x > state.width * state.dpr + 14) {
          Object.assign(flake, spawn(false));
        }
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(226,238,255,${flake.alpha})`;
        ctx.shadowColor = 'rgba(170,200,255,.85)';
        ctx.shadowBlur = 3 * state.dpr;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    };

    resize();
    window.addEventListener('resize', resize);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  return <canvas className="snowfield" ref={canvasRef} aria-hidden="true" />;
}
