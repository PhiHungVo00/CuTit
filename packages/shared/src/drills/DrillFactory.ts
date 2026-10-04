/**
 * GoF Factory Method Pattern (2)
 * Khởi tạo đối tượng bài tập thích ứng tùy biến theo loại bài kiểm tra
 */
export interface DrillItem {
  id: string;
  type: 'quiz' | 'fill' | 'listen' | 'sentence';
  renderPrompt(): string;
}

export class DrillFactory {
  public static createDrill(type: 'quiz' | 'fill' | 'listen' | 'sentence', payload: any): DrillItem {
    switch (type) {
      case 'quiz':
        return {
          id: payload.id,
          type: 'quiz',
          renderPrompt: () => `Trắc nghiệm: ${payload.question}`
        };
      case 'fill':
        return {
          id: payload.id,
          type: 'fill',
          renderPrompt: () => `Điền từ vào chỗ trống: ${payload.sentence}`
        };
      default:
        return {
          id: payload.id || 'default',
          type,
          renderPrompt: () => `Bài tập loại: ${type}`
        };
    }
  }
}
