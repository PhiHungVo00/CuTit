import { CallScreen } from '@vietlearning/mfe-conversation';

/** Route bọc mỏng để chunk lazy có tên ổn định "CallRoute". Màn gọi tự có đầu màn; `?video=0|1` do màn gọi đọc. */
export default function CallRoute() {
  return <CallScreen />;
}
