import { useT } from '../i18n';
import { playText } from './coursePlayer';

/** Nút 🐢 (D9 mục 6): đọc lại chậm — tệp dựng sẵn phát 0,75× giữ cao độ, TTS của máy giảm tốc độ */
export function SlowButton({ text }: { text: string }) {
  const t = useT();
  return (
    <button type="button" aria-label={t('listenSlow')} title={t('listenSlow')} onClick={() => void playText(text, undefined, { slow: true })} className="min-h-12 min-w-12 shrink-0 rounded-xl border border-line bg-surface-2 px-3 text-lg">
      🐢
    </button>
  );
}
