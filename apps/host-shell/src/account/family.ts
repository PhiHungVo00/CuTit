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

/** Gửi hết hàng đợi của hồ sơ hiện tại; còn sót (mất mạng) => không cho chuyển */
async function flushAll(): Promise<ReturnType<typeof startAccountSync>> {
  const engine = startAccountSync();
  const ok = await engine.flush();
  if (!ok || engine.status().pending > 0) throw new SwitchError('offline');
  return engine;
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
  await engine.pullAndReplace(() => session().switchToChild(tokens));
  familyStore.getState().setAccount({ mode: 'child', mediaConsent: false, activeChildId: childId });
  await refreshAccountInfo().catch(() => undefined);
}

/** Hồ sơ trẻ → phụ huynh (sau cổng phụ huynh) */
export async function exitChild(): Promise<void> {
  if (!(await session().parentInfo())) throw new SwitchError('no-parent');
  const engine = await flushAll();
  await engine.pullAndReplace(() => session().switchToParent());
  familyStore.getState().setAccount({ mode: 'adult', mediaConsent: true, activeChildId: null });
  await refreshAccountInfo().catch(() => undefined);
}
