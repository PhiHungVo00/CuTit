import { Link } from 'react-router-dom';
import { SCREENS, prefetchScreen, screenId } from '../routes';
import { useT as useShellT } from '../i18n';
import { useT } from '../exploreI18n';

/** Khám phá /kham-pha: 12 công cụ M1–M12 trước đây ở trang chủ (không mất màn hình nào). Chunk lazy. */
export default function Explore() {
  const t = useT();
  const ts = useShellT();
  return (
    <div className="home">
      <h1>{t('exploreTitle')}</h1>
      <p className="lead">{t('exploreLead')}</p>
      <ul className="screen-grid">
        {SCREENS.map((s) => (
          <li key={s.path}>
            <Link className="screen-card" to={s.path} onPointerDown={() => prefetchScreen(s)} onFocus={() => prefetchScreen(s)}>
              <span className="card-icon" aria-hidden="true">
                {s.icon}
              </span>
              <span>
                <span className="card-title">{t(`${screenId(s)}.label`)}</span>
                <br />
                <span className="card-desc">{t(`${screenId(s)}.desc`)}</span>
              </span>
              <span className={s.ready ? 'badge ready' : 'badge'}>{s.ready ? ts('open') : ts('soon')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
