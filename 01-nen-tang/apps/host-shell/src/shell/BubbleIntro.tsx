import { defineMessages, setDeviceSettings } from '@vietlearning/state';

const { useT } = defineMessages(
  { text: 'Cu Tít ở đây! Chạm vào mình để hỏi bất cứ lúc nào.', ok: 'Đã hiểu' },
  { text: 'Cu Tít is here! Tap me to ask anything, any time.', ok: 'Got it' }
);

/** Giới thiệu bong bóng một lần cho người mới; bấm "Đã hiểu" thì không hiện lại (deviceSettings.seenBubbleIntro). */
export default function BubbleIntro() {
  const t = useT();
  return (
    <div className="bubble-intro" role="dialog" aria-label={t('text')}>
      <p>{t('text')}</p>
      <button type="button" onClick={() => setDeviceSettings({ seenBubbleIntro: true })}>
        {t('ok')}
      </button>
    </div>
  );
}
