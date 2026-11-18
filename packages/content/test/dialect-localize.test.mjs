import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeText } from '../dist/index.js';

test('A7 localizeText: thay nguyên từ theo miền, giữ hoa đầu câu, miền Bắc giữ nguyên', () => {
  assert.equal(localizeText('Quả dứa này bao nhiêu tiền', 'south'), 'Trái thơm này bao nhiêu tiền');
  assert.equal(localizeText('Quả dứa này bao nhiêu tiền', 'central'), 'Trái thơm ni bao nhiêu tiền');
  assert.equal(localizeText('Quả dứa này bao nhiêu tiền', 'north'), 'Quả dứa này bao nhiêu tiền');
  assert.equal(localizeText('Bạn tên là gì?', 'central'), 'Bạn tên là chi?');
  assert.equal(localizeText('Mẹ tôi', 'south'), 'Má tôi');
});

test('A7 localizeText: không thay một phần từ, không thay dây chuyền, bỏ qua từ đồng hình', () => {
  assert.equal(localizeText('dứaa', 'south'), 'dứaa');
  assert.equal(localizeText('Anh ấy gầy', 'south'), 'Anh ấy ốm', 'gầy→ốm, không tiếp tục ốm→bệnh');
  assert.equal(localizeText('Thanh ngã', 'south'), 'Thanh ngã');
  assert.equal(localizeText('Tôi bị ốm', 'south'), 'Tôi bị ốm', '"ốm" Bắc = bệnh nhưng Nam = gầy: không tự đổi');
  assert.equal(localizeText('Thế nào?', 'south'), 'Sao?');
});
