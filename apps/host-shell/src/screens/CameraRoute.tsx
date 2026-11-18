import { Link } from 'react-router-dom';
import { CameraScreen } from '@vietlearning/mfe-vision';
import { defineMessages } from '@vietlearning/state';
import { useMediaAllowed } from '@vietlearning/state/family';

// Màn khóa riêng của camera (không dùng chung ChildLock: mỗi chunk lười dùng chung thêm một mục vào bản đồ preload
// của bundle đầu — ngân sách 68.5 kB đã sát)
const { useT } = defineMessages(
  {
    title: 'Camera cần bố mẹ cho phép',
    body: 'Ảnh chụp được gửi lên máy chủ để nhận diện đồ vật, nên bố mẹ cần bật cho phép ở mục Gia đình trước nhé.',
    toFamily: 'Mục Gia đình (bố mẹ)'
  },
  {
    title: 'The camera needs a parent’s permission',
    body: 'Photos are sent to the server to recognise objects, so a parent needs to allow it in Family first.',
    toFamily: 'Family (for parents)'
  }
);

function CameraLock() {
  const t = useT();
  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <section role="status" data-testid="child-lock" className="mx-auto flex max-w-[560px] flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card">
        <p className="m-0 text-center text-5xl" aria-hidden="true">
          📷
        </p>
        <h1 className="m-0 text-center text-lg font-extrabold text-ink">{t('title')}</h1>
        <p className="m-0 text-[15px] text-ink-soft">{t('body')}</p>
        <Link to="/tuy-chinh?muc=gia-dinh" className="flex min-h-12 w-full items-center justify-center rounded-xl border border-line-strong bg-surface-2 px-4 font-bold text-ink">
          {t('toFamily')}
        </Link>
      </section>
    </div>
  );
}

/** Route M4 (bọc mỏng để chunk lazy có tên ổn định "CameraRoute").
 * GĐ4b: hồ sơ trẻ chỉ dùng camera khi phụ huynh đã cho phép gửi ảnh lên server (D4; Gateway cũng chặn). */
export default function CameraRoute() {
  return useMediaAllowed() ? <CameraScreen /> : <CameraLock />;
}
