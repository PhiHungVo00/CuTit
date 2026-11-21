import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendTurn, TurnError, type TurnRequest } from './chatClient';

const req: TurnRequest = { sessionId: '7d444840-9dc0-11d1-b245-5ffdce74fad2', userText: 'chào', targetDialect: 'north', learnerLevel: 1, correctionLevel: 'gentle', persona: 'be_cu_tit', history: [], explanationLanguage: 'vi' };

function sseResponse(chunks: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
      c.close();
    }
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('sendTurn (SSE)', () => {
  it('ghép sự kiện bị cắt giữa chừng giữa các gói mạng, trả về done', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"type":"tok', 'en","text":"Chào "}\n\ndata: {"type":"token","text":"bạn"}\n\n', 'data: {"type":"done","turnId":"7d444840-9dc0-11d1-b245-5ffdce74fad2","reply":"Chào bạn","completedTasks":[1],"mock":true}\n\n'])));
    const tokens: string[] = [];
    const done = await sendTurn(req, (e) => e.type === 'token' && tokens.push(e.text), new AbortController().signal);
    expect(tokens.join('')).toBe('Chào bạn');
    expect(done.completedTasks).toEqual([1]);
  });

  it('luồng đóng khi chưa có done => lỗi incomplete (không coi câu dở là xong)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"type":"token","text":"Chào"}\n\n'])));
    await expect(sendTurn(req, () => undefined, new AbortController().signal)).rejects.toMatchObject({ kind: 'incomplete' });
  });

  it('sự kiện lệch contract => lỗi, không đưa dữ liệu sai lên giao diện', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"type":"html","value":"<b>x</b>"}\n\n'])));
    const err = await sendTurn(req, () => undefined, new AbortController().signal).catch((e) => e);
    expect(err).toBeInstanceOf(TurnError);
    expect(err.kind).toBe('contract');
  });

  it('sự kiện SSE error llm_busy => unavailable + code llm_busy, câu "bận" theo explanationLanguage; mã khác giữ code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"type":"error","code":"llm_busy","message":"Cu Tít đang bận"}\n\n'])));
    const en = await sendTurn({ ...req, explanationLanguage: 'en' }, () => undefined, new AbortController().signal).catch((e) => e);
    expect(en).toBeInstanceOf(TurnError);
    expect(en.kind).toBe('unavailable');
    expect(en.code).toBe('llm_busy');
    expect(en.message).toMatch(/busy/i);
    const vi_ = await sendTurn(req, () => undefined, new AbortController().signal).catch((e) => e);
    expect(vi_.message).toMatch(/bận/);

    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"type":"error","code":"internal_error","message":"x"}\n\n'])));
    const other = await sendTurn(req, () => undefined, new AbortController().signal).catch((e) => e);
    expect(other.kind).toBe('server');
    expect(other.code).toBe('internal_error');
  });
});
