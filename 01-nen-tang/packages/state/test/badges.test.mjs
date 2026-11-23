import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeStatuses, newlyEarned, weekStart, weeklySummary, knownDay, migrateProgress, LONG_TERM_DAYS, TONE_MASTERY } from '../dist/progress.js';
import { progressStore } from '../dist/progress.js';
import { learnerStore, dayKey } from '../dist/index.js';

/** GĐ4: huy hiệu theo THÀNH THẠO (không theo số ngày cày) + tổng kết tuần so với chính mình */

const TONES = ['ngang', 'huyen', 'sac', 'hoi', 'nga', 'nang'];
const FACTS = {
  tones: TONES,
  units: [
    { id: 'u1', lessonIds: ['u1l1', 'u1l2', 'u1l5'], roleplayIds: ['u1l5'] },
    { id: 'u2', lessonIds: ['u2l1', 'u2l5'], roleplayIds: ['u2l5'] }
  ]
};
const empty = () => ({ toneStats: {}, srs: {}, lessons: {}, testedOut: {} });
const byKey = (list) => Object.fromEntries(list.map((b) => [b.key, b]));
const card = (intervalDays, dueAt = '2026-12-30T00:00:00.000Z') => ({ intervalDays, dueAt });
const NOW = new Date('2026-11-18T10:00:00'); // Thứ Tư
const ago = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

test('Danh sách huy hiệu: thanh điệu, thẻ nhớ dài hạn, từng unit, nhập vai, vượt unit — người mới chưa đạt gì', () => {
  const s = byKey(badgeStatuses(empty(), FACTS));
  assert.deepEqual(Object.keys(s), ['tones80', 'cards25', 'cards100', 'unit:u1', 'unit:u2', 'roleplay', 'testout']);
  assert.ok(Object.values(s).every((b) => !b.met && b.current === 0));
  assert.equal(s.tones80.target, 6);
  assert.equal(s.cards100.target, 100);
  assert.equal(s['unit:u1'].target, 3);
});

test('6 thanh đều ≥ 80 điểm (mỗi thanh ít nhất 3 lượt) — đếm số thanh đã đạt', () => {
  const toneStats = Object.fromEntries(TONES.map((t) => [t, { n: 3, sum: 3 * TONE_MASTERY }]));
  toneStats.nga = { n: 3, sum: 3 * 79 };
  toneStats.nang = { n: 2, sum: 200 }; // điểm cao nhưng chưa đủ lượt
  let s = byKey(badgeStatuses({ ...empty(), toneStats }, FACTS));
  assert.equal(s.tones80.current, 4);
  assert.equal(s.tones80.met, false);
  toneStats.nga = { n: 4, sum: 4 * 85 };
  toneStats.nang = { n: 3, sum: 300 };
  s = byKey(badgeStatuses({ ...empty(), toneStats }, FACTS));
  assert.equal(s.tones80.current, 6);
  assert.equal(s.tones80.met, true);
});

test(`Thẻ nhớ dài hạn = khoảng ôn ≥ ${LONG_TERM_DAYS} ngày; số hiện có không vượt mục tiêu`, () => {
  const srs = {};
  for (let i = 0; i < 30; i++) srs[`w${i}`] = card(i < 26 ? 21 : 20);
  const s = byKey(badgeStatuses({ ...empty(), srs }, FACTS));
  assert.equal(s.cards25.current, 25);
  assert.equal(s.cards25.met, true);
  assert.equal(s.cards100.current, 26);
  assert.equal(s.cards100.met, false);
});

test('Xong unit = mọi bài xong HOẶC đã vượt unit; nhập vai đạt = bài nhập vai ≥ 60%; vượt unit bất kỳ', () => {
  const lessons = { u1l1: { best: 1 }, u1l2: { best: 0.4 }, u1l5: { best: 0.5 } };
  let s = byKey(badgeStatuses({ ...empty(), lessons }, FACTS));
  assert.equal(s['unit:u1'].current, 3);
  assert.equal(s['unit:u1'].met, true);
  assert.equal(s.roleplay.met, false, 'nhập vai 50% chưa đạt');
  lessons.u1l5 = { best: 0.6 };
  s = byKey(badgeStatuses({ ...empty(), lessons, testedOut: { u2: '2026-11-18T00:00:00.000Z' } }, FACTS));
  assert.equal(s.roleplay.met, true);
  assert.equal(s['unit:u2'].met, true);
  assert.equal(s['unit:u2'].current, 2);
  assert.equal(s.testout.met, true);
});

test('newlyEarned: chỉ huy hiệu vừa đạt và chưa có', () => {
  const statuses = badgeStatuses({ ...empty(), testedOut: { u2: 'x' } }, FACTS);
  assert.deepEqual(newlyEarned(statuses, {}), ['unit:u2', 'testout']);
  assert.deepEqual(newlyEarned(statuses, { testout: { at: 'x', seen: true } }), ['unit:u2']);
});

test('Store: awardBadges lưu lúc đạt, chưa xem; không có huy hiệu mất đi khi điểm tụt', () => {
  learnerStore.getState().reset();
  progressStore.getState().resetProgress();
  const toneStats = Object.fromEntries(TONES.map((t) => [t, { n: 3, sum: 270 }]));
  progressStore.setState({ toneStats });
  assert.deepEqual(progressStore.getState().awardBadges(FACTS, NOW), ['tones80']);
  assert.deepEqual(progressStore.getState().badges.tones80, { at: NOW.toISOString(), seen: false });
  // gọi lại: không trao lần hai
  assert.deepEqual(progressStore.getState().awardBadges(FACTS, NOW), []);
  // điểm tụt dưới 80 => huy hiệu vẫn còn
  progressStore.getState().recordTone('ngang', 0, NOW);
  progressStore.getState().recordTone('ngang', 0, NOW);
  progressStore.getState().awardBadges(FACTS, NOW);
  assert.ok(progressStore.getState().badges.tones80);
  progressStore.getState().markBadgesSeen();
  assert.equal(progressStore.getState().badges.tones80.seen, true);
});

test('migrateProgress: chuẩn hóa huy hiệu + dữ liệu tuần; bản lưu cũ không có trường mới vẫn hợp lệ', () => {
  const m = migrateProgress({ badges: { ok: { at: '2026-11-01T00:00:00.000Z', seen: true }, bad: 3, noAt: { seen: false } }, lessonsByDay: { [ago(1)]: 2, x: 'y' } }, 1);
  assert.deepEqual(m.badges, { ok: { at: '2026-11-01T00:00:00.000Z', seen: true } });
  assert.deepEqual(m.lessonsByDay, { [ago(1)]: 2 });
  const old = migrateProgress({ lessonsDone: 3 }, 1);
  assert.deepEqual(old.badges, {});
  assert.deepEqual(old.knownAt, {});
  assert.equal(old.toneWeek, null);
});

test('weekStart = Thứ Hai của tuần; knownDay = ngày ôn gần nhất (hạn − khoảng ôn)', () => {
  assert.equal(weekStart(NOW), '2026-11-16');
  assert.equal(weekStart(new Date('2026-11-22T23:00:00')), '2026-11-16'); // Chủ Nhật
  assert.equal(weekStart(new Date('2026-11-23T00:30:00')), '2026-11-23');
  assert.equal(knownDay({ intervalDays: 6, dueAt: new Date('2026-11-24T10:00:00').toISOString() }), '2026-11-18');
});

test('Tổng kết tuần: phút học, bài xong, từ đã thuộc, XP — tuần này so với tuần trước của chính mình', () => {
  const activity = { [ago(0)]: 600, [ago(2)]: 300, [ago(3)]: 120 /* CN tuần trước */, [ago(9)]: 60 /* T2 tuần trước */, [ago(10)]: 999 /* tuần trước nữa */ };
  const lessonsByDay = { [ago(1)]: 2, [ago(4)]: 1, [ago(20)]: 5 };
  const knownAt = { a: ago(0), b: ago(2), c: ago(5), d: ago(30) };
  const xpByDay = { [ago(0)]: 25, [ago(5)]: 10 };
  const w = weeklySummary({ activity, lessonsByDay, knownAt, xpByDay, toneStats: {}, toneWeek: null }, NOW);
  assert.equal(w.weekStart, '2026-11-16');
  assert.deepEqual(w.thisWeek, { minutes: 15, lessons: 2, words: 2, xp: 25 });
  assert.deepEqual(w.lastWeek, { minutes: 3, lessons: 1, words: 1, xp: 10 });
  assert.equal(w.hasLastWeek, true);
  assert.equal(w.bestTone, null);
  const fresh = weeklySummary({ activity: { [ago(0)]: 60 }, lessonsByDay: {}, knownAt: {}, xpByDay: {}, toneStats: {}, toneWeek: null }, NOW);
  assert.equal(fresh.hasLastWeek, false);
});

test('Thanh tiến bộ nhất: điểm trung bình tuần này so với trung bình trước tuần này', () => {
  const toneWeek = { week: '2026-11-16', base: { sac: { n: 4, sum: 240 }, hoi: { n: 2, sum: 140 }, nga: { n: 1, sum: 90 } } };
  // tuần này: sắc 2 lượt TB 90 (+30), hỏi 1 lượt 80 (+10), ngã 1 lượt 50 (−40), nặng mới (chưa có trước => không so)
  const toneStats = { sac: { n: 6, sum: 420 }, hoi: { n: 3, sum: 220 }, nga: { n: 2, sum: 140 }, nang: { n: 1, sum: 99 } };
  const w = weeklySummary({ activity: {}, lessonsByDay: {}, knownAt: {}, xpByDay: {}, toneStats, toneWeek }, NOW);
  assert.deepEqual(w.bestTone, { tone: 'sac', avg: 90, delta: 30 });
  // mốc thuộc tuần cũ => tuần này chưa luyện thanh nào
  const stale = weeklySummary({ activity: {}, lessonsByDay: {}, knownAt: {}, xpByDay: {}, toneStats, toneWeek: { ...toneWeek, week: '2026-11-09' } }, NOW);
  assert.equal(stale.bestTone, null);
});

test('Store: recordTone chốt mốc đầu tuần; completeLesson đếm bài theo ngày; noteKnownWords ghi ngày thuộc', () => {
  learnerStore.getState().reset();
  progressStore.getState().resetProgress();
  const lastWeek = new Date('2026-11-12T10:00:00');
  progressStore.getState().recordTone('sac', 60, lastWeek);
  progressStore.getState().recordTone('sac', 90, NOW);
  assert.deepEqual(progressStore.getState().toneWeek, { week: '2026-11-16', base: { sac: { n: 1, sum: 60 } } });
  progressStore.getState().recordTone('sac', 100, NOW);
  assert.deepEqual(progressStore.getState().toneWeek.base, { sac: { n: 1, sum: 60 } }, 'mốc không đổi trong tuần');
  progressStore.getState().completeLesson('u1l1', { total: 2, firstTryCorrect: 2 }, NOW);
  progressStore.getState().completeLesson('u1l1', { total: 2, firstTryCorrect: 2 }, NOW);
  assert.equal(progressStore.getState().lessonsByDay[dayKey(NOW)], 2);
  const srs = {
    a: { itemRef: 'a', intervalDays: 6, dueAt: new Date('2026-11-24T10:00:00').toISOString() },
    b: { itemRef: 'b', intervalDays: 1, dueAt: new Date('2026-11-19T10:00:00').toISOString() }
  };
  progressStore.getState().noteKnownWords(srs);
  assert.deepEqual(progressStore.getState().knownAt, { a: '2026-11-18' });
  // ôn lại sau đó không đổi ngày đã thuộc
  srs.a = { ...srs.a, intervalDays: 15, dueAt: new Date('2026-12-09T10:00:00').toISOString() };
  progressStore.getState().noteKnownWords(srs);
  assert.deepEqual(progressStore.getState().knownAt, { a: '2026-11-18' });
});
