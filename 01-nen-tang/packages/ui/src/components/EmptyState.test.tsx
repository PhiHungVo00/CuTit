// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState.js';

afterEach(cleanup);

describe('EmptyState', () => {
  it('hiện Cu Tít đúng tư thế, tiêu đề, lời giải thích và nút hành động', () => {
    const { container } = render(<EmptyState mood="ngu" title="Chưa có gì" body="Làm bài đầu tiên nhé" action={<button type="button">Bắt đầu</button>} />);
    expect(container.querySelector('img')!.getAttribute('src')).toContain('cutit-ngu');
    expect(screen.getByRole('heading', { name: 'Chưa có gì' })).toBeTruthy();
    expect(screen.getByText('Làm bài đầu tiên nhé')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeTruthy();
  });

  it('mặc định là role=status; tone=error là role=alert', () => {
    const { rerender } = render(<EmptyState mood="suy-nghi" title="Đang tải" />);
    expect(screen.getByRole('status')).toBeTruthy();
    rerender(<EmptyState mood="buon" tone="error" title="Lỗi" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('không có body/action thì không vẽ thêm khối thừa', () => {
    const { container } = render(<EmptyState mood="khen" title="Xong" />);
    expect(container.querySelectorAll('p').length).toBe(0);
  });

  it('cho đổi mức tiêu đề và cỡ Cu Tít', () => {
    const { container } = render(<EmptyState mood="ngu" title="T" as="h3" size={64} />);
    expect(screen.getByRole('heading', { level: 3 })).toBeTruthy();
    expect(container.querySelector('img')!.getAttribute('width')).toBe('64');
  });
});
