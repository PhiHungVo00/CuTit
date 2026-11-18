import React from 'react';

/** Chạy độc lập để phát triển remote (pnpm --filter @vietlearning/mfe-path dev); Host ghép qua src/index.ts. */
export const App: React.FC = () => (
  <div style={{ padding: '1rem', border: '1px dashed #6366F1', borderRadius: '6px' }}>
    <h4>Remote MFE: mfe-path</h4>
    <p>Lộ trình học · phiên bài học · ôn tập · kiểm tra vượt unit</p>
  </div>
);
