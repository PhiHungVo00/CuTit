/**
 * Gọi bài xếp lớp A5 ở Gateway (/v1/placement/next). api-client + Zod được import lười để
 * màn hình mở nhanh; chỉ tải khi người học chọn làm bài.
 */
export interface PlacementQuestion {
  id: string;
  prompt: string;
  /** bản tiếng Anh của câu hỏi (đáp án vẫn là tiếng Việt) */
  promptEn?: string;
  options: string[];
  index: number;
  maxQuestions: number;
}

export type PlacementStep = { finished: false; question: PlacementQuestion } | { finished: true; level: number };

export type PlacementFailure = { message: string; offline: boolean };

export async function placementNext(sessionId: string, answer?: { questionId: string; choice: number }): Promise<PlacementStep> {
  const [{ request }, { PlacementNextResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  const r = await request('/v1/placement/next', { body: answer ? { sessionId, answer } : { sessionId }, schema: PlacementNextResponseSchema });
  if (r.finished) {
    if (!r.assignedLevel) throw new Error('Thiếu assignedLevel');
    return { finished: true, level: r.assignedLevel };
  }
  if (!r.question) throw new Error('Thiếu câu hỏi');
  return { finished: false, question: r.question };
}

export async function describePlacementError(err: unknown, expiredMessage: string): Promise<PlacementFailure> {
  const [{ GatewayRequestError, describeGatewayError }, { learnerStore }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/state')]);
  const offline = err instanceof GatewayRequestError && (err.kind === 'offline' || err.kind === 'timeout');
  if (err instanceof GatewayRequestError && err.status === 409) {
    return { message: expiredMessage, offline: false };
  }
  return { message: describeGatewayError(err, learnerStore.getState().preferences.uiLanguage), offline };
}

export function newSessionId(): string {
  const c: Partial<Crypto> & Pick<Crypto, 'getRandomValues'> = crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // WebView cũ (hoặc trang không phải secure context) không có randomUUID: tạo UUID v4 từ getRandomValues
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
