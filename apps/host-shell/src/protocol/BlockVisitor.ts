/**
 * GoF Visitor Pattern (22)
 * Duyệt cây UI Block để làm sạch mã độc (Sanitization) và thu thập thống kê (Analytics)
 */
export interface BlockVisitor {
  visitLeaf(block: any): void;
  visitComposite(block: any): void;
}

export class SanitizerVisitor implements BlockVisitor {
  visitLeaf(block: any) { /* Làm sạch mã độc XSS */ }
  visitComposite(block: any) { /* Duyệt các node con */ }
}
