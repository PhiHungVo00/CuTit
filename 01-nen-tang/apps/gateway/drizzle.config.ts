import { defineConfig } from 'drizzle-kit';

/**
 * Sinh migration SQL đánh số từ schema dùng chung (01-nen-tang/packages/contracts). Không cần kết nối DB.
 * Chạy: pnpm --filter @vietlearning/gateway db:generate --name <tên>
 * Migration được Gateway tự chạy lúc mở DB (src/db/client.ts). Không sửa migration đã phát hành.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: '../../packages/contracts/src/db/schema.ts',
  out: './drizzle'
});
