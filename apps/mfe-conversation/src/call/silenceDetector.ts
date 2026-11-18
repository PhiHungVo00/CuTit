/**
 * Phát hiện người học ngừng nói cho màn gọi thoại (luật ngưỡng năng lượng đơn giản — KHÔNG phải thuật toán
 * xử lý tín hiệu mới ngoài A1–A8: chỉ so mức RMS mà bộ thu âm sẵn có đã tính, với nền ồn ước lượng).
 *
 * - Ngưỡng tiếng nói = nền ồn × 3, kẹp trong [0.015, 0.08]; nền ồn = trung bình 300 ms đầu, sau đó bám chậm theo phần im lặng.
 * - Bắt đầu nói khi vượt ngưỡng liên tục ≥ minSpeechMs (bỏ tiếng "cạch").
 * - Đã nói rồi im ≥ silenceMs => 'end'. Chưa nói gì sau noSpeechMs => 'no-speech'. Tổng ≥ maxMs => 'max'.
 */
export type SilenceEvent = 'none' | 'end' | 'no-speech' | 'max';

export interface SilenceOptions {
  silenceMs?: number;
  noSpeechMs?: number;
  maxMs?: number;
  minSpeechMs?: number;
}

const MIN_THRESHOLD = 0.015;
const MAX_THRESHOLD = 0.08;
const CALIBRATE_MS = 300;

export class SilenceDetector {
  private readonly silenceMs: number;
  private readonly noSpeechMs: number;
  private readonly maxMs: number;
  private readonly minSpeechMs: number;
  private start: number | null = null;
  private noise = 0;
  private noiseN = 0;
  private loudSince: number | null = null;
  private quietSince: number | null = null;
  private spoke = false;

  constructor(o: SilenceOptions = {}) {
    this.silenceMs = o.silenceMs ?? 1200;
    this.noSpeechMs = o.noSpeechMs ?? 8000;
    this.maxMs = o.maxMs ?? 15000;
    this.minSpeechMs = o.minSpeechMs ?? 300;
  }

  /** Đã nghe thấy lời nói chưa (để giao diện đổi chữ "Đang nghe…" → "Mình đang nghe bạn nói") */
  get speaking(): boolean {
    return this.spoke;
  }

  push(rms: number, tMs: number): SilenceEvent {
    this.start ??= tMs;
    const elapsed = tMs - this.start;
    if (elapsed >= this.maxMs) return 'max';

    if (elapsed < CALIBRATE_MS) {
      this.noise = (this.noise * this.noiseN + rms) / ++this.noiseN;
      return 'none';
    }
    // Trần ngưỡng: người học nói ngay khi micro vừa mở (nền ồn đo nhầm thành tiếng nói) vẫn được nghe
    const threshold = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, this.noise * 3));
    if (rms >= threshold) {
      this.quietSince = null;
      this.loudSince ??= tMs;
      if (!this.spoke && tMs - this.loudSince >= this.minSpeechMs) this.spoke = true;
    } else {
      this.loudSince = null;
      this.quietSince ??= tMs;
      // nền ồn bám chậm theo lúc im lặng (phòng thay đổi dần), không bám theo tiếng nói
      this.noise = this.noise * 0.95 + rms * 0.05;
      if (this.spoke && tMs - this.quietSince >= this.silenceMs) return 'end';
    }
    if (!this.spoke && elapsed >= this.noSpeechMs) return 'no-speech';
    return 'none';
  }
}
