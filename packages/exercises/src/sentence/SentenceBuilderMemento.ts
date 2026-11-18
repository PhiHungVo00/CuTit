/**
 * GoF Memento Pattern (23)
 * Lưu trạng thái ghép câu để hỗ trợ thao tác Undo / Redo cho người học
 */
export class SentenceMemento {
  constructor(public readonly state: string[]) {}
}

export class SentenceOriginator {
  private tokens: string[] = [];

  setTokens(tokens: string[]) { this.tokens = [...tokens]; }
  getTokens() { return [...this.tokens]; }

  save(): SentenceMemento { return new SentenceMemento(this.tokens); }
  restore(m: SentenceMemento) { this.tokens = [...m.state]; }
}
