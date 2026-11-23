import test from 'node:test';
import assert from 'node:assert/strict';
import { learnerStore, computeStreak, accuracyBySkill, dueCards, dayKey, cefrLabel } from '../dist/index.js';

const s = () => learnerStore.getState();
test.beforeEach(() => s().reset());

test('Onboarding lưu hồ sơ và đồng bộ phương ngữ vào tùy chỉnh', () => {
  s().completeOnboarding({ level: 3, goal: 'travel', nativeLang: 'ko', dialect: 'south' });
  assert.equal(s().profile.onboarded, true);
  assert.equal(s().profile.level, 3);
  assert.equal(s().preferences.dialect, 'south');
});

test('SRS (A4): thẻ mới đến hạn ngay; trả lời tốt đẩy hạn 1 → 6 ngày; trả lời sai về 1 ngày', () => {
  const t0 = new Date('2026-11-15T08:00:00');
  s().addCard({ itemRef: 'dialect:d5', front: 'thìa', back: 'muỗng', source: 'dialect' }, t0);
  s().addCard({ itemRef: 'dialect:d5', front: 'X', back: 'Y', source: 'dialect' }, t0); // trùng: bỏ qua
  assert.equal(s().srs['dialect:d5'].front, 'thìa');
  assert.equal(dueCards(s().srs, t0).length, 1);

  s().reviewCard('dialect:d5', 5, t0);
  let c = s().srs['dialect:d5'];
  assert.equal(c.intervalDays, 1);
  assert.equal(dueCards(s().srs, t0).length, 0);
  s().reviewCard('dialect:d5', 4, new Date('2026-11-16T08:00:00'));
  assert.equal(s().srs['dialect:d5'].intervalDays, 6);
  s().reviewCard('dialect:d5', 1, new Date('2026-11-22T08:00:00'));
  c = s().srs['dialect:d5'];
  assert.equal(c.intervalDays, 1);
  assert.equal(c.repetitions, 0);
  assert.ok(c.ease >= 130);
});

test('Streak: đếm ngày liên tiếp; hôm nay chưa học vẫn giữ chuỗi tới hôm qua; đứt thì về 0', () => {
  const today = new Date('2026-11-15T20:00:00');
  const d = (offset) => {
    const x = new Date(today);
    x.setDate(x.getDate() - offset);
    return dayKey(x);
  };
  assert.equal(computeStreak({ [d(0)]: 60, [d(1)]: 30, [d(2)]: 10, [d(4)]: 99 }, today), 3);
  assert.equal(computeStreak({ [d(1)]: 30, [d(2)]: 10 }, today), 2);
  assert.equal(computeStreak({ [d(3)]: 30 }, today), 0);
});

test('Thời gian học cộng dồn theo ngày; độ chính xác theo kỹ năng', () => {
  const now = new Date('2026-11-15T09:00:00');
  s().addStudyTime(90, now);
  s().addStudyTime(30.4, now);
  s().addStudyTime(-5, now);
  assert.equal(s().activity[dayKey(now)], 120);

  s().recordAttempt('drill', true);
  s().recordAttempt('drill', false);
  s().recordAttempt('drill', true);
  s().recordAttempt('sentence', true);
  const acc = accuracyBySkill(s().attempts);
  assert.deepEqual(acc.drill, { total: 3, correct: 2, rate: 67 });
  assert.equal(acc.sentence.rate, 100);
});

test('Lịch sử làm bài giới hạn 1000 mục (không phình bộ nhớ máy)', () => {
  for (let i = 0; i < 1100; i++) s().recordAttempt('drill', i % 2 === 0);
  assert.equal(s().attempts.length, 1000);
});

test('cefrLabel', () => {
  assert.equal(cefrLabel(1), 'A1');
  assert.equal(cefrLabel(6), 'C2');
  assert.equal(cefrLabel(9), 'C2');
});

test('i18n: tra theo ngôn ngữ hiện tại, thay biến, thiếu bản dịch => tiếng Việt', async () => {
  const { defineMessages, learnerStore } = await import('../dist/index.js');
  const m = defineMessages({ hi: 'Chào {name}', only: 'Chỉ có tiếng Việt' }, { hi: 'Hello {name}', only: '' });
  learnerStore.getState().setPreferences({ uiLanguage: 'en' });
  assert.equal(m.t('hi', { name: 'Nam' }), 'Hello Nam');
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
  assert.equal(m.t('hi', { name: 'Nam' }), 'Chào Nam');
  assert.equal(m.t('hi'), 'Chào {name}', 'thiếu biến => giữ nguyên chỗ trống');
});

test('bản lưu cũ thiếu uiLanguage vẫn nhận mặc định (gộp sâu)', async () => {
  const { learnerStore } = await import('../dist/index.js');
  const merge = learnerStore.persist.getOptions().merge;
  const cur = learnerStore.getState();
  const merged = merge({ preferences: { voiceId: 'x', speed: 1.2, dialect: 'south', correctionLevel: 'off', persona: 'co_giao' } }, cur);
  assert.equal(merged.preferences.speed, 1.2);
  assert.ok(['vi', 'en'].includes(merged.preferences.uiLanguage));
});
