import { describe, expect, it } from 'vitest';
import { messageForError } from './errors';

const e = (kind: string, code?: string, details?: Record<string, unknown>) => ({ kind, code, details });

describe('messageForError — thông báo lỗi theo mã', () => {
  it('llm_busy ⇒ bận, thử lại được', () => {
    expect(messageForError(e('unavailable', 'llm_busy'), 'vi')).toEqual({ text: 'Cu Tít đang bận, thử lại sau ít giây', retry: true });
    expect(messageForError(e('unavailable', 'llm_busy'), 'en').retry).toBe(true);
  });
  it('quota_exceeded ⇒ hết lượt hôm nay, không thử lại', () => {
    const r = messageForError(e('quota', 'quota_exceeded'), 'vi');
    expect(r.text).toBe('Hết lượt hôm nay, có lượt mới lúc 0 giờ');
    expect(r.retry).toBe(false);
    expect(messageForError(e('quota', 'quota_exceeded'), 'en').text).toMatch(/midnight/i);
  });
  it('quota_exceeded + scope global ⇒ Cu Tít nghỉ một chút', () => {
    const r = messageForError(e('quota', 'quota_exceeded', { scope: 'global' }), 'vi');
    expect(r.text).toBe('Hôm nay nhiều bạn học quá, Cu Tít nghỉ một chút');
    expect(r.retry).toBe(false);
  });
  it('429 mã khác (giới hạn theo phút) ⇒ chờ rồi thử lại', () => {
    expect(messageForError(e('quota', 'rate_limited'), 'vi').retry).toBe(true);
  });
  it('lỗi mạng/treo ⇒ không kết nối được máy chủ, gửi lại được', () => {
    for (const kind of ['offline', 'timeout', 'incomplete']) {
      expect(messageForError(e(kind), 'vi')).toEqual({ text: 'Không kết nối được máy chủ', retry: true });
    }
    expect(messageForError(e('offline'), 'en').text).toBe('Can’t reach the server');
  });
  it('yêu cầu bị từ chối ⇒ không gửi lại', () => {
    expect(messageForError(e('invalid-request', 'llm_rejected'), 'vi').retry).toBe(false);
  });
  it('lỗi khác ⇒ câu chung, thử lại được', () => {
    expect(messageForError(e('server'), 'vi').retry).toBe(true);
  });
});
