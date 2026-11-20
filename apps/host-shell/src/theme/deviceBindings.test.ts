import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEVICE_SETTINGS, deviceSettingsStore, setDeviceSettings } from '@vietlearning/state';
import { applyDocumentSettings, bindMusicSettings, resolveTheme } from './deviceBindings';

const fakeRoot = () => {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    getAttribute: (k: string) => attrs.get(k) ?? null
  };
};

describe('resolveTheme', () => {
  it("'system' theo prefers-color-scheme", () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
  it('lựa chọn cố định thắng media', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyDocumentSettings', () => {
  it('theme system + media tối ⇒ data-theme=dark', () => {
    const root = fakeRoot();
    applyDocumentSettings(root, { ...DEFAULT_DEVICE_SETTINGS, theme: 'system' }, true);
    expect(root.getAttribute('data-theme')).toBe('dark');
  });
  it('reducedMotion ⇒ data-reduced-motion=true; tắt ⇒ bỏ thuộc tính', () => {
    const root = fakeRoot();
    applyDocumentSettings(root, { ...DEFAULT_DEVICE_SETTINGS, reducedMotion: true }, false);
    expect(root.getAttribute('data-reduced-motion')).toBe('true');
    applyDocumentSettings(root, { ...DEFAULT_DEVICE_SETTINGS, reducedMotion: false }, false);
    expect(root.getAttribute('data-reduced-motion')).toBeNull();
  });
});

describe('bindMusicSettings', () => {
  const setup = () => {
    setDeviceSettings({ ...DEFAULT_DEVICE_SETTINGS });
    const m = { start: vi.fn(), stop: vi.fn(), setTrack: vi.fn(), setVolume: vi.fn() };
    const off = bindMusicSettings(deviceSettingsStore, m);
    return { m, off };
  };
  it('tắt nhạc ⇒ music.stop()', () => {
    const { m, off } = setup();
    setDeviceSettings({ music: false });
    expect(m.stop).toHaveBeenCalledTimes(1);
    off();
  });
  it('bật lại nhạc ⇒ music.start()', () => {
    const { m, off } = setup();
    setDeviceSettings({ music: false });
    setDeviceSettings({ music: true });
    expect(m.start).toHaveBeenCalledTimes(1);
    off();
  });
  it('đổi bài ⇒ setTrack; đổi âm lượng ⇒ setVolume', () => {
    const { m, off } = setup();
    setDeviceSettings({ musicTrack: 'trau-ve' });
    expect(m.setTrack).toHaveBeenCalledWith('trau-ve');
    setDeviceSettings({ musicVolume: 0.8 });
    expect(m.setVolume).toHaveBeenCalledWith(0.8);
    off();
  });
  it('đổi trường khác không đụng nhạc', () => {
    const { m, off } = setup();
    setDeviceSettings({ reducedMotion: true });
    expect(m.stop).not.toHaveBeenCalled();
    expect(m.setTrack).not.toHaveBeenCalled();
    off();
  });
});
