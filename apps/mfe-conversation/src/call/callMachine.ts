/**
 * Máy trạng thái của màn gọi thoại (hàm thuần, kiểm thử được). Hook useCall chỉ phản ứng theo `phase`:
 * listening = mở micro (tự dừng khi ngừng nói) · thinking = gửi lượt tới Gateway · speaking = đọc câu trả lời.
 * Half-duplex: micro chỉ mở lại sau SPOKEN, để không thu nhầm giọng gia sư.
 */
export type CallPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'typing' | 'paused' | 'ended';
export type EndReason = 'hangup' | 'quota' | 'max-turns';

/** Mỗi cuộc gọi tối đa số lượt này rồi tự sang tổng kết (giữ chi phí + buổi học ngắn gọn) */
export const MAX_CALL_TURNS = 12;

export interface CallState {
  phase: CallPhase;
  input: 'voice' | 'text';
  turns: number;
  /** câu người học vừa nói/gõ, đang chờ gia sư trả lời (giữ để thử lại khi lỗi mạng) */
  pendingText: string | null;
  error: string | null;
  micError: string | null;
  reason: EndReason | null;
}

export type CallAction =
  | { type: 'START' }
  | { type: 'HEARD'; text: string }
  | { type: 'NO_SPEECH' }
  | { type: 'SEND_TYPED'; text: string }
  | { type: 'THOUGHT' }
  | { type: 'SPOKEN' }
  | { type: 'MIC_FAILED'; error: string }
  | { type: 'USE_TEXT' }
  | { type: 'USE_VOICE' }
  | { type: 'RESUME' }
  /** đọc lại câu trả lời cuối (nút “nói chậm lại”) */
  | { type: 'REPLAY' }
  | { type: 'TURN_FAILED'; quota: boolean; message: string }
  | { type: 'HANG_UP' };

export const initialCall: CallState = { phase: 'idle', input: 'voice', turns: 0, pendingText: null, error: null, micError: null, reason: null };

const waitForLearner = (s: CallState): CallState => ({ ...s, phase: s.input === 'voice' ? 'listening' : 'typing' });

export function callReducer(s: CallState, a: CallAction): CallState {
  if (s.phase === 'ended') return s;
  if (a.type === 'HANG_UP') return { ...s, phase: 'ended', reason: 'hangup' };
  // Đang đọc câu trả lời: chỉ đọc xong mới cho người học nói/gõ tiếp
  if (s.phase === 'speaking' && a.type !== 'SPOKEN') return s;

  switch (a.type) {
    case 'START':
      return s.phase === 'idle' ? waitForLearner({ ...s, error: null }) : s;
    case 'HEARD':
      return s.phase === 'listening' ? { ...s, phase: 'thinking', pendingText: a.text, error: null } : s;
    case 'SEND_TYPED':
      return s.phase === 'typing' || s.phase === 'paused' || s.phase === 'listening' ? { ...s, phase: 'thinking', pendingText: a.text, error: null } : s;
    case 'NO_SPEECH':
      return s.phase === 'listening' ? { ...s, phase: 'paused' } : s;
    case 'THOUGHT':
      return s.phase === 'thinking' ? { ...s, phase: 'speaking', turns: s.turns + 1, pendingText: null } : s;
    case 'SPOKEN':
      if (s.phase !== 'speaking') return s;
      return s.turns >= MAX_CALL_TURNS ? { ...s, phase: 'ended', reason: 'max-turns' } : waitForLearner(s);
    case 'MIC_FAILED':
      return { ...s, phase: s.phase === 'thinking' ? s.phase : 'typing', input: 'text', micError: a.error };
    case 'USE_TEXT':
      return s.phase === 'thinking' ? s : { ...s, phase: 'typing', input: 'text' };
    case 'USE_VOICE':
      return s.phase === 'thinking' ? s : { ...s, phase: 'listening', input: 'voice', micError: null, error: null };
    case 'REPLAY':
      return s.turns > 0 && (s.phase === 'listening' || s.phase === 'typing' || s.phase === 'paused') ? { ...s, phase: 'speaking', error: null } : s;
    case 'RESUME':
      return s.phase === 'paused' ? waitForLearner({ ...s, error: null }) : s;
    case 'TURN_FAILED':
      if (s.phase !== 'thinking') return s;
      return a.quota ? { ...s, phase: 'ended', reason: 'quota', error: a.message } : { ...s, phase: 'paused', error: a.message };
  }
}
