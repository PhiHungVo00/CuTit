/**
 * Cấu hình Gateway dùng chung (subpath `@vietlearning/api-client/config`).
 * Tách khỏi index để Host gọi configureGateway() lúc khởi động mà không kéo cả client vào gói đầu (R10).
 * `index.ts` re-export các hàm này => API cũ giữ nguyên, và chỉ có MỘT bản trạng thái `config`.
 */
/** Kho khóa–giá trị bất đồng bộ (Capacitor Preferences trên app, localStorage trên web) */
export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

interface GatewayConfig {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  /** Gọi khi Gateway trả 401: làm mới phiên; true => gửi lại request đúng MỘT lần */
  onUnauthorized?: () => Promise<boolean>;
  /** Nơi lưu phiên đăng nhập (refresh token, mã khôi phục). Bỏ trống => localStorage */
  storage?: KeyValue;
  timeoutMs: number;
}

let config: GatewayConfig = { baseUrl: 'http://localhost:4000', timeoutMs: 15000 };

export function configureGateway(next: Partial<GatewayConfig>): void {
  config = { ...config, ...next, baseUrl: (next.baseUrl ?? config.baseUrl).replace(/\/$/, '') };
}

export function gatewayBaseUrl(): string {
  return config.baseUrl;
}

/** Kho phiên do Host cấp (undefined => phiên dùng localStorage) */
export function gatewayStorage(): KeyValue | undefined {
  return config.storage;
}

/** Dùng nội bộ trong client */
export function gatewayConfig(): Readonly<GatewayConfig> {
  return config;
}
