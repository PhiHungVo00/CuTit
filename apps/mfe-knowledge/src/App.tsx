import React, { useState } from 'react';
import { HonorificMatrixScreen } from './components/HonorificMatrixScreen';
import { MobileSimulatorFrame } from './components/MobileSimulatorFrame';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  return (
    <MobileSimulatorFrame
      initialDevice="iphone"
      currentTheme={theme}
      onThemeToggle={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
    >
      <HonorificMatrixScreen
        key={theme}
        initialTheme={theme}
      />
    </MobileSimulatorFrame>
  );
};

export default App;
