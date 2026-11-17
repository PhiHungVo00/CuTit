import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_SCREEN_CHANGED_EVENT,
  NAV_SCREEN_IDS,
  NAV_SOURCE_IDS,
  NavScreenChangedEventSchema,
  emitNavScreenChanged
} from '../dist/index.js';

// ---- Giá trị hợp đồng nền tảng ----

test('NAV: Hằng số sự kiện đúng tên hợp đồng', () => {
  assert.equal(NAV_SCREEN_CHANGED_EVENT, 'shell.nav.screen_changed');
});

test('NAV: Danh mục 13 màn hình (overview + 12 màn), không trùng lặp', () => {
  assert.equal(NAV_SCREEN_IDS.length, 13);
  assert.equal(new Set(NAV_SCREEN_IDS).size, 13);
  assert.ok(NAV_SCREEN_IDS.includes('overview'));
  for (const id of ['m1-chat', 'm7-roleplay', 'm8-sentence', 'm5-drill', 'm3-honorific', 'm10-culture', 'm4-vision', 'm2-pitch', 'm6-dialect', 'm9-analytics', 'm11-onboarding', 'm12-preferences']) {
    assert.ok(NAV_SCREEN_IDS.includes(id), `thiếu màn ${id}`);
  }
});

test('NAV: Nguồn phát sự kiện gồm đủ 10 nguồn (có rail cho cột phải web), không trùng', () => {
  assert.equal(NAV_SOURCE_IDS.length, 10);
  assert.equal(new Set(NAV_SOURCE_IDS).size, 10);
  for (const s of ['sidebar', 'bottom_tab', 'drawer', 'card', 'subtab', 'main_tab', 'quick_action', 'rail', 'url', 'programmatic']) {
    assert.ok(NAV_SOURCE_IDS.includes(s), `thiếu nguồn ${s}`);
  }
});

// ---- Schema Zod ----

test('NAV: Schema nhận payload hợp lệ (có from + mainTab)', () => {
  const res = NavScreenChangedEventSchema.safeParse({
    to: 'm9-analytics',
    from: 'overview',
    source: 'rail',
    mainTab: 'overview',
    emittedAt: 1750000000000
  });
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.data.to, 'm9-analytics');
    assert.equal(res.data.source, 'rail');
    assert.equal(res.data.emittedAt, 1750000000000);
  }
});

test('NAV: Schema nhận payload không có from (màn xuất phát không bắt buộc)', () => {
  const res = NavScreenChangedEventSchema.safeParse({
    to: 'overview',
    source: 'programmatic',
    emittedAt: 1750000000000
  });
  assert.equal(res.success, true);
});

test('NAV: Schema chối nguồn lạ (không có trong danh mục)', () => {
  const res = NavScreenChangedEventSchema.safeParse({
    to: 'overview',
    from: 'm1-chat',
    source: 'magic_wand',
    emittedAt: 1750000000000
  });
  assert.equal(res.success, false);
});

test('NAV: Schema chối màn không tồn tại và chối emittedAt sai định dạng', () => {
  const badScreen = NavScreenChangedEventSchema.safeParse({
    to: 'm99-khong-ton-tai',
    source: 'card',
    emittedAt: 1750000000000
  });
  assert.equal(badScreen.success, false);

  const badTime = NavScreenChangedEventSchema.safeParse({
    to: 'overview',
    source: 'card',
    emittedAt: 0
  });
  assert.equal(badTime.success, false);

  const floatTime = NavScreenChangedEventSchema.safeParse({
    to: 'overview',
    source: 'card',
    emittedAt: 1750000000.5
  });
  assert.equal(floatTime.success, false);
});

// ---- emitNavScreenChanged (cổng phát an toàn) ----

test('NAV: emitNavScreenChanged phát đúng tên sự kiện + tự gắn emittedAt qua bus', () => {
  const calls = [];
  const fakeBus = {
    emit: (event, data) => calls.push({ event, data })
  };

  emitNavScreenChanged(fakeBus, { to: 'm3-honorific', from: 'overview', source: 'sidebar' });

  assert.equal(calls.length, 1);
  const first = calls[0];
  assert.equal(first.event, 'shell.nav.screen_changed');
  assert.equal(first.data.to, 'm3-honorific');
  assert.equal(first.data.source, 'sidebar');
  assert.equal(typeof first.data.emittedAt, 'number');
  assert.ok(first.data.emittedAt > 0);
});

test('NAV: emitNavScreenChanged im lặng khi payload lệch schema (không phát bậy)', () => {
  const calls = [];
  const fakeBus = {
    emit: (event, data) => calls.push({ event, data })
  };

  // source không hợp lệ → payload phải bị bỏ qua
  emitNavScreenChanged(fakeBus, { to: 'overview', source: 'tap_khung' });
  assert.equal(calls.length, 0);

  // to không tồn tại → cũng bỏ qua
  emitNavScreenChanged(fakeBus, { to: 'm0-fake', source: 'card' });
  assert.equal(calls.length, 0);
});
