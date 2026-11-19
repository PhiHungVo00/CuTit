import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { VoiceConsent } from './VoiceConsent';

afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

const show = (onAgree = vi.fn()) =>
  render(
    <MemoryRouter>
      <VoiceConsent text="Âm thanh gửi qua Gateway." onAgree={onAgree} onCancel={vi.fn()} />
    </MemoryRouter>
  );

describe('VoiceConsent (hộp đồng ý micro dùng chung cho chat, nhập vai, gọi thoại)', () => {
  it('có link tới chính sách quyền riêng tư /quyen-rieng-tu', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
    show();
    const link = screen.getByRole('link', { name: 'Đọc chính sách quyền riêng tư' });
    expect(link.getAttribute('href')).toBe('/quyen-rieng-tu');
  });

  it('tiếng Anh', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    show();
    expect(screen.getByRole('link', { name: 'Read the privacy policy' }).getAttribute('href')).toBe('/quyen-rieng-tu');
  });

  it('đồng ý => ghi nhận consent voice', () => {
    const onAgree = vi.fn();
    learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
    show(onAgree);
    fireEvent.click(screen.getByRole('button', { name: 'Đồng ý, ghi âm' }));
    expect(onAgree).toHaveBeenCalled();
    expect(learnerStore.getState().consents.voice).toBe(true);
  });
});
