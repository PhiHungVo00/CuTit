import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { AuthScreen } from './AuthScreen';
import { makeDeps, renderAt } from './testkit';

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('AuthScreen', () => {
  it('Google lần đầu trên máy: hỏi xác nhận tuổi TRƯỚC khi mở Google; chưa tick thì không gọi', async () => {
    const f = makeDeps();
    renderAt(<AuthScreen deps={f.deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục với Google' }));
    expect(await screen.findByText('Xác nhận tuổi')).toBeTruthy();
    const go = screen.getByRole('button', { name: 'Tiếp tục với Google' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    expect(f.session.signInWithGoogle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Tôi xác nhận mình đủ 16 tuổi/));
    fireEvent.click(go);
    await waitFor(() => expect(f.session.signInWithGoogle).toHaveBeenCalledTimes(1));
  });

  it('đã xác nhận tuổi trên máy (đăng nhập Google lại): không hỏi nữa', async () => {
    localStorage.setItem('becutit.age-confirmed', '1');
    const f = makeDeps();
    renderAt(<AuthScreen deps={f.deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục với Google' }));
    await waitFor(() => expect(f.session.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Xác nhận tuổi')).toBeNull();
  });

  it('có nút Google, hai tab, hiện/ẩn mật khẩu và link Quên mật khẩu (vi)', async () => {
    renderAt(<AuthScreen deps={makeDeps().deps} />);
    expect(screen.getByRole('button', { name: 'Tiếp tục với Google' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng nhập', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tạo tài khoản', pressed: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quên mật khẩu?' })).toBeTruthy();
    const pw = screen.getByLabelText('Mật khẩu') as HTMLInputElement;
    expect(pw.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(pw.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(pw.type).toBe('password');
  });

  it('tiếng Anh: Continue with Google', () => {
    learnerStore.getState().setPreferences({ uiLanguage: 'en' });
    renderAt(<AuthScreen deps={makeDeps().deps} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
  });

  it('chưa có OAuth client Google => ẩn nút Google, form vẫn dùng được', () => {
    renderAt(<AuthScreen deps={makeDeps({ google: false }).deps} />);
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
    expect(screen.getByLabelText('Tên đăng nhập')).toBeTruthy();
  });

  it('đăng nhập sai: một câu chung, không nói tên có tồn tại hay không', async () => {
    const f = makeDeps();
    f.session.login.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'unauthorized', code: 'invalid_credentials' }));
    renderAt(<AuthScreen deps={f.deps} />);
    type('Tên đăng nhập', 'Mai.Le ');
    type('Mật khẩu', 'sai-mat-khau');
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập').closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toBe('Tên đăng nhập hoặc mật khẩu không đúng.');
    // tên được chuẩn hóa trước khi gửi
    expect(f.session.login).toHaveBeenCalledWith('mai.le', 'sai-mat-khau');
  });

  it('đăng nhập đúng => về Hồ sơ và đồng bộ', async () => {
    const f = makeDeps();
    renderAt(<AuthScreen deps={f.deps} />);
    type('Tên đăng nhập', 'mai.le');
    type('Mật khẩu', 'dung-mat-khau-1');
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập').closest('form')!);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/ho-so'));
    expect(f.calls).toContain('login');
    expect(f.calls).toContain('flush');
  });

  it('tạo tài khoản: cần xác nhận tuổi; xong => màn mã dự phòng, nút tiếp tục chỉ bật sau khi tick "Tôi đã lưu mã"', async () => {
    const f = makeDeps();
    renderAt(<AuthScreen deps={f.deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    type('Tên đăng nhập', 'mai.le');
    type('Mật khẩu', 'mat-khau-du-dai');
    const form = screen.getByLabelText('Tên đăng nhập').closest('form')!;
    fireEvent.submit(form);
    expect(await screen.findByText('Bạn cần xác nhận đủ tuổi để tạo tài khoản.')).toBeTruthy();
    expect(f.session.register).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Tôi xác nhận mình đủ 16 tuổi/));
    fireEvent.submit(form);
    expect((await screen.findByTestId('backup-code')).textContent).toBe('ABCD-EFGH-JKMN-PQRS');
    const go = screen.getByRole('button', { name: 'Tiếp tục' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Tôi đã lưu mã'));
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    expect(screen.getByTestId('where').textContent).toBe('/ho-so');
  });

  it('mật khẩu quá ngắn / tên không hợp lệ bị chặn ở máy, không gọi mạng', async () => {
    const f = makeDeps();
    renderAt(<AuthScreen deps={f.deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    type('Tên đăng nhập', 'maì');
    type('Mật khẩu', 'ngan');
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập').closest('form')!);
    expect(await screen.findByText(/Tên đăng nhập chưa hợp lệ/)).toBeTruthy();
    expect(screen.getByText('Mật khẩu cần từ 8 ký tự trở lên.')).toBeTruthy();
    expect(f.session.register).not.toHaveBeenCalled();
  });

  it('tên đã có người dùng (chỉ ở đăng ký) báo rõ', async () => {
    const f = makeDeps();
    f.session.register.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'invalid-request', code: 'username_taken' }));
    renderAt(<AuthScreen deps={f.deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    type('Tên đăng nhập', 'mai.le');
    type('Mật khẩu', 'mat-khau-du-dai');
    fireEvent.click(screen.getByLabelText(/Tôi xác nhận mình đủ/));
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập').closest('form')!);
    expect(await screen.findByText(/đã có người dùng/)).toBeTruthy();
  });

  it('Google trả needs_merge => hộp 2 nút; "Gộp" chạy mergeInto, "Chỉ dùng tài khoản" chạy pullAndReplace', async () => {
    localStorage.setItem('becutit.age-confirmed', '1');
    const f = makeDeps({ progress: true });
    f.session.signInWithGoogle.mockResolvedValueOnce({ status: 'needs_merge', mergeTicket: 't'.repeat(20), target: { createdAt: '2026-11-01T00:00:00.000Z', hasProgress: true } } as never);
    renderAt(<AuthScreen deps={f.deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục với Google' }));
    expect(await screen.findByRole('button', { name: 'Gộp tiến độ máy này vào tài khoản' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chỉ dùng tiến độ của tài khoản' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gộp tiến độ máy này vào tài khoản' }));
    await waitFor(() => expect(f.calls).toContain('mergeInto'));
    expect(f.session.merge).toHaveBeenCalledWith('t'.repeat(20), 'merge');
  });

  it('Google trả needs_merge => "Chỉ dùng tiến độ của tài khoản" bỏ tiến độ máy (discard_device + pullAndReplace)', async () => {
    localStorage.setItem('becutit.age-confirmed', '1');
    const f = makeDeps({ progress: true });
    f.session.signInWithGoogle.mockResolvedValueOnce({ status: 'needs_merge', mergeTicket: 't'.repeat(20), target: { createdAt: '2026-11-01T00:00:00.000Z', hasProgress: true } } as never);
    renderAt(<AuthScreen deps={f.deps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục với Google' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chỉ dùng tiến độ của tài khoản' }));
    await waitFor(() => expect(f.calls).toContain('pullAndReplace'));
    expect(f.session.merge).toHaveBeenCalledWith('t'.repeat(20), 'discard_device');
  });

  it('đăng nhập mật khẩu trên máy khách có tiến độ => hỏi gộp/thay TRƯỚC khi đổi tài khoản', async () => {
    const f = makeDeps({ progress: true });
    renderAt(<AuthScreen deps={f.deps} />);
    type('Tên đăng nhập', 'mai.le');
    type('Mật khẩu', 'dung-mat-khau-1');
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập').closest('form')!);
    expect(await screen.findByText('Máy này đã có tiến độ học')).toBeTruthy();
    expect(f.session.login).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉ dùng tiến độ của tài khoản' }));
    await waitFor(() => expect(f.calls).toEqual(['login', 'pullAndReplace']));
    expect(f.calls).not.toContain('flush');
  });

  it('tài khoản chờ xóa (restorable) => "Khôi phục tài khoản?" TRƯỚC khi kéo dữ liệu; khôi phục rồi mới đồng bộ', async () => {
    const f = makeDeps();
    f.session.login.mockResolvedValueOnce({ status: 'signed_in', isGuest: false, providers: ['password'], accessToken: 'a'.repeat(12), refreshToken: 'r'.repeat(24), expiresIn: 900, userId: 'u', restorable: { deleteAt: '2026-12-20T00:00:00.000Z' } } as never);
    renderAt(<AuthScreen deps={f.deps} />);
    type('Tên đăng nhập', 'mai.le');
    type('Mật khẩu', 'dung-mat-khau-1');
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập').closest('form')!);
    expect(await screen.findByText('Khôi phục tài khoản?')).toBeTruthy();
    expect(f.calls).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục tài khoản' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/ho-so'));
    expect(f.calls).toEqual(['restore', 'flush']);
  });

  it('không khôi phục => đăng xuất, không kéo dữ liệu', async () => {
    const f = makeDeps();
    f.session.login.mockResolvedValueOnce({ status: 'signed_in', isGuest: false, providers: ['password'], accessToken: 'a'.repeat(12), refreshToken: 'r'.repeat(24), expiresIn: 900, userId: 'u', restorable: { deleteAt: '2026-12-20T00:00:00.000Z' } } as never);
    renderAt(<AuthScreen deps={f.deps} />);
    type('Tên đăng nhập', 'mai.le');
    type('Mật khẩu', 'dung-mat-khau-1');
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập').closest('form')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Không, đăng xuất' }));
    await waitFor(() => expect(f.calls).toEqual(['logout']));
    expect(screen.getByTestId('where').textContent).toBe('/dang-nhap');
  });

  it('merged-elsewhere: báo rõ và đăng nhập đi qua mergeInto({ guestGone: true })', async () => {
    const f = makeDeps({ blocked: 'merged_elsewhere', progress: true });
    renderAt(<AuthScreen deps={f.deps} />);
    expect(await screen.findByText(/đã gộp vào tài khoản ở máy khác/)).toBeTruthy();
    type('Tên đăng nhập', 'mai.le');
    type('Mật khẩu', 'dung-mat-khau-1');
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập').closest('form')!);
    await waitFor(() => expect(f.calls).toContain('mergeInto:guestGone'));
    expect(f.session.login).toHaveBeenCalled();
  });
});
