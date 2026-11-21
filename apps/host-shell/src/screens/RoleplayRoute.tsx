import { RoleplayScreen } from '@vietlearning/mfe-conversation';
import { BackBar } from '../shell/BackBar';

/** Route bọc mỏng để chunk lazy có tên ổn định "RoleplayRoute". Host thêm nút quay lại (link cũ). */
export default function RoleplayRoute() {
  return (
    <>
      <BackBar />
      <RoleplayScreen />
    </>
  );
}
