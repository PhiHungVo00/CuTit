import { ChatScreen } from '@vietlearning/mfe-conversation';

/** Route bọc mỏng để chunk lazy có tên ổn định "ChatRoute". Màn chat tự có đầu màn (không còn thanh chế độ của Host). */
export default function ChatRoute() {
  return <ChatScreen />;
}
