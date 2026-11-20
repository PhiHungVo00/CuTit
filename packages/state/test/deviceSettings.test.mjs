import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage giả, đặt TRƯỚC khi nạp module (kho đọc khóa cũ lúc khởi tạo)
const data = new Map([['becutit.theme', 'dark']]);
globalThis.localStorage = {
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => void data.set(k, String(v)),
  removeItem: (k) => void data.delete(k)
};

const { trackForHour, preferredDialect, DEFAULT_DEVICE_SETTINGS, deviceSettingsStore, setDeviceSettings } = await import('../dist/index.js');

test('trackForHour chia sáng/chiều/tối theo giờ', () => {
  assert.equal(trackForHour(5), 'sang-lang');
  assert.equal(trackForHour(11), 'sang-lang');
  assert.equal(trackForHour(12), 'chieu-dong');
  assert.equal(trackForHour(17), 'chieu-dong');
  assert.equal(trackForHour(18), 'trau-ve');
  assert.equal(trackForHour(4), 'trau-ve');
});

test('mặc định đúng, trừ theme được di trú từ khóa cũ becutit.theme=dark', () => {
  assert.deepEqual(DEFAULT_DEVICE_SETTINGS, {
    theme: 'light', sfx: true, haptics: true, music: true, musicTrack: 'rotate', musicVolume: 0.35, reducedMotion: false, seenBubbleIntro: false
  });
  const s = deviceSettingsStore.getState();
  assert.equal(s.theme, 'dark'); // người dùng cũ giữ giao diện tối
  assert.equal(s.sfx, true);
});

test('setDeviceSettings gộp một phần và lưu vào becutit.device', () => {
  setDeviceSettings({ musicVolume: 0.6, reducedMotion: true });
  const s = deviceSettingsStore.getState();
  assert.equal(s.musicVolume, 0.6);
  assert.equal(s.reducedMotion, true);
  assert.equal(s.theme, 'dark');
  assert.ok(data.get('becutit.device'));
});

test('preferredDialect: preferences.dialect nếu có, ngược lại profile.dialect', () => {
  assert.equal(preferredDialect({ profile: { dialect: 'north' }, preferences: { dialect: 'south' } }), 'south');
  assert.equal(preferredDialect({ profile: { dialect: 'central' }, preferences: { dialect: '' } }), 'central');
});
