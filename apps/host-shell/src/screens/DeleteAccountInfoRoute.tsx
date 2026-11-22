import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../deleteAccountI18n';

type Key = Parameters<ReturnType<typeof useT>>[0];

const SECTIONS: { title: Key; items: Key[]; ordered?: boolean }[] = [
  { title: 'howTitle', items: ['how1', 'how2', 'how3'], ordered: true },
  { title: 'graceTitle', items: ['grace1', 'grace2', 'grace3'] },
  { title: 'nowTitle', items: ['now1'] },
  { title: 'deletedTitle', items: ['deleted1', 'deleted2', 'deleted3', 'deleted4'] },
  { title: 'keptTitle', items: ['kept1', 'kept2', 'kept3', 'kept4'] },
  { title: 'helpTitle', items: ['help1'] }
];

// Kiểu nằm trong chunk lazy của trang (không thêm vào CSS toàn app)
const S = {
  h2: { margin: '20px 0 6px', fontSize: 18 },
  list: { margin: 0, paddingLeft: 20, lineHeight: 1.55, display: 'grid', gap: 6 },
  draft: { padding: '10px 12px', borderRadius: 10, background: '#78350f', color: '#fef3c7', fontWeight: 700 },
  updated: { marginTop: 20, fontSize: 14, opacity: 0.8 },
  links: { display: 'flex', flexWrap: 'wrap', gap: 16, margin: '8px 0 0', padding: 0, listStyle: 'none' }
} satisfies Record<string, CSSProperties>;

/**
 * Trang công khai /xoa-tai-khoan (Host, chunk lazy): hướng dẫn xóa tài khoản cho Google Play Data safety.
 * Chỉ chữ + link: KHÔNG gọi Gateway, KHÔNG tạo tài khoản khách khi chỉ mở trang này, KHÔNG có biểu mẫu xóa trên web.
 */
export default function DeleteAccountInfoRoute() {
  const t = useT();
  return (
    <article className="home">
      <h1>{t('title')}</h1>
      <p style={S.draft} role="note">
        {t('draft')}
      </p>
      <p className="lead">{t('intro')}</p>
      {SECTIONS.map((s) => {
        const List = s.ordered ? 'ol' : 'ul';
        return (
          <section key={s.title} aria-labelledby={`da-${s.title}`}>
            <h2 id={`da-${s.title}`} style={S.h2}>
              {t(s.title)}
            </h2>
            <List style={S.list}>
              {s.items.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </List>
          </section>
        );
      })}
      <section aria-labelledby="da-linksTitle">
        <h2 id="da-linksTitle" style={S.h2}>
          {t('linksTitle')}
        </h2>
        <ul style={S.links}>
          <li>
            <Link to="/quyen-rieng-tu">{t('privacy')}</Link>
          </li>
          <li>
            {/* TODO dự án 3 (Task 7): đổi sang /dang-nhap khi màn đăng nhập có route */}
            <Link to="/ho-so">{t('signIn')}</Link>
          </li>
        </ul>
      </section>
      <p style={S.updated}>{t('updated')}</p>
    </article>
  );
}
