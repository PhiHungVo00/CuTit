import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CuTit } from '@vietlearning/ui';
import { EventBus } from '@vietlearning/shared';
import { defineMessages, useDeviceSettings } from '@vietlearning/state';
import { playSfx } from '../audio/lazyAudio';
import { prefetchPath } from '../routes';
import { useBubbleVisibility } from './useBubbleVisibility';
import { useTransitionNavigate } from './useTransitionNavigate';

const BubbleIntro = lazy(() => import('./BubbleIntro'));

const { useT } = defineMessages({ ask: 'Hỏi Bé Cu Tít' }, { ask: 'Ask Bé Cu Tít' });

/** Cu Tít đang chờ AI trả lời? MFE chat phát `cutit:thinking` { thinking } qua EventBus (Task 12 nối). */
function useThinking(): boolean {
  const [thinking, setThinking] = useState(false);
  useEffect(() => EventBus.getInstance().subscribe('cutit:thinking', (d: { thinking?: boolean }) => setThinking(Boolean(d?.thinking))), []);
  return thinking;
}

/** Bong bóng Cu Tít góc phải dưới, trên thanh tab: chạm mở thẳng chat. Chunk lười, gắn sau lần vẽ đầu. */
export default function CuTitBubble() {
  const t = useT();
  const go = useTransitionNavigate();
  const { pathname } = useLocation();
  const visibility = useBubbleVisibility(pathname);
  const thinking = useThinking();
  const seenIntro = useDeviceSettings((s) => s.seenBubbleIntro);
  if (visibility === 'hidden') return null;
  const mini = visibility === 'mini';
  return (
    <>
      {!seenIntro && !mini && (
        <Suspense fallback={null}>
          <BubbleIntro />
        </Suspense>
      )}
      <button
        type="button"
        className={mini ? 'cutit-bubble mini' : 'cutit-bubble'}
        aria-label={t('ask')}
        onPointerDown={() => prefetchPath('/hoi-thoai')}
        onClick={() => {
          playSfx('mo-bong-bong');
          go('/hoi-thoai');
        }}
      >
        <CuTit mood={thinking ? 'suy-nghi' : 'chan-dung'} size={mini ? 32 : 52} animate={thinking} alt="" preload={['suy-nghi', 'chan-dung']} />
      </button>
    </>
  );
}
