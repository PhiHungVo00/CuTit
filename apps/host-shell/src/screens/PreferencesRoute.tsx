import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PreferencesScreen } from '@vietlearning/mfe-learner';

/**
 * GĐ4b: mục Gia đình (hồ sơ trẻ) mở bằng /tuy-chinh?muc=gia-dinh — nạp lười TỪ chunk này, không thêm route vào
 * bundle đầu (mỗi route lazy thêm bản đồ chunk phụ thuộc vào app-*.js; ngân sách 68.5 kB đã sát).
 */
const FamilyRoute = lazy(() => import('./FamilyRoute'));

/** Route bọc mỏng để chunk lazy có tên ổn định "PreferencesRoute". */
export default function PreferencesRoute() {
  const [params] = useSearchParams();
  if (params.get('muc') === 'gia-dinh')
    return (
      <Suspense fallback={null}>
        <FamilyRoute />
      </Suspense>
    );
  return <PreferencesScreen />;
}
