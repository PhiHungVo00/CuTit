import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lessonXp,
  testOutXp,
  reviewXp,
  goalProgress,
  learnedDays,
  streakWithFreezes,
  applyStreakFreezes,
  freezesEarned,
  weekCalendar,
  clampReminderHour,
  planReminders,
  migrateProgress,
  GOAL_OPTIONS,
  MAX_FREEZES
} from '../dist/gamification.js';
import { progressStore } from '../dist/progress.js';
import { dayKey } from '../dist/index.js';

const TODAY = new Date('2026-11-18T10:00:00'); // Thứ Tư
const ago = (n, base = TODAY) => {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

test('XP theo bài: có thưởng theo độ chính xác, không chỉ theo số bài', () => {
  assert.equal(lessonXp({ total: 10, firstTryCorrect: 10 }), 25);
  assert.equal(lessonXp({ total: 10, firstTryCorrect: 5 }), 15);
  assert.equal(lessonXp({ total: 8, firstTryCorrect: 0 }), 10);
  assert.equal(lessonXp({ total: 0, firstTryCorrect: 0 }), 0);
  assert.equal(testOutXp(true), 30);
  assert.equal(testOutXp(false), 0);
  assert.equal(reviewXp(4), 4);
});

test('Mục tiêu ngày theo phút: 5/10/15/20', () => {
  assert.deepEqual([...GOAL_OPTIONS], [5, 10, 15, 20]);
  assert.equal(goalProgress(600, 10).met, true);
  assert.equal(goalProgress(599, 10).met, false);
  assert.equal(goalProgress(150, 5).ratio, 0.5);
  assert.equal(goalProgress(9999, 5).ratio, 1);
  assert.equal(goalProgress(125, 10).minutes, 2);
});

test('Ngày đã học = có giờ học HOẶC có XP HOẶC được đóng băng; streak dùng computeStreak', () => {
  const learned = learnedDays({ [ago(2)]: 30 }, { [ago(1)]: 12, [ago(0)]: 0 }, [ago(3)]);
  assert.deepEqual(Object.keys(learned).sort(), [ago(3), ago(2), ago(1)].sort());
  assert.equal(streakWithFreezes({ [ago(2)]: 30 }, { [ago(1)]: 12 }, [ago(3)], TODAY), 3);
});

test('Đóng băng: lỡ 1 ngày có 1 đóng băng => dùng, streak giữ; gọi lại không trừ lần hai', () => {
  const learned = { [ago(3)]: 1, [ago(2)]: 1 };
  const r1 = applyStreakFreezes({ learned, frozenDays: [], freezes: 1 }, TODAY);
  assert.equal(r1.used, 1);
  assert.equal(r1.freezes, 0);
  assert.deepEqual(r1.frozenDays, [ago(1)]);
  assert.equal(streakWithFreezes(learned, {}, r1.frozenDays, TODAY), 3);
  const r2 = applyStreakFreezes({ learned, frozenDays: r1.frozenDays, freezes: r1.freezes }, TODAY);
  assert.equal(r2.used, 0);
  assert.deepEqual(r2.frozenDays, r1.frozenDays);
});

test('Đóng băng: lỡ 2 ngày có 2 đóng băng => dùng cả 2; lỡ 3 ngày => không tiêu (chuỗi đã đứt)', () => {
  const two = applyStreakFreezes({ learned: { [ago(3)]: 1 }, frozenDays: [], freezes: 2 }, TODAY);
  assert.equal(two.used, 2);
  assert.equal(two.freezes, 0);
  const three = applyStreakFreezes({ learned: { [ago(4)]: 1 }, frozenDays: [], freezes: 2 }, TODAY);
  assert.equal(three.used, 0);
  assert.equal(three.freezes, 2);
  const never = applyStreakFreezes({ learned: {}, frozenDays: [], freezes: 2 }, TODAY);
  assert.equal(never.used, 0);
  const yesterdayLearned = applyStreakFreezes({ learned: { [ago(1)]: 1 }, frozenDays: [], freezes: 1 }, TODAY);
  assert.equal(yesterdayLearned.used, 0, 'hôm qua có học thì không cần đóng băng');
});

test('Đóng băng kiếm bằng học: mỗi 5 bài xong +1, tối đa 2', () => {
  assert.equal(MAX_FREEZES, 2);
  assert.equal(freezesEarned(4, 5, 0), 1);
  assert.equal(freezesEarned(5, 6, 0), 0);
  assert.equal(freezesEarned(9, 10, 2), 2);
  assert.equal(freezesEarned(9, 10, 1), 2);
  assert.equal(freezesEarned(0, 3, 1), 1);
});

test('Lịch tuần: 7 ngày Thứ Hai → Chủ Nhật, trạng thái từng ngày', () => {
  const w = weekCalendar({ [ago(2)]: 1 }, [ago(1)], TODAY);
  assert.equal(w.length, 7);
  assert.equal(w[0].weekday, 1);
  assert.equal(w[6].weekday, 0);
  const by = Object.fromEntries(w.map((d) => [d.day, d.status]));
  assert.equal(by[ago(2)], 'done');
  assert.equal(by[ago(1)], 'frozen');
  assert.equal(by[ago(0)], 'today');
  assert.equal(by[ago(-1)], 'future');
  assert.equal(w[0].day, ago(2), 'Thứ Hai 16/11');
  assert.equal(weekCalendar({}, [], TODAY)[0].status, 'missed');
  const learnedToday = weekCalendar({ [ago(0)]: 5 }, [], TODAY);
  assert.equal(learnedToday.find((d) => d.day === ago(0)).status, 'done');
});

test('Nhắc học: giờ yên lặng 22h–7h, bỏ hôm nay nếu đã đạt mục tiêu, tắt => không nhắc', () => {
  assert.equal(clampReminderHour(23), 21);
  assert.equal(clampReminderHour(5), 7);
  assert.equal(clampReminderHour(19), 19);
  const on = { enabled: true, hour: 19, minute: 30 };
  const notMet = planReminders(on, false, TODAY);
  assert.equal(notMet.length, 7);
  assert.equal(dayKey(notMet[0]), ago(0));
  assert.equal(notMet[0].getHours(), 19);
  assert.equal(notMet[0].getMinutes(), 30);
  const met = planReminders(on, true, TODAY);
  assert.equal(met.length, 6);
  assert.equal(dayKey(met[0]), ago(-1));
  const late = planReminders(on, false, new Date('2026-11-18T20:00:00'));
  assert.equal(dayKey(late[0]), '2026-11-19', 'đã qua giờ nhắc hôm nay');
  assert.ok(planReminders({ enabled: true, hour: 23, minute: 0 }, false, TODAY).every((d) => d.getHours() === 21));
  assert.deepEqual(planReminders({ ...on, enabled: false }, false, TODAY), []);
});

test('migrateProgress: chuẩn hóa bản lưu cũ/hỏng', () => {
  const m = migrateProgress({ dailyGoal: 7, freezes: 9, xpByDay: { '2026-11-17': 20 } }, 0);
  assert.equal(m.dailyGoal, 10);
  assert.equal(m.freezes, 2);
  assert.deepEqual(m.xpByDay, { '2026-11-17': 20 });
  assert.deepEqual(m.lessons, {});
  assert.deepEqual(m.frozenDays, []);
  assert.equal(m.reminder.enabled, false);
  assert.equal(m.reminder.hour, 19);
  const junk = migrateProgress(null, 0);
  assert.equal(junk.dailyGoal, 10);
  assert.equal(junk.lessonsDone, 0);
  const neg = migrateProgress({ freezes: -3, reminder: { enabled: true, hour: 2, minute: 99 } }, 0);
  assert.equal(neg.freezes, 0);
  assert.equal(neg.reminder.hour, 7);
  assert.equal(neg.reminder.minute, 0);
});

test('Store tiến độ: xong bài cộng XP theo ngày, giữ điểm tốt nhất, 5 bài => 1 đóng băng', () => {
  const s = () => progressStore.getState();
  s().resetProgress();
  const r1 = s().completeLesson('u1l1', { total: 8, firstTryCorrect: 4 }, TODAY);
  assert.equal(r1.xp, 15);
  const r2 = s().completeLesson('u1l1', { total: 8, firstTryCorrect: 8 }, TODAY);
  assert.equal(r2.xp, 25);
  assert.equal(s().xpByDay[ago(0)], 40);
  assert.equal(s().lessons.u1l1.best, 1);
  assert.equal(s().lessons.u1l1.times, 2);
  assert.equal(s().lessonsDone, 2);
  for (const id of ['u1l2', 'u1l3']) s().completeLesson(id, { total: 8, firstTryCorrect: 8 }, TODAY);
  assert.equal(s().freezes, 0);
  const r5 = s().completeLesson('u1l4', { total: 8, firstTryCorrect: 8 }, TODAY);
  assert.equal(r5.freezeEarned, true);
  assert.equal(s().freezes, 1);

  s().recordMistake('meaning:w1:vi-en', TODAY);
  s().recordMistake('meaning:w1:vi-en', TODAY);
  assert.equal(s().mistakes.length, 1);
  s().clearMistake('meaning:w1:vi-en');
  assert.equal(s().mistakes.length, 0);
  s().recordTone('sac', 80);
  s().recordTone('sac', 60);
  assert.deepEqual(s().toneStats.sac, { n: 2, sum: 140 });
  s().setDailyGoal(15);
  assert.equal(s().dailyGoal, 15);
  s().passTestOut('u2', TODAY);
  assert.ok(s().testedOut.u2);
  assert.equal(s().xpByDay[ago(0)], 40 + 25 * 3 + 30);
  s().resetProgress();
  assert.equal(s().lessonsDone, 0);
  assert.equal(s().dailyGoal, 10);
});

test('Store: settleFreezes dùng đóng băng một lần cho ngày lỡ', () => {
  const s = () => progressStore.getState();
  s().resetProgress();
  progressStore.setState({ freezes: 1, xpByDay: { [ago(2)]: 10 } });
  assert.equal(s().settleFreezes({}, TODAY), 1);
  assert.equal(s().settleFreezes({}, TODAY), 0);
  assert.equal(s().freezes, 0);
  assert.deepEqual(s().frozenDays, [ago(1)]);
});
