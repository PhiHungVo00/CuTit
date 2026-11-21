import { RoleplayScreen } from '@vietlearning/mfe-conversation';
import { CuTitModeBar } from '../shell/CuTitModeBar';

/** Route bọc mỏng để chunk lazy có tên ổn định "RoleplayRoute". Host thêm thanh đổi chế độ Cu Tít. */
export default function RoleplayRoute() {
  return (
    <>
      <CuTitModeBar />
      <RoleplayScreen />
    </>
  );
}
