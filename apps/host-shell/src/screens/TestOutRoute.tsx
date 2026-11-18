import { TestOutScreen } from '@vietlearning/mfe-path';

/** Kiểm tra vượt unit /kiem-tra/:unitId — bọc mỏng để chunk lazy có tên ổn định "TestOutRoute" (ngân sách .size-limit.cjs). */
export default function TestOutRoute() {
  return <TestOutScreen />;
}
