import { describe, expect, it } from 'vitest';
import { detectPlatform } from './platform';

describe('detectPlatform (thay Capacitor.getPlatform ở gói đầu, R10)', () => {
  it('trình duyệt thường => web', () => {
    expect(detectPlatform({})).toBe('web');
    expect(detectPlatform(undefined)).toBe('web');
    expect(detectPlatform({ webkit: { messageHandlers: {} } })).toBe('web');
  });

  it('WebView Android có androidBridge => android', () => {
    expect(detectPlatform({ androidBridge: {} })).toBe('android');
  });

  it('WKWebView có messageHandlers.bridge => ios', () => {
    expect(detectPlatform({ webkit: { messageHandlers: { bridge: {} } } })).toBe('ios');
  });

  it('CapacitorCustomPlatform thắng mọi dấu hiệu khác (giống core)', () => {
    expect(detectPlatform({ CapacitorCustomPlatform: { name: 'electron' }, androidBridge: {} })).toBe('electron');
  });

  it('khớp đúng @capacitor/core khi nạp thật', async () => {
    const g = globalThis as Record<string, unknown>;
    for (const win of [{}, { androidBridge: {} }, { webkit: { messageHandlers: { bridge: {} } } }]) {
      const saved = { androidBridge: g.androidBridge, webkit: g.webkit, Capacitor: g.Capacitor };
      Object.assign(g, { androidBridge: undefined, webkit: undefined, Capacitor: undefined }, win);
      try {
        const { Capacitor } = await import('@capacitor/core');
        // core đọc globalThis mỗi lần gọi getPlatform()
        expect(detectPlatform(g)).toBe(Capacitor.getPlatform());
      } finally {
        Object.assign(g, saved);
      }
    }
  });
});
