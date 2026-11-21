import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TabBar } from './TabBar';

// Ngôn ngữ mặc định lấy theo navigator.language của máy (runner CI là tiếng Anh). renderToStaticMarkup đọc
// trạng thái KHỞI TẠO của store (snapshot phía server), nên phải ghim ngôn ngữ trước khi module state được nạp.
vi.hoisted(() => {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'vi-VN' }, configurable: true });
});

const render = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <TabBar />
    </MemoryRouter>
  );

describe('TabBar', () => {
  it('có đúng 4 mục với nhãn tiếng Việt', () => {
    const html = render('/');
    expect((html.match(/<a /g) ?? []).length).toBe(4);
    for (const label of ['Học', 'Luyện tập', 'Bạn bè', 'Hồ sơ']) expect(html).toContain(`>${label}<`);
  });
  it('mục đang chọn có aria-current=page (đúng một mục)', () => {
    const html = render('/phat-am');
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/a>).)*Luyện tập/s);
  });
  it('/cai-dat/am-thanh sáng tab Hồ sơ; màn Cu Tít không sáng tab nào', () => {
    expect(render('/cai-dat/am-thanh')).toMatch(/aria-current="page"[^>]*>(?:(?!<\/a>).)*Hồ sơ/s);
    expect(render('/hoi-thoai')).not.toContain('aria-current');
  });
  it('icon là SVG, không emoji', () => {
    const html = render('/');
    expect(html.match(/<svg/g)?.length).toBe(4);
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
