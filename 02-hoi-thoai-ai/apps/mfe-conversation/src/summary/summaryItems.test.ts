import { describe, expect, it } from 'vitest';
import { buildSummary } from './summaryItems';

const youWrote = (t: string) => `Bạn đã nói: “${t}”.`;

describe('buildSummary (tổng kết sau buổi nói/nhập vai)', () => {
  it('lỗi trước, từ mới sau; gộp trùng theo itemRef; key ổn định', () => {
    const items = buildSummary(
      [
        { original: 'chao anh', corrected: 'Chào anh', explanation: 'Thiếu dấu.' },
        { original: 'chao  anh', corrected: 'chào anh', explanation: 'Thiếu dấu.' }
      ],
      [{ vi: 'dứa', en: 'pineapple' }, { vi: 'Dứa', en: 'pineapple' }, { vi: 'nghìn', en: 'thousand' }],
      youWrote
    );
    expect(items).toEqual([
      { key: 'roleplay:chào anh', kind: 'mistake', front: 'Chào anh', back: 'Bạn đã nói: “chao anh”. Thiếu dấu.' },
      { key: 'conv:word:dứa', kind: 'word', front: 'dứa', back: 'pineapple' },
      { key: 'conv:word:nghìn', kind: 'word', front: 'nghìn', back: 'thousand' }
    ]);
  });

  it('chuẩn hóa NFC để chữ dựng sẵn và chữ tổ hợp không thành hai thẻ', () => {
    const items = buildSummary([], [{ vi: 'dứa', en: 'a' }, { vi: 'dứa'.normalize('NFD'), en: 'b' }], youWrote);
    expect(items).toHaveLength(1);
  });

  it('không có gì => rỗng', () => {
    expect(buildSummary([], [], youWrote)).toEqual([]);
  });
});
