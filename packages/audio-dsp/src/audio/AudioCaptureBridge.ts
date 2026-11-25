/**
 * GoF Bridge Pattern (10): tách trừu tượng "thu âm" khỏi nền tảng thực thi.
 *
 * WebAudioDriver dùng getUserMedia + AudioWorklet (PCM float, không qua codec => giống nhau
 * trên mọi trình duyệt, đúng TDD). Trong app Capacitor, WebView Android cũng chạy getUserMedia:
 * Capacitor tự xin quyền RECORD_AUDIO khi trang yêu cầu micro (cần khai báo trong AndroidManifest),
 * nên chưa cần plugin thu âm native riêng. Nếu sau này cần (vd. ghi khi tắt màn hình), thêm một
 * driver mới cài cùng interface này.
 */
import { acquireAudio } from '@vietlearning/shared/audio/focus';
import { concatChunks, downsample } from './resample.js';

export interface RecordingResult {
  /** PCM mono 16 kHz, -1..1 */
  pcm: Float32Array;
  sampleRate: number;
  durationMs: number;
}

export interface AudioPlatformDriver {
  /** onLevel(rms, audioMs): audioMs = vị trí trong luồng thu (số mẫu đã nhận / tần số lấy mẫu), KHÔNG phụ thuộc lúc khung tới luồng chính */
  start(onLevel?: (rms: number, audioMs?: number) => void): Promise<void>;
  stop(): Promise<RecordingResult>;
  cancel(): void;
}

export type CaptureErrorCode = 'permission-denied' | 'no-microphone' | 'unsupported' | 'failed';

export class CaptureError extends Error {
  constructor(public readonly code: CaptureErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CaptureError';
  }
}

/** Mã AudioWorkletProcessor: chép từng khối 128 mẫu ra luồng chính, kèm mức âm lượng. */
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      let s = 0;
      for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
      this.port.postMessage({ samples: ch.slice(0), rms: Math.sqrt(s / ch.length) });
    }
    return true;
  }
}
registerProcessor('vl-capture', CaptureProcessor);
`;

export class WebAudioDriver implements AudioPlatformDriver {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;

  /**
   * @param speech true = thu lời nói để chép lời (STT): BẬT khử ồn/khử vọng/tự chỉnh âm lượng của thiết bị.
   *               false (mặc định) = phân tích cao độ: tắt các bộ lọc vì chúng làm méo F0.
   */
  constructor(private readonly targetRate = 16000, private readonly speech = false) {}

  async start(onLevel?: (rms: number, audioMs?: number) => void): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      throw new CaptureError('unsupported', 'Thiết bị không hỗ trợ thu âm');
    }
    try {
      // Phân tích cao độ: tắt xử lý giọng tự động (làm méo F0). Chép lời: bật để giọng rõ hơn
      const dsp = this.speech;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: dsp, noiseSuppression: dsp, autoGainControl: dsp }
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new CaptureError('permission-denied');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CaptureError('no-microphone');
      throw new CaptureError('failed', String(err));
    }

    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'vl-capture');
    this.chunks = [];
    const rate = this.ctx.sampleRate;
    let received = 0;
    this.node.port.onmessage = (e: MessageEvent<{ samples: Float32Array; rms: number }>) => {
      this.chunks.push(e.data.samples);
      received += e.data.samples.length;
      // Giờ theo âm thanh: máy tải nặng thì tin nhắn từ worklet tới dồn cục, performance.now() lúc nhận sẽ nén/giãn thời lượng
      onLevel?.(e.data.rms, (received / rate) * 1000);
    };
    source.connect(this.node);
    // Không nối ra loa (tránh hú); một số trình duyệt cần node được "kéo" nên nối qua gain = 0
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.startedAt = performance.now();
  }

  async stop(): Promise<RecordingResult> {
    const rate = this.ctx?.sampleRate ?? this.targetRate;
    const raw = concatChunks(this.chunks);
    const durationMs = performance.now() - this.startedAt;
    this.cancel();
    return { pcm: downsample(raw, rate, this.targetRate), sampleRate: this.targetRate, durationMs };
  }

  cancel(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.chunks = [];
  }
}

/** Phần trừu tượng của Bridge: nơi gọi chỉ biết record()/finish(), không biết nền tảng. */
export class AudioCaptureBridge {
  /**
   * Báo điều phối âm thanh NGAY khi bắt đầu thu (trước cả hộp thoại xin quyền micro) để nhạc nền hạ xuống
   * và không lọt vào bản thu; nhả khi finish/cancel/lỗi.
   */
  private hold: (() => void) | null = null;

  constructor(private readonly driver: AudioPlatformDriver = new WebAudioDriver()) {}

  private release(): void {
    this.hold?.();
    this.hold = null;
  }

  async record(onLevel?: (rms: number, audioMs?: number) => void): Promise<void> {
    this.release();
    this.hold = acquireAudio('record');
    try {
      await this.driver.start(onLevel);
    } catch (err) {
      this.release();
      throw err;
    }
  }

  async finish(): Promise<RecordingResult> {
    try {
      return await this.driver.stop();
    } finally {
      this.release();
    }
  }

  cancel(): void {
    try {
      this.driver.cancel();
    } finally {
      this.release();
    }
  }
}
