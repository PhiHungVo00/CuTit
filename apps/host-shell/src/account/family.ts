/**
 * GĐ4b — Chế độ trẻ em (D4): điều phối chuyển hồ sơ trên máy. Chunk lười (chỉ màn Gia đình + khởi động đồng bộ).
 *
 * Chuyển hồ sơ = đổi tài khoản trên máy => PHẢI đi qua SyncEngine.pullAndReplace sau khi hàng đợi đã gửi hết:
 * pullAndReplace bỏ hàng đợi, và nếu token đổi bằng đường khác thì nhánh “owner đổi” của engine sẽ tải TOÀN BỘ
 * dữ liệu máy (của phụ huynh) lên hồ sơ trẻ. Vì vậy mất mạng => từ chối chuyển (dữ liệu trẻ nằm ở server).
 */
import { request } from '@vietlearning/api-client';
import { AuthTokensSchema, ChildListResponseSchema, ChildProfileSchema, DeleteMeResponseSchema, AnalyticsSummaryResponseSchema } from '@vietlearning/contracts/api';
import { dayKey } from '@vietlearning/state';
import { familyStore } from '@vietlearning/state/family';
import { refreshAccountInfo, session, startAccountSync } from './bootstrap';

export class SwitchError extends Error {
  constructor(public reason: 'offline' | 'no-parent') {
    super(reason);
  }
}

/**
 * Gửi hết hàng đợi của hồ sơ hiện tại; còn sót (mất mạng) => không cho chuyển.
 * `dropIfUnauthorized`: rời hồ sơ trẻ khi phiên trẻ đã hỏng (`child_session_expired`) — cổng PIN vẫn phải đưa máy về
 * phụ huynh, chấp nhận bỏ vài sự kiện chưa gửi của trẻ (pullAndReplace bỏ hàng đợi).
 */
async function flushAll(dropIfUnauthorized = false): Promise<ReturnType<typeof startAccountSync>> {
  const engine = startAccountSync();
  // Đồng hồ học (activity.set) có thể thêm sự kiện ngay lúc đang gửi => gửi lại vài lần tới khi hàng đợi rỗng
  for (let i = 0; i < 4; i++) {
    if (!(await engine.flush())) {
      if (dropIfUnauthorized && engine.status().error === 'unauthorized') return engine;
      throw new SwitchError('offline');
    }
    if (engine.status().pending === 0) return engine;
  }
  throw new SwitchError('offline');
}

/**
 * Đổi tài khoản trong pullAndReplace và đặt chế độ NGAY trong lúc đổi (để phiên và lớp khóa giao diện không lệch nhau).
 * Đổi xong mà kéo dữ liệu lỗi (mất mạng giữa chừng): coi như ĐÃ chuyển — engine giữ `replacePending` và tự kéo + thay
 * khi có mạng (không đẩy dữ liệu hồ sơ cũ lên hồ sơ mới).
 */
async function switchProfile(engine: ReturnType<typeof startAccountSync>, change: () => Promise<void>): Promise<void> {
  let switched = false;
  try {
    await engine.pullAndReplace(async () => {
      await change();
      switched = true;
    });
  } catch (err) {
    if (!switched) throw err;
  }
  await refreshAccountInfo().catch(() => undefined);
}

export const listChildren = () => request('/v1/family/children', { schema: ChildListResponseSchema });

export async function createChild(name: string) {
  const child = await request('/v1/family/children', { method: 'POST', schema: ChildProfileSchema });
  const s = familyStore.getState();
  s.setName(child.userId, name);
  familyStore.setState({ childCount: s.childCount + 1 });
  return child;
}

export const setChildConsent = (childId: string, media: boolean) =>
  request(`/v1/family/children/${childId}/consent`, { method: 'PUT', body: { media }, schema: ChildProfileSchema });

export const childSummary = (childId: string) =>
  request(`/v1/family/children/${childId}/summary?today=${dayKey(new Date())}`, { schema: AnalyticsSummaryResponseSchema });

export async function deleteChild(childId: string) {
  await request(`/v1/family/children/${childId}`, { method: 'DELETE', schema: DeleteMeResponseSchema });
  familyStore.getState().forgetChild(childId);
}

/** Phụ huynh → hồ sơ trẻ (đang ở phiên phụ huynh) */
export async function enterChild(childId: string): Promise<void> {
  const engine = await flushAll();
  const tokens = await request(`/v1/family/children/${childId}/session`, { method: 'POST', schema: AuthTokensSchema });
  await switchProfile(engine, async () => {
    await session().switchToChild(tokens);
    familyStore.getState().setAccount({ mode: 'child', mediaConsent: false, activeChildId: childId });
  });
}

/** Hồ sơ trẻ → phụ huynh (sau cổng phụ huynh) */
export async function exitChild(): Promise<void> {
  if (!(await session().parentInfo())) throw new SwitchError('no-parent');
  const engine = await flushAll(true);
  await switchProfile(engine, async () => {
    await session().switchToParent();
    familyStore.getState().setAccount({ mode: 'adult', mediaConsent: true, activeChildId: null });
  });
}
