// Đồ giả dùng chung cho test social (không gọi Gateway thật)
export const U1 = '11111111-1111-4111-8111-111111111111';
export const U2 = '22222222-2222-4222-8222-222222222222';
export const CID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const CID2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const hex = (n) => n.toString(16).padStart(12, '0');
export const mid = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-${hex(n)}`;
export const cmid = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-${hex(n)}`;

export function msg(seq, cid = CID, extra = {}) {
  return { id: mid(seq), cid, seq, kind: 'text', body: `tin ${seq}`, createdAt: '2026-11-26T01:00:00.000Z', mine: false, sender: { id: U2, displayName: 'Bạn' }, ...extra };
}
export const page = (messages, hasMore = false) => ({ messages, hasMore });

export const flush = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};

/** Bộ hẹn giờ giả: advance(ms) chạy các hàm đến hạn theo thứ tự */
export function fakeScheduler() {
  let t = 0;
  let id = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) {
      timers.set(++id, { at: t + ms, fn });
      return id;
    },
    clearTimeout(h) {
      timers.delete(h);
    },
    now: () => t,
    pending: () => [...timers.values()].map((x) => x.at - t).sort((a, b) => a - b),
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        t = Math.max(t, next[1].at);
        next[1].fn();
        await flush();
      }
      t = end;
      await flush();
    }
  };
}

export function fakeVisibility(initial = true) {
  let v = initial;
  const subs = new Set();
  return {
    isVisible: () => v,
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    set(next) {
      v = next;
      subs.forEach((cb) => cb(next));
    }
  };
}

export function makeFakeWebSocket() {
  const instances = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.readyState = 0;
      instances.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close(code = 1000) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.closedBy = 'client';
      queueMicrotask(() => this.onclose?.({ code }));
    }
    // ---- điều khiển từ test ----
    open() {
      this.readyState = 1;
      this.onopen?.({});
    }
    receive(frame) {
      this.onmessage?.({ data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
    }
    serverClose(code) {
      this.readyState = 3;
      this.onclose?.({ code });
    }
  }
  FakeWebSocket.instances = instances;
  return FakeWebSocket;
}
