import { useState } from 'react';
import { useT } from '../i18n';

/** Giới hạn thân tin (CHAT_LIMITS.bodyMax của contracts; chép số để chunk không kéo zod). Gateway vẫn kiểm lại. */
const BODY_MAX = 4000;

/** Ô soạn tin: Enter gửi, Shift+Enter xuống dòng. Không gửi tin trống/quá dài. */
export function Composer({ onSend }: { onSend: (body: string) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const body = text.trim();
  const tooLong = text.length > BODY_MAX;
  const submit = () => {
    if (!body || tooLong) return;
    onSend(body);
    setText('');
  };
  return (
    <form
      className="flex flex-col gap-1 border-t border-line bg-surface px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {tooLong && (
        <p role="alert" className="m-0 text-sm font-bold text-ink">
          {t('chat.bodyTooLong', { n: BODY_MAX })}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          aria-label={t('chat.compose')}
          placeholder={t('chat.compose')}
          rows={1}
          value={text}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" disabled={!body || tooLong} className="min-h-11 min-w-11 rounded-xl bg-accent px-3 font-extrabold text-accent-ink disabled:opacity-50">
          {t('chat.send')}
        </button>
      </div>
    </form>
  );
}
