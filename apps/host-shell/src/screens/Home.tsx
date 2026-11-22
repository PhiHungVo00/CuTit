import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { cefrLabel, useLearner } from '@vietlearning/state';
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

const HomeMascot = lazy(() => import('./HomeMascot'));
const HomeLookup = lazy(() => import('./HomeLookup'));

function PathSkeleton() {
  const t = useT();
  return (
    <div aria-busy="true" role="status" aria-label={t('pathLoading')} className="flex flex-col gap-4">
      <div className="h-8 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-14 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}

export function Home() {
  const profile = useLearner((s) => s.profile);
  const t = useT();
  const onboarding = SCREENS.find((s) => s.path === '/bat-dau');
  return (
    <div className="home">
      {/* Tiêu đề là chữ thường trực (không nằm trong chunk lười) => LCP là chữ, không phải ảnh Cu Tít */}
      <header className="flex items-center gap-3">
        <span className="block size-16 shrink-0">
          <Suspense fallback={null}>
            <HomeMascot />
          </Suspense>
        </span>
        <h1 className="min-w-0 flex-1">{t('homeTitle')}</h1>
      </header>
      {/* Dòng dẫn rộng hết lề: là khối chữ lớn nhất trong màn đầu nên LCP vẫn là chữ thường trực (không phải chữ trong chunk lười) */}
      <p className="m-0 mb-5 mt-2 text-base leading-6 text-ink-soft">
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

      {/* Tra cứu: vào từ tab Học (spec 5.2); chunk lười để gói đầu không gánh */}
      <Suspense fallback={null}>
        <HomeLookup />
      </Suspense>
    </div>
  );
}
