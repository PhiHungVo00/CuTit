import { vi } from 'vitest';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render } from '@testing-library/react';
import type { AuthDeps } from './deps';

/** Bản giả của phiên + engine cho test màn tài khoản (không mạng) */
export function makeDeps(over: { google?: boolean; mail?: boolean; progress?: boolean; kind?: 'guest' | 'account' | null; blocked?: 'signed_out' | 'merged_elsewhere' | null; providers?: string[] } = {}) {
  const calls: string[] = [];
  const signedIn = (extra = {}) => ({ status: 'signed_in', isGuest: false, providers: ['password'], accessToken: 'a'.repeat(12), refreshToken: 'r'.repeat(24), expiresIn: 900, userId: '00000000-0000-4000-8000-000000000001', ...extra });
  const kind = over.kind === undefined ? 'guest' : over.kind;
  const session = {
    info: vi.fn(async () => (kind ? { userId: 'u1', recoveryCode: kind === 'guest' ? 'ABCD-EFGH-JKMN-PQRS' : null, kind, providers: over.providers ?? (kind === 'account' ? ['password'] : []) } : null)),
    getToken: vi.fn(async () => 'tok'),
    blockedReason: vi.fn(() => over.blocked ?? null),
    login: vi.fn(async () => (calls.push('login'), signedIn())),
    register: vi.fn(async () => (calls.push('register'), { ...signedIn(), backupCode: 'ABCD-EFGH-JKMN-PQRS' })),
    signInWithGoogle: vi.fn(async () => (calls.push('google'), signedIn({ providers: ['google'] }))),
    merge: vi.fn(async (_t: string, s: string) => (calls.push(`merge:${s}`), signedIn())),
    restore: vi.fn(async () => void calls.push('restore')),
    logout: vi.fn(async () => void calls.push('logout')),
    deleteAccount: vi.fn(async (m?: string) => (calls.push(`delete:${m}`), { deleteAt: null })),
    forgotPassword: vi.fn(async () => void calls.push('forgot')),
    resetPasswordWithEmail: vi.fn(async () => void calls.push('reset-email')),
    resetPasswordWithBackup: vi.fn(async () => (calls.push('reset-backup'), { backupCode: 'WXYZ-WXYZ-WXYZ-WXYZ' })),
    changePassword: vi.fn(async () => void calls.push('change')),
    startEmailLink: vi.fn(async () => void calls.push('email-start')),
    verifyEmailLink: vi.fn(async () => (calls.push('email-verify'), [{ id: 'i1', provider: 'password', display: 'mai.le' }, { id: 'i2', provider: 'email', display: 'm***@gmail.com' }])),
    rotateBackupCode: vi.fn(async () => (calls.push('rotate'), { backupCode: 'NEWC-NEWC-NEWC-NEWC' })),
    identities: vi.fn(async () => (over.providers?.includes('google') && !over.providers.includes('password') ? [{ id: 'g1', provider: 'google', display: 'Google' }] : [{ id: 'i1', provider: 'password', display: 'mai.le' }, ...(over.providers?.includes('google') ? [{ id: 'g1', provider: 'google', display: 'Google' }] : [])])),
    onUserChange: () => () => undefined
  };
  const status = { pending: 0, lastSyncAt: null, syncing: false, error: null, signOutPending: false };
  const statusListeners = new Set<(s: typeof status) => void>();
  const engine = {
    status: () => status,
    onStatus: (cb: (s: typeof status) => void) => (statusListeners.add(cb), () => statusListeners.delete(cb)),
    flush: vi.fn(async () => (calls.push('flush'), true)),
    pullAndReplace: vi.fn(async (fn?: () => Promise<unknown>) => {
      await fn?.();
      calls.push('pullAndReplace');
    }),
    mergeInto: vi.fn(async (fn: () => Promise<{ userId: string }>, o?: { guestGone?: boolean }) => {
      await fn();
      calls.push(o?.guestGone ? 'mergeInto:guestGone' : 'mergeInto');
    }),
    resetLocal: vi.fn(async (fn?: () => Promise<unknown>) => {
      await fn?.();
      calls.push('resetLocal');
    }),
    signOut: vi.fn(async (fn?: () => Promise<unknown>) => {
      await fn?.();
      calls.push('signOut');
      return 'done' as const;
    }),
    cancelSignOut: vi.fn(() => true),
    stop: () => undefined
  };
  const deps = {
    session: async () => session,
    engine: async () => engine,
    googleAvailable: () => over.google ?? true,
    mailReset: () => over.mail ?? false,
    hasLocalProgress: () => over.progress ?? false
  } as unknown as AuthDeps;
  return { deps, session, engine, calls, status, statusListeners };
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

export function renderAt(ui: ReactElement, path = '/dang-nhap') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
      <Where />
    </MemoryRouter>
  );
}
