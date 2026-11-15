/**
 * Ép Nguyên tắc 7 (Độc lập triển khai) khi ghép MFE lúc build thay cho Module Federation runtime.
 * Chạy: pnpm lint:boundaries
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-remote-imports',
      comment: 'Một remote MFE không được import remote khác. Giao tiếp qua URL, Event Bus hoặc state do Host cấp.',
      severity: 'error',
      from: { path: '^apps/mfe-([^/]+)/' },
      to: {
        path: ['^apps/mfe-([^/]+)/', 'node_modules/@vietlearning/mfe-([^/]+)'],
        pathNot: ['^apps/mfe-$1/', 'node_modules/@vietlearning/mfe-$1(/|$)']
      }
    },
    {
      name: 'host-uses-public-entry-only',
      comment: 'Host chỉ import điểm vào công khai (src/index.ts) của remote, không đi sâu vào file nội bộ.',
      severity: 'error',
      from: { path: '^apps/host-shell/' },
      to: {
        path: '^apps/mfe-[^/]+/src/',
        pathNot: '^apps/mfe-[^/]+/src/index\\.ts$'
      }
    },
    {
      name: 'packages-do-not-import-apps',
      comment: 'Thư viện dùng chung không được phụ thuộc vào ứng dụng.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' }
    },
    {
      name: 'client-does-not-import-gateway',
      comment: 'Client mỏng: không kéo mã server (và secret) vào bundle trình duyệt.',
      severity: 'error',
      from: { path: '^apps/(host-shell|mfe-[^/]+)/' },
      to: { path: '^apps/gateway/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    preserveSymlinks: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['main', 'types']
    }
  }
};
