import { Link } from 'react-router-dom';
import { useLearner } from '@vietlearning/state';
import { ChatPanel } from './ChatPanel';
import { useChatSession } from './useChatSession';

/** Màn hình M1: trò chuyện tự do với gia sư (chữ), sửa lỗi theo mức người học chọn, gợi ý khối học liên quan. */
export function ChatScreen() {
  const persona = useLearner((s) => s.preferences.persona);
  const session = useChatSession();
  const tutorName = persona === 'co_giao' ? 'Cô giáo Lan' : 'Bé Cu Tít';

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">Trò chuyện</h1>
          <Link to="/nhap-vai" className="flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline">
            🎭 Nhập vai
          </Link>
        </header>
        <ChatPanel
          session={session}
          tutorName={tutorName}
          placeholder="Viết tiếng Việt, vd. Xin chào!"
          emptyHint={`${tutorName} sẵn sàng trò chuyện. Hãy chào một câu bằng tiếng Việt — gõ thiếu dấu cũng được, mình sẽ chỉ cách viết đúng. Cần kết nối mạng.`}
        />
      </div>
    </div>
  );
}
