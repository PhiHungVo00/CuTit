import type { AuthSignedIn } from '@vietlearning/contracts/api';
import type { AuthDeps } from './deps';

/**
 * Luồng đăng nhập có đồng bộ (dự án 3 Task 7). Quy tắc đã rà ở PR #23:
 * - khách đã bị gộp ở máy khác (`merged-elsewhere`) rồi đăng nhập => PHẢI bọc trong `mergeInto(..., { guestGone: true })`,
 *   nếu không dữ liệu máy bị tải lại dưới id sự kiện mới và XP cộng hai lần;
 * - tài khoản chờ xóa (`restorable`) => hỏi "Khôi phục tài khoản?" TRƯỚC khi kéo dữ liệu; không khôi phục => đăng xuất;
 * - đăng nhập mật khẩu vào tài khoản có sẵn: Gateway chưa cấp vé gộp cho đường này, nên "gộp" làm ở phía máy: đổi chủ hàng
 *   đợi => engine tải dữ liệu máy lên tài khoản (id sự kiện mới, khách bị bỏ lại nên không cộng hai lần), "thay" =>
 *   `pullAndReplace`.
 */
export type SignInOutcome =
  | { type: 'done' }
  | { type: 'needs_merge'; ticket: string }
  | { type: 'restorable'; deleteAt: string; finish(restore: boolean): Promise<void> };

/** Cách xử lý tiến độ trên máy khi đăng nhập vào tài khoản có sẵn */
export type LocalChoice = 'merge' | 'replace';

class RestorePending extends Error {
  constructor(public readonly deleteAt: string) {
    super('restore pending');
  }
}

const quiet = (p: Promise<unknown>) => p.catch(() => undefined);

async function settleAfterSignIn(deps: AuthDeps, r: AuthSignedIn, choice: LocalChoice | undefined, replaceDone: boolean): Promise<SignInOutcome> {
  const engine = await deps.engine();
  const finishSync = async () => {
    // đã thay dữ liệu trong pullAndReplace thì thôi; còn lại gửi dữ liệu máy (đổi chủ => tải lên tài khoản) và kéo về
    if (!engine || replaceDone) return; // pullAndReplace/mergeInto đã tự kéo dữ liệu
    if (choice === 'replace') await engine.pullAndReplace();
    else await quiet(engine.flush({ pull: true }));
  };
  if (r.restorable) {
    const s = await deps.session();
    return {
      type: 'restorable',
      deleteAt: r.restorable.deleteAt,
      async finish(restore) {
        if (restore) {
          await s.restore();
          await finishSync();
        } else {
          await s.logout();
        }
      }
    };
  }
  await finishSync();
  return { type: 'done' };
}

/** Mật khẩu: đang là khách => đổi sang tài khoản; có tiến độ trên máy thì `choice` do người dùng chọn trước */
export async function loginWithPassword(deps: AuthDeps, username: string, password: string, choice?: LocalChoice): Promise<SignInOutcome> {
  const s = await deps.session();
  const engine = await deps.engine();
  if (engine && s.blockedReason() === 'merged_elsewhere') {
    let res: AuthSignedIn | undefined;
    await engine.mergeInto(
      async () => {
        res = await s.login(username, password);
        return { userId: res.userId };
      },
      { guestGone: true }
    );
    return settleAfterSignIn(deps, res!, undefined, true);
  }
  if (engine && choice === 'replace') {
    let res: AuthSignedIn | undefined;
    try {
      await engine.pullAndReplace(async () => {
        res = await s.login(username, password);
        if (res.restorable) throw new RestorePending(res.restorable.deleteAt);
      });
    } catch (err) {
      if (!(err instanceof RestorePending)) throw err;
    }
    return settleAfterSignIn(deps, res!, 'replace', !res!.restorable);
  }
  const res = await s.login(username, password);
  return settleAfterSignIn(deps, res, choice, false);
}

/** Đăng ký: đang là khách => nâng cấp chính khách đó (giữ tiến độ). Trả mã dự phòng (hiện MỘT lần) */
export async function registerAccount(deps: AuthDeps, username: string, password: string): Promise<{ backupCode: string }> {
  const s = await deps.session();
  const r = await s.register(username, password);
  const engine = await deps.engine();
  if (engine) await quiet(engine.flush({ pull: true }));
  return { backupCode: r.backupCode };
}

export async function continueWithGoogle(deps: AuthDeps): Promise<SignInOutcome> {
  const s = await deps.session();
  const engine = await deps.engine();
  if (engine && s.blockedReason() === 'merged_elsewhere') {
    let res: AuthSignedIn | undefined;
    let ticket: string | undefined;
    try {
      await engine.mergeInto(
        async () => {
          const r = await s.signInWithGoogle();
          if (r.status === 'needs_merge') {
            ticket = r.mergeTicket;
            throw new Error('needs_merge');
          }
          res = r as unknown as AuthSignedIn;
          return { userId: r.userId };
        },
        { guestGone: true }
      );
    } catch (err) {
      if (!ticket) throw err;
    }
    if (ticket) return { type: 'needs_merge', ticket };
    return settleAfterSignIn(deps, res!, undefined, true);
  }
  const r = await s.signInWithGoogle();
  if (r.status === 'needs_merge') return { type: 'needs_merge', ticket: r.mergeTicket };
  return settleAfterSignIn(deps, r as unknown as AuthSignedIn, undefined, false);
}

/** Người dùng chọn ở hộp gộp (Google trả needs_merge) */
export async function resolveMerge(deps: AuthDeps, ticket: string, strategy: 'merge' | 'discard_device'): Promise<SignInOutcome> {
  const s = await deps.session();
  const engine = await deps.engine();
  let res: AuthSignedIn | undefined;
  const switchAccount = async () => {
    res = await s.merge(ticket, strategy);
    return { userId: res.userId };
  };
  if (!engine) await switchAccount();
  else if (strategy === 'merge') await engine.mergeInto(switchAccount);
  else await engine.pullAndReplace(switchAccount);
  return settleAfterSignIn(deps, res!, undefined, true);
}

export type LogoutResult = 'done' | 'waiting-network' | 'cancelled';

/** Đăng xuất: đẩy hàng đợi rồi thu hồi token và xóa dữ liệu máy; offline => chờ mạng (không có "vẫn đăng xuất") */
export async function signOutAccount(deps: AuthDeps, everywhere: boolean): Promise<LogoutResult> {
  const s = await deps.session();
  const engine = await deps.engine();
  if (!engine) {
    await s.logout(everywhere);
    return 'done';
  }
  return engine.signOut(() => s.logout(everywhere));
}

export async function deleteAccount(deps: AuthDeps, mode: 'grace' | 'now'): Promise<void> {
  const s = await deps.session();
  const engine = await deps.engine();
  if (engine) await engine.resetLocal(() => s.deleteAccount(mode));
  else await s.deleteAccount(mode);
}
