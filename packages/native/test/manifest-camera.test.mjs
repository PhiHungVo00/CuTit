import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Android 11+: không khai báo <queries> cho IMAGE_CAPTURE thì Capacitor không thấy app camera => 📷 mở hộp chọn ảnh (DA2-T9).
test('AndroidManifest khai báo queries cho IMAGE_CAPTURE (📷 mở camera thật)', () => {
  const xml = readFileSync(new URL('../../../apps/host-shell/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const queries = xml.match(/<queries>[\s\S]*?<\/queries>/)?.[0] ?? '';
  assert.match(queries, /android\.media\.action\.IMAGE_CAPTURE/);
  assert.match(xml, /android\.permission\.CAMERA/);
});
