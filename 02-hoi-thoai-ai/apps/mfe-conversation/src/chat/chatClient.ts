/**
 * Gửi một lượt hội thoại tới /v1/chat/turn và đọc luồng SSE (api-client.streamEvents + Zod theo contract).
 * - Không có sự kiện nào trong STALL_MS => hủy, báo 'timeout' (timeout của api-client chỉ áp tới lúc nhận header).
 * - Luồng kết thúc mà không có 'done' => lỗi (không coi câu trả lời dở dang là hoàn chỉnh).
 */
import type { ChatEvent, ChatHistoryItem } from '@vietlearning/contracts/api';
import { t } from '../i18n';

export const STALL_MS = 15_000;

export interface TurnRequest {
  sessionId: string;
  userText: string;
  targetDialect: 'north' | 'central' | 'south';
  learnerLevel: number;
  correctionLevel: 'gentle' | 'strict' | 'off';
  persona: string;
  scenarioId?: string;
  history: ChatHistoryItem[];
  explanationLanguage: 'vi' | 'en';
  /** GĐ3: 'call' = gọi thoại (bản chép lời giọng nói, trả lời văn nói ngắn) */
  mode?: 'chat' | 'call';
  /** Tóm tắt cuộc trò chuyện (≤ 600 ký tự) thay cho phần lịch sử cũ hơn 10 lượt */
  summary?: string;
  /** Ảnh JPEG base64 (đã thu nhỏ bởi `capturePhoto`); lượt có ảnh tốn thêm 1 lượt xem ảnh */
  imageBase64?: string;
}

export type DoneEvent = Extract<ChatEvent, { type: 'done' }>;

export class TurnError extends Error {
  constructor(
    public readonly kind: 'offline' | 'timeout' | 'quota' | 'unavailable' | 'incomplete' | 'server' | 'contract' | 'unauthorized' | 'update-required' | 'invalid-request',
    message: string,
    /** mã lỗi Gateway (vd. quota_exceeded = hết lượt AI hôm nay, khác rate-limit theo phút) */
    public readonly code?: string,
    /** thân lỗi JSON của Gateway (vd. scope:'global' của quota_exceeded) */
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

/** “Hết lượt hôm nay” kèm giờ lượt mới theo giờ máy người học (Gateway tính theo nửa đêm UTC) */
export function quotaMessage(resetAt: string): string {
  const d = new Date(resetAt);
  const time = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return t('quotaOut', { time });
}

export async function sendTurn(req: TurnRequest, onEvent: (e: ChatEvent) => void, signal: AbortSignal): Promise<DoneEvent> {
  const [{ streamEvents, GatewayRequestError, describeGatewayError }, { ChatEventSchema }] = await Promise.all([
    import('@vietlearning/api-client'),
    import('@vietlearning/contracts/api')
  ]);

  const local = new AbortController();
  const onOuterAbort = () => local.abort();
  signal.addEventListener('abort', onOuterAbort, { once: true });
  let stalled = false;
  let watchdog = setTimeout(() => ((stalled = true), local.abort()), STALL_MS);
  const kick = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => ((stalled = true), local.abort()), STALL_MS);
  };

  let done: DoneEvent | null = null;
  try {
    await streamEvents(
      '/v1/chat/turn',
      req,
      ChatEventSchema,
      (e) => {
        kick();
        if (e.type === 'error') {
          // AI bận (hết chuỗi dự phòng, lượt không bị trừ): câu riêng theo ngôn ngữ giải thích, dùng chung bản dịch của api-client
          if (e.code === 'llm_busy') throw new TurnError('unavailable', describeGatewayError(new GatewayRequestError('unavailable', 'llm_busy', 503, 'llm_busy'), req.explanationLanguage), e.code);
          throw new TurnError('server', e.message ?? t('errTutor'), e.code);
        }
        if (e.type === 'done') done = e;
        onEvent(e);
      },
      local.signal
    );
  } catch (err) {
    if (err instanceof TurnError) throw err;
    if (stalled) throw new TurnError('timeout', t('errStalled'));
    if (signal.aborted) throw err; // người dùng hủy / rời màn hình: để nơi gọi tự bỏ qua
    if (err instanceof GatewayRequestError) {
      const resetAt = err.details?.resetAt;
      if (err.code === 'quota_exceeded' && typeof resetAt === 'string') throw new TurnError('quota', quotaMessage(resetAt), err.code, err.details);
      throw new TurnError(err.kind, describeGatewayError(err, req.explanationLanguage), err.code, err.details);
    }
    throw new TurnError('offline', t('errDropped'));
  } finally {
    clearTimeout(watchdog);
    signal.removeEventListener('abort', onOuterAbort);
    local.abort(); // đóng luồng nếu thoát sớm (vd. sự kiện error) để không giữ kết nối
  }
  if (!done) throw new TurnError('incomplete', t('errIncomplete'));
  return done;
}

/** Viết lại bản tóm tắt cuộc trò chuyện. Lỗi ném lên để nơi gọi giữ tóm tắt cũ (không chặn lượt người dùng). */
export async function summarizeConversation(req: { sessionId: string; previousSummary?: string; history: ChatHistoryItem[]; explanationLanguage: 'vi' | 'en' }, signal?: AbortSignal): Promise<string> {
  const { summarizeChat } = await import('@vietlearning/api-client');
  return (await summarizeChat(req, signal)).summary;
}
