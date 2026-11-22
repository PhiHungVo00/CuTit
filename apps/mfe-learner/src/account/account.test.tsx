import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { AccountPanel } from './AccountPanel';
import { ForgotPassword } from './ForgotPassword';
import { SignInInvite } from './SignInInvite';
import { TaiKhoan } from '../settings/groups/TaiKhoan';
import { makeDeps, renderAt } from './testkit';

beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  learnerStore.getState().reset();
  progressStore.getState().resetProgress();
});

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submitOf = (label: RegExp | string) => fireEvent.submit(screen.getByLabelText(label).closest('form')!);

describe('ForgotPassword', () => {
  it('MAIL_PROVIDER=none: chỉ có đường mã dự phòng, không có lựa chọn email, không treo', async () => {
    const f = makeDeps({ mail: false });
    renderAt(<ForgotPassword deps={f.deps} onBack={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Mã gửi qua email' })).toBeNull();
    expect(screen.queryByText('Gửi mã')).toBeNull();
    expect(screen.getByLabelText('Mã dự phòng')).toBeTruthy();
    expect(screen.getByText(/Chưa có mã dự phòng/)).toBeTruthy();
  });

  it('đặt lại bằng mã dự phòng => hiện mã MỚI (bắt lưu) rồi quay lại đăng nhập', async () => {
    const f = makeDeps({ mail: false });
    let back = 0;
    renderAt(<ForgotPassword deps={f.deps} onBack={() => back++} />);
    type('Tên đăng nhập', 'Mai.Le');
    type('Mã dự phòng', 'abcd-efgh-jkmn-pqrs');
    type('Mật khẩu mới', 'mat-khau-moi-123');
    submitOf('Mã dự phòng');
    expect((await screen.findByTestId('backup-code')).textContent).toBe('WXYZ-WXYZ-WXYZ-WXYZ');
    expect(f.session.resetPasswordWithBackup).toHaveBeenCalledWith('mai.le', 'abcd-efgh-jkmn-pqrs', 'mat-khau-moi-123');
    fireEvent.click(screen.getByLabelText('Tôi đã lưu mã'));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(back).toBe(1);
  });

  it('sai mã dự phòng => một câu chung', async () => {
    const f = makeDeps();
    f.session.resetPasswordWithBackup.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'unauthorized', code: 'invalid_credentials' }));
    renderAt(<ForgotPassword deps={f.deps} onBack={() => undefined} />);
    type('Tên đăng nhập', 'mai.le');
    type('Mã dự phòng', 'sai');
    type('Mật khẩu mới', 'mat-khau-moi-123');
    submitOf('Mã dự phòng');
    expect(await screen.findByText('Tên đăng nhập hoặc mã dự phòng không đúng.')).toBeTruthy();
  });

  it('có mail: luôn báo "Nếu thông tin đúng, mã đã được gửi"; mã sai => "Mã không đúng hoặc đã hết hạn, hãy xin mã mới"', async () => {
    const f = makeDeps({ mail: true });
    f.session.resetPasswordWithEmail.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'invalid-request', code: 'otp_invalid' }));
    renderAt(<ForgotPassword deps={f.deps} onBack={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mã gửi qua email' }));
    type('Tên đăng nhập hoặc email', 'khong-ton-tai');
    fireEvent.submit(screen.getByLabelText('Tên đăng nhập hoặc email').closest('form')!);
    expect(await screen.findByText(/Nếu thông tin đúng, mã đã được gửi/)).toBeTruthy();
    type('Mã 6 số', '123456');
    type('Mật khẩu mới', 'mat-khau-moi-123');
    fireEvent.submit(screen.getByLabelText('Mã 6 số').closest('form')!);
    expect(await screen.findByText('Mã không đúng hoặc đã hết hạn, hãy xin mã mới.')).toBeTruthy();
  });
});

describe('SignInInvite', () => {
  it('khách chưa xong bài nào: không hiện; xong bài đầu tiên: hiện; "Để sau" tắt và nhớ', async () => {
    const f = makeDeps();
    const { unmount } = renderAt(<SignInInvite deps={f.deps} />);
    await act(async () => undefined);
    expect(screen.queryByText('Giữ tiến độ học của bạn')).toBeNull();
    act(() => progressStore.setState({ lessonsDone: 1 }));
    expect(await screen.findByText('Giữ tiến độ học của bạn')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(screen.queryByText('Giữ tiến độ học của bạn')).toBeNull();
    unmount();
    renderAt(<SignInInvite deps={f.deps} />);
    await act(async () => undefined);
    expect(screen.queryByText('Giữ tiến độ học của bạn')).toBeNull();
  });

  it('tài khoản thật: không hiện thẻ mời; nút mời đi tới /dang-nhap', async () => {
    const acct = makeDeps({ kind: 'account' });
    progressStore.setState({ lessonsDone: 3 });
    renderAt(<SignInInvite deps={acct.deps} />, '/ho-so');
    await act(async () => undefined);
    expect(screen.queryByText('Giữ tiến độ học của bạn')).toBeNull();
    cleanup();
    renderAt(<SignInInvite deps={makeDeps().deps} always />, '/ho-so');
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng nhập / Tạo tài khoản' }));
    expect(screen.getByTestId('where').textContent).toBe('/dang-nhap');
  });
});

describe('Cài đặt › Tài khoản (khách)', () => {
  it('khách: mời đăng nhập, vẫn thấy mã khôi phục cũ', async () => {
    const f = makeDeps();
    const acc = { session: async () => ({ info: async () => ({ userId: 'u1', recoveryCode: 'ABCD-EFGH-JKMN-PQRS' }), getToken: async () => 't', recover: async () => 'u', deleteAccount: async () => undefined }), engine: async () => null };
    renderAt(<TaiKhoan deps={acc as never} authDeps={f.deps} />, '/cai-dat/tai-khoan');
    expect(await screen.findByRole('button', { name: 'Đăng nhập / Tạo tài khoản' })).toBeTruthy();
    expect((await screen.findByTestId('recovery-code')).textContent).toBe('ABCD-EFGH-JKMN-PQRS');
  });
});

describe('AccountPanel (tài khoản thật)', () => {
  const panel = (over = {}) => {
    const f = makeDeps({ kind: 'account', ...over });
    renderAt(<AccountPanel deps={f.deps} />, '/cai-dat/tai-khoan');
    return f;
  };

  it('liệt kê phương thức; tài khoản chỉ có Google: không có gắn email/đổi mật khẩu/mã dự phòng', async () => {
    panel({ providers: ['google'] });
    expect(await screen.findByText('Google', { selector: 'span.font-bold' })).toBeTruthy();
    expect(screen.queryByText('Đổi mật khẩu', { selector: 'h2' })).toBeNull();
    expect(screen.queryByText('Mã dự phòng', { selector: 'h2' })).toBeNull();
    expect(screen.queryByText('Gắn email để lấy lại mật khẩu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
  });

  it('tài khoản mật khẩu: có tên đăng nhập, gắn email (đòi mật khẩu hiện tại), đổi mật khẩu, tạo mã dự phòng', async () => {
    const f = panel();
    expect(await screen.findByText('mai.le')).toBeTruthy();
    // gắn email: gửi mã rồi xác minh
    type('Email', 'Mai@Gmail.com');
    fireEvent.change(screen.getAllByLabelText('Mật khẩu hiện tại')[0], { target: { value: 'mk-hien-tai-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
    await waitFor(() => expect(f.session.startEmailLink).toHaveBeenCalledWith('mai@gmail.com', 'mk-hien-tai-1'));
    type('Mã 6 số', '123456');
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận email' }));
    expect(await screen.findByText('m***@gmail.com')).toBeTruthy();
    // mã dự phòng mới: hiện qua màn mã (một lần)
    fireEvent.change(screen.getAllByLabelText('Mật khẩu hiện tại')[2], { target: { value: 'mk-hien-tai-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mã dự phòng mới' }));
    expect((await screen.findByTestId('backup-code')).textContent).toBe('NEWC-NEWC-NEWC-NEWC');
    fireEvent.click(screen.getByLabelText('Tôi đã lưu mã'));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByText('mai.le')).toBeTruthy();
  });

  it('gắn email khi MAIL_PROVIDER=none: báo chưa gửi được, chỉ đường mã dự phòng', async () => {
    const f = panel();
    f.session.startEmailLink.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'unavailable', code: 'provider_unavailable' }));
    await screen.findByText('mai.le');
    type('Email', 'mai@gmail.com');
    fireEvent.change(screen.getAllByLabelText('Mật khẩu hiện tại')[0], { target: { value: 'mk-hien-tai-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác minh' }));
    expect(await screen.findByText(/dùng mã dự phòng để lấy lại mật khẩu/)).toBeTruthy();
  });

  it('đổi mật khẩu sai mật khẩu hiện tại => thông báo riêng', async () => {
    const f = panel();
    f.session.changePassword.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'unauthorized', code: 'invalid_credentials' }));
    await screen.findByText('mai.le');
    fireEvent.change(screen.getAllByLabelText('Mật khẩu hiện tại')[1], { target: { value: 'sai' } });
    type('Mật khẩu mới', 'mat-khau-moi-123');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText('Mật khẩu hiện tại không đúng.')).toBeTruthy();
  });

  it('đăng xuất: đẩy hàng đợi rồi thu hồi qua engine.signOut', async () => {
    const f = panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(f.engine.signOut).toHaveBeenCalled());
    expect(f.session.logout).toHaveBeenCalledWith(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng xuất mọi thiết bị' }));
    await waitFor(() => expect(f.session.logout).toHaveBeenCalledWith(true));
  });

  it('đăng xuất khi offline => "Sẽ đăng xuất khi có mạng" + nút Hủy đăng xuất', async () => {
    const f = makeDeps({ kind: 'account' });
    f.status.signOutPending = true;
    f.status.pending = 4;
    renderAt(<AccountPanel deps={f.deps} />);
    expect(await screen.findByText('Sẽ đăng xuất ngay khi có mạng để không mất 4 mục chưa đồng bộ.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hủy đăng xuất' }));
    await waitFor(() => expect(f.engine.cancelSignOut).toHaveBeenCalled());
  });

  it('xóa tài khoản: mặc định khóa 30 ngày (mode grace)', async () => {
    const f = panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa tài khoản (30 ngày)' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa tài khoản (30 ngày)' })[0]);
    await waitFor(() => expect(f.calls).toContain('delete:grace'));
    expect(f.calls).toContain('resetLocal');
  });

  it('"Xóa ngay" chỉ bật khi gõ đúng tên đăng nhập', async () => {
    const f = panel();
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa ngay' }));
    const go = screen.getByRole('button', { name: 'Xóa ngay, không thể hoàn tác' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    type('Xác nhận xóa', 'ai-do');
    expect(go.disabled).toBe(true);
    type('Xác nhận xóa', 'MAI.LE');
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(f.calls).toContain('delete:now'));
  });

  it('"Xóa ngay" với tài khoản chỉ có Google: gõ từ XOA', async () => {
    const f = panel({ providers: ['google'] });
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa ngay' }));
    expect(screen.getByText(/Gõ “XOA”/)).toBeTruthy();
    type('Xác nhận xóa', 'xoa');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa ngay, không thể hoàn tác' }));
    await waitFor(() => expect(f.calls).toContain('delete:now'));
  });
});
