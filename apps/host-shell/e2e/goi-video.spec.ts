import { expect, test } from '@playwright/test';
import { installFakeMicStartHook } from './fake-mic';

/**
 * Task 7 — gọi video theo lượt với camera giả của Chrome (--use-fake-device-for-media-stream) và micro giả
 * (0,4 s im → 1 s "giọng" → im). Gateway thật (PGlite, không khóa AI).
 */
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

async function fakeMic(page: import('@playwright/test').Page, opts: { denyCamera?: boolean } = {}) {
  await installFakeMicStartHook(page);
  await page.addInitScript((deny) => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c?: MediaStreamConstraints) => {
      if (c?.video) {
        if (deny) throw new DOMException('denied', 'NotAllowedError');
        return real(c);
      }
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 220;
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      (dest.stream as MediaStream & { __start?: () => void }).__start = () => {
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.setValueAtTime(0.8, t + 0.4);
        gain.gain.setValueAtTime(0, t + 1.4);
        osc.start();
      };
      return dest.stream;
    };
  }, !!opts.denyCamera);
}

test.describe('Task 7 gọi video', () => {
  test('mỗi câu nói gửi kèm đúng 1 ảnh; nhãn "đang xem"; ghi rõ luật lượt', async ({ page }) => {
    test.setTimeout(90_000);
    await fakeMic(page);
    const bodies: { mode?: string; imageBase64?: string }[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/v1/chat/turn') && r.method() === 'POST') bodies.push(r.postDataJSON());
    });
    await page.goto('/goi-thoai?video=1');
    await expect(page.getByTestId('turn-rule')).toHaveText('Mỗi câu nói = 1 lượt (kèm 1 ảnh)');
    await page.getByRole('button', { name: 'Gọi video' }).click();
    await page.getByRole('button', { name: 'Đồng ý, ghi âm' }).click();
    await expect(page.getByLabel('Hình camera của bạn')).toBeVisible();
    await expect(page.getByTestId('call-status')).toContainText('Cu Tít đang nghe…');
    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(bodies[0].mode).toBe('call');
    expect(bodies[0].imageBase64 ?? '').toMatch(/^\/9j\//); // JPEG
    expect((bodies[0].imageBase64 ?? '').length).toBeLessThanOrEqual(204_800);
  });

  test('camera bị từ chối ⇒ chuyển sang gọi thường, cuộc gọi vẫn chạy (không treo, không gửi ảnh)', async ({ page }) => {
    test.setTimeout(90_000);
    await fakeMic(page, { denyCamera: true });
    const bodies: { imageBase64?: string }[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/v1/chat/turn') && r.method() === 'POST') bodies.push(r.postDataJSON());
    });
    await page.goto('/goi-thoai?video=1');
    await page.getByRole('button', { name: 'Gọi video' }).click();
    await page.getByRole('button', { name: 'Đồng ý, ghi âm' }).click();
    await expect(page.getByTestId('camera-note')).toContainText('chuyển sang gọi thường');
    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(bodies[0].imageBase64).toBeUndefined();
    await expect(page.getByRole('log', { name: 'Phụ đề' }).getByText(/Bé Cu Tít đây/)).toBeVisible({ timeout: 30_000 });
  });
});
