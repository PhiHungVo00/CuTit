import { useState } from 'react';
import { Link } from 'react-router-dom';
import { learnerStore, useLearner } from '@vietlearning/state';
import { Button, Icon } from '@vietlearning/ui';
import { useT } from '../i18n';

/** Khóa đồng ý theo phiên bản danh sách nhà cung cấp AI (đổi nhà cung cấp ⇒ tăng version ⇒ hỏi lại). */
export const aiConsentKey = (version: number) => `aiProviders.v${version}`;

/**
 * Hộp đồng ý AI hiện một lần cho mỗi phiên bản danh sách nhà cung cấp, trước lần đầu dùng micro/camera/gọi.
 * Hai công tắc dùng khóa `voice`, `camera`: bật sẵn theo giá trị cũ (và bật sẵn tính năng người học vừa bấm),
 * nhưng người đã đồng ý micro từ trước vẫn phải xác nhận một lần.
 * Lưu "đã xác nhận" bằng khóa `aiProviders.v<N>` trong `consents` (kho hiện chỉ có Record<string, boolean>).
 */
export function AiConsentDialog({ version, wants, onDone }: { version: number; wants: 'voice' | 'camera'; onDone: (result: { confirmed: boolean; voice: boolean; camera: boolean }) => void }) {
  const t = useT();
  const consents = useLearner((s) => s.consents);
  const [voice, setVoice] = useState(consents.voice === true || wants === 'voice');
  const [camera, setCamera] = useState(consents.camera === true || wants === 'camera');
  const apply = (key: string, on: boolean) => (on ? learnerStore.getState().giveConsent(key) : learnerStore.getState().revokeConsent(key));
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ct-ai-consent" className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-[560px] flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <p id="ct-ai-consent" className="m-0 flex items-center gap-2 text-[17px] font-black text-ink">
          <Icon name="khoa" size={20} />
          {t('aiConsentTitle')}
        </p>
        <p className="m-0 text-sm text-ink-soft">{t('aiConsentBody')}</p>
        <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
          <input type="checkbox" role="switch" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="size-5" />
          {t('aiConsentVoice')}
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
          <input type="checkbox" role="switch" checked={camera} onChange={(e) => setCamera(e.target.checked)} className="size-5" />
          {t('aiConsentCamera')}
        </label>
        <Link to="/quyen-rieng-tu" className="self-start text-sm font-bold text-ink underline">
          {t('privacyPolicy')}
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => onDone({ confirmed: false, voice, camera })}>
            {t('aiConsentLater')}
          </Button>
          <Button
            onClick={() => {
              apply('voice', voice);
              apply('camera', camera);
              learnerStore.getState().giveConsent(aiConsentKey(version));
              onDone({ confirmed: true, voice, camera });
            }}
          >
            {t('aiConsentOk')}
          </Button>
        </div>
      </div>
    </div>
  );
}
