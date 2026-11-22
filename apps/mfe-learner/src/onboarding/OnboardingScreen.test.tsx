import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { OnboardingScreen } from './OnboardingScreen';

const show = () =>
  render(
    <MemoryRouter>
      <OnboardingScreen />
    </MemoryRouter>
  );
const mascot = (c: HTMLElement) => c.querySelector('span.ct-cutit img') as HTMLImageElement | null;

beforeEach(() => {
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

describe('Làm quen (P1-5)', () => {
  it('bước 1: Cu Tít chào 96px', () => {
    const { container } = show();
    const img = mascot(container)!;
    expect(img.getAttribute('src')).toContain('cutit-chao');
    expect(img.getAttribute('width')).toBe('96');
  });

  it('các bước chọn sau đó: Cu Tít suy nghĩ', () => {
    const { container } = show();
    fireEvent.click(screen.getByRole('radio', { name: /Du lịch/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp/ }));
    expect(mascot(container)!.getAttribute('src')).toContain('cutit-suy-nghi');
    expect(mascot(container)!.getAttribute('width')).toBe('72');
  });

  it('bước 2: chỉ English hiện sẵn, các ngôn ngữ ít dùng gập trong “Xem thêm ngôn ngữ”', () => {
    show();
    fireEvent.click(screen.getByRole('radio', { name: /Du lịch/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp/ }));
    expect(screen.getByRole('radio', { name: /English/ })).toBeTruthy();
    const more = screen.getByText('Xem thêm ngôn ngữ').closest('details')!;
    expect(more.open).toBe(false);
    for (const l of ['한국어', '日本語', '中文', 'Français']) expect(more.textContent).toContain(l);
    expect(more.textContent).toContain('Ngôn ngữ khác');
  });

  it('chọn ngôn ngữ trong mục gập vẫn bật nút Tiếp (cùng một nhóm radio)', () => {
    show();
    fireEvent.click(screen.getByRole('radio', { name: /Du lịch/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp/ }));
    expect(screen.getByRole('button', { name: /Tiếp/ })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('radio', { name: '한국어' }));
    expect(screen.getByRole('button', { name: /Tiếp/ })).toHaveProperty('disabled', false);
  });

  it('en có đủ chữ', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    show();
    fireEvent.click(screen.getByRole('radio', { name: /Travel/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('More languages')).toBeTruthy();
  });
});
