import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSentenceOrder } from '../dist/a8/sentenceOrder.js';
import { SENTENCE_ITEMS } from '../../content/dist/index.js';

const item = (id) => SENTENCE_ITEMS.find((s) => s.id === id);
const texts = (it, order) => order.map((i) => it.tokens[i].text);

test('Dữ liệu 60 câu: đủ 60, mọi thứ tự chấp nhận là hoán vị hợp lệ, không trùng chữ trong một câu', () => {
  assert.equal(SENTENCE_ITEMS.length, 60);
  for (const it of SENTENCE_ITEMS) {
    const n = it.tokens.length;
    for (const acc of it.accepted) assert.deepEqual([...acc].sort((a, b) => a - b), [...Array(n).keys()], it.id);
    const lower = it.tokens.map((t) => t.text.toLowerCase());
    assert.equal(new Set(lower).size, n, `${it.id} có token trùng chữ (mơ hồ khi kéo thả)`);
    assert.equal(typeof it.reviewed, 'boolean');
  }
});

test('A8: mọi thứ tự chấp nhận của cả 60 câu đều được chấm đúng', () => {
  for (const it of SENTENCE_ITEMS) for (const acc of it.accepted) assert.equal(checkSentenceOrder(it, texts(it, acc)).valid, true, it.id);
});

test('A8: trạng ngữ thời gian di chuyển được ("Trời hôm nay rất đẹp" cũng đúng)', () => {
  const it = item('s3');
  assert.equal(checkSentenceOrder(it, ['trời', 'Hôm nay', 'rất', 'đẹp']).valid, true);
});

test('A8: tính từ đứng trước danh từ ("đỏ áo") => giải thích luật tính từ sau danh từ', () => {
  const r = checkSentenceOrder(item('s13'), ['Cô ấy', 'mặc', 'đỏ', 'áo']);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('SAU danh từ')), r.errors.join(' | '));
  assert.deepEqual(r.correctOrder, ['Cô ấy', 'mặc', 'áo', 'đỏ']);
});

test('A8: "này" đặt trước danh từ, loại từ tách khỏi danh từ, tiểu từ hỏi không ở cuối', () => {
  const book = checkSentenceOrder(item('s12'), ['này', 'Quyển', 'sách', 'rất', 'hay']);
  assert.ok(book.errors.some((e) => e.includes('chỉ định')));
  const cats = checkSentenceOrder(item('s11'), ['Tôi', 'có', 'con', 'hai', 'mèo']);
  assert.ok(cats.errors.some((e) => e.includes('Loại từ')));
  const q = checkSentenceOrder(item('s5'), ['Anh', 'không', 'có', 'khỏe']);
  assert.ok(q.errors.some((e) => e.includes('cuối câu')));
});

test('A8: phủ định / "đang" đặt sau động từ => giải thích; chủ ngữ sau động từ => giải thích', () => {
  const neg = checkSentenceOrder(item('s7'), ['Tôi', 'uống', 'không', 'cà phê']);
  assert.ok(neg.errors.some((e) => e.includes('TRƯỚC động từ "uống"')), neg.errors.join(' | '));
  const sv = checkSentenceOrder(item('s1'), ['ăn', 'Tôi', 'phở']);
  assert.ok(sv.errors.some((e) => e.includes('Chủ ngữ')));
  assert.ok(sv.misplaced.length > 0);
});

test('A8: thiếu/thừa/lạ từ => yêu cầu dùng đủ từ; không phân biệt hoa thường, chuẩn hóa NFC', () => {
  assert.match(checkSentenceOrder(item('s1'), ['Tôi', 'ăn']).errors[0], /đủ và đúng/);
  assert.match(checkSentenceOrder(item('s1'), ['Tôi', 'ăn', 'cơm']).errors[0], /đủ và đúng/);
  assert.equal(checkSentenceOrder(item('s1'), ['tôi', 'ăn', 'phở'.normalize('NFD')]).valid, true);
});
