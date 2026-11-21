/**
 * Điều phối "ai đang dùng loa/micro". Mọi nguồn phát/thu (đọc câu, âm bài học, cuộc gọi, thu âm)
 * gọi acquireAudio() lúc bắt đầu và release lúc xong/lỗi/hủy. Khi có nguồn bận, nhạc nền hạ dần
 * rồi dừng, âm hiệu ứng im khi đang thu âm (nếu không nhạc lọt vào bản thu sẽ làm chấm phát âm sai).
 */
export type AudioUse = 'record' | 'speech' | 'lesson-audio' | 'call';

const holders = new Set<{ use: AudioUse }>();
const listeners = new Set<(busy: boolean) => void>();

export function isAudioBusy(): boolean {
  return holders.size > 0;
}

/** Đang có nguồn THU âm (micro mở). */
export function isRecording(): boolean {
  for (const h of holders) if (h.use === 'record') return true;
  return false;
}

export function onAudioBusyChange(cb: (busy: boolean) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

function emit(busy: boolean): void {
  for (const cb of [...listeners]) {
    try {
      cb(busy);
    } catch {
      /* một người nghe lỗi không được chặn người khác */
    }
  }
}

export function acquireAudio(use: AudioUse): () => void {
  const was = isAudioBusy();
  const holder = { use };
  holders.add(holder);
  if (!was) emit(true);
  return () => {
    // gọi lần hai: holder đã không còn trong tập => không làm gì
    if (!holders.delete(holder)) return;
    if (!isAudioBusy()) emit(false);
  };
}
