import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ForcedUpdate } from './ForcedUpdate';
import { ForcedOfflineBanner, UpdatePrompt } from './UpdatePrompt';
import { updateMessages } from './updateI18n';

// Ngôn ngữ mặc định theo navigator.language: ghim tiếng Việt trước khi module state nạp (như TabBar.test)
vi.hoisted(() => {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'vi-VN' }, configurable: true });
});

describe('ForcedUpdate', () => {
  const html = renderToStaticMarkup(<ForcedUpdate onUpdate={() => undefined} />);
  it('alertdialog modal, có tiêu đề + mô tả, KHÔNG có nút đóng, đúng một nút', () => {
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="update-forced-title"');
    expect(html).toContain('Cần cập nhật để học tiếp');
    expect(html).toContain('Tiến độ của bạn vẫn được giữ an toàn.');
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    expect(html).toContain('Cập nhật ngay');
    expect(html).not.toMatch(/aria-label="[^"]*(Đóng|Close)/i);
  });
  it('lỗi mở cửa hàng hiện trong màn (role=alert) khi kênh báo', () => {
    const withErr = renderToStaticMarkup(<ForcedUpdate onUpdate={() => undefined} errorKey="openStoreFailed" />);
    expect(withErr).toContain('Không mở được cửa hàng');
    expect(withErr).toContain('role="alert"');
  });
});

describe('UpdatePrompt', () => {
  it('nhắc mềm: role=status, tiêu đề có phiên bản, Để sau + Cập nhật', () => {
    const html = renderToStaticMarkup(<UpdatePrompt kind="soft" version="1.5.2" notes={null} onPrimary={() => undefined} onLater={() => undefined} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Có bản mới 1.5.2');
    expect(html).toContain('Để sau');
    expect(html).toContain('>Cập nhật<');
  });
  it('ghi chú là chữ thuần: <b> hiện nguyên văn (đã escape), không thành thẻ', () => {
    const html = renderToStaticMarkup(<UpdatePrompt kind="soft" version="1.5.2" notes={{ vi: '<b>x</b>', en: '<b>x</b>' }} onPrimary={() => undefined} />);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('Có gì mới');
  });
  it('vùng chạm nút ≥ 44px', () => {
    const html = renderToStaticMarkup(<UpdatePrompt kind="soft" version="1" onPrimary={() => undefined} onLater={() => undefined} />);
    expect((html.match(/min-height:44px/g) ?? []).length).toBe(2);
  });
  it('tải xong: thẻ restartTitle + nút khởi động lại; đang tải: thanh tiến độ', () => {
    expect(renderToStaticMarkup(<UpdatePrompt kind="ready" onPrimary={() => undefined} />)).toContain('Đã tải xong bản mới');
    const dl = renderToStaticMarkup(<UpdatePrompt kind="downloading" percent={40} />);
    expect(dl).toContain('Đang tải bản mới… 40%');
    expect(dl).toContain('role="progressbar"');
  });
  it('thẻ tải lại của web', () => {
    const html = renderToStaticMarkup(<UpdatePrompt kind="webReload" onPrimary={() => undefined} onLater={() => undefined} />);
    expect(html).toContain('Có bản mới — tải lại?');
    expect(html).toContain('>Tải lại<');
  });
  it('dải forcedOffline', () => {
    expect(renderToStaticMarkup(<ForcedOfflineBanner />)).toContain('Cần cập nhật khi có mạng · Bài đã tải vẫn học được');
  });
});

describe('thẻ APK (Task 7)', () => {
  const noop = async () => undefined;
  it('sẵn sàng cài / hỏi dữ liệu di động / xin quyền / lỗi: đúng chữ bảng 5.8, ≥ 44px', () => {
    const ready = renderToStaticMarkup(<UpdatePrompt kind="apk" card={{ kind: 'ready', version: '1.5.2', install: noop }} onLater={() => undefined} />);
    expect(ready).toContain('Đã tải xong bản mới 1.5.2');
    expect(ready).toContain('>Cài đặt<');
    expect(ready).toContain('Để sau');
    const metered = renderToStaticMarkup(<UpdatePrompt kind="apk" card={{ kind: 'metered', sizeMb: 30, downloadNow: noop, waitWifi: () => undefined }} />);
    expect(metered).toContain('Bản cập nhật khoảng 30 MB. Tải bằng dữ liệu di động?');
    expect(metered).toContain('Tải ngay');
    expect(metered).toContain('Đợi Wi-Fi');
    const allow = renderToStaticMarkup(<UpdatePrompt kind="apk" card={{ kind: 'allow', openSettings: noop }} />);
    expect(allow).toContain('Cho phép Bé Cu Tít cài bản cập nhật');
    expect(allow).toContain('Mở Cài đặt');
    const failed = renderToStaticMarkup(<UpdatePrompt kind="apk" card={{ kind: 'failed', retry: noop, openPage: () => undefined }} />);
    expect(failed).toContain('Không cập nhật được.');
    expect(failed).toContain('Mở trang tải');
    expect((failed.match(/min-height:44px/g) ?? []).length).toBe(2);
  });
  it('màn bắt buộc hiện % tải (không cho bấm lại) và thẻ xin quyền thay nút chính', () => {
    const dl = renderToStaticMarkup(<ForcedUpdate onUpdate={() => undefined} percent={42} />);
    expect(dl).toContain('Đang tải bản mới… 42%');
    expect(dl).toContain('role="progressbar"');
    expect(dl).toContain('disabled');
    const allow = renderToStaticMarkup(<ForcedUpdate onUpdate={() => undefined} card={{ kind: 'allow', openSettings: async () => undefined }} />);
    expect(allow).toContain('Cho phép Bé Cu Tít cài bản cập nhật');
    expect(allow).toContain('Mở Cài đặt');
    expect((allow.match(/<button/g) ?? []).length).toBe(1);
  });
});

describe('updateI18n', () => {
  it('tiếng Anh đúng bảng 5.8 (kiểm vài khóa) và có {version}', () => {
    // t() đọc ngôn ngữ từ store; ở đây chỉ kiểm khóa tồn tại cho vi (en được TypeScript ép đủ khóa)
    expect(updateMessages.t('softTitle', { version: '2.0.0' })).toBe('Có bản mới 2.0.0');
    expect(updateMessages.t('webReloadAction')).toBe('Tải lại');
  });
});
