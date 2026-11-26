import { useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { FeedbackScreen, MyFeedback } from '@vietlearning/mfe-learner';
import { useUiLanguage } from '@vietlearning/state';
import { getPlatform } from '../native/platform';
import { feedbackRouteInfo } from '../shell/routeTrail';
import { errorReport, osLabel } from './feedbackContext';

/**
 * `/gop-y` (biểu mẫu) và `/gop-y/cua-toi` (danh sách). Host dựng `context` vì MFE không biết lịch sử điều hướng;
 * lỗi từ ScreenErrorBoundary đến qua state điều hướng (không đi qua URL).
 */
export default function FeedbackRoute() {
  const { pathname, state } = useLocation();
  const [params] = useSearchParams();
  const lang = useUiLanguage();
  const context = useMemo(
    () => ({
      appVersion: import.meta.env.VITE_APP_VERSION || '0.0.0',
      build: import.meta.env.VITE_APP_BUILD || 'dev',
      platform: getPlatform() === 'android' ? ('android' as const) : ('web' as const),
      osVersion: osLabel(typeof navigator === 'undefined' ? '' : navigator.userAgent),
      locale: lang,
      ...feedbackRouteInfo()
    }),
    [lang]
  );
  if (pathname.replace(/\/+$/, '') === '/gop-y/cua-toi') return <MyFeedback />;
  const e = (state as { error?: { name?: unknown; stack?: unknown } } | null)?.error;
  const error = typeof e?.name === 'string' ? errorReport(e) : undefined;
  return <FeedbackScreen initialKind={params.get('loai') === 'loi' || error ? 'bug' : undefined} error={error} context={context} />;
}
