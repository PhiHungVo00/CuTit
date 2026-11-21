import type { Page } from '@playwright/test';

/**
 * Micro giả: tín hiệu chỉ BẮT ĐẦU khi app nối luồng vào đồ thị âm thanh (`createMediaStreamSource`), không phải lúc gọi
 * `getUserMedia`. Lý do: giữa hai thời điểm đó app còn nạp AudioWorklet (`addModule`) — lâu hay mau tùy tải máy. Khi
 * chạy song song với các test khác, nếu tín hiệu đã chạy từ lúc `getUserMedia` thì app bỏ lỡ đầu câu và chấm sai
 * (e2e chập chờn, mất ~1/3 lần). Bản giả đặt `stream.__start = () => {...}`; hook này gọi nó đúng một lần.
 */
export async function installFakeMicStartHook(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const orig = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function (stream: MediaStream) {
      const s = stream as MediaStream & { __start?: () => void };
      const start = s.__start;
      s.__start = undefined;
      const node = orig.call(this, stream);
      if (start) {
        // chỉ phát khi ngữ cảnh thu đã thật sự chạy (có thể đang 'suspended' tới khi app gọi resume())
        const ctx = this;
        const go = () => setTimeout(start, 100);
        if (ctx.state === 'running') go();
        else ctx.addEventListener('statechange', function onState() {
          if (ctx.state !== 'running') return;
          ctx.removeEventListener('statechange', onState);
          go();
        });
      }
      return node;
    };
  });
}
