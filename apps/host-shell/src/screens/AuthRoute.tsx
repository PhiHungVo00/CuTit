import { AuthScreen } from '@vietlearning/mfe-learner';
// Nạp bootstrap tài khoản (cấu hình Google, nghe sự kiện phiên) kể cả khi mở thẳng /dang-nhap
import '../account/bootstrap';

/** Route bọc mỏng để chunk lazy có tên ổn định "AuthRoute" — màn đăng nhập/đăng ký (dự án 3). */
export default function AuthRoute() {
  return <AuthScreen />;
}
