import { describe, expect, it } from 'vitest';
import { callReducer, initialCall, MAX_CALL_TURNS, type CallAction, type CallState } from './callMachine';

const run = (actions: CallAction[], from: CallState = initialCall) => actions.reduce(callReducer, from);

describe('callReducer — vòng gọi thoại', () => {
  it('chu trình 2 lượt bằng giọng nói: nghe → nghĩ → đọc → nghe lại', () => {
    const s1 = run([{ type: 'START' }]);
    expect(s1.phase).toBe('listening');
    const s2 = run([{ type: 'HEARD', text: 'Xin chào' }], s1);
    expect(s2).toMatchObject({ phase: 'thinking', pendingText: 'Xin chào' });
    const s3 = run([{ type: 'THOUGHT' }], s2);
    expect(s3).toMatchObject({ phase: 'speaking', turns: 1 });
    const s4 = run([{ type: 'SPOKEN' }, { type: 'HEARD', text: 'Tôi khỏe' }, { type: 'THOUGHT' }, { type: 'SPOKEN' }], s3);
    expect(s4).toMatchObject({ phase: 'listening', turns: 2 });
  });

  it('half-duplex: đang đọc thì micro đóng — chỉ SPOKEN (hoặc gác máy) mới rời pha speaking', () => {
    const speaking = run([{ type: 'START' }, { type: 'HEARD', text: 'a' }, { type: 'THOUGHT' }]);
    const others: CallAction[] = [{ type: 'HEARD', text: 'b' }, { type: 'NO_SPEECH' }, { type: 'START' }, { type: 'USE_VOICE' }, { type: 'SEND_TYPED', text: 'x' }];
    for (const a of others) expect(callReducer(speaking, a).phase).toBe('speaking');
    expect(callReducer(speaking, { type: 'HANG_UP' })).toMatchObject({ phase: 'ended', reason: 'hangup' });
  });

  it('không nghe thấy gì => tạm dừng chờ người học bấm nói tiếp (không lặp vô hạn)', () => {
    const s = run([{ type: 'START' }, { type: 'NO_SPEECH' }]);
    expect(s.phase).toBe('paused');
    expect(run([{ type: 'RESUME' }], s).phase).toBe('listening');
  });

  it('micro không dùng được => chuyển sang gõ chữ, vẫn gọi tiếp được', () => {
    const s = run([{ type: 'START' }, { type: 'MIC_FAILED', error: 'permission-denied' }]);
    expect(s).toMatchObject({ phase: 'typing', input: 'text', micError: 'permission-denied' });
    const s2 = run([{ type: 'SEND_TYPED', text: 'Chào bạn' }, { type: 'THOUGHT' }, { type: 'SPOKEN' }], s);
    expect(s2).toMatchObject({ phase: 'typing', turns: 1 });
  });

  it('gõ thay nói và quay lại nói', () => {
    const s = run([{ type: 'START' }, { type: 'USE_TEXT' }]);
    expect(s).toMatchObject({ phase: 'typing', input: 'text' });
    expect(run([{ type: 'USE_VOICE' }], s)).toMatchObject({ phase: 'listening', input: 'voice' });
  });

  it('hết lượt AI hôm nay => kết thúc cuộc gọi với lý do quota; lỗi mạng => tạm dừng có thông báo', () => {
    const thinking = run([{ type: 'START' }, { type: 'HEARD', text: 'a' }]);
    expect(callReducer(thinking, { type: 'TURN_FAILED', quota: true, message: 'hết lượt' })).toMatchObject({ phase: 'ended', reason: 'quota', error: 'hết lượt' });
    expect(callReducer(thinking, { type: 'TURN_FAILED', quota: false, message: 'mất mạng' })).toMatchObject({ phase: 'paused', error: 'mất mạng', pendingText: 'a' });
  });

  it('có giới hạn số lượt mỗi cuộc gọi rồi tự sang tổng kết', () => {
    let s = run([{ type: 'START' }]);
    for (let i = 0; i < MAX_CALL_TURNS; i++) s = run([{ type: 'HEARD', text: 'a' }, { type: 'THOUGHT' }, { type: 'SPOKEN' }], s);
    expect(s).toMatchObject({ phase: 'ended', reason: 'max-turns', turns: MAX_CALL_TURNS });
  });

  it('nói chậm lại: đọc lại câu cuối (không tính thêm lượt), micro đóng khi đang đọc', () => {
    const listening = run([{ type: 'START' }, { type: 'HEARD', text: 'a' }, { type: 'THOUGHT' }, { type: 'SPOKEN' }]);
    const replay = callReducer(listening, { type: 'REPLAY' });
    expect(replay).toMatchObject({ phase: 'speaking', turns: 1 });
    expect(callReducer(replay, { type: 'SPOKEN' })).toMatchObject({ phase: 'listening', turns: 1 });
    expect(callReducer(run([{ type: 'START' }]), { type: 'REPLAY' }).phase).toBe('listening'); // chưa có câu nào để đọc lại
  });

  it('gác máy từ mọi pha => ended; sau ended không có gì đổi được nữa', () => {
    const ended = run([{ type: 'START' }, { type: 'HANG_UP' }]);
    expect(ended.phase).toBe('ended');
    expect(run([{ type: 'START' }, { type: 'HEARD', text: 'a' }], ended).phase).toBe('ended');
  });
});
