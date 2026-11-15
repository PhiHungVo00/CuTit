import { useCallback } from 'react';
import { HonorificMatrixScreen } from '@vietlearning/mfe-knowledge';
import { EventBus } from '@vietlearning/shared';

/**
 * Bọc màn hình M3: chuyển sự kiện chọn cặp xưng hô lên Event Bus để các remote khác
 * (ví dụ Hội thoại) lắng nghe, thay vì import chéo giữa các remote.
 */
export default function HonorificScreen() {
  const handlePairChange = useCallback((pair: { speaker: string; listener: string; pairId: string }) => {
    EventBus.getInstance().emit('honorific:pair-selected', pair);
  }, []);

  return <HonorificMatrixScreen initialTheme="dark" onPairChange={handlePairChange} />;
}
