import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { cefrLabel, learnerStore, useLearner } from '@vietlearning/state';
import { SCREENS, prefetchScreen } from '../routes';
import { useT } from '../i18n';

/**
 * Lộ trình (nút “Học tiếp”, ôn hôm nay, bản đồ unit) nằm trong chunk lazy của mfe-path để bundle đầu
 * giữ trong ngân sách. Bắt đầu tải NGAY khi module này được đánh giá (song song lúc React khởi tạo),
 * không đợi tới lúc render; trong lúc chờ hiện khung xương (skeleton).
 */
const loadPath = () => import('./PathHomeRoute');
// Mở thẳng một màn khác (deep link) thì không tải trước chunk lộ trình
if (typeof location !== 'undefined' && location.pathname === '/') void loadPath().catch(() => undefined);
const PathHome = lazy(loadPath);

function PathSkeleton() {
  const t = useT();
  return (
    <div aria-busy="true" role="status" aria-label={t('pathLoading')} className="flex flex-col gap-4">
      <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-14 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}

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

      {/* Banner nằm CÙNG khối Suspense với lộ trình: hiện cùng lúc, không bị lộ trình (cao hơn khung chờ) đẩy xuống
          sau khi tải => không gây xê dịch bố cục (CLS 0,111 trên Lighthouse trước đây) */}
      <Suspense fallback={<PathSkeleton />}>
        <PathHome />
        {/* Làm quen/xếp lớp là tùy chọn: người mới học được bài đầu tiên ngay, không cần đăng ký */}
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
      </Suspense>
    </div>
  );
}
