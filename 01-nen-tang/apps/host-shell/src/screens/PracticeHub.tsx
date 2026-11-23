import { ListRow, type IconName } from '@vietlearning/ui';
import { prefetchPath } from '../routes';
import { useTransitionNavigate } from '../shell/useTransitionNavigate';
import { useT } from '../exploreI18n';

type Key = 'on-tap' | 'phat-am' | 'phong-thanh' | 'luyen-tap' | 'ghep-cau';
const ITEMS: { path: string; key: Key; icon: IconName }[] = [
  { path: '/on-tap', key: 'on-tap', icon: 'hoc' },
  { path: '/phat-am', key: 'phat-am', icon: 'loa' },
  { path: '/phong-thanh', key: 'phong-thanh', icon: 'nhac' },
  { path: '/luyen-tap', key: 'luyen-tap', icon: 'luyen-tap' },
  { path: '/ghep-cau', key: 'ghep-cau', icon: 'chat' }
];

/** Tab Luyện tập /luyen-tap-chung: lối vào các cách luyện (thay màn Khám phá). Chunk lazy. */
export default function PracticeHub() {
  const t = useT();
  const go = useTransitionNavigate();
  return (
    <div className="home">
      <h1>{t('exploreTitle')}</h1>
      <p className="lead">{t('exploreLead')}</p>
      <div className="list-card">
        {ITEMS.map(({ path, key, icon }) => (
          <div key={path} onPointerDown={() => prefetchPath(path)}>
            <ListRow
              icon={icon}
              label={t(key === 'phong-thanh' ? 'gym.label' : `${key}.label`)}
              hint={t(key === 'phong-thanh' ? 'gym.desc' : `${key}.desc`)}
              to={path}
              onClick={(e) => {
                e.preventDefault();
                go(path);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
