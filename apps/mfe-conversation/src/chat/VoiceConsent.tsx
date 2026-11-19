import { Link } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { useT } from '../i18n';

/**
 * Thông báo quyền riêng tư trước lần ghi âm đầu tiên (đồng ý `voice` dùng chung cho chat, nhập vai, gọi thoại).
 * `text` khác nhau theo màn: chat cho sửa chữ trước khi gửi, gọi thoại gửi ngay khi ngừng nói.
 */
export function VoiceConsent({ text, onAgree, onCancel }: { text: string; onAgree: () => void; onCancel: () => void }) {
  const t = useT();
  return (
    <div role="dialog" aria-labelledby="ct-voice-privacy" className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-3">
      <p id="ct-voice-privacy" className="m-0 text-[15px] font-bold text-ink">
        {t('voicePrivacyTitle')}
      </p>
      <p className="m-0 text-sm text-ink-soft">{text}</p>
      <Link to="/quyen-rieng-tu" className="self-start text-sm font-bold text-ink underline">
        {t('privacyPolicy')}
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="min-h-12 rounded-xl border border-line-strong bg-surface px-3 font-bold text-ink">
          {t('notNow')}
        </button>
        <button
          type="button"
          onClick={() => {
            learnerStore.getState().giveConsent('voice');
            onAgree();
          }}
          className="min-h-12 rounded-xl bg-accent px-3 font-extrabold text-accent-ink"
        >
          {t('agreeRecord')}
        </button>
      </div>
    </div>
  );
}
