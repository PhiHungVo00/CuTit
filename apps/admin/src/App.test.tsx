import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createAdminClient } from '@vietlearning/api-client/admin';
import { App } from './App.js';
import { I18nProvider } from './i18n.js';
import type { SessionHandle } from './session.js';

const ID = '11111111-1111-4111-8111-111111111111';
const FILE_IMG = '22222222-2222-4222-8222-222222222222';
const FILE_VID = '33333333-3333-4333-8333-333333333333';
const TICKET = 't'.repeat(40);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const queueItem = (over: Record<string, unknown> = {}) => ({
  type: 'feedback', id: ID, kind: 'bug', excerpt: 'App bị đứng khi mở màn phát âm', status: 'received', appVersion: '1.2.0',
  route: '/speech', fileCount: 2, createdAt: '2026-11-26T01:00:00.000Z', accountPendingDeletion: false, ...over
});
const detail = (over: Record<string, unknown> = {}) => ({
  id: ID, kind: 'bug', body: 'Nội dung <img src=x onerror=alert(1)> thử', status: 'received', createdAt: '2026-11-26T01:00:00.000Z', events: [],
  context: { appVersion: '1.2.0', build: '1002000', platform: 'android', osVersion: 'Android 15', locale: 'vi', route: '/speech', recentRoutes: ['/learn'] },
  userIdShort: 'abcd1234', accountPendingDeletion: false, doneAt: null,
  files: [
    { id: FILE_IMG, media: 'image', contentType: 'image/png', bytes: 1000, durationMs: null, purged: false },
    { id: FILE_VID, media: 'video', contentType: 'video/mp4', bytes: 5000, durationMs: 4000, purged: false }
  ], ...over
});

interface Gw {
  calls: Array<{ method: string; path: string; body?: unknown; auth?: string }>;
  roles: string[];
  loginNext: 'totp' | 'enroll';
  refreshOk: boolean;
  failProtected: number; // số lần trả 401 cho request có phiên
  queue: (query: URLSearchParams) => unknown;
  fileCount: number;
}

function gateway(over: Partial<Gw> = {}) {
  const g: Gw = { calls: [], roles: ['owner'], loginNext: 'totp', refreshOk: true, failProtected: 0, queue: () => ({ items: [queueItem()], nextCursor: null, pendingCount: 3 }), fileCount: 0, ...over };
  let cur = detail();
  const fn = async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const auth = (init.headers as Record<string, string>).Authorization;
    g.calls.push({ method: init.method!, path: u.pathname + u.search, body, auth });
    const p = u.pathname;
    if (p === '/admin/v1/auth/login') return json(200, { ticket: TICKET, next: g.loginNext });
    if (p === '/admin/v1/auth/totp') return body.code === '000000' ? json(401, { error: 'totp_invalid' }) : json(200, { accessToken: 'acc', expiresIn: 600 });
    if (p === '/admin/v1/auth/totp/enroll') return json(200, { otpauthUrl: 'otpauth://totp/BeCuTit:chu?secret=JBSWY3DPEHPK3PXP', secret: 'JBSWY3DPEHPK3PXP' });
    if (p === '/admin/v1/auth/totp/confirm') return json(200, { accessToken: 'acc', expiresIn: 600, backupCodes: Array.from({ length: 10 }, (_, i) => `abcd${i}-wxyz${i}`) });
    if (p === '/admin/v1/auth/refresh') return g.refreshOk ? json(200, { accessToken: 'acc', expiresIn: 600 }) : json(401, { error: 'session_expired' });
    if (p === '/admin/v1/auth/logout') return new Response(null, { status: 204 });
    if (g.failProtected > 0) {
      g.failProtected--;
      return json(401, { error: 'invalid_token' });
    }
    if (p === '/admin/v1/session') return json(200, { userIdShort: 'abcd1234', roles: g.roles });
    if (p === '/admin/v1/queue') return json(200, g.queue(u.searchParams));
    if (p === `/admin/v1/feedback/${ID}`) return json(200, cur);
    if (p === `/admin/v1/feedback/${ID}/status`) {
      cur = detail({ status: body.status, events: [{ at: '2026-11-26T02:00:00.000Z', status: body.status, message: body.message ?? null }] });
      return json(200, cur);
    }
    if (p.endsWith('/url')) return json(200, { url: `http://gw.test/admin/v1/blob?k=${p.includes(FILE_IMG) ? 'img' : 'vid'}&n=${++g.fileCount}`, expiresAt: '2026-11-26T03:00:00.000Z' });
    if (p === '/admin/v1/audit') return json(200, { items: [{ id: 1, at: '2026-11-26T01:00:00.000Z', actorKind: 'user', actorUserIdShort: 'abcd1234', action: 'auth.login', targetType: 'user', targetId: 'abcd1234', meta: {} }], nextCursor: null });
    return json(404, { error: 'not_found' });
  };
  return { g, fn };
}

function setup(over: Partial<Gw> = {}) {
  const { g, fn } = gateway(over);
  const listeners = new Set<() => void>();
  const client = createAdminClient('http://gw.test', { fetch: fn as unknown as typeof fetch, onSessionExpired: () => listeners.forEach((f) => f()) });
  const handle: SessionHandle = { client, onExpired: (f) => (listeners.add(f), () => void listeners.delete(f)) };
  render(
    <I18nProvider initial="vi">
      <App handle={handle} />
    </I18nProvider>
  );
  return g;
}

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function signIn() {
  await screen.findByRole('heading', { name: 'Đăng nhập quản trị' });
  type('Tên đăng nhập', 'chu');
  type('Mật khẩu', 'matkhau-manh-1');
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
}

describe('đăng nhập', () => {
  it('mật khẩu → mã 6 số → hàng chờ (có số chưa xong); không ghi gì vào localStorage', async () => {
    const g = setup({ refreshOk: false });
    await signIn();
    await screen.findByRole('heading', { name: 'Nhập mã 6 số' });
    type('Mã 6 số', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await screen.findByRole('heading', { name: 'Góp ý chờ xử lý' });
    expect(await screen.findByText('3 chưa xong')).toBeTruthy();
    expect(g.calls.find((c) => c.path === '/admin/v1/auth/totp')?.body).toEqual({ ticket: TICKET, code: '123456' });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('mã sai: báo lỗi, ở lại màn mã', async () => {
    setup({ refreshOk: false });
    await signIn();
    await screen.findByRole('heading', { name: 'Nhập mã 6 số' });
    type('Mã 6 số', '000000');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Mã không đúng/);
  });

  it('lần đầu: mã mời → QR + chuỗi bí mật → xác nhận → 10 mã dự phòng, phải bấm "Tôi đã lưu" mới vào', async () => {
    setup({ refreshOk: false, loginNext: 'enroll' });
    await signIn();
    await screen.findByRole('heading', { name: 'Đăng ký mã 6 số lần đầu' });
    type('Mã mời', 'abcde-fghij-klmno');
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mã QR' }));
    await screen.findByRole('heading', { name: 'Quét mã QR' });
    expect(screen.getByRole('img', { name: /Mã QR/ })).toBeTruthy();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    type('Mã 6 số', '654321');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await screen.findByRole('heading', { name: 'Chép 10 mã dự phòng' });
    expect(within(screen.getByRole('list', { name: 'Chép 10 mã dự phòng' })).getAllByRole('listitem')).toHaveLength(10);
    expect(screen.queryByRole('heading', { name: 'Góp ý chờ xử lý' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tôi đã lưu' }));
    await screen.findByRole('heading', { name: 'Góp ý chờ xử lý' });
  });

  it('tải lại trang: khôi phục phiên bằng cookie, không hỏi lại mật khẩu/mã', async () => {
    const g = setup();
    await screen.findByRole('heading', { name: 'Góp ý chờ xử lý' });
    expect(g.calls[0]!.path).toBe('/admin/v1/auth/refresh');
    expect(screen.queryByLabelText('Mật khẩu')).toBeNull();
  });

  it('mất mạng khi đăng nhập: báo lỗi dễ hiểu', async () => {
    const client = createAdminClient('http://gw.test', { fetch: (async (u: string) => (u.endsWith('/refresh') ? json(401, {}) : Promise.reject(new TypeError('x')))) as unknown as typeof fetch });
    render(<I18nProvider initial="vi"><App handle={{ client, onExpired: () => () => undefined }} /></I18nProvider>);
    await signIn();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Không kết nối được máy chủ/);
  });
});

describe('hàng chờ và chi tiết', () => {
  it('bộ lọc đổi query; chọn dòng → chi tiết hiện ảnh (img) và video (controls) bằng URL ký; nội dung HTML chỉ là chữ', async () => {
    const g = setup();
    await screen.findByText('App bị đứng khi mở màn phát âm');
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'done' } });
    await waitFor(() => expect(g.calls.some((c) => c.path.includes('/queue') && c.path.includes('status=done'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: '' } });
    fireEvent.click(await screen.findByRole('button', { name: /App bị đứng/ }));
    const img = (await screen.findByRole('img', { name: 'Ảnh đính kèm 1' })) as HTMLImageElement;
    expect(img.src).toMatch(/^http:\/\/gw\.test\/admin\/v1\/blob\?k=img/);
    const video = await screen.findByLabelText('Video đính kèm 2');
    expect(video.tagName).toBe('VIDEO');
    expect(video.hasAttribute('controls')).toBe(true);
    // nội dung người dùng chứa thẻ HTML: phải hiện thành chữ, không tạo phần tử
    expect(screen.getByText(/Nội dung <img src=x onerror=alert\(1\)> thử/)).toBeTruthy();
    expect(document.querySelectorAll('img[src="x"]').length).toBe(0);
    expect(document.querySelector('iframe, object, embed')).toBeNull();
  });

  it('URL ký hết hạn / ảnh lỗi: hiện nút "Tải lại tệp" và xin URL mới', async () => {
    const g = setup();
    fireEvent.click(await screen.findByRole('button', { name: /App bị đứng/ }));
    const img = await screen.findByRole('img', { name: 'Ảnh đính kèm 1' });
    fireEvent.error(img);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Tải lại tệp' }))[0]!);
    await waitFor(() => expect(g.calls.filter((c) => c.path.includes(`/files/${FILE_IMG}/url`)).length).toBe(2));
    expect(await screen.findByRole('img', { name: 'Ảnh đính kèm 1' })).toBeTruthy();
  });

  it('lưu trạng thái + lời nhắn: gửi đúng body, danh sách cập nhật', async () => {
    const g = setup();
    fireEvent.click(await screen.findByRole('button', { name: /App bị đứng/ }));
    await screen.findByRole('heading', { name: 'Chi tiết góp ý' });
    fireEvent.change(screen.getByLabelText('Trạng thái mới'), { target: { value: 'done' } });
    fireEvent.change(screen.getByLabelText(/Lời nhắn cho người gửi/), { target: { value: '  Đã sửa ở bản 1.2.1  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi' }));
    await screen.findByText('Đã lưu.');
    expect(g.calls.find((c) => c.path.endsWith('/status'))?.body).toEqual({ status: 'done', message: 'Đã sửa ở bản 1.2.1' });
    const row = screen.getByRole('button', { name: /App bị đứng/ });
    expect(within(row).getByText('Đã xong')).toBeTruthy();
  });

  it('lời nhắn tối đa 1000 ký tự (ô nhập chặn ở maxlength)', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /App bị đứng/ }));
    const ta = (await screen.findByLabelText(/Lời nhắn cho người gửi/)) as HTMLTextAreaElement;
    expect(ta.maxLength).toBe(1000);
  });

  it('vai trò thấp (reviewer): khóa nút lưu, ẩn tab nhật ký', async () => {
    setup({ roles: ['reviewer'] });
    fireEvent.click(await screen.findByRole('button', { name: /App bị đứng/ }));
    await screen.findByText(/chỉ được xem/);
    expect((screen.getByRole('button', { name: 'Lưu và gửi' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Nhật ký' })).toBeNull();
  });

  it('owner thấy nhật ký quản trị', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Nhật ký' }));
    await screen.findByRole('heading', { name: 'Nhật ký quản trị' });
    expect(await screen.findByText('auth.login')).toBeTruthy();
  });

  it('server trả dữ liệu sai schema: không hiển thị, báo lỗi', async () => {
    setup({ queue: () => ({ items: 'hỏng' }) });
    expect((await screen.findByRole('alert')).textContent).toMatch(/không đúng dạng/);
  });
});

describe('hết hạn phiên', () => {
  it('401 hai lần liên tiếp giữa chừng → về màn đăng nhập kèm thông báo', async () => {
    // lần đầu vào hàng chờ ổn; sau đó mọi request có phiên bị 401 và refresh cũng hỏng
    const g = setup();
    fireEvent.click(await screen.findByRole('button', { name: /App bị đứng/ }));
    await screen.findByRole('heading', { name: 'Chi tiết góp ý' });
    g.failProtected = 99;
    g.refreshOk = false;
    fireEvent.change(screen.getByLabelText('Trạng thái mới'), { target: { value: 'done' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi' }));
    await screen.findByRole('heading', { name: 'Đăng nhập quản trị' });
    expect(screen.getByRole('status').textContent).toMatch(/Phiên đã hết hạn/);
  });

  it('đăng xuất: gọi /logout và về màn đăng nhập', async () => {
    const g = setup();
    await screen.findByRole('heading', { name: 'Góp ý chờ xử lý' });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await screen.findByRole('heading', { name: 'Đăng nhập quản trị' });
    expect(g.calls.some((c) => c.path === '/admin/v1/auth/logout')).toBe(true);
  });
});
