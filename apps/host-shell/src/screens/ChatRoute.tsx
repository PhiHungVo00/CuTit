import { ChatScreen } from '@vietlearning/mfe-conversation';
import { useIsChild } from '@vietlearning/state/family';
import { ChildLock } from './ChildLock';

/** Route bọc mỏng để chunk lazy có tên ổn định "ChatRoute". GĐ4b: hồ sơ trẻ không có chat AI tự do (D4). */
export default function ChatRoute() {
  return useIsChild() ? <ChildLock /> : <ChatScreen />;
}
