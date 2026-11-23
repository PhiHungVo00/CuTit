import { useState } from 'react';
import { HonorificMatrixScreen } from './components/HonorificMatrixScreen';
import { MobileSimulatorFrame } from './components/MobileSimulatorFrame';
import type { Theme } from './components/honorific/options';

/** Trang demo độc lập của remote (chạy `pnpm --filter @vietlearning/mfe-knowledge dev`). */
export const App = () => {
  const [theme, setTheme] = useState<Theme>('dark');

  return (
    <MobileSimulatorFrame
      initialDevice="iphone"
      currentTheme={theme}
      onThemeToggle={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
    >
      {/* Theme được điều khiển từ ngoài: không cần key={theme} => không remount, không mất lựa chọn */}
      <HonorificMatrixScreen theme={theme} onThemeChange={setTheme} />
    </MobileSimulatorFrame>
  );
};

export default App;
