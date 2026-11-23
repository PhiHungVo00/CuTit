import { GatewayError } from '../pipeline/RequestPipeline.js';
import type { JsonRequest, JsonResult, LlmProvider } from './llm.js';
import { LlmProviderError } from './llm.js';
import type { SttProvider, SttResult } from './stt.js';

/**
 * Chuỗi dự phòng theo năng lực (LLM_CHAIN / VISION_CHAIN / STT_CHAIN).
 * Gặp 429 / 5xx / timeout / JSON sai schema => thử nguồn kế. Mỗi nguồn có ngắt mạch tạm (circuit breaker):
 * sau 429 nghỉ vài phút (theo Retry-After nếu có), sau vài lỗi liên tiếp nghỉ ngắn, lỗi cấu hình (401/402/403/404) nghỉ như 429.
 * Hết chuỗi => 503 `llm_busy` (KHÔNG phải quota_exceeded; nơi gọi hoàn lại lượt đã trừ).
 * Ngoại lệ KHÔNG thử nguồn khác: `llm_blocked` (nội dung bị bộ lọc an toàn từ chối) và lỗi do yêu cầu của chính ta.
 */

export interface ChainLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface BreakerOptions {
  /** nghỉ bao lâu sau 429/lỗi cấu hình (ms) */
  openMs: number;
  /** số lỗi tạm thời (timeout/5xx/mạng) LIÊN TIẾP thì ngắt mạch */
  failureThreshold: number;
  /** nghỉ bao lâu sau chuỗi lỗi tạm thời (ms) */
  transientOpenMs: number;
  now?: () => number;
}

/** Mã HTTP của nhà cung cấp cho biết lỗi nằm ở yêu cầu, không phải ở nguồn */
const REQUEST_FAULT = new Set([400, 413, 415, 422]);

export class CircuitBreaker {
  private openUntil = new Map<string, number>();
  private failures = new Map<string, number>();
  private readonly now: () => number;

  constructor(private readonly opts: BreakerOptions) {
    this.now = opts.now ?? Date.now;
  }

  isOpen(id: string): boolean {
    const until = this.openUntil.get(id);
    if (until === undefined) return false;
    if (until <= this.now()) {
      this.openUntil.delete(id); // nửa mở: cho thử lại một lần; lỗi tiếp thì lại ngắt
      this.failures.set(id, this.opts.failureThreshold - 1);
      return false;
    }
    return true;
  }

  /** mili giây còn lại của nguồn đang ngắt (0 nếu không) */
  remainingMs(id: string): number {
    const until = this.openUntil.get(id);
    return until === undefined ? 0 : Math.max(0, until - this.now());
  }

  recordSuccess(id: string): void {
    this.failures.delete(id);
  }

  recordFailure(id: string, err: unknown): void {
    const e = err as Partial<LlmProviderError> | undefined;
    if (e?.code === 'llm_bad_output' || e?.code === 'llm_unsupported') return; // lỗi nội dung, không phải nguồn hỏng
    // 4xx do chính YÊU CẦU (ảnh/âm thanh hỏng, quá lớn, tham số sai): nguồn vẫn khỏe. Không đếm, kẻo một người gửi vài
    // ảnh hỏng là nguồn bị nghỉ cho MỌI người (chuỗi vẫn thử nguồn kế cho yêu cầu này)
    if (e?.upstreamStatus !== undefined && REQUEST_FAULT.has(e.upstreamStatus)) return;
    const rate = e?.code === 'llm_busy';
    const fatal = e?.upstreamStatus === 401 || e?.upstreamStatus === 402 || e?.upstreamStatus === 403 || e?.upstreamStatus === 404;
    if (rate || fatal) {
      // Retry-After của nhà cung cấp chỉ được kéo dài/rút ngắn trong [30 s, openMs × 4]
      const hinted = e?.retryAfterMs;
      const ms = hinted ? Math.min(Math.max(hinted, 30_000), this.opts.openMs * 4) : this.opts.openMs;
      this.openUntil.set(id, this.now() + ms);
      this.failures.delete(id);
      return;
    }
    const n = (this.failures.get(id) ?? 0) + 1;
    this.failures.set(id, n);
    if (n >= this.opts.failureThreshold) {
      this.openUntil.set(id, this.now() + this.opts.transientOpenMs);
      this.failures.delete(id);
    }
  }
}

export interface ChainOptions {
  breaker: CircuitBreaker;
  /** tổng thời gian cho cả chuỗi (ms): client chỉ chờ ~10 s nên chuỗi phải dừng trước đó */
  budgetMs: number;
  /** không bắt đầu thêm nguồn khi còn dưới ngần này (ms) */
  minAttemptMs?: number;
  /**
   * Thời gian chừa lại cho MỖI nguồn còn lại phía sau (ms, mặc định 3000): nguồn đầu chậm không được ăn hết ngân sách
   * khiến nguồn dự phòng không còn thời gian (Gemini chậm ~9 s là ca thật).
   */
  reserveMs?: number;
  now?: () => number;
  log?: ChainLog;
}

interface Source<T> {
  id: string;
  item: T;
}

const RETRYABLE = new Set(['llm_busy', 'llm_timeout', 'llm_unavailable', 'llm_bad_output']);

/** Chạy lần lượt các nguồn đến khi một nguồn trả kết quả được chấp nhận; hết nguồn => llm_busy */
async function runChain<T, R>(
  label: string,
  sources: Source<T>[],
  opts: ChainOptions,
  call: (item: T, timeoutMs: number) => Promise<{ result: R; ok: boolean }>,
  usable: (item: T) => boolean
): Promise<{ result: R; source: string }> {
  const now = opts.now ?? Date.now;
  const started = now();
  const minAttempt = opts.minAttemptMs ?? 500;
  const failed: string[] = [];
  let retryAfterMs: number | undefined;
  let providerCalls = 0;
  /** mọi nguồn ĐÃ GỌI đều từ chối vì chính yêu cầu (400/413/415/422) */
  let allRequestFault = true;

  const reserve = opts.reserveMs ?? 3000;
  for (const [idx, s] of sources.entries()) {
    if (!usable(s.item)) continue; // thiếu năng lực (vd. không nhận ảnh): bỏ qua, không phải lỗi
    if (opts.breaker.isOpen(s.id)) {
      failed.push(`${s.id}:open`);
      const left = opts.breaker.remainingMs(s.id);
      retryAfterMs = retryAfterMs === undefined ? left : Math.min(retryAfterMs, left);
      continue;
    }
    const remaining = opts.budgetMs - (now() - started);
    if (remaining < minAttempt) {
      failed.push(`${s.id}:no_time`);
      break;
    }
    // nguồn còn dùng được phía sau => chừa thời gian cho chúng
    // (chừa cho MỘT nguồn kế tiếp, không nhân theo số nguồn: nguồn chính không bị chia nhỏ ngân sách khi chuỗi dài)
    const hasLater = sources.slice(idx + 1).some((x) => usable(x.item) && !opts.breaker.isOpen(x.id));
    const attemptMs = Math.max(minAttempt, remaining - (hasLater ? reserve : 0));
    const t0 = now();
    providerCalls++;
    try {
      const { result, ok } = await call(s.item, attemptMs);
      if (!ok) {
        allRequestFault = false;
        failed.push(`${s.id}:llm_bad_output`);
        opts.log?.warn({ chain: label, source: s.id, code: 'llm_bad_output' }, 'AI source returned invalid output, trying next');
        continue;
      }
      opts.breaker.recordSuccess(s.id);
      opts.log?.info({ chain: label, source: s.id, ms: now() - t0, skipped: failed }, 'AI source answered');
      return { result, source: s.id };
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'unknown';
      if (code === 'llm_blocked' || (err instanceof GatewayError && !RETRYABLE.has(code) && !(err instanceof LlmProviderError))) throw err;
      opts.breaker.recordFailure(s.id, err);
      const up = (err as Partial<LlmProviderError>).upstreamStatus;
      if (up === undefined || !REQUEST_FAULT.has(up)) allRequestFault = false;
      failed.push(`${s.id}:${code}`);
      opts.log?.warn({ chain: label, source: s.id, code, status: (err as LlmProviderError).upstreamStatus, ms: now() - t0 }, 'AI source failed, trying next');
    }
  }

  opts.log?.warn({ chain: label, tried: failed }, 'AI chain exhausted');
  // Lỗi nằm ở yêu cầu (ảnh/âm thanh hỏng, quá lớn): không phải "AI bận" — không hứa "chưa trừ lượt", không hoàn lượt
  // (nếu hoàn, gửi lặp lại dữ liệu hỏng sẽ đốt trần chung miễn phí vì ngắt mạch cố ý không đếm các lỗi này)
  if (providerCalls > 0 && allRequestFault) throw new RequestRejectedError(providerCalls);
  const retryAfterSec = retryAfterMs && retryAfterMs > 0 ? Math.min(Math.ceil(retryAfterMs / 1000), 300) : undefined;
  throw new ChainExhaustedError(providerCalls, retryAfterSec);
}

/**
 * Hết chuỗi => 503 llm_busy. `providerCalls` = số lần THỰC SỰ gọi nhà cung cấp (0 = mọi nguồn đang ngắt mạch/bị bỏ qua):
 * quyết định có hoàn trần dùng chung cả app hay không (gọi thật thì đã đốt hạn mức nhà cung cấp, xem RequestPipeline).
 */
export class ChainExhaustedError extends GatewayError {
  constructor(public readonly providerCalls: number, retryAfterSec?: number) {
    super(503, 'llm_busy', 'Cu Tít đang bận, thử lại sau ít giây', retryAfterSec ? { retryAfterSec } : undefined);
  }
}

/** Mọi nguồn đã gọi đều từ chối chính yêu cầu (4xx) => 422 `llm_rejected`; RequestPipeline KHÔNG hoàn lượt */
export class RequestRejectedError extends GatewayError {
  constructor(public readonly providerCalls: number) {
    super(422, 'llm_rejected', 'Dịch vụ AI không nhận dữ liệu này (ảnh/âm thanh hỏng hoặc quá lớn)');
  }
}

export interface LlmChainSource {
  id: string;
  provider: LlmProvider;
}

/** Chuỗi dự phòng LLM (cũng dùng cho vision: nguồn không nhận ảnh được bỏ qua tự động). Vẫn là một LlmProvider (Nguyên tắc 4). */
export class FallbackLlmProvider implements LlmProvider {
  readonly name: string;
  readonly supportsImage: boolean;
  readonly supportsAudio: boolean;

  constructor(
    private readonly label: string,
    private readonly sources: LlmChainSource[],
    private readonly opts: ChainOptions
  ) {
    this.name = `chain(${sources.map((s) => s.id).join(',')})`;
    this.supportsImage = sources.some((s) => s.provider.supportsImage !== false);
    this.supportsAudio = sources.some((s) => s.provider.supportsAudio !== false);
  }

  async generateJson(req: JsonRequest): Promise<JsonResult> {
    const hasImage = req.turns.some((t) => t.parts.some((p) => 'inline' in p && p.inline.mimeType.startsWith('image/')));
    const hasAudio = req.turns.some((t) => t.parts.some((p) => 'inline' in p && p.inline.mimeType.startsWith('audio/')));
    const { result, source } = await runChain<LlmProvider, JsonResult>(
      this.label,
      this.sources.map((s) => ({ id: s.id, item: s.provider })),
      this.opts,
      async (provider, timeoutMs) => {
        const r = await provider.generateJson({ ...req, timeoutMs: Math.min(timeoutMs, req.timeoutMs ?? timeoutMs) });
        return { result: r, ok: !req.accept || req.accept(r.json) };
      },
      (p) => (!hasImage || p.supportsImage !== false) && (!hasAudio || p.supportsAudio !== false)
    );
    return { ...result, provider: source };
  }
}

export interface SttChainSource {
  id: string;
  provider: SttProvider;
}

/** Chuỗi dự phòng STT (vd. gemini → groq:whisper-large-v3-turbo) */
export class FallbackSttProvider implements SttProvider {
  readonly name: string;

  constructor(
    private readonly sources: SttChainSource[],
    private readonly opts: ChainOptions
  ) {
    this.name = `chain(${sources.map((s) => s.id).join(',')})`;
  }

  async transcribe(audio: { bytes: Buffer; mimetype: string }): Promise<SttResult> {
    const { result, source } = await runChain<SttProvider, SttResult>(
      'stt',
      this.sources.map((s) => ({ id: s.id, item: s.provider })),
      this.opts,
      async (provider, timeoutMs) => ({ result: await provider.transcribe({ ...audio, timeoutMs } as typeof audio), ok: true }),
      () => true
    );
    return { ...result, provider: source };
  }
}
