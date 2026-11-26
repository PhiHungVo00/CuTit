import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { learnerStore } from '@vietlearning/state';
import { Gate } from './Gate';
import { eligibleMe, fakeClient } from '../test/fakeClient';

const show = (client: ReturnType<typeof fakeClient>['client']) =>
  render(
    <MemoryRouter>
      <Gate client={client} title="Tin nhắn">
        <p>NỘI DUNG CHAT</p>
      </Gate>
    </MemoryRouter>
  );
const me = (ineligible: string | null, extra: object = {}) => ({ ...eligibleMe, ineligible, ...extra }) as never;

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  learnerStore.getState().reset();
});

describe('Cổng điều kiện chat', () => {
  it('đủ điều kiện ⇒ vẽ nội dung', async () => {
    show(fakeClient({ me: async () => me(null) }).client);
    expect(await screen.findByText('NỘI DUNG CHAT')).toBeTruthy();
  });

  it('khách ⇒ lời mời tạo tài khoản (link /dang-nhap), không vào chat', async () => {
    show(fakeClient({ me: async () => me('guest') }).client);
    const cta = await screen.findByRole('link', { name: 'Tạo tài khoản' });
    expect(cta.getAttribute('href')).toBe('/dang-nhap');
    expect(screen.queryByText('NỘI DUNG CHAT')).toBeNull();
  });

  it('chưa khai tuổi ⇒ chọn năm (select, không ô ngày); đủ 18 ⇒ tải lại điều kiện', async () => {
    const declareAge = vi.fn(async () => ({ isAdult: true, lockedUntil: null }));
    let call = 0;
    const meFn = vi.fn(async () => (call++ === 0 ? me('age_unknown') : me(null)));
    show(fakeClient({ me: meFn, declareAge }).client);
    const select = (await screen.findByLabelText('Năm sinh')) as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(document.querySelector('input[type="date"]')).toBeNull();
    const save = screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // chưa chọn năm
    fireEvent.change(select, { target: { value: '1990' } });
    fireEvent.click(save);
    await waitFor(() => expect(declareAge).toHaveBeenCalledWith(1990));
    expect(await screen.findByText('NỘI DUNG CHAT')).toBeTruthy();
    // năm sinh không còn ở DOM, localStorage, sessionStorage, kho người học
    expect(document.body.innerHTML).not.toContain('1990');
    expect(JSON.stringify({ ...localStorage })).not.toContain('1990');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('1990');
    expect(JSON.stringify(learnerStore.getState())).not.toContain('1990');
  });

  it('khai chưa đủ 18 ⇒ màn giải thích thân thiện, học bình thường, không nội dung chat, không nhắc năm sinh', async () => {
    const declareAge = vi.fn(async () => ({ isAdult: false, lockedUntil: '2027-11-26T00:00:00.000Z' }));
    show(fakeClient({ me: async () => me('age_unknown'), declareAge }).client);
    fireEvent.change(await screen.findByLabelText('Năm sinh'), { target: { value: '2012' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Tính năng này dành cho người từ 18 tuổi')).toBeTruthy();
    expect(screen.getByText(/vẫn học bài/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về trang học' })).toBeTruthy();
    expect(screen.queryByText('NỘI DUNG CHAT')).toBeNull();
    expect(document.body.innerHTML).not.toContain('2012');
    expect(JSON.stringify({ ...localStorage })).not.toContain('2012');
  });

  it('server báo dưới 18 sẵn ⇒ màn giải thích', async () => {
    show(fakeClient({ me: async () => me('minor') }).client);
    expect(await screen.findByText('Tính năng này dành cho người từ 18 tuổi')).toBeTruthy();
  });

  it('lỗi khi lưu tuổi: báo lỗi không nhắc năm đã gửi, vẫn lưu lại được', async () => {
    const declareAge = vi.fn().mockRejectedValueOnce({ status: 500 }).mockResolvedValue({ isAdult: true, lockedUntil: null });
    show(fakeClient({ me: async () => me('age_unknown'), declareAge }).client);
    fireEvent.change(await screen.findByLabelText('Năm sinh'), { target: { value: '1985' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('1985');
  });

  it('chưa có handle ⇒ đặt tên, gợi ý sẵn tên đăng nhập; trùng tên ⇒ báo chọn tên khác', async () => {
    const setHandle = vi.fn().mockRejectedValueOnce({ status: 409, code: 'handle_taken' }).mockResolvedValue({ handle: 'minh2' });
    show(fakeClient({ me: async () => me('no_handle', { handle: null, suggestedHandle: 'minh' }), setHandle }).client);
    const input = (await screen.findByLabelText('Tên bạn (handle)')) as HTMLInputElement;
    expect(input.value).toBe('minh');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tên' }));
    expect((await screen.findByRole('alert')).textContent).toContain('có người dùng rồi');
    expect(setHandle).toHaveBeenCalledWith('minh');
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tên' }));
    expect((await screen.findByRole('alert')).textContent).toContain('chưa hợp lệ');
  });

  it('bị khóa chat / chờ xóa ⇒ có giải thích', async () => {
    show(fakeClient({ me: async () => me('restricted') }).client);
    expect(await screen.findByText('Tin nhắn đang tạm khóa')).toBeTruthy();
    cleanup();
    show(fakeClient({ me: async () => me('pending_deletion') }).client);
    expect(await screen.findByText('Tài khoản đang chờ xóa')).toBeTruthy();
  });

  it('lỗi mạng ⇒ có nút Thử lại (không màn trắng); 404 (chưa bật) ⇒ nói chưa mở, vẫn học được', async () => {
    const meFn = vi.fn().mockRejectedValueOnce({ kind: 'offline' }).mockResolvedValue(me(null));
    show(fakeClient({ me: meFn }).client);
    expect((await screen.findByRole('alert')).textContent).toContain('Phần này cần mạng');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('NỘI DUNG CHAT')).toBeTruthy();
    cleanup();
    show(fakeClient({ me: async () => Promise.reject({ status: 404 }) }).client);
    expect((await screen.findByRole('alert')).textContent).toContain('chưa mở');
    expect(screen.getByRole('link', { name: 'Về trang học' })).toBeTruthy();
  });
});
