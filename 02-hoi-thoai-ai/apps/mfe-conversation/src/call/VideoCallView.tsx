import { useEffect, useRef } from 'react';
import { openPreview } from '@vietlearning/native';
import { Button, Icon } from '@vietlearning/ui';
import type { CameraOffReason } from './callMachine';
import { useT } from './i18n';

/**
 * Khung camera trước trong cuộc gọi video. Mở bằng `openPreview` (native, Task 2), tắt đèn camera khi rời màn.
 * Lỗi mở camera (từ chối quyền, không có camera…) ⇒ `onCameraOff`, cuộc gọi chuyển sang gọi thường chứ không treo.
 * Không tự chụp: việc chụp khung hình theo lượt do useCall điều khiển qua phần tử video nhận từ `onVideo`.
 */
export function VideoCallView({ onVideo, onCameraOff }: { onVideo: (video: HTMLVideoElement | null) => void; onCameraOff: (reason: CameraOffReason) => void }) {
  const t = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const cbs = useRef({ onVideo, onCameraOff });
  cbs.current = { onVideo, onCameraOff };

  useEffect(() => {
    let live = true;
    const video = ref.current;
    if (!video) return;
    openPreview(video, 'user').then(
      (stop) => {
        if (!live) return stop();
        stopRef.current = stop;
        cbs.current.onVideo(video);
      },
      (e: unknown) => {
        if (!live) return;
        cbs.current.onCameraOff((e as { code?: string } | null)?.code === 'permission-denied' ? 'permission-denied' : 'failed');
      }
    );
    return () => {
      live = false;
      stopRef.current?.();
      stopRef.current = null;
      cbs.current.onVideo(null);
    };
  }, []);

  const turnOff = () => {
    stopRef.current?.();
    stopRef.current = null;
    cbs.current.onVideo(null);
    cbs.current.onCameraOff('user');
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-line-strong bg-surface-2">
      <video ref={ref} aria-label={t('videoPreview')} className="block aspect-[4/3] w-full -scale-x-100 object-cover" playsInline muted autoPlay />
      <Button variant="secondary" aria-label={t('cameraOff')} onClick={turnOff} style={{ position: 'absolute', right: 8, bottom: 8 }}>
        <Icon name="camera" size={18} />
        {t('cameraOff')}
      </Button>
    </div>
  );
}
