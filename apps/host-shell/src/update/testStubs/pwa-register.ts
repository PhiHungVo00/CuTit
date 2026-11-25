// Chỉ dùng cho Vitest: 'virtual:pwa-register' do vite-plugin-pwa sinh lúc build; test luôn vi.mock module này.
export function registerSW(): (reload?: boolean) => Promise<void> {
  throw new Error('virtual:pwa-register chỉ có trong bản build — hãy vi.mock trong test');
}
