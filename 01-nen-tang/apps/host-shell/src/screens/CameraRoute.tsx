import { CameraScreen } from '@vietlearning/mfe-vision';
import { BackBar } from '../shell/BackBar';

/** Route bọc mỏng để chunk lazy có tên ổn định "CameraRoute". Host thêm nút quay lại (link cũ). */
export default function CameraRoute() {
  return (
    <>
      <BackBar />
      <CameraScreen />
    </>
  );
}
