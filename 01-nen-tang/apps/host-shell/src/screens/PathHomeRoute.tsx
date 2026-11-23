import { PathHome } from '@vietlearning/mfe-path';

/** Phần lộ trình của trang chủ (lazy) — bọc mỏng để chunk lazy có tên ổn định "PathHomeRoute" (ngân sách .size-limit.cjs). */
export default function PathHomeRoute() {
  return <PathHome />;
}
