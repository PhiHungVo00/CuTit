import { useEffect } from 'react';

/** Chờ AI lâu hơn mức này ở pha `thinking` thì Cu Tít nói "ừm" một lần để cuộc gọi không im lặng */
export const FILLER_DELAY_MS = 1200;

/** Mỗi lượt `thinking` gọi `say` tối đa một lần, sau FILLER_DELAY_MS; trả lời về sớm hơn thì không gọi. */
export function useThinkingFiller(phase: string, say: () => void): void {
  useEffect(() => {
    if (phase !== 'thinking') return;
    const id = setTimeout(say, FILLER_DELAY_MS);
    return () => clearTimeout(id);
    // say luôn là hàm mới mỗi lần render; chỉ phụ thuộc pha để không đặt lại đồng hồ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
}
