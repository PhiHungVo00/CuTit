/**
 * GoF Singleton (4) & Observer (14) Pattern
 * Quản lý phát và lắng nghe sự kiện liên Micro Frontend và luồng âm thanh
 */
type EventHandler = (data: any) => void;

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, EventHandler[]> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public subscribe(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);

    // Trả về hàm hủy đăng ký
    return () => {
      const handlers = this.listeners.get(event) || [];
      this.listeners.set(event, handlers.filter(h => h !== handler));
    };
  }

  public emit(event: string, data: any): void {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(h => h(data));
  }
}
