import { describe, expect, it } from 'vitest';
import { SilenceDetector } from './silenceDetector';

/** Đẩy mức âm `rms` mỗi 50 ms trong `ms`, trả sự kiện khác 'none' đầu tiên (kèm thời điểm) */
function feed(d: SilenceDetector, start: number, ms: number, rms: number) {
  for (let t = start; t < start + ms; t += 50) {
    const e = d.push(rms, t);
    if (e !== 'none') return { e, t };
  }
  return { e: 'none' as const, t: start + ms };
}

describe('SilenceDetector — phát hiện người học ngừng nói', () => {
  it('im lặng hoàn toàn => no-speech ở 8 giây (không treo micro)', () => {
    const r = feed(new SilenceDetector(), 0, 10_000, 0.001);
    expect(r.e).toBe('no-speech');
    expect(r.t).toBeGreaterThanOrEqual(8000);
    expect(r.t).toBeLessThan(8100);
  });

  it('nói 1 giây rồi im 1.2 giây => end', () => {
    const d = new SilenceDetector();
    feed(d, 0, 400, 0.002); // nền ồn
    expect(feed(d, 400, 1000, 0.2).e).toBe('none');
    const r = feed(d, 1400, 3000, 0.002);
    expect(r.e).toBe('end');
    expect(r.t).toBeGreaterThanOrEqual(1400 + 1200);
    expect(r.t).toBeLessThan(1400 + 1300);
  });

  it('ngừng ngắn giữa câu (< 1.2 s) không cắt lời', () => {
    const d = new SilenceDetector();
    feed(d, 0, 1000, 0.2);
    expect(feed(d, 1000, 700, 0.002).e).toBe('none');
    expect(feed(d, 1700, 800, 0.2).e).toBe('none');
  });

  it('ồn/nói liên tục => cắt ở 15 giây (max)', () => {
    const r = feed(new SilenceDetector(), 0, 20_000, 0.3);
    expect(r.e).toBe('max');
    expect(r.t).toBeGreaterThanOrEqual(15_000);
  });

  it('nền ồn đều (quạt, xe) không bị tính là lời nói; tiếng nói to hơn nền mới tính', () => {
    const d = new SilenceDetector();
    // nền 0.03 (trên ngưỡng tối thiểu 0.015) nhưng đều => sau 8 s vẫn là no-speech
    expect(feed(d, 0, 9000, 0.03).e).toBe('no-speech');
  });

  it('tiếng “cạch” rất ngắn (< 300 ms) không tính là bắt đầu nói', () => {
    const d = new SilenceDetector();
    feed(d, 0, 400, 0.002);
    feed(d, 400, 150, 0.4);
    expect(feed(d, 550, 2000, 0.002).e).toBe('none');
  });
});
