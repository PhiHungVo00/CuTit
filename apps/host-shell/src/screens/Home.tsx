import { Link } from 'react-router-dom';
import { SCREENS, prefetchScreen } from '../routes';

export function Home() {
  return (
    <div className="home">
      <h1>Học Tiếng Việt Cùng Bé Cu Tít</h1>
      <p className="lead">Chọn một chủ đề để bắt đầu luyện tập hôm nay.</p>

      <ul className="screen-grid">
        {SCREENS.map((s) => (
          <li key={s.path}>
            <Link
              className="screen-card"
              to={s.path}
              onPointerDown={() => prefetchScreen(s)}
              onFocus={() => prefetchScreen(s)}
            >
              <span className="card-icon" aria-hidden="true">
                {s.icon}
              </span>
              <span>
                <span className="card-title">{s.label}</span>
                <br />
                <span className="card-desc">{s.description}</span>
              </span>
              <span className={s.ready ? 'badge ready' : 'badge'}>{s.ready ? 'Mở' : 'Sắp có'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
