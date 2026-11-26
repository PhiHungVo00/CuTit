import type { FeedbackKind } from '@vietlearning/contracts/api';

/**
 * Bản nháp góp ý: chỉ CHỮ + loại (tệp không lưu), để thoát ra rồi mở lại vẫn còn (spec §5.1).
 * localStorage có thể bị chặn (chế độ riêng tư, WebView lạ) ⇒ mọi thao tác bọc try/catch, màn vẫn chạy.
 */
export const DRAFT_KEY = 'becutit.feedback.draft';

export interface FeedbackDraft {
  kind: FeedbackKind;
  body: string;
}

export function loadDraft(): FeedbackDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FeedbackDraft>;
    if (typeof v.body !== 'string' || (v.kind !== 'bug' && v.kind !== 'idea' && v.kind !== 'other')) return null;
    return { kind: v.kind, body: v.body };
  } catch {
    return null;
  }
}

export function saveDraft(draft: FeedbackDraft): void {
  try {
    if (draft.body.trim() === '') localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* không lưu được nháp: bỏ qua */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* bỏ qua */
  }
}
