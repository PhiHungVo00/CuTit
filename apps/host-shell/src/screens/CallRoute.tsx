import { CallScreen } from '@vietlearning/mfe-conversation';
import { CuTitModeBar } from '../shell/CuTitModeBar';

/** Route bọc mỏng để chunk lazy có tên ổn định "CallRoute". Host thêm thanh đổi chế độ Cu Tít. */
export default function CallRoute() {
  return (
    <>
      <CuTitModeBar />
      <CallScreen />
    </>
  );
}
