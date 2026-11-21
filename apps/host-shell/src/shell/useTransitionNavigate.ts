import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { loaderOf } from '../routes';
import { navigateWithTransition } from './viewTransition';

/** navigate() có chuyển cảnh (tải chunk đích trước). Dùng cho thanh tab và các lối vào chính. */
export function useTransitionNavigate(): (to: string) => void {
  const navigate = useNavigate();
  return useCallback((to: string) => void navigateWithTransition((p) => navigate(p), to, loaderOf(to)), [navigate]);
}
