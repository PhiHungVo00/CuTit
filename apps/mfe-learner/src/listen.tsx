import { getDeviceSpeech } from '@vietlearning/native';
import { SLOW_FACTOR, speechRate } from '@vietlearning/state';
import { Button, Icon } from '@vietlearning/ui';
import { useT } from './i18n';

/**
 * Đọc bằng TTS của máy: tốc độ M12 × tốc độ gốc của màn (`base`); `slow` = nút nghe chậm (× SLOW_FACTOR, cùng hệ số với
 * coursePlayer của lộ trình). Mỗi MFE giữ bản riêng (Nguyên tắc 7: không import chéo remote).
 */
export const say = (text: string, base: number, slow = false): Promise<void> =>
  getDeviceSpeech()
    .speak(text, { rate: speechRate(base * (slow ? SLOW_FACTOR : 1)) })
    .catch(() => undefined);

/** Nút đọc chậm đặt cạnh nút nghe thường */
export function SlowListen({ text, base }: { text: string; base: number; className?: string }) {
  const t = useT();
  const label = t('listenSlow');
  return (
    <Button type="button" variant="secondary" aria-label={label} title={label} onClick={() => void say(text, base, true)} style={{ minWidth: 48, padding: '0 12px' }}>
      <Icon name="loa" size={18} />
      <span aria-hidden="true" style={{ fontSize: '0.8rem' }}>0.75×</span>
    </Button>
  );
}