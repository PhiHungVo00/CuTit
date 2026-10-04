/**
 * GoF Iterator Pattern (20)
 * Duyệt tuần tự danh sách thẻ cần ôn tập theo SM-2 mà không để lộ cấu trúc dữ liệu bên trong
 */
export interface SRSCardItem {
  id: string;
  itemRef: string;
  dueAt: Date;
}

export class SRSIterator {
  private index = 0;

  constructor(private cards: SRSCardItem[]) {}

  public hasNext(): boolean {
    return this.index < this.cards.length;
  }

  public next(): SRSCardItem | null {
    if (!this.hasNext()) return null;
    return this.cards[this.index++];
  }

  public reset(): void {
    this.index = 0;
  }
}
