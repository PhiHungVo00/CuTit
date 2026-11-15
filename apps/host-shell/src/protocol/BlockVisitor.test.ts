import { describe, expect, it } from 'vitest';
import { BlockStatsVisitor, MAX_BLOCKS_PER_TURN, sanitizeAgentBlocks, visitBlocks } from './BlockVisitor';

const block = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  type: 'culture_pill',
  title: 'Văn hóa chào hỏi',
  payload: { tip: 'Khoanh tay chào người lớn tuổi.' },
  ...over
});

describe('sanitizeAgentBlocks (SanitizerVisitor)', () => {
  it('giữ block hợp lệ, bỏ block sai contract mà không làm hỏng cả lượt', () => {
    const out = sanitizeAgentBlocks([block(), { id: 'x', type: 'script_block', title: 't', payload: {} }, 'rác', null]);
    expect(out).toHaveLength(1);
    expect(out[0].payload).toEqual({ tip: 'Khoanh tay chào người lớn tuổi.' });
  });

  it('trả mảng rỗng khi dữ liệu không phải mảng', () => {
    expect(sanitizeAgentBlocks({ blocks: [] })).toEqual([]);
    expect(sanitizeAgentBlocks(undefined)).toEqual([]);
  });

  it('bỏ key nguy hiểm: innerHTML, event handler, style, __proto__', () => {
    const payload = JSON.parse(
      '{"tip":"ok","dangerouslySetInnerHTML":{"__html":"<img src=x onerror=alert(1)>"},"onClick":"alert(1)","style":"x","__proto__":{"polluted":true},"nested":{"innerHTML":"<b>x</b>","keep":1}}'
    );
    const [out] = sanitizeAgentBlocks([block({ payload })]);
    expect(Object.keys(out.payload).sort()).toEqual(['nested', 'tip']);
    expect(out.payload.nested).toEqual({ keep: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('chỉ cho phép URL http(s) ở các trường url/href/src/audio', () => {
    const [out] = sanitizeAgentBlocks([
      block({
        payload: {
          audioUrl: 'https://cdn.example.com/a.mp3',
          href: 'javascript:alert(1)',
          imageSrc: 'data:text/html;base64,PHNjcmlwdD4=',
          link: '/relative/path',
          note: 'javascript: chỉ là chữ ở trường thường'
        }
      })
    ]);
    expect(out.payload).toEqual({
      audioUrl: 'https://cdn.example.com/a.mp3',
      note: 'javascript: chỉ là chữ ở trường thường'
    });
  });

  it('bỏ ký tự điều khiển / đảo chiều văn bản, chuẩn hóa NFC, cắt chuỗi quá dài', () => {
    const [out] = sanitizeAgentBlocks([
      block({ title: 'Chào‮ bạn', payload: { long: 'a'.repeat(5000) } })
    ]);
    expect(out.title).toBe('Chào bạn');
    expect((out.payload.long as string).length).toBe(2000);
  });

  it('giới hạn độ sâu lồng nhau và số block mỗi lượt', () => {
    const deep = { a: { b: { c: { d: { e: 'quá sâu' } } } } };
    const [out] = sanitizeAgentBlocks([block({ payload: deep })]);
    expect(JSON.stringify(out.payload)).not.toContain('quá sâu');

    const many = Array.from({ length: 10 }, (_, i) => block({ id: `b${i}` }));
    expect(sanitizeAgentBlocks(many)).toHaveLength(MAX_BLOCKS_PER_TURN);
  });

  it('bỏ giá trị không phải JSON thuần (NaN, Infinity)', () => {
    const [out] = sanitizeAgentBlocks([block({ payload: { a: Number.NaN, b: Infinity, c: 3 } })]);
    expect(out.payload).toEqual({ c: 3 });
  });
});

describe('BlockStatsVisitor', () => {
  it('đếm loại block hợp lệ', () => {
    const types = visitBlocks([block(), block({ type: 'honorific_card' }), { bad: true }], new BlockStatsVisitor());
    expect(types).toEqual(['culture_pill', 'honorific_card']);
  });
});
