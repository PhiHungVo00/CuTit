import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { AccountSection, type AccountDeps } from './AccountSection';

afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

function fakes(overrides: Partial<{ info: unknown; recover: () => Promise<string>; deleteAccount: () => Promise<void> }> = {}) {
  const calls: string[] = [];
  const session = {
    info: vi.fn(async () => (overrides.info === undefined ? { userId: 'u1', recoveryCode: 'ABCD-EFGH-JKMN-PQRS' } : overrides.info)),
    getToken: vi.fn(async () => 'tok'),
    recover: vi.fn(overrides.recover ?? (async () => (calls.push('recover'), 'u2'))),
    deleteAccount: vi.fn(overrides.deleteAccount ?? (async () => void calls.push('delete')))
  };
  const engine = {
    status: () => ({ pending: 0, lastSyncAt: null, syncing: false, error: null }),
    onStatus: () => () => undefined,
    flush: vi.fn(async () => true),
    pullAndReplace: vi.fn(async (fn?: () => Promise<unknown>) => {
      await fn?.();
      calls.push('pull');
      learnerStore.setState({ srs: { a: { itemRef: 'a', front: 'a', back: 'a', source: 'dialect', ease: 250, intervalDays: 0, repetitions: 0, dueAt: new Date().toISOString() } } });
    }),
    resetLocal: vi.fn(async (fn?: () => Promise<unknown>) => {
      await fn?.();
      calls.push('reset');
    }),
    stop: () => undefined
  };
  const deps = { session: async () => session, engine: async () => engine } as unknown as AccountDeps;
  return { deps, session, engine, calls };
}

describe('AccountSection (M12)', () => {
  it('hiện mã khôi phục đã lưu trên máy', async () => {
    render(<AccountSection deps={fakes().deps} />);
    expect(await screen.findByTestId('recovery-code')).toHaveProperty('textContent', 'ABCD-EFGH-JKMN-PQRS');
  });

  it('khôi phục: gọi recover BÊN TRONG pullAndReplace rồi báo số thẻ', async () => {
    const f = fakes();
    render(<AccountSection deps={f.deps} />);
    fireEvent.change(await screen.findByPlaceholderText('XXXX-XXXX-XXXX-XXXX'), { target: { value: 'wxyz-wxyz-wxyz-wxyz' } });
    fireEvent.submit(screen.getByPlaceholderText('XXXX-XXXX-XXXX-XXXX').closest('form')!);
    await waitFor(() => expect(f.calls).toEqual(['recover', 'pull']));
    expect(f.session.recover).toHaveBeenCalledWith('wxyz-wxyz-wxyz-wxyz');
    expect(await screen.findByText(/1/)).toBeTruthy();
  });

  it('mã sai => báo lỗi, không thay dữ liệu', async () => {
    const f = fakes({ recover: async () => Promise.reject(Object.assign(new Error('x'), { kind: 'unauthorized', code: 'invalid_recovery_code' })) });
    render(<AccountSection deps={f.deps} />);
    fireEvent.change(await screen.findByPlaceholderText('XXXX-XXXX-XXXX-XXXX'), { target: { value: '0000000000000000' } });
    fireEvent.submit(screen.getByPlaceholderText('XXXX-XXXX-XXXX-XXXX').closest('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/không đúng|not right/);
    expect(f.calls).not.toContain('pull');
  });

  it('xóa tài khoản: xác nhận 2 bước, DELETE chạy bên trong resetLocal', async () => {
    const f = fakes();
    render(<AccountSection deps={f.deps} />);
    fireEvent.click(await screen.findByRole('button', { name: /Xóa tài khoản và dữ liệu|Delete account and data/ }));
    fireEvent.click(screen.getByRole('button', { name: /Xóa vĩnh viễn|Delete permanently/ }));
    await waitFor(() => expect(f.calls).toEqual(['delete', 'reset']));
  });

  it('xóa tài khoản: chạm “Xóa vĩnh viễn” hai lần chỉ gửi MỘT DELETE; trong lúc chờ nút khóa + có chỉ báo', async () => {
    let done!: () => void;
    const f = fakes({ deleteAccount: () => new Promise<void>((ok) => (done = ok)) });
    render(<AccountSection deps={f.deps} />);
    fireEvent.click(await screen.findByRole('button', { name: /Xóa tài khoản và dữ liệu|Delete account and data/ }));
    const yes = screen.getByRole('button', { name: /Xóa vĩnh viễn|Delete permanently/ });
    fireEvent.click(yes);
    fireEvent.click(yes);
    await waitFor(() => expect(f.session.deleteAccount).toHaveBeenCalledTimes(1));
    expect(yes).toHaveProperty('disabled', true);
    expect(yes.textContent).toMatch(/Đang xóa|Deleting/);
    expect(screen.getByRole('button', { name: /Thôi|Cancel/ })).toHaveProperty('disabled', true);
    done();
    await waitFor(() => expect(f.engine.resetLocal).toHaveBeenCalledTimes(1));
    expect(f.session.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('xóa khi mất mạng => báo cần mạng, không xóa dữ liệu máy', async () => {
    const f = fakes({ deleteAccount: async () => Promise.reject(Object.assign(new Error('offline'), { kind: 'offline' })) });
    render(<AccountSection deps={f.deps} />);
    fireEvent.click(await screen.findByRole('button', { name: /Xóa tài khoản và dữ liệu|Delete account and data/ }));
    fireEvent.click(screen.getByRole('button', { name: /Xóa vĩnh viễn|Delete permanently/ }));
    expect(await screen.findByText(/Cần kết nối mạng|needs an internet/)).toBeTruthy();
    expect(f.calls).not.toContain('reset');
  });
});
