import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseApkHosts } from './apk-hosts.mjs';

test('tách dấu phẩy, cắt khoảng trắng, chữ thường, bỏ trống và trùng', () => {
  assert.deepEqual(parseApkHosts(' CDN.Example.com, dl.example.com ,,cdn.example.com'), ['cdn.example.com', 'dl.example.com']);
});
test('không đặt / rỗng ⇒ mảng rỗng', () => {
  assert.deepEqual(parseApkHosts(undefined), []);
  assert.deepEqual(parseApkHosts('  , '), []);
});
