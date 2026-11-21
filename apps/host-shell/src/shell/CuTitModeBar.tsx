import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '@vietlearning/ui';
import { defineMessages } from '@vietlearning/state';
import { CUTIT_MODES } from './navMap';

const { useT } = defineMessages(
  { back: 'Quay lại', modes: 'Chế độ với Cu Tít', chat: 'Chat', role: 'Nhập vai', call: 'Gọi thoại', cam: 'Camera' },
  { back: 'Back', modes: 'Cu Tít modes', chat: 'Chat', role: 'Role-play', call: 'Call', cam: 'Camera' }
);

const MODES: { path: (typeof CUTIT_MODES)[number]; key: 'chat' | 'role' | 'call' | 'cam'; icon: IconName }[] = [
  { path: '/hoi-thoai', key: 'chat', icon: 'chat' },
  { path: '/nhap-vai', key: 'role', icon: 'nhap-vai' },
  { path: '/goi-thoai', key: 'call', icon: 'goi' },
  { path: '/camera', key: 'cam', icon: 'camera' }
];

/**
 * Thanh đầu của các màn Cu Tít (host bọc, không sửa MFE): nút quay lại + đổi chế độ Chat · Nhập vai · Gọi thoại · Camera.
 * Màn Cu Tít ẩn thanh tab nên đây là lối ra duy nhất ngoài nút Back của máy.
 */
export function CuTitModeBar() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="mode-bar">
      <button type="button" className="mode-back" aria-label={t('back')} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
        <Icon name="quay-lai" size={22} />
      </button>
      <nav aria-label={t('modes')} className="mode-tabs">
        {MODES.map((m) => (
          <Link key={m.path} to={m.path} replace aria-current={pathname === m.path ? 'page' : undefined}>
            <Icon name={m.icon} size={16} />
            <span>{t(m.key)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
