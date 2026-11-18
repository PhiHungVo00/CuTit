import { useNavigate } from 'react-router-dom';
import { useT } from '../privacyI18n';

type Key = Parameters<ReturnType<typeof useT>>[0];

const SECTIONS: { title: Key; items: Key[] }[] = [
  { title: 'collectTitle', items: ['collect1', 'collect2', 'collect3', 'collect4'] },
  { title: 'aiTitle', items: ['ai1', 'ai2', 'ai3'] },
  { title: 'keepTitle', items: ['keep1', 'keep2', 'keep3'] },
  { title: 'deleteTitle', items: ['delete1', 'delete2'] },
  { title: 'contactTitle', items: ['contact1'] }
];

/** Chính sách quyền riêng tư /quyen-rieng-tu (Host, chunk lazy). Link tới từ M12 bằng URL. */
export default function PrivacyRoute() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <article className="home privacy">
      <h1>{t('title')}</h1>
      <p className="privacy-draft" role="note">
        {t('draft')}
      </p>
      <p className="lead">{t('intro')}</p>
      {SECTIONS.map((s) => (
        <section key={s.title} aria-labelledby={`pv-${s.title}`}>
          <h2 id={`pv-${s.title}`}>{t(s.title)}</h2>
          <ul>
            {s.items.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="privacy-updated">{t('updated')}</p>
      <button type="button" className="privacy-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
        {t('back')}
      </button>
    </article>
  );
}
