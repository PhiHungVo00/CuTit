/**
 * GoF Builder Pattern (3)
 * Lắp ráp Prompt nhiều tầng cho LLM: Persona Bé Cu Tít + Cấp độ CEFR + Phương ngữ + Quy tắc phản hồi
 */
export class SystemPromptBuilder {
  private persona = 'Bạn là Bé Cu Tít, 7 tuổi, người bạn đồng hành học tiếng Việt thân thiện, đáng yêu.';
  private level = 'CEFR A1';
  private dialect = 'Bắc (Hà Nội)';
  private scenario = '';

  public setLevel(level: string): this {
    this.level = level;
    return this;
  }

  public setDialect(dialect: string): this {
    this.dialect = dialect;
    return this;
  }

  public setScenario(scenario: string): this {
    this.scenario = scenario;
    return this;
  }

  public build(): string {
    return `
${this.persona}
- Cấp độ người học: ${this.level}
- Phương ngữ mục tiêu: ${this.dialect}
${this.scenario ? `- Kịch bản hiện tại: ${this.scenario}` : ''}
Quy tắc:
1. Trả lời ngắn gọn, thân thiện, dùng từ ngữ giản dị phù hợp trẻ em và người mới học.
2. Nếu người học dùng sai dấu thanh hoặc sai từ, nhẹ nhàng chỉ ra và sửa lại cho đúng.
`.trim();
  }
}
