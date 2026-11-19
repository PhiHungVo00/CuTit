import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../privacyI18n';

type Key = Parameters<ReturnType<typeof useT>>[0];

const SECTIONS: { title: Key; items: Key[] }[] = [
  { title: 'lawTitle', items: ['law1', 'law2', 'law3', 'law4'] },
  { title: 'collectTitle', items: ['collect1', 'collect2', 'collect3', 'collect4', 'collect5', 'collect6'] },
  { title: 'aiTitle', items: ['ai1', 'ai2', 'ai3'] },
  { title: 'rightsTitle', items: ['rights1', 'rights2', 'rights3', 'rights4', 'rights5'] },
  { title: 'sellTitle', items: ['sell1', 'sell2', 'sell3'] },
  { title: 'childTitle', items: ['child1'] },
  { title: 'deleteTitle', items: ['delete1', 'delete2', 'delete3'] },
  { title: 'contactTitle', items: ['contact1'] }
];

// Kiểu nằm trong chunk lazy của trang (không thêm vào CSS toàn app — ngân sách 7.5 kB)
const S = {
  h2: { margin: '20px 0 6px', fontSize: 18 },
  ul: { margin: 0, paddingLeft: 20, lineHeight: 1.55, display: 'grid', gap: 6 },
  draft: { padding: '10px 12px', borderRadius: 10, background: '#78350f', color: '#fef3c7', fontWeight: 700 },
  updated: { marginTop: 20, fontSize: 14, opacity: 0.8 },
  back: { minHeight: 48, marginTop: 8, padding: '0 20px', border: '1px solid currentColor', borderRadius: 12, background: 'transparent', color: 'inherit', fontWeight: 700, cursor: 'pointer' }
} satisfies Record<string, CSSProperties>;

/** Chính sách quyền riêng tư /quyen-rieng-tu (Host, chunk lazy). Link tới từ M12 bằng URL. */
export default function PrivacyRoute() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <article className="home">
      <h1>{t('title')}</h1>
      <p style={S.draft} role="note">
        {t('draft')}
      </p>
      <p className="lead">{t('intro')}</p>
      {SECTIONS.map((s) => (
        <section key={s.title} aria-labelledby={`pv-${s.title}`}>
          <h2 id={`pv-${s.title}`} style={S.h2}>{t(s.title)}</h2>
          <ul style={S.ul}>
            {s.items.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </section>
      ))}
      <p style={S.updated}>{t('updated')}</p>
      <button type="button" style={S.back} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
        {t('back')}
      </button>
    </article>
  );
}
