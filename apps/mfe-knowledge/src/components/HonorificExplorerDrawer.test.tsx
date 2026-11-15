import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { HonorificExplorerDrawer } from './HonorificExplorerDrawer';

vi.mock('../services/speechSynthesis', () => ({ speechService: { speak: vi.fn(), stop: vi.fn() } }));

afterEach(cleanup);
// Các khẳng định bên dưới dùng nhãn tiếng Việt
beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));

const setup = (isOpen = true) => {
  const onClose = vi.fn();
  const onSelectPair = vi.fn();
  render(<HonorificExplorerDrawer isOpen={isOpen} onClose={onClose} onSelectPair={onSelectPair} theme="dark" />);
  return { onClose, onSelectPair };
};

describe('HonorificExplorerDrawer', () => {
  it('là dialog có tiêu đề, hiển thị đủ 20 cặp', () => {
    setup();
    expect(screen.getByRole('dialog', { name: /Bảng 20 cặp/ })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
  });

  it('tìm không dấu: "thay" tìm ra "Thầy"', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'thay' } });
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    // Tìm cả trong phần giải thích (không hiển thị trên thẻ), nên chỉ kiểm tra: lọc bớt và có cặp "Thầy"
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(20);
    expect(items.some((t) => t.includes('Thầy'))).toBe(true);
  });

  it('nút Back Android (sự kiện app:back) khi đang mở: đóng bảng và chặn Shell rời màn hình', () => {
    const { onClose } = setup(true);
    const evt = new Event('app:back', { cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('khi đóng thì không chặn nút Back', () => {
    const { onClose } = setup(false);
    const evt = new Event('app:back', { cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Áp dụng" chọn cặp rồi đóng bảng', () => {
    const { onClose, onSelectPair } = setup();
    fireEvent.click(screen.getAllByRole('button', { name: /Áp dụng/ })[0]);
    expect(onSelectPair).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('giao diện tiếng Anh: tiêu đề và tên quan hệ tiếng Anh, đại từ vẫn tiếng Việt', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    setup();
    expect(screen.getByRole('dialog', { name: /The 20 standard pronoun pairs/ })).toBeTruthy();
    expect(screen.getByText('Family – grandparents')).toBeTruthy();
    expect(screen.getAllByText('I: cháu').length).toBeGreaterThan(0);
  });
});
