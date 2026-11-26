/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Gốc URL Gateway, đặt LÚC BUILD (không phải khóa bí mật). Mặc định http://localhost:4000 */
  readonly VITE_GATEWAY_URL?: string;
}
