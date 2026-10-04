/**
 * GoF Prototype Pattern (5)
 * Nhân bản và cấu hình nhanh các kịch bản hội thoại mẫu (Roleplay Scenario)
 */
export interface Scenario {
  id: string;
  title: string;
  location: string;
  tasks: string[];
  clone(): Scenario;
}

export class MarketplaceScenario implements Scenario {
  constructor(
    public id: string,
    public title: string,
    public location: string,
    public tasks: string[]
  ) {}

  clone(): Scenario {
    return new MarketplaceScenario(
      `${this.id}_custom_${Date.now()}`,
      this.title,
      this.location,
      [...this.tasks]
    );
  }
}
