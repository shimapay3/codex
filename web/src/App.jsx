import { useEffect, useState } from 'react';
import Hero from './components/Hero.jsx';
import StatStrip from './components/StatStrip.jsx';
import LedgerTable from './components/LedgerTable.jsx';
import ImmortalBand from './components/ImmortalBand.jsx';
import ThemeDock from './components/ThemeDock.jsx';
import SnowField from './components/SnowField.jsx';
import { useLiveSnapshot } from './lib/useLiveSnapshot.js';

const THEME_COLOR = {
  gold: '#06060c',
  neon: '#07060d',
  aurora: '#04100e',
  mint: '#f3faf6',
  term: '#050a06',
  wave: '#120a20',
  ice: '#050c1c',
};

export default function App() {
  const { snapshot, connection } = useLiveSnapshot();
  const [theme, setTheme] = useState(() => localStorage.getItem('sky_theme') || 'gold');
  const [snow, setSnow] = useState(() => localStorage.getItem('sky_snow') !== '0');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('sky_theme', theme);

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = THEME_COLOR[theme] || '#06060c';
  }, [theme]);

  useEffect(() => {
    document.body.dataset.snow = snow ? 'on' : 'off';
    localStorage.setItem('sky_snow', snow ? '1' : '0');
  }, [snow]);

  return (
    <div className="sky">
      <div className="sky__aura" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="sky__grain" aria-hidden="true" />
      <SnowField active={snow} />

      <main className="wrap">
        <Hero
          sheetName={snapshot?.sheetName}
          status={snapshot?.status}
          connection={connection}
          fetchedAt={snapshot?.fetchedAt}
        />
        <StatStrip snapshot={snapshot} />
        <LedgerTable snapshot={snapshot} connection={connection} />
        <ImmortalBand />
        <footer className="foot">
          <span>Tài Chính Đô La Xanh</span>
          <span className="foot__sep" aria-hidden="true">·</span>
          <span>1 Bản-USD = {snapshot?.rate ? snapshot.rate.toLocaleString('vi-VN') : '300.000'} ₫</span>
        </footer>
      </main>

      <ThemeDock theme={theme} onTheme={setTheme} snow={snow} onSnow={setSnow} />
    </div>
  );
}
