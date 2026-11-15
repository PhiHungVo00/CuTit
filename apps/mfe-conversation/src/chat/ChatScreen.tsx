import { Link } from 'react-router-dom';
import { useLearner } from '@vietlearning/state';
import { ChatPanel } from './ChatPanel';
import { useChatSession } from './useChatSession';
import { useT } from '../i18n';

/** Màn hình M1: trò chuyện tự do với gia sư (chữ), sửa lỗi theo mức người học chọn, gợi ý khối học liên quan. */
export function ChatScreen() {
  const t = useT();
  const persona = useLearner((s) => s.preferences.persona);
  const session = useChatSession();
  const tutorName = persona === 'co_giao' ? t('teacherName') : 'Bé Cu Tít';

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">{t('chatTitle')}</h1>
          <Link to="/nhap-vai" className="flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
            {t('roleplayLink')}
          </Link>
        </header>
        <ChatPanel
          session={session}
          tutorName={tutorName}
          placeholder={t('chatPlaceholder')}
          emptyHint={t('chatEmpty', { name: tutorName })}
        />
      </div>
    </div>
  );
}
