import { useEffect, useRef } from 'react';

// Nền "ngoài không gian": tinh vân (CSS) + trường sao lấp lánh (canvas).
export default function SpaceBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let stars = [];
    let frame = 0;
    let raf = 0;

    const seed = () => {
      const count = Math.max(60, Math.round((width * height) / 9000));
      const tints = ['255,255,255', '186,214,255', '190,255,240', '226,205,255'];
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.3 + 0.2,
        base: Math.random() * 0.5 + 0.25,
        speed: Math.random() * 0.02 + 0.004,
        phase: Math.random() * Math.PI * 2,
        tint: tints[Math.floor(Math.random() * tints.length)],
      }));
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        const alpha = reduced
          ? star.base
          : star.base * (0.55 + 0.45 * Math.sin(frame * star.speed + star.phase));
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.fillStyle = `rgb(${star.tint})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      frame += 1;
      paint();
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduced) {
      paint();
    } else {
      loop();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="space-backdrop" aria-hidden="true">
      <div className="space-nebula space-nebula--a" />
      <div className="space-nebula space-nebula--b" />
      <div className="space-nebula space-nebula--c" />
      <canvas ref={canvasRef} className="space-stars" />
      <div className="space-vignette" />
    </div>
  );
}
