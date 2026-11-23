/**
 * Ép Nguyên tắc 7 (Độc lập triển khai) khi ghép MFE lúc build thay cho Module Federation runtime.
 * Chạy: pnpm lint:boundaries
 *
 * Mã nguồn chia 4 thư mục sở hữu (01-nen-tang … 04-am-thanh-tri-thuc), mỗi thư mục có apps/ và packages/.
 * OWNER = tiền tố thư mục sở hữu; các luật cũ giữ nguyên ý nghĩa, chỉ đổi đường dẫn.
 */
const OWNER = '^0\\d-[^/]+/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-remote-imports',
      comment: 'Một remote MFE không được import remote khác. Giao tiếp qua URL, Event Bus hoặc state do Host cấp.',
      severity: 'error',
      from: { path: OWNER + 'apps/mfe-([^/]+)/' },
      to: {
        path: [OWNER + 'apps/mfe-([^/]+)/', 'node_modules/@vietlearning/mfe-([^/]+)'],
        pathNot: [OWNER + 'apps/mfe-$1/', 'node_modules/@vietlearning/mfe-$1(/|$)']
      }
    },
    {
      name: 'host-uses-public-entry-only',
      comment: 'Host chỉ import điểm vào công khai (src/index.ts) của remote, không đi sâu vào file nội bộ.',
      severity: 'error',
      from: { path: OWNER + 'apps/host-shell/' },
      to: {
        path: OWNER + 'apps/mfe-[^/]+/src/',
        pathNot: OWNER + 'apps/mfe-[^/]+/src/index\\.ts$'
      }
    },
    {
      name: 'packages-do-not-import-apps',
      comment: 'Thư viện dùng chung không được phụ thuộc vào ứng dụng.',
      severity: 'error',
      from: { path: OWNER + 'packages/' },
      to: { path: OWNER + 'apps/' }
    },
    {
      name: 'client-does-not-import-gateway',
      comment: 'Client mỏng: không kéo mã server (và secret) vào bundle trình duyệt.',
      severity: 'error',
      from: { path: OWNER + 'apps/(host-shell|mfe-[^/]+)/' },
      to: { path: OWNER + 'apps/gateway/' }
    },
    {
      name: 'owner-dir-only-depends-on-foundation',
      comment:
        'Thư mục 02-/03-/04- chỉ được phụ thuộc vào chính nó và 01-nen-tang (gói lõi ui/state/contracts/api-client/native/shared). ' +
        'Ngoại lệ có chủ đích (cho vào pathNot bên dưới, ghi ở docs/CAU-TRUC-4-THU-MUC.md): gói nội dung dùng chung ' +
        '04-…/packages/content và 03-…/packages/exercises.',
      severity: 'error',
      from: { path: '^(0[234]-[^/]+)/' },
      to: {
        path: '^0[234]-[^/]+/',
        pathNot: ['^$1/', '^04-am-thanh-tri-thuc/packages/content/', '^03-hoc-tap/packages/exercises/']
      }
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
