import { useEffect, useRef, useState } from 'react';

const THEMES = [
  { id: 'gold', name: 'Hoàng Ân', swatch: 'linear-gradient(120deg,#120c03,#e8c477,#fff1c9)' },
  { id: 'neon', name: 'Neon Tokyo', swatch: 'linear-gradient(120deg,#0b0716,#ff2ec4,#00e5ff)' },
  { id: 'aurora', name: 'Aurora', swatch: 'linear-gradient(120deg,#04100e,#2dd4bf,#a78bfa)' },
  { id: 'mint', name: 'Solar Mint', swatch: 'linear-gradient(120deg,#ecfdf5,#99f6e4,#a3e635)' },
  { id: 'term', name: 'Terminal', swatch: 'linear-gradient(120deg,#050a06,#00ff66,#7dffb0)' },
  { id: 'wave', name: 'Synthwave', swatch: 'linear-gradient(120deg,#2f1a58,#ff7edb,#ffb35c)' },
  { id: 'ice', name: 'Quantum Ice', swatch: 'linear-gradient(120deg,#050c1c,#0284c7,#818cf8)' },
];

export default function ThemeDock({ theme, onTheme, snow, onSnow }) {
  const [open, setOpen] = useState(false);
  const dockRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (dockRef.current && !dockRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dock" ref={dockRef}>
      <div className={`dock__panel${open ? ' is-open' : ''}`} role="dialog" aria-label="Tuỳ chỉnh hiển thị">
        <p className="dock__label">Chủ đề</p>
        <div className="dock__themes">
          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`swatch${item.id === theme ? ' is-on' : ''}`}
              aria-pressed={item.id === theme}
              onClick={() => onTheme(item.id)}
            >
              <span className="swatch__preview" style={{ background: item.swatch }} aria-hidden="true" />
              <span className="swatch__name">{item.name}</span>
            </button>
          ))}
        </div>

        <div className="dock__fx">
          <span className="dock__label">Hiệu ứng</span>
          <button
            type="button"
            className={`toggle${snow ? ' is-on' : ''}`}
            aria-pressed={snow}
            onClick={() => onSnow(!snow)}
          >
            <span className="toggle__track" aria-hidden="true">
              <span className="toggle__knob" />
            </span>
            <span className="toggle__text">Tuyết rơi</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`dock__fab${open ? ' is-on' : ''}`}
        aria-expanded={open}
        aria-label="Chọn chủ đề và hiệu ứng"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="13.5" cy="6.5" r="1.2" />
          <circle cx="17.5" cy="10.5" r="1.2" />
          <circle cx="8.5" cy="7.5" r="1.2" />
          <circle cx="6.5" cy="12.5" r="1.2" />
          <path d="M12 2.7a9.3 9.3 0 1 0 9.3 9.3c0-1.1-.9-2-2-2h-1.6a2.4 2.4 0 0 1-1.8-4c.6-.6.5-1.6-.2-2A9.2 9.2 0 0 0 12 2.7Z" />
        </svg>
      </button>
    </div>
  );
}
