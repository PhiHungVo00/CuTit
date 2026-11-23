import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@vietlearning/contracts/db';
import type { GatewayConfig } from '../config.js';

/**
 * Kết nối DB qua Drizzle, MỞ LƯỜI: route đầu tiên cần DB mới khởi tạo (PGlite mất ~1–3 s lần đầu),
 * nên các route AI/không cần DB và phần lớn test không phải trả giá này.
 *
 * - Có DATABASE_URL (production: Neon/Supabase) => postgres-js.
 * - Không có => PGlite (Postgres nhúng, WASM): `memory://` cho test, thư mục `.data/pglite` cho dev.
 * Migration SQL đánh số trong 01-nen-tang/apps/gateway/drizzle/ chạy tự động lúc mở.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

const here = dirname(fileURLToPath(import.meta.url)); // dist/db
const MIGRATIONS = join(here, '..', '..', 'drizzle');


export interface DbProvider {
  get(): Promise<Db>;
  close(): Promise<void>;
}

export function createDbProvider(config: Pick<GatewayConfig, 'DATABASE_URL' | 'PGLITE_DIR'>): DbProvider {
  let opened: Promise<{ db: Db; close: () => Promise<void> }> | null = null;

  const open = async () => {
    if (config.DATABASE_URL) {
      const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([
        import('postgres'),
        import('drizzle-orm/postgres-js'),
        import('drizzle-orm/postgres-js/migrator')
      ]);
      const client = postgres(config.DATABASE_URL, { max: 10, onnotice: () => {} });
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: MIGRATIONS });
      return { db: db as unknown as Db, close: () => client.end() };
    }
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
      import('@electric-sql/pglite'),
      import('drizzle-orm/pglite'),
      import('drizzle-orm/pglite/migrator')
    ]);
    const dir = config.PGLITE_DIR;
    if (!dir.startsWith('memory://')) mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db: db as unknown as Db, close: () => client.close() };
  };

  return {
    get: async () => {
      opened ??= open();
      try {
        return (await opened).db;
      } catch (err) {
        opened = null; // cho phép thử lại lần sau thay vì kẹt lỗi mãi
        throw err;
      }
    },
    close: async () => {
      if (!opened) return;
      const o = opened;
      opened = null;
      try {
        await (await o).close();
      } catch {
        /* mở thất bại thì không có gì để đóng */
      }
    }
  };
}
