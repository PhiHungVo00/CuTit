import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ADMIN_PORT, GATEWAY_PORT } from '../playwright.config';

/**
 * e2e thật: trang quản trị (bản build, cổng ADMIN_PORT) + Gateway thật (PGlite + kho tệp tạm, cổng GATEWAY_PORT).
 * Mọi bí mật sinh ngẫu nhiên cho lần chạy này rồi bỏ; tài khoản thử tạo cục bộ qua đường dẫn công khai + CLI cấp quyền. Không in giá trị bí mật.
 * Ảnh chụp (nếu đặt E2E_SHOTS=<thư mục>) ghi ra ngoài repo.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GW = `http://localhost:${GATEWAY_PORT}`;
const ADMIN_ORIGIN = `http://localhost:${ADMIN_PORT}`;
const hex = (n: number) => randomBytes(n).toString('hex');
const PW = `Mk-${hex(8)}-Aa1!`;
const USER = 'chu.app.thu';
const SENDER = 'nguoi.gop.y';
const SHOTS = process.env.E2E_SHOTS;

const env: Record<string, string | undefined> = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(GATEWAY_PORT),
  ADMIN_ORIGIN,
  ADMIN_MFA_KEY: hex(32),
  ADMIN_JWT_SECRET: hex(32),
  ADMIN_BLOB_URL_SECRET: hex(32),
  JWT_SECRET: hex(32),
  AUDIT_IP_SALT: hex(32),
  AUTH_OTP_PEPPER: hex(32),
  AUTH_RATE_LIMIT_PER_MINUTE: '1000',
  AUTH_LOGIN_SLOWDOWN_MS: '0',
  MAIL_PROVIDER: 'none',
  CORS_ORIGIN: 'http://localhost:3000'
};

let tmp = '';
let gw: ChildProcess | null = null;

function startGateway(): Promise<void> {
  gw = spawn(process.execPath, ['dist/index.js'], { cwd: join(ROOT, 'apps/gateway'), env, stdio: 'ignore' });
  return waitFor(`${GW}/healthz`);
}
async function stopGateway(): Promise<void> {
  const p = gw;
  gw = null;
  if (!p || p.exitCode !== null) return;
  await new Promise<void>((done) => {
    p.once('exit', () => done());
    p.kill();
  });
}
async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* chưa lên */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Không lên được: ${url}`);
}

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(GW + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}

/** TOTP RFC 6238 (SHA-1, 30 giây, 6 số) từ chuỗi base32 */
function totp(secret: string, stepOffset = 0): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset));
  const h = createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1]! & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

// PNG 2x2 hợp lệ tối thiểu (tạo bằng zlib để có IDAT đúng)
function png(): Buffer {
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const w = 24;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w * 3 }, (_, i) => (i * 7) % 256))]);
  const raw = Buffer.concat(Array.from({ length: w }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function seedFeedback(token: string, body: string, withImage: boolean): Promise<void> {
  const form = new FormData();
  form.append('meta', JSON.stringify({ kind: 'bug', body, context: { appVersion: '1.0.0', build: '1000000', platform: 'web', osVersion: 'Chrome', locale: 'vi', route: '/luyen-tap', recentRoutes: ['/'] } }));
  if (withImage) form.append('files', new Blob([new Uint8Array(png())], { type: 'image/png' }), 'anh.png');
  const r = await fetch(`${GW}/v1/feedback`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  if (!r.ok) throw new Error(`seed feedback ${r.status}`);
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}
async function noA11yViolations(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  tmp = mkdtempSync(join(tmpdir(), 'admin-e2e-'));
  env.PGLITE_DIR = join(tmp, 'pg');
  env.BLOB_DIR = join(tmp, 'blobs');
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  // 1) tạo hai tài khoản mật khẩu (chủ app + người góp ý)
  await startGateway();
  const reg = await (await post('/v1/auth/register', { username: SENDER, password: PW })).json();
  const reg2 = await post('/v1/auth/register', { username: USER, password: PW });
  expect(reg2.status).toBe(200);
  // 2) PGlite chỉ một tiến trình: dừng Gateway rồi cấp quyền bằng CLI (in MÃ MỜI ra stdout)
  await stopGateway();
  const g = spawnSync('corepack', ['pnpm', '--filter', '@vietlearning/gateway', 'admin:grant', '--username', USER, '--role', 'owner'], { cwd: ROOT, env, encoding: 'utf8', shell: process.platform === 'win32' });
  const invite = /[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}/.exec(g.stdout + g.stderr)?.[0];
  if (!invite) throw new Error('Không lấy được mã mời từ admin:grant');
  process.env.E2E_INVITE = invite;
  // 3) khởi động lại và gửi góp ý (một có ảnh, một không)
  await startGateway();
  await seedFeedback(reg.accessToken, 'Màn luyện tập bị đứng khi bấm nghe mẫu hai lần. <script>window.__xss=1</script>', true);
  await seedFeedback(reg.accessToken, 'Em muốn có thêm bài tập về thanh điệu', false);
});

test.afterAll(async () => {
  await stopGateway();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test('luồng đầy đủ: đăng ký mã 6 số lần đầu → hàng chờ → ảnh hiện thật → đổi trạng thái → tải lại vẫn đăng nhập → đăng xuất → vào lại bằng mã dự phòng', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => /Content Security Policy|Refused to/i.test(m.text()) && violations.push(m.text()));
  await page.goto(ADMIN_ORIGIN + '/');
  await expect(page.getByRole('heading', { name: 'Đăng nhập quản trị' })).toBeVisible();
  await noA11yViolations(page);
  await shot(page, '1-dang-nhap');

  await page.getByLabel('Tên đăng nhập').fill(USER);
  await page.getByLabel('Mật khẩu').fill(PW);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng ký mã 6 số lần đầu' })).toBeVisible();
  await page.getByLabel('Mã mời').fill(process.env.E2E_INVITE!);
  await page.getByRole('button', { name: 'Tạo mã QR' }).click();
  await expect(page.getByRole('heading', { name: 'Quét mã QR' })).toBeVisible();
  await noA11yViolations(page);
  await shot(page, '2-ma-qr');
  const secret = (await page.locator('code.secret').textContent())!.trim();
  await page.getByLabel('Mã 6 số').fill(totp(secret));
  await page.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByRole('heading', { name: 'Chép 10 mã dự phòng' })).toBeVisible();
  const backup = (await page.locator('ul.codes code').first().textContent())!.trim();
  await expect(page.locator('ul.codes li')).toHaveCount(10);
  await page.getByRole('button', { name: 'Tôi đã lưu' }).click();

  // hàng chờ: 2 góp ý, 2 chưa xong
  await expect(page.getByRole('heading', { name: 'Góp ý chờ xử lý' })).toBeVisible();
  await expect(page.getByText('2 chưa xong')).toBeVisible();
  await page.getByRole('button', { name: /Màn luyện tập bị đứng/ }).click();
  const img = page.getByRole('img', { name: 'Ảnh đính kèm 1' });
  await expect(img).toBeVisible();
  // ảnh từ nguồn khác (Gateway) hiện thật trong trình duyệt dưới CSP
  await expect.poll(() => img.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // nội dung có thẻ <script> chỉ là chữ, không chạy
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.getByRole('article').getByText('<script>window.__xss=1</script>', { exact: false })).toBeVisible();
  await noA11yViolations(page);
  await shot(page, '3-chi-tiet-anh');

  // bộ lọc
  await page.getByLabel('Loại').selectOption('idea');
  await expect(page.getByText('Không có góp ý nào khớp bộ lọc.')).toBeVisible();
  await page.getByLabel('Loại').selectOption('');
  await expect(page.getByRole('button', { name: /Màn luyện tập bị đứng/ })).toBeVisible();

  // đổi trạng thái + lời nhắn
  await page.getByRole('button', { name: /Màn luyện tập bị đứng/ }).click();
  await page.getByLabel('Trạng thái mới').selectOption('done');
  await page.getByLabel(/Lời nhắn cho người gửi/).fill('Cảm ơn bạn, đã sửa ở bản sau.');
  await page.getByRole('button', { name: 'Lưu và gửi' }).click();
  await expect(page.getByText('Đã lưu.')).toBeVisible();
  await expect(page.getByText('1 chưa xong')).toBeVisible();
  await shot(page, '4-da-xong');

  // nhật ký (owner)
  await page.getByRole('button', { name: 'Nhật ký' }).click();
  await expect(page.getByRole('heading', { name: 'Nhật ký quản trị' })).toBeVisible();
  await expect(page.getByText('feedback.status').first()).toBeVisible();
  await expect(page.getByText('feedback.view_file').first()).toBeVisible();
  await shot(page, '5-nhat-ky');

  // tải lại trang: khôi phục phiên bằng cookie HttpOnly, không hỏi lại mã; không có token trong kho trình duyệt
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Góp ý chờ xử lý' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.cookie)).toBe('');

  // đăng xuất → mã dự phòng
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập quản trị' })).toBeVisible();
  await page.getByLabel('Tên đăng nhập').fill(USER);
  await page.getByLabel('Mật khẩu').fill(PW);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('heading', { name: 'Nhập mã 6 số' })).toBeVisible();
  await page.getByRole('button', { name: 'Dùng mã dự phòng' }).click();
  await page.getByLabel('Mã dự phòng').fill(backup);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Góp ý chờ xử lý' })).toBeVisible();

  expect(violations).toEqual([]);
});

test('người lạ: đăng nhập tài khoản không có vai trò bị từ chối bằng đúng một thông báo', async ({ page }) => {
  await page.goto(ADMIN_ORIGIN + '/');
  await page.getByLabel('Tên đăng nhập').fill(SENDER);
  await page.getByLabel('Mật khẩu').fill(PW);
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('alert')).toHaveText('Sai tên đăng nhập hoặc mật khẩu.');
});
