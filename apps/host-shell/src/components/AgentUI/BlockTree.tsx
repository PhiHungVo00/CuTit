/**
 * GoF Composite Pattern (8)
 * Quản lý các khối giao diện UI động thành cây phân cấp, xử lý đồng nhất khối đơn và khối lồng
 */
export interface UIComponent {
  render(): any;
}

export class LeafBlock implements UIComponent {
  constructor(private name: string) {}
  render() { return `Block: ${this.name}`; }
}

export class CompositeBlock implements UIComponent {
  private children: UIComponent[] = [];
  add(child: UIComponent) { this.children.push(child); }
  render() { return this.children.map(c => c.render()); }
}
