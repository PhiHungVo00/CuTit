import { useEffect, useState } from 'react';
import type { ConnState } from '../client/types';
import { useT } from '../i18n';

/** Thanh nhỏ: ngoại tuyến (máy mất mạng) hoặc "Đang kết nối…" (WebSocket đang nối lại). Có chữ, không chỉ màu. */
export function ConnectionBar({ state }: { state: ConnState }) {
  const t = useT();
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const text = !online ? t('chat.offlineBar') : state === 'reconnecting' || state === 'connecting' ? t('chat.reconnecting') : null;
  if (!text) return null;
  return (
    <p role="status" className="m-0 rounded-xl bg-surface-2 px-3 py-2 text-sm font-bold text-ink">
      {text}
    </p>
  );
}
