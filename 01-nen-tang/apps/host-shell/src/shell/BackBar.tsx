import { useNavigate } from 'react-router-dom';
import { Icon } from '@vietlearning/ui';
import { defineMessages } from '@vietlearning/state';

const { useT } = defineMessages({ back: 'Quay lại' }, { back: 'Back' });

/**
 * Thanh đầu tối giản (chỉ nút quay lại) cho màn Cu Tít cũ còn chạy bằng link cũ (/nhap-vai, /camera).
 * Màn tập trung ẩn thanh tab nên đây là lối ra duy nhất ngoài nút Back của máy.
 * Màn chat và màn gọi tự có đầu màn riêng, không dùng thanh này.
 */
export function BackBar() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="back-bar">
      <button type="button" className="back-bar-btn" aria-label={t('back')} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
        <Icon name="quay-lai" size={22} />
      </button>
    </div>
  );
}
