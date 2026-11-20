import { Link } from 'react-router-dom';
import { ListRow, Toggle } from '@vietlearning/ui';
import { learnerStore, useLearner } from '@vietlearning/state';
import { card, linkBtn } from '../../common/ui';
import { useT } from '../../i18n';
import { Rows } from '../parts';

/** Rút lại đồng ý (Luật 91/2025 Điều 4, 10): có hiệu lực ngay trên máy, lên server ở lần đồng bộ kế. Chỉ rút, không cấp lại ở đây (app hỏi khi dùng tính năng). */
export function QuyenRiengTu() {
  const t = useT();
  const consents = useLearner((s) => s.consents);
  return (
    <>
      <section className={card}>
        <p className="m-0 text-[15px] text-ink-soft">{t('privacyAi')}</p>
        <p className="m-0 text-[15px] text-ink-soft">{t('privacyLocal')}</p>
      </section>
      <h2 className="m-0 text-base font-extrabold text-ink">{t('consentHeading')}</h2>
      <Rows>
        {(['voice', 'camera'] as const).map((key) => (
          <ListRow
            key={key}
            label={t(`consent.${key}`)}
            hint={consents[key] ? t('consentOn') : t('consentOff')}
            trailing={<Toggle label={t(`consent.${key}`)} checked={Boolean(consents[key])} disabled={!consents[key]} onChange={(on) => !on && learnerStore.getState().revokeConsent(key)} />}
          />
        ))}
      </Rows>
      <p className="m-0 text-sm text-ink-muted">{t('consentRevokeHint')}</p>
      {/* Trang chính sách nằm ở Host: chỉ link bằng URL (không import chéo) */}
      <Link to="/quyen-rieng-tu" className={`${linkBtn} self-start`}>
        {t('privacyPolicy')}
      </Link>
    </>
  );
}
