/**
 * GoF State Pattern (17)
 * Vòng đời một lượt thoại: IDLE → (RECORDING →) UPLOADING → STREAMING → (PLAYING →) IDLE.
 * Chỉ cho phép các chuyển trạng thái hợp lệ; lỗi/hủy luôn được quay về IDLE.
 * RECORDING dành cho nhập giọng nói (chưa bật: STT của Gateway còn là mock — xem nhật ký).
 */
export type TurnState = 'IDLE' | 'RECORDING' | 'UPLOADING' | 'STREAMING' | 'PLAYING';

const ALLOWED: Record<TurnState, readonly TurnState[]> = {
  IDLE: ['RECORDING', 'UPLOADING'],
  RECORDING: ['UPLOADING', 'IDLE'],
  UPLOADING: ['STREAMING', 'IDLE'],
  STREAMING: ['PLAYING', 'IDLE'],
  PLAYING: ['IDLE']
};

export class TurnStateMachine {
  private currentState: TurnState = 'IDLE';

  constructor(private readonly onChange?: (s: TurnState) => void) {}

  /** Trả false (và giữ nguyên trạng thái) nếu chuyển không hợp lệ */
  public transition(next: TurnState): boolean {
    if (next === this.currentState) return true;
    if (!ALLOWED[this.currentState].includes(next)) return false;
    this.currentState = next;
    this.onChange?.(next);
    return true;
  }

  /** Lỗi hoặc người dùng hủy: về IDLE từ bất kỳ trạng thái nào */
  public reset(): void {
    if (this.currentState === 'IDLE') return;
    this.currentState = 'IDLE';
    this.onChange?.('IDLE');
  }

  public getState(): TurnState {
    return this.currentState;
  }

  /** Đang bận (không nhận lượt mới) */
  public isBusy(): boolean {
    return this.currentState !== 'IDLE';
  }
}
