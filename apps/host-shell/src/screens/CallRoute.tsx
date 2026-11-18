import { Navigate } from 'react-router-dom';
import { CallScreen } from '@vietlearning/mfe-conversation';
import { useIsChild } from '@vietlearning/state/family';

/** Gọi thoại /goi-thoai (GĐ3) — bọc mỏng để chunk lazy có tên ổn định "CallRoute" (ngân sách .size-limit.cjs).
 * GĐ4b: gọi thoại là trò chuyện tự do => hồ sơ trẻ chuyển sang /hoi-thoai (màn khóa thân thiện, gợi ý nhập vai). */
export default function CallRoute() {
  return useIsChild() ? <Navigate to="/hoi-thoai" replace /> : <CallScreen />;
}
