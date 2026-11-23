import { useCallback } from 'react';
import { HonorificMatrixScreen } from '@vietlearning/mfe-knowledge';
import { EventBus } from '@vietlearning/shared';
import { useAppTheme } from '../theme/ThemeContext';

/**
 * Bọc màn hình M3:
 * - Giao diện do Shell cấp (controlled), nên thanh tab và màn hình đổi cùng nhau và được lưu lại.
 * - Sự kiện chọn cặp xưng hô đi qua Event Bus để remote khác lắng nghe, không import chéo.
 */
export default function HonorificScreen() {
  const { theme, setTheme } = useAppTheme();

  const handlePairChange = useCallback((pair: { speaker: string; listener: string; pairId: string }) => {
    EventBus.getInstance().emit('honorific:pair-selected', pair);
  }, []);

  return <HonorificMatrixScreen theme={theme} onThemeChange={setTheme} onPairChange={handlePairChange} />;
}
