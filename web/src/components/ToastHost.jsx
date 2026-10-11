import { useEffect, useState } from 'react';
import { subscribeToasts } from '../lib/toast.js';
import Icon from './Icon.jsx';

const ICONS = { success: 'check', danger: 'alert', warn: 'alert', info: 'sparkle' };

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(
    () =>
      subscribeToasts((item) => {
        setItems((prev) => [...prev.slice(-3), item]);
        window.setTimeout(
          () => setItems((prev) => prev.filter((entry) => entry.id !== item.id)),
          item.ttl,
        );
      }),
    [],
  );

  if (!items.length) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast--${item.kind}`}>
          <Icon name={ICONS[item.kind] ?? 'sparkle'} size={16} />
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
