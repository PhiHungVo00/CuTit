import { useEffect, useState } from 'react';

function reducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === 'true') return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Số đếm từ 0 lên `to` trong `ms` (ease-out). Giảm chuyển động (hệ điều hành hoặc công tắc của app) => hiện thẳng đích.
 * Chỉ dùng cho con số mang tính ăn mừng; chữ cho trình đọc màn hình nên luôn là số cuối.
 */
export function useCountUp(to: number, ms = 600): number {
  const instant = to <= 0 || reducedMotion();
  const [n, setN] = useState(instant ? to : 0);
  useEffect(() => {
    if (to <= 0 || reducedMotion()) {
      setN(to);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - start) / ms);
      setN(Math.round(to * (1 - (1 - k) * (1 - k))));
      if (k >= 1) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [to, ms]);
  return n;
}
