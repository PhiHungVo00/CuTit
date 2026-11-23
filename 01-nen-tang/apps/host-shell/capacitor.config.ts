import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Đóng gói Host Shell (đã ghép toàn bộ MFE lúc build) thành app Android/iOS.
 * Toàn bộ file web nằm sẵn trong app => mở app không cần mạng, chỉ gọi Gateway khi cần AI.
 *
 * Dev với emulator Android: Gateway trên máy tính là http://10.0.2.2:4000.
 * Đặt VITE_GATEWAY_URL lúc build (xem 01-nen-tang/apps/host-shell/.env.example).
 */
const isDev = process.env.NODE_ENV !== 'production';

const config: CapacitorConfig = {
  appId: 'vn.edu.uit.becutit',
  appName: 'Bé Cu Tít',
  webDir: 'dist',
  android: {
    // Chỉ cho phép trang https://localhost gọi Gateway http (emulator) khi dev.
    allowMixedContent: isDev,
    // Chặn debug WebView qua chrome://inspect ở bản release
    webContentsDebuggingEnabled: isDev,
    // Android 15 (targetSdk 35) bắt buộc edge-to-edge: chừa lề cho status bar / thanh điều hướng
    adjustMarginsForEdgeToEdge: 'auto'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0, // ẩn thủ công ngay khi React đã vẽ xong (main.tsx)
      launchAutoHide: false,
      backgroundColor: '#FBF3E4',
      showSpinner: false
    }
  }
};

export default config;
