import React, { useState } from 'react';
import { AdaptiveDrillScreen } from './components/AdaptiveDrillScreen.js';
import { SentenceBuilderScreen } from './components/SentenceBuilderScreen.js';

export const App: React.FC = () => {
  const [tab, setTab] = useState<'m5-drill' | 'm8-sentence'>('m8-sentence');

  return (
    <div className="min-h-screen bg-[#190a05]">
      {/* Standalone dev switcher bar */}
      <div className="bg-[#120703] border-b border-[#3b1a10] px-4 py-2 flex items-center justify-between text-xs text-[#cca79b]">
        <div className="font-bold flex items-center gap-1.5 text-white">
          <span>🎋</span>
          <span>Remote: mfe-practice (Port 3005)</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('m8-sentence')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              tab === 'm8-sentence'
                ? 'bg-[#e56c5e] text-[#410001]'
                : 'bg-[#2a130c] text-[#cca79b]'
            }`}
          >
            M8: Đốt Tre A8
          </button>
          <button
            onClick={() => setTab('m5-drill')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              tab === 'm5-drill'
                ? 'bg-[#f8bc4b] text-[#220e07]'
                : 'bg-[#2a130c] text-[#cca79b]'
            }`}
          >
            M5: Bài Tập SRS
          </button>
        </div>
      </div>

      {tab === 'm8-sentence' ? (
        <SentenceBuilderScreen onNavigateTab={(t) => t === 'drill' && setTab('m5-drill')} />
      ) : (
        <AdaptiveDrillScreen onNavigateTab={(t) => t === 'sentence' && setTab('m8-sentence')} />
      )}
    </div>
  );
};

export default App;
