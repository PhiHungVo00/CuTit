/**
 * Tên biến CSS của bảng màu Bé Cu Tít. Giá trị màu CHỈ nằm ở `theme.css` (một nguồn);
 * TypeScript chỉ tham chiếu `var(--ct-*)`, không lặp mã màu.
 */
export const themeTokens = {
  colors: {
    canvas: 'var(--ct-canvas)',
    surface: 'var(--ct-surface)',
    ink: 'var(--ct-ink)',
    heading: 'var(--ct-heading)',
    accent: 'var(--ct-accent)',
    accentInk: 'var(--ct-accent-ink)',
    gold: 'var(--ct-gold)',
    sky: 'var(--ct-sky)',
    danger: 'var(--ct-danger)',
    line: 'var(--ct-line)',
  },
  typography: {
    fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
    lineHeightToneOptimized: '1.65', // tối ưu dấu thanh ở, ễ, ự
  },
  mascot: {
    name: 'Bé Cu Tít',
    age: 7,
    attributes: ['nón lá', 'khăn rằn', 'áo nâu'],
  },
} as const;
