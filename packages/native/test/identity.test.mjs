import test from 'node:test';
import assert from 'node:assert/strict';
import { IdentityError, configureGoogleIdentity, getGoogleIdToken, isGoogleSignInAvailable } from '../dist/index.js';

test('chưa cấu hình OAuth client: nút ẩn, lấy token ném not_configured (không sập)', async () => {
  configureGoogleIdentity({});
  assert.equal(isGoogleSignInAvailable(), false);
  await assert.rejects(getGoogleIdToken('n'.repeat(20)), (e) => e instanceof IdentityError && e.code === 'not_configured');
  configureGoogleIdentity({ webClientId: '   ' });
  assert.equal(isGoogleSignInAvailable(), false);
});

test('đã cấu hình: nút hiện; web dùng GIS với nonce và trả credential', async () => {
  configureGoogleIdentity({ webClientId: 'abc.apps.googleusercontent.com' });
  assert.equal(isGoogleSignInAvailable(), true);
  let cfg;
  globalThis.google = {
    accounts: {
      id: {
        initialize: (c) => (cfg = c),
        prompt: () => cfg.callback({ credential: 'ID.TOKEN.XYZ' }),
        cancel() {}
      }
    }
  };
  assert.equal(await getGoogleIdToken('nonce-123456789012'), 'ID.TOKEN.XYZ');
  assert.equal(cfg.nonce, 'nonce-123456789012');
  assert.equal(cfg.client_id, 'abc.apps.googleusercontent.com');
});

test('web: hộp bị bỏ qua/đóng => cancelled', async () => {
  configureGoogleIdentity({ webClientId: 'abc.apps.googleusercontent.com' });
  globalThis.google = {
    accounts: {
      id: {
        initialize() {},
        prompt: (cb) => cb({ isNotDisplayed: () => false, isSkippedMoment: () => true, isDismissedMoment: () => false }),
        cancel() {}
      }
    }
  };
  await assert.rejects(getGoogleIdToken('nonce-123456789012'), (e) => e.code === 'cancelled');
});

test('native: KHÔNG truyền `scopes` cho SocialLogin.login (Capgo từ chối khi MainActivity chưa cấu hình; ID token đã có email/profile)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/identity.ts', import.meta.url), 'utf8');
  const call = src.slice(src.indexOf('SocialLogin.login('), src.indexOf('SocialLogin.login(') + 200);
  assert.ok(call.includes('nonce'), 'phải tìm thấy lời gọi login có nonce');
  assert.doesNotMatch(call, /scopes/);
});
