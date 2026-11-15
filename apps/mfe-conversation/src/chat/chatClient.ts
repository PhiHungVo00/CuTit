/**
 * Gửi một lượt hội thoại tới /v1/chat/turn và đọc luồng SSE (api-client.streamEvents + Zod theo contract).
 * - Không có sự kiện nào trong STALL_MS => hủy, báo 'timeout' (timeout của api-client chỉ áp tới lúc nhận header).
 * - Luồng kết thúc mà không có 'done' => lỗi (không coi câu trả lời dở dang là hoàn chỉnh).
 */
import type { ChatEvent, ChatHistoryItem } from '@vietlearning/contracts/api';

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
}

export type DoneEvent = Extract<ChatEvent, { type: 'done' }>;

export class TurnError extends Error {
  constructor(
    public readonly kind: 'offline' | 'timeout' | 'quota' | 'unavailable' | 'incomplete' | 'server' | 'contract' | 'unauthorized' | 'invalid-request',
    message: string
  ) {
    super(message);
  }
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
        if (e.type === 'error') throw new TurnError('server', e.message ?? 'Gia sư gặp lỗi khi trả lời.');
        if (e.type === 'done') done = e;
        onEvent(e);
      },
      local.signal
    );
  } catch (err) {
    if (err instanceof TurnError) throw err;
    if (stalled) throw new TurnError('timeout', 'Gia sư không phản hồi. Vui lòng thử lại.');
    if (signal.aborted) throw err; // người dùng hủy / rời màn hình: để nơi gọi tự bỏ qua
    if (err instanceof GatewayRequestError) throw new TurnError(err.kind, describeGatewayError(err));
    throw new TurnError('offline', 'Mất kết nối giữa chừng. Vui lòng thử lại.');
  } finally {
    clearTimeout(watchdog);
    signal.removeEventListener('abort', onOuterAbort);
    local.abort(); // đóng luồng nếu thoát sớm (vd. sự kiện error) để không giữ kết nối
  }
  if (!done) throw new TurnError('incomplete', 'Câu trả lời bị ngắt giữa chừng. Vui lòng thử lại.');
  return done;
}
