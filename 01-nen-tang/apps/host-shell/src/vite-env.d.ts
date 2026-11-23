/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** `version` của apps/host-shell/package.json (vite.config.ts → define) */
  readonly VITE_APP_VERSION: string;
  /** Số build suy từ version, dạng chuỗi: x·1 000 000 + y·1 000 + z */
  readonly VITE_APP_BUILD: string;
}
