import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Môi trường âm thanh của thiết bị cho nhạc nền (khớp AudioEnv của @vietlearning/shared/audio).
 * Android: plugin nội bộ AudioEnvPlugin.java (chế độ chuông, AudioFocus). Web/iOS: không im lặng, không mất focus.
 */
export interface AudioEnvBridge {
  /**
   * true ⇒ KHÔNG nên bắt đầu nhạc nền: máy ở chế độ im lặng/rung, hoặc app khác đang phát nhạc.
   * Gọi ngay trước khi phát nên Android nhân tiện xin AUDIOFOCUS_GAIN khi trả false.
   */
  isSilent(): Promise<boolean>;
  /** Báo khi app khác giành audio focus (cuộc gọi, trình phát khác). Trả hàm hủy đăng ký. */
  onFocusLost(cb: () => void): () => void;
}

interface AudioEnvPlugin {
  isSilent(): Promise<{ silent: boolean }>;
  addListener(event: 'focusLost', cb: () => void): Promise<PluginListenerHandle>;
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
    onFocusLost(cb) {
      let handle: PluginListenerHandle | undefined;
      let off = false;
      void plugin.addListener('focusLost', cb).then((h) => (off ? void h.remove() : (handle = h)), () => undefined);
      return () => {
        off = true;
        void handle?.remove();
        handle = undefined;
      };
    }
  });
}
