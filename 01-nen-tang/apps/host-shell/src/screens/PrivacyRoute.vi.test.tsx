import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Ghim ngôn ngữ trước khi nạp store (renderToStaticMarkup đọc trạng thái khởi tạo)
vi.hoisted(() => {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'vi-VN' }, configurable: true });
});

describe('Chính sách quyền riêng tư (vi) theo nhà cung cấp AI', () => {
  it('liệt kê Google Gemini, Groq, OpenRouter, loại dữ liệu và việc nhà cung cấp có thể dùng để cải thiện dịch vụ', async () => {
    const { default: PrivacyRoute } = await import('./PrivacyRoute');
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PrivacyRoute />
      </MemoryRouter>
    );
    for (const s of ['Google (Gemini)', 'Groq', 'OpenRouter', 'tin nhắn chữ', 'giọng nói', 'khung hình', 'cải thiện dịch vụ']) expect(html).toContain(s);
    expect(html).not.toContain('không chia sẻ dữ liệu cho ai ngoài Google Gemini');
    expect(html).toContain('[Cần điền');
  });
});
