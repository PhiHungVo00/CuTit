import { Link } from 'react-router-dom';
import { cefrLabel, learnerStore, useLearner } from '@vietlearning/state';
import { SCREENS, prefetchScreen, screenId } from '../routes';
import { useT } from '../i18n';

export function Home() {
  const profile = useLearner((s) => s.profile);
  const t = useT();
  const lang = useLearner((s) => s.preferences.uiLanguage);
  const onboarding = SCREENS.find((s) => s.path === '/bat-dau');
  return (
    <div className="home">
      <div className="home-head">
        <h1>{t('appTitle')}</h1>
        <button
          type="button"
          className="lang-switch"
          lang={lang === 'vi' ? 'en' : 'vi'}
          aria-label={t('langSwitchLabel')}
          onClick={() => learnerStore.getState().setPreferences({ uiLanguage: lang === 'vi' ? 'en' : 'vi' })}
        >
          🌐 {t('langSwitch')}
        </button>
      </div>
      <p className="lead">
        {profile.onboarded ? t('homeLevel', { level: cefrLabel(profile.level) }) : ''}
        {t('homeLead')}
      </p>

      {!profile.onboarded && onboarding && (
        <Link className="onboard-banner" to="/bat-dau" onPointerDown={() => prefetchScreen(onboarding)} onFocus={() => prefetchScreen(onboarding)}>
          <span aria-hidden="true">🌱</span>
          <span>
            <strong>{t('onboardTitle')}</strong>
            <br />
            {t('onboardBody')}
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
                <span className="card-title">{t(`${screenId(s)}.label`)}</span>
                <br />
                <span className="card-desc">{t(`${screenId(s)}.desc`)}</span>
              </span>
              <span className={s.ready ? 'badge ready' : 'badge'}>{s.ready ? t('open') : t('soon')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
