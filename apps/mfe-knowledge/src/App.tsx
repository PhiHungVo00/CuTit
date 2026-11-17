import React, { useState } from 'react';
import { HonorificMatrixScreen } from './components/HonorificMatrixScreen.js';
import { CultureGuideScreen } from './components/CultureGuideScreen.js';

export const App: React.FC = () => {
  const [tab, setTab] = useState<'m3-honorific' | 'm10-culture'>('m10-culture');

  return (
    <div className="min-h-screen bg-[#190a05]">
      {/* Standalone dev switcher bar */}
      <div className="bg-[#120703] border-b border-[#3b1a10] px-4 py-2 flex items-center justify-between text-xs text-[#cca79b]">
        <div className="font-bold flex items-center gap-1.5 text-white">
          <span>🏮</span>
          <span>Remote: mfe-knowledge (Port 3004)</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('m3-honorific')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              tab === 'm3-honorific'
                ? 'bg-[#B45309] text-[#FEF3C7]'
                : 'bg-[#2a130c] text-[#cca79b]'
            }`}
          >
            M3: Xưng Hô A6
          </button>
          <button
            onClick={() => setTab('m10-culture')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              tab === 'm10-culture'
                ? 'bg-[#f8bc4b] text-[#220e07]'
                : 'bg-[#2a130c] text-[#cca79b]'
            }`}
          >
            M10: Văn Hóa 20 Thẻ
          </button>
        </div>
      </div>

      {tab === 'm3-honorific' ? (
        <HonorificMatrixScreen initialTheme="dark" onNavigateTab={(t: string) => t === 'culture' && setTab('m10-culture')} />
      ) : (
        <CultureGuideScreen initialTheme="dark" onNavigateTab={(t: string) => t === 'honorific' && setTab('m3-honorific')} />
      )}
    </div>
  );
};

export default App;
