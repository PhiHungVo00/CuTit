import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createDbProvider, schema } from '../dist/db/client.js';
import { makeApp } from './helpers.mjs';

/**
 * Hạ tầng test WebSocket (dự án 4, Task 5): Gateway thật nghe cổng 0 (hệ điều hành chọn, không đụng phiên khác),
 * PGlite trong bộ nhớ, đồng hồ giả cho hub (`clock.t`) + `app.realtime.sweep()` gọi tay (không chờ thật).
 */
export async function startWs({ env = {}, realtime = {}, versions } = {}) {
  // đồng hồ giả = giờ thật + độ lệch: thời gian thật vẫn trôi (JWT/DB dùng giờ thật), test chỉ "nhảy" thêm bằng `clock.t += ms`
  let offset = 0;
  const clock = {
    get t() {
      return Date.now() + offset;
    },
    set t(v) {
      offset = v - Date.now();
    }
  };
  const dbp = createDbProvider({ PGLITE_DIR: 'memory://' });
  const dir = mkdtempSync(join(tmpdir(), 'ws-test-'));
  let versionsEnv = {};
  if (versions) {
    const file = join(dir, 'app-versions.json');
    writeFileSync(file, JSON.stringify(versions));
    versionsEnv = { APP_VERSIONS_FILE: file, APP_VERSIONS_TTL_MS: '0' };
  }
  const app = await makeApp(
    { AUTH_RATE_LIMIT_PER_MINUTE: '10000', WS_RATE_LIMIT_PER_MINUTE: '10000', ...versionsEnv, ...env },
    { db: dbp, realtime: { now: () => clock.t, sweepMs: 0, ...realtime } }
  );
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = app.server.address().port;
  const db = await dbp.get();
  const clients = new Set();
  const uncaught = [];
  const onUncaught = (e) => uncaught.push(e);
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUncaught);

  const env2 = {
    app,
    dbp,
    db,
    clock,
    port,
    uncaught,
    url: `ws://127.0.0.1:${port}/ws`,
    /** người dùng đủ điều kiện chat (không khách, đủ 18, có handle) */
    async user(over = {}) {
      const [u] = await db
        .insert(schema.users)
        .values({ isGuest: false, isAdult: true, ageDeclaredAt: new Date(), ...(over.user ?? {}) })
        .returning();
      if (over.profile !== false) {
        await db.insert(schema.socialProfiles).values({
          userId: u.id,
          displayName: over.name ?? `Ban ${u.id.slice(0, 4)}`,
          handle: over.handle === null ? null : (over.handle ?? `u${u.id.replace(/-/g, '').slice(0, 12)}`),
          ...(over.settings ?? {})
        });
      }
      return u;
    },
    token(userId, { typ = 'access', expiresIn = 900 } = {}) {
      return app.jwt.sign({ sub: userId, typ }, { expiresIn });
    },
    /** mở kết nối; `hello` mặc định tự gửi khi `auth !== false` */
    connect(userId, o = {}) {
      const c = new Client(o.url ?? env2.url + (o.query ?? ''));
      clients.add(c);
      if (o.hello !== false && userId) {
        c.send({
          t: 'hello',
          v: 1,
          token: o.token ?? env2.token(userId),
          build: o.build ?? 100,
          device: o.device ?? randomUUID(),
          ...(o.helloExtra ?? {})
        });
      }
      return c;
    },
    /** kết nối + chờ `hello_ok` */
    async ready(userId, o = {}) {
      const c = env2.connect(userId, o);
      const f = await c.waitFrame((x) => x.t === 'hello_ok');
      c.helloOk = f;
      return c;
    },
    async close() {
      for (const c of clients) c.terminate();
      await app.close();
      await dbp.close();
      rmSync(dir, { recursive: true, force: true });
      process.off('uncaughtException', onUncaught);
      process.off('unhandledRejection', onUncaught);
    }
  };
  return env2;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Client {
  frames = [];
  closed = null;
  opened;
  constructor(url) {
    this.ws = new WebSocket(url);
    this.waiters = [];
    this.opened = new Promise((res) => {
      this.ws.on('open', () => res(true));
      this.ws.on('unexpected-response', (_req, r) => {
        this.httpStatus = r.statusCode;
        r.resume();
        this.closed = { code: 1006, http: r.statusCode };
        res(false);
        this.flush();
      });
      this.ws.on('error', () => res(false));
    });
    this.ws.on('message', (data) => {
      let f;
      try {
        f = JSON.parse(data.toString());
      } catch {
        f = { raw: data.toString() };
      }
      this.frames.push(f);
      this.flush();
    });
    this.ws.on('close', (code) => {
      this.closed = this.closed ?? { code };
      this.flush();
    });
  }
  flush() {
    for (const w of [...this.waiters]) w.check();
  }
  send(o) {
    const data = typeof o === 'string' || Buffer.isBuffer(o) ? o : JSON.stringify(o);
    const go = () => this.ws.send(data);
    if (this.ws.readyState === WebSocket.CONNECTING) this.ws.once('open', go);
    else if (this.ws.readyState === WebSocket.OPEN) go();
  }
  sendBinary(buf) {
    const go = () => this.ws.send(buf, { binary: true });
    if (this.ws.readyState === WebSocket.CONNECTING) this.ws.once('open', go);
    else if (this.ws.readyState === WebSocket.OPEN) go();
  }
  /** đợi khung thỏa điều kiện (kể cả khung đã tới trước) */
  waitFrame(pred, ms = 3000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        cleanup();
        reject(new Error(`hết giờ chờ khung; đã nhận: ${JSON.stringify(this.frames)}; đóng: ${JSON.stringify(this.closed)}`));
      }, ms);
      const w = {
        check: () => {
          const f = this.frames.find(pred);
          if (f) {
            cleanup();
            resolve(f);
          } else if (this.closed) {
            cleanup();
            reject(new Error(`đóng trước khi có khung: ${JSON.stringify(this.closed)}; đã nhận: ${JSON.stringify(this.frames)}`));
          }
        }
      };
      const cleanup = () => {
        clearTimeout(t);
        this.waiters = this.waiters.filter((x) => x !== w);
      };
      this.waiters.push(w);
      w.check();
    });
  }
  waitClosed(ms = 3000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        cleanup();
        reject(new Error(`chưa đóng sau ${ms}ms; đã nhận: ${JSON.stringify(this.frames)}`));
      }, ms);
      const w = {
        check: () => {
          if (this.closed) {
            cleanup();
            resolve(this.closed);
          }
        }
      };
      const cleanup = () => {
        clearTimeout(t);
        this.waiters = this.waiters.filter((x) => x !== w);
      };
      this.waiters.push(w);
      w.check();
    });
  }
  /** đợi `ms` rồi trả các khung thỏa điều kiện (kiểm "KHÔNG nhận") */
  async collect(pred, ms = 250) {
    await wait(ms);
    return this.frames.filter(pred);
  }
  terminate() {
    try {
      this.ws.terminate();
    } catch {
      /* đã đóng */
    }
  }
}
