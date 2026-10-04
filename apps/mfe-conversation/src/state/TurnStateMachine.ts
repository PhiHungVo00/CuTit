/**
 * GoF State Pattern (17)
 * Quản lý vòng đời lượt thoại: IDLE -> RECORDING -> UPLOADING -> STREAMING -> PLAYING
 */
export type TurnState = 'IDLE' | 'RECORDING' | 'UPLOADING' | 'STREAMING' | 'PLAYING';

export class TurnStateMachine {
  private currentState: TurnState = 'IDLE';

  public transition(newState: TurnState): void {
    console.log(`[TurnStateMachine] ${this.currentState} -> ${newState}`);
    this.currentState = newState;
  }

  public getState(): TurnState {
    return this.currentState;
  }
}
