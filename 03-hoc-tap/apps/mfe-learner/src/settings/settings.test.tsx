import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_DEVICE_SETTINGS, deviceSettingsStore, learnerStore, setDeviceSettings } from '@vietlearning/state';
import { SettingsGroup, SettingsIndex, type SettingsGroupId } from '../index';

// Màn Cài đặt chỉ ghi deviceSettings; host-shell mới điều khiển nhạc. Gọi music trực tiếp là lỗi.
vi.mock('@vietlearning/shared/audio', async (orig) => {
  const real = await orig<typeof import('@vietlearning/shared/audio')>();
  const forbidden = () => {
    throw new Error('MFE không được gọi music trực tiếp');
  };
  return { ...real, music: new Proxy({}, { get: () => forbidden }) };
});

const group = (id: SettingsGroupId) =>
  render(
    <MemoryRouter>
      <SettingsGroup id={id} />
    </MemoryRouter>
  );

beforeEach(() => {
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  setDeviceSettings({ ...DEFAULT_DEVICE_SETTINGS });
});
afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

describe('SettingsIndex', () => {
  it('có đủ 7 nhóm theo thứ tự', () => {
    render(
      <MemoryRouter>
        <SettingsIndex />
      </MemoryRouter>
    );
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs.filter((h) => h?.startsWith('/cai-dat/'))).toEqual(['giao-dien', 'ngon-ngu', 'hoc', 'am-thanh', 'chuyen-dong', 'quyen-rieng-tu', 'tai-khoan'].map((g) => `/cai-dat/${g}`));
  });
});

describe('SettingsGroup', () => {
  it('Âm thanh: tắt Nhạc nền ⇒ deviceSettings.music === false', () => {
    group('am-thanh');
    fireEvent.click(screen.getByRole('switch', { name: 'Nhạc nền' }));
    expect(deviceSettingsStore.getState().music).toBe(false);
  });

  it('Âm thanh: chọn bài “Trâu về” ⇒ musicTrack === trau-ve', () => {
    group('am-thanh');
    fireEvent.click(screen.getByRole('radio', { name: 'Trâu về' }));
    expect(deviceSettingsStore.getState().musicTrack).toBe('trau-ve');
  });

  it('Giao diện: chọn tối ⇒ theme === dark; Chuyển động: bật giảm chuyển động', () => {
    group('giao-dien');
    fireEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(deviceSettingsStore.getState().theme).toBe('dark');
    cleanup();
    group('chuyen-dong');
    fireEvent.click(screen.getByRole('switch', { name: 'Giảm chuyển động' }));
    expect(deviceSettingsStore.getState().reducedMotion).toBe(true);
  });

  it('Ngôn ngữ: chọn English ghi preferences.uiLanguage', () => {
    group('ngon-ngu');
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(learnerStore.getState().preferences.uiLanguage).toBe('en');
  });

  it('Học: đổi phương ngữ ghi cả preferences.dialect và profile.dialect', () => {
    group('hoc');
    fireEvent.click(screen.getByRole('radio', { name: 'Miền Nam' }));
    expect(learnerStore.getState().preferences.dialect).toBe('south');
    expect(learnerStore.getState().profile.dialect).toBe('south');
  });

  it('Quyền riêng tư: tắt công tắc giọng nói ⇒ rút đồng ý micro, camera giữ nguyên', () => {
    learnerStore.setState({ consents: { voice: true, camera: true } });
    group('quyen-rieng-tu');
    fireEvent.click(screen.getByRole('switch', { name: /Giọng nói/ }));
    expect(learnerStore.getState().consents.voice).toBeUndefined();
    expect(learnerStore.getState().consents.camera).toBeDefined();
  });

  it('Tài khoản: giữ phần khôi phục và xóa tài khoản (AccountSection)', async () => {
    group('tai-khoan');
    expect(await screen.findByRole('button', { name: /Xóa tài khoản và dữ liệu/ })).toBeTruthy();
    expect(screen.getByText('Dùng tài khoản từ máy khác')).toBeTruthy();
  });

  it('chuỗi có bản tiếng Anh', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    group('am-thanh');
    expect(screen.getByRole('switch', { name: 'Background music' })).toBeTruthy();
  });
});
