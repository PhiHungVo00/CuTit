import { getDeviceSpeech } from '@vietlearning/native';
import { playSfx } from '@vietlearning/shared/audio';
import { SLOW_FACTOR, speechRate } from '@vietlearning/state';
import { useT } from './i18n';

/**
 * Đọc bằng TTS của máy: tốc độ M12 × tốc độ gốc của màn (`base`); `slow` = nút nghe chậm (× SLOW_FACTOR, cùng hệ số với
 * coursePlayer của lộ trình). Mỗi MFE giữ bản riêng (Nguyên tắc 7: không import chéo remote).
 */
export const say = (text: string, base: number, slow = false): Promise<void> => {
  playSfx('cutit-noi'); // báo hiệu Cu Tít sắp nói, trước khi TTS bắt đầu
  return getDeviceSpeech()
    .speak(text, { rate: speechRate(base * (slow ? SLOW_FACTOR : 1)) })
    .catch(() => undefined);
};

/** Nút đọc chậm đặt cạnh nút nghe thường */
export function SlowListen({ text, base, className = 'min-h-11 min-w-11 shrink-0 rounded-xl border border-line bg-surface-2 px-3 text-lg' }: { text: string; base: number; className?: string }) {
  const t = useT();
  const label = t('listenSlow');
  return (
    <button type="button" aria-label={label} title={label} onClick={() => void say(text, base, true)} className={className}>
      0.75×
    </button>
  );
}
