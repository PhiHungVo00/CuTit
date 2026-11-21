import { AccountSection, type AccountDeps } from '../../preferences/AccountSection';

export function TaiKhoan({ deps }: { deps?: AccountDeps }) {
  return <AccountSection deps={deps} />;
}
