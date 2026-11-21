import { CameraScreen } from '@vietlearning/mfe-vision';
import { CuTitModeBar } from '../shell/CuTitModeBar';

/** Route bọc mỏng để chunk lazy có tên ổn định "CameraRoute". Host thêm thanh đổi chế độ Cu Tít. */
export default function CameraRoute() {
  return (
    <>
      <CuTitModeBar />
      <CameraScreen />
    </>
  );
}
