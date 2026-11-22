import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';

vi.mock('@vietlearning/api-client', () => ({ request: vi.fn(() => new Promise(() => undefined)), describeGatewayError: vi.fn() }));
vi.mock('@vietlearning/native', () => ({
  canOpenAppSettings: () => false,
  openAppSettings: vi.fn(),
  getDeviceSpeech: () => ({ speak: vi.fn() }),
  fileToJpegBase64: vi.fn(async () => ({ base64: 'x', previewUrl: 'blob:p' })),
  toJpegBase64: vi.fn()
}));

import { CameraScreen } from './CameraScreen';

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

const open = () => {
  render(
    <MemoryRouter>
      <CameraScreen />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: /Chọn ảnh|Chọn/ }));
};

describe('Camera: hộp đồng ý rút gọn (P1-6)', () => {
  it('tóm tắt ngắn hiện sẵn, đoạn đầy đủ gập trong “Chi tiết”, nút chính dính đáy', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Ảnh của bạn đi đâu?');
    const details = screen.getByText('Chi tiết').closest('details')!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('máy chủ của Google có thể đặt ở ngoài Việt Nam');
    // tóm tắt (ngoài mục gập) ngắn hơn bản đầy đủ
    const summary = [...dialog.querySelectorAll('p')].find((p) => !details.contains(p) && /Gemini/.test(p.textContent ?? ''))!;
    expect(summary.textContent!.length).toBeLessThan(details.textContent!.length / 2);
    expect(screen.getByRole('button', { name: 'Đồng ý, tiếp tục' }).parentElement!.className).toContain('sticky');
  });

  it('en: “Details”', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    render(
      <MemoryRouter>
        <CameraScreen />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Choose|Pick/ }));
    expect(screen.getByText('Details')).toBeTruthy();
  });
});
