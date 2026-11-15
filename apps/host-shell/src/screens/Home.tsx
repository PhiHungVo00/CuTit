import { Link } from 'react-router-dom';
import { cefrLabel, useLearner } from '@vietlearning/state';
import { SCREENS, prefetchScreen } from '../routes';

export function Home() {
  const profile = useLearner((s) => s.profile);
  const onboarding = SCREENS.find((s) => s.path === '/bat-dau');
  return (
    <div className="home">
      <h1>Học Tiếng Việt Cùng Bé Cu Tít</h1>
      <p className="lead">
        {profile.onboarded ? `Trình độ ${cefrLabel(profile.level)} · ` : ''}Chọn một chủ đề để bắt đầu luyện tập hôm nay.
      </p>

      {!profile.onboarded && onboarding && (
        <Link className="onboard-banner" to="/bat-dau" onPointerDown={() => prefetchScreen(onboarding)} onFocus={() => prefetchScreen(onboarding)}>
          <span aria-hidden="true">🌱</span>
          <span>
            <strong>Lần đầu học cùng Cu Tít?</strong>
            <br />
            Làm quen 1 phút và xếp lớp để bài học vừa sức bạn.
          </span>
        </Link>
      )}

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
