import test from 'node:test';
import assert from 'node:assert/strict';
import { TONE_SETS } from '../dist/index.js';

const MARK = { ngang: null, huyen: '̀', sac: '́', hoi: '̉', nga: '̃', nang: '̣' };

test('Bộ thanh: ≥ 8 bộ, mỗi bộ ≥ 4 thanh, dấu thanh của từ khớp đúng thanh ghi, cùng phần vần', () => {
  assert.ok(TONE_SETS.length >= 8);
  for (const s of TONE_SETS) {
    const forms = Object.entries(s.forms);
    assert.ok(forms.length >= 4, s.id);
    for (const [tone, f] of forms) {
      const nfd = f.vi.normalize('NFD');
      const mark = MARK[tone];
      if (mark) assert.ok(nfd.includes(mark), `${s.id} ${f.vi} phải mang thanh ${tone}`);
      assert.equal(nfd.replace(/[̣̀́̉̃]/g, '').normalize('NFC'), s.base, `${s.id} ${f.vi}`);
      assert.ok(f.en, `${s.id} ${f.vi} thiếu nghĩa`);
    }
  }
});
