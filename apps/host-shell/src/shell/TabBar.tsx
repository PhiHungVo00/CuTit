import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '@vietlearning/ui';
import { playSfx } from '../audio/lazyAudio';
import { useT } from '../i18n';
import { prefetchPath } from '../routes';
import { TAB_HOME, TAB_IDS, tabOf, type TabId } from './navMap';
import { useTransitionNavigate } from './useTransitionNavigate';

const ICON: Record<TabId, IconName> = { hoc: 'hoc', 'luyen-tap': 'luyen-tap', 'ban-be': 'ban-be', 'ho-so': 'ho-so' };
const LABEL = { hoc: 'learn', 'luyen-tap': 'tabPractice', 'ban-be': 'tabFriends', 'ho-so': 'tabProfile' } as const;

/** Thanh 4 tab: Học · Luyện tập · Bạn bè · Hồ sơ. Tab sáng theo bản đồ route (tabOf), không theo đường dẫn khớp tuyệt đối. */
export function TabBar() {
  const t = useT();
  const { pathname } = useLocation();
  const active = tabOf(pathname);
  const go = useTransitionNavigate();
  return (
    <nav className="tabbar" aria-label={t('mainNav')}>
      {TAB_IDS.map((id) => (
        <Link
          key={id}
          to={TAB_HOME[id]}
          aria-current={active === id ? 'page' : undefined}
          onPointerDown={() => prefetchPath(TAB_HOME[id])}
          onFocus={() => prefetchPath(TAB_HOME[id])}
          onClick={(e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            if (pathname === TAB_HOME[id]) return; // đang ở đúng trang chủ của tab; ở màn con của tab thì về trang chủ tab
            if (active !== id) playSfx('chuyen-tab');
            go(TAB_HOME[id]);
          }}
        >
          <span className="tab-icon">
            <Icon name={ICON[id]} size={24} />
          </span>
          <span>{t(LABEL[id])}</span>
        </Link>
      ))}
    </nav>
  );
}
