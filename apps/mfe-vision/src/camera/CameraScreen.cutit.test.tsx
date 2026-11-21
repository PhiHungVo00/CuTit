import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';

vi.mock('@vietlearning/api-client', () => ({ request: vi.fn(() => new Promise(() => undefined)), describeGatewayError: vi.fn() }));
vi.mock('@vietlearning/native', () => ({
  canOpenAppSettings: () => false,
  openAppSettings: vi.fn(),
  getDeviceSpeech: () => ({ speak: vi.fn() }),
  fileToJpegBase64: vi.fn(async () => ({ base64: 'x', previewUrl: 'blob:p' })),
  toJpegBase64: vi.fn(),
}));

import { CameraScreen } from './CameraScreen';

beforeEach(() => {
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  learnerStore.getState().giveConsent('camera');
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('Camera: Cu Tít suy nghĩ khi chờ phân tích', () => {
  it('đang phân tích ảnh ⇒ CuTit mood "suy-nghi"', async () => {
    const { container } = render(
      <MemoryRouter>
        <CameraScreen />
      </MemoryRouter>
    );
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['a'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    const imgs = screen.getAllByRole('img') as HTMLImageElement[];
    expect(imgs.some((i) => i.src.includes('cutit-suy-nghi'))).toBe(true);
  });
});
