import { Link } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { Button, Icon } from '@vietlearning/ui';
import { useT } from '../i18n';

/**
 * Thông báo quyền riêng tư trước lần ghi âm đầu tiên (đồng ý `voice` dùng chung cho chat, nhập vai, gọi thoại).
 * `text` khác nhau theo màn: chat cho sửa chữ trước khi gửi, gọi thoại gửi ngay khi ngừng nói.
 */
export function VoiceConsent({ text, onAgree, onCancel }: { text: string; onAgree: () => void; onCancel: () => void }) {
  const t = useT();
  return (
    <div role="dialog" aria-labelledby="ct-voice-privacy" className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-2 p-3">
      <p id="ct-voice-privacy" className="m-0 flex items-center gap-2 text-[15px] font-bold text-ink">
        <Icon name="khoa" size={18} />
        {t('voicePrivacyTitle')}
      </p>
      <p className="m-0 text-sm text-ink-soft">{text}</p>
      <Link to="/quyen-rieng-tu" className="self-start text-sm font-bold text-ink underline">
        {t('privacyPolicy')}
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('notNow')}
        </Button>
        <Button
          onClick={() => {
            learnerStore.getState().giveConsent('voice');
            onAgree();
          }}
        >
          {t('agreeRecord')}
        </Button>
      </div>
    </div>
  );
}
