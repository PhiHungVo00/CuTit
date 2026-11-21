import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Môi trường âm thanh của thiết bị cho nhạc nền (khớp AudioEnv của @vietlearning/shared/audio).
 * Android: plugin nội bộ AudioEnvPlugin.java (chế độ chuông, AudioFocus). Web/iOS: không im lặng, không mất focus.
 */
export interface AudioEnvBridge {
  /**
   * true ⇒ KHÔNG nên bắt đầu nhạc nền: máy ở chế độ im lặng/rung, hoặc app khác đang phát nhạc.
   */
  isSilent(): Promise<boolean>;
  /** Hợp đồng của điều phối âm thanh; hiện không bao giờ gọi (WebView tự tạm dừng khi mất focus). Trả hàm hủy đăng ký. */
  onFocusLost(cb: () => void): () => void;
}

interface AudioEnvPlugin {
  isSilent(): Promise<{ silent: boolean }>;
}

const WEB: AudioEnvBridge = { isSilent: async () => false, onFocusLost: () => () => {} };

let bridge: AudioEnvBridge | undefined;

export function getAudioEnv(): AudioEnvBridge {
  if (bridge) return bridge;
  if (Capacitor.getPlatform() !== 'android') return (bridge = WEB);
  const plugin = registerPlugin<AudioEnvPlugin>('AudioEnv');
  return (bridge = {
    // lỗi hỏi native ⇒ coi như không im lặng (nhạc là phần phụ, không được làm hỏng app)
    isSilent: () => plugin.isSilent().then((r) => r.silent, () => false),
    // Mất focus do WebView tự xử lý (Chromium tạm dừng phần tử audio khi app khác giành loa); xem AudioEnvPlugin.java
    onFocusLost: () => () => {}
  });
}
