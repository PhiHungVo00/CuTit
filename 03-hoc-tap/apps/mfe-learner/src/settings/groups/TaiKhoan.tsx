import { lazy, Suspense } from 'react';
import type { AccountDeps } from '../../preferences/AccountSection';
import type { AuthDeps } from '../../account/deps';

// Dự án 3: toàn bộ giao diện tài khoản nạp LƯỜI (chunk riêng) để mục lục Cài đặt giữ trong ngân sách bundle
const AccountGroup = lazy(() => import('../../account/AccountGroup').then((m) => ({ default: m.AccountGroup })));

/** Cài đặt › Tài khoản: tài khoản thật => AccountPanel; khách => lời mời đăng nhập + mã khôi phục/đồng bộ như trước. */
export function TaiKhoan({ deps, authDeps }: { deps?: AccountDeps; authDeps?: AuthDeps }) {
  return (
    <Suspense fallback={null}>
      <AccountGroup deps={deps} authDeps={authDeps} />
    </Suspense>
  );
}
