import React, { useState } from 'react';
import { PitchVisualizerScreen } from './components/PitchVisualizerScreen';
import { DialectSwitcherScreen } from './components/DialectSwitcherScreen';

export interface AppProps {
  initialScreen?: 'm2-pitch' | 'm6-dialect';
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const App: React.FC<AppProps> = ({
  initialScreen = 'm2-pitch',
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [activeScreen, setActiveScreen] = useState<'m2-pitch' | 'm6-dialect'>(initialScreen);

  return (
    <div className="w-full min-h-screen relative font-sans">
      {/* Top Mobile Sub-Navigation Bar for Speech Lab Modules */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 max-w-md w-full z-40 px-4 py-1.5 bg-[#1c0904]/95 backdrop-blur border-b border-[#3c241b] flex items-center justify-center">
        <div className="w-full flex p-1 bg-[#301a12] rounded-xl shadow-inner gap-1">
          <button
            onClick={() => setActiveScreen('m2-pitch')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeScreen === 'm2-pitch'
                ? 'bg-[#e56c5e] text-[#5a0304] shadow-[0_2px_0_#5a0304]'
                : 'text-[#dec0bc] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">graphic_eq</span>
            <span>🎵 Luyện Cao Độ M2</span>
          </button>

          <button
            onClick={() => setActiveScreen('m6-dialect')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              activeScreen === 'm6-dialect'
                ? 'bg-[#f8bc4b] text-[#271900] shadow-[0_2px_0_#bc8714]'
                : 'text-[#dec0bc] hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">train</span>
            <span>🚂 Phương Ngữ 3 Miền M6</span>
          </button>
        </div>
      </div>

      {/* Screen Render */}
      <div className="pt-8">
        {activeScreen === 'm2-pitch' ? (
          <PitchVisualizerScreen
            initialTheme={initialTheme}
            onBack={onBack}
            onNavigateTab={onNavigateTab}
          />
        ) : (
          <DialectSwitcherScreen
            initialTheme={initialTheme}
            onBack={onBack}
            onNavigateTab={onNavigateTab}
          />
        )}
      </div>
    </div>
  );
};

export default App;
