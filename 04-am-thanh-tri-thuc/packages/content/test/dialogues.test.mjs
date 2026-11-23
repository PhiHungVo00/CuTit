import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE, DIALOGUES, dialogueForUnit, ROLEPLAY_SCENARIOS, HonorificInterpreter } from '../dist/index.js';

const isEnd = (n) => n === 'end-ok' || n === 'end-retry';

test('Tình huống: mỗi unit có đúng một kịch bản, trỏ về kịch bản AI cũ của unit đó', () => {
  for (const u of COURSE.units) {
    const d = DIALOGUES.filter((x) => x.unit === u.id);
    assert.equal(d.length, 1, `${u.id} cần 1 tình huống`);
    const rp = u.lessons.find((l) => l.roleplay);
    assert.equal(d[0].aiScenarioId, rp.roleplay);
    assert.ok(ROLEPLAY_SCENARIOS.some((s) => s.id === d[0].aiScenarioId));
    assert.equal(typeof d[0].reviewed, 'boolean');
  }
});

test('Tình huống: mọi next trỏ tới nút có thật hoặc end-*; start có thật; id nút duy nhất', () => {
  for (const d of DIALOGUES) {
    const ids = d.nodes.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes(d.start));
    for (const n of d.nodes) {
      assert.ok(n.options.length >= 2, `${d.id}/${n.id} cần >= 2 lựa chọn`);
      assert.ok(n.cutit && n.cutitEn);
      for (const o of n.options) {
        assert.ok(isEnd(o.next) || ids.includes(o.next), `${d.id}/${n.id} → ${o.next}`);
        assert.ok(o.text && o.textEn);
      }
    }
  }
});

test('Tình huống: từ start luôn có đường tới end-ok, và không có vòng lặp vô tận không lối ra', () => {
  for (const d of DIALOGUES) {
    const by = new Map(d.nodes.map((n) => [n.id, n]));
    const canWin = new Map();
    const win = (id, seen = new Set()) => {
      if (id === 'end-ok') return true;
      if (id === 'end-retry') return false;
      if (canWin.has(id)) return canWin.get(id);
      if (seen.has(id)) return false;
      seen.add(id);
      const r = by.get(id).options.some((o) => win(o.next, seen));
      canWin.set(id, r);
      return r;
    };
    assert.ok(win(d.start), `${d.id} không có đường tới end-ok`);
    for (const n of d.nodes) assert.ok(win(n.id), `${d.id}/${n.id} là ngõ cụt`);
  }
});

test('Tình huống: bản chụp A6 của nút khớp luật HonorificInterpreter thật; mọi lựa chọn của nút đó khai báo xưng hô', () => {
  let graded = 0;
  for (const d of DIALOGUES)
    for (const n of d.nodes) {
      if (!n.a6) continue;
      graded++;
      assert.ok(n.context, `${d.id}/${n.id} có a6 nhưng thiếu context`);
      const r = new HonorificInterpreter().interpret(n.context);
      assert.deepEqual(n.a6, { speaker: r.speaker, listener: r.listener }, `${d.id}/${n.id} lệch luật A6`);
      for (const o of n.options) assert.ok(o.a6, `${d.id}/${n.id}: lựa chọn thiếu a6`);
      assert.ok(n.options.some((o) => o.a6.speaker === n.a6.speaker && o.a6.listener === n.a6.listener), 'phải có lựa chọn đúng xưng hô');
      assert.ok(n.options.some((o) => o.a6.speaker !== n.a6.speaker || o.a6.listener !== n.a6.listener), 'phải có lựa chọn sai xưng hô');
    }
  assert.ok(graded >= 3, 'ít nhất 3 nút chấm xưng hô');
});

test('Tình huống chưa duyệt: bản phát hành không hiện, bản dev thì hiện', () => {
  for (const u of COURSE.units) {
    const d = DIALOGUES.find((x) => x.unit === u.id);
    assert.equal(dialogueForUnit(u.id, { includeUnreviewed: true }), d);
    assert.equal(dialogueForUnit(u.id, { includeUnreviewed: false }), d.reviewed ? d : undefined);
  }
  assert.equal(dialogueForUnit('khong-co', { includeUnreviewed: true }), undefined);
});
