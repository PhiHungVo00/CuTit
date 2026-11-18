import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE, ROLEPLAY_SCENARIOS, scenarioForUnit, findLesson } from '../dist/index.js';

const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();

test('GĐ3: mỗi unit kết thúc bằng đúng một bài nhập vai, trỏ tới kịch bản của chính unit đó', () => {
  for (const u of COURSE.units) {
    const rp = u.lessons.filter((l) => l.roleplay);
    assert.equal(rp.length, 1, `${u.id} cần đúng 1 bài nhập vai`);
    assert.equal(u.lessons.at(-1), rp[0], `${u.id}: nhập vai phải là bài cuối`);
    assert.deepEqual(rp[0].exercises, []);
    const sc = ROLEPLAY_SCENARIOS.find((s) => s.id === rp[0].roleplay);
    assert.ok(sc, `${rp[0].roleplay} không tồn tại`);
    assert.equal(sc.unit, u.id);
    assert.equal(sc.reviewed, false, 'nội dung mới là bản nháp');
    assert.equal(scenarioForUnit(u.id), sc);
    assert.ok(sc.tasks.length >= 3 && sc.tasks.length <= 4);
    assert.equal(sc.tasks.length, sc.tasksEn.length);
    assert.ok(rp[0].title.startsWith('Nhập vai') && rp[0].titleEn.startsWith('Role-play'));
    assert.equal(findLesson(rp[0].id).unit.id, u.id);
  }
});

test('Kịch bản cuối unit đúng chủ đề unit', () => {
  const text = (id) => fold(ROLEPLAY_SCENARIOS.find((s) => s.id === scenarioForUnit(id).id).tasks.join(' '));
  assert.match(text('u1'), /chao/);
  assert.match(text('u1'), /ten/);
  assert.match(text('u2'), /dua|thom/);
  assert.match(text('u2'), /gia|bao nhieu/);
  assert.match(text('u3'), /cho toi|goi/);
  assert.match(text('u3'), /o dau/);
});
