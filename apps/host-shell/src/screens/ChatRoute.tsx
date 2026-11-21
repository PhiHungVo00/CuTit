import { ChatScreen } from '@vietlearning/mfe-conversation';
import { CuTitModeBar } from '../shell/CuTitModeBar';

/** Route bọc mỏng để chunk lazy có tên ổn định "ChatRoute". Host thêm thanh đổi chế độ Cu Tít. */
export default function ChatRoute() {
  return (
    <>
      <CuTitModeBar />
      <ChatScreen />
    </>
  );
}
