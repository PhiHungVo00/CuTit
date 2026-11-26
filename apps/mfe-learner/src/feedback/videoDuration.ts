/**
 * Độ dài video (mili giây) đọc bằng thẻ <video> chỉ nạp metadata. Server KHÔNG kiểm độ dài (spec §5.2), app tự kiểm.
 * WebM quay bằng MediaRecorder thường báo duration = Infinity: tua tới cuối để trình duyệt tính ra thời lượng thật.
 */
export function readVideoDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const finish = (fn: () => void) => {
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(url);
      fn();
    };
    video.preload = 'metadata';
    video.onerror = () => finish(() => reject(new Error('video_unreadable')));
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return finish(() => resolve(Math.round(video.duration * 1000)));
      video.ontimeupdate = () => {
        video.ontimeupdate = null;
        if (Number.isFinite(video.duration)) finish(() => resolve(Math.round(video.duration * 1000)));
        else finish(() => reject(new Error('video_unreadable')));
      };
      video.currentTime = 1e101;
    };
    video.src = url;
    video.load();
  });
}
