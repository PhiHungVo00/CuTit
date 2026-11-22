import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Ghim ngôn ngữ trước khi nạp store (khách lạ chưa có hồ sơ ⇒ theo navigator.language)
vi.hoisted(() => {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'vi-VN' }, configurable: true });
});

async function render() {
  const { default: Route } = await import('./DeleteAccountInfoRoute');
  return renderToStaticMarkup(
    <MemoryRouter>
      <Route />
    </MemoryRouter>
  );
}

describe('Trang công khai Xóa tài khoản (vi)', () => {
  it('nêu cách xóa trong app, 30 ngày khôi phục, xóa ngay, dữ liệu xóa/giữ, liên hệ "Sắp có"', async () => {
    const html = await render();
    for (const s of ['Xóa tài khoản', 'Hồ sơ', 'Cài đặt', '30 ngày', 'Xóa ngay', 'Khôi phục', 'Tiến độ học', 'Bản băm', '90 ngày', '180 ngày', 'Sắp có']) expect(html).toContain(s);
  });

  it('link tới /quyen-rieng-tu và /ho-so (Đăng nhập tạm), không có biểu mẫu', async () => {
    const html = await render();
    expect(html).toContain('href="/quyen-rieng-tu"');
    expect(html).toContain('href="/ho-so"');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
  });

  it('có đủ chuỗi en cho mọi khóa vi (không để trống)', async () => {
    const { vi: viDict, en } = await import('../deleteAccountI18n');
    expect(Object.keys(en).sort()).toEqual(Object.keys(viDict).sort());
    for (const [k, v] of Object.entries(en)) expect(v, k).not.toBe('');
  });
});
