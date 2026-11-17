import React, { useState } from 'react';
import { AdaptiveOnboardingScreen } from './components/AdaptiveOnboardingScreen.js';
import { AnalyticsSrsScreen } from './components/AnalyticsSrsScreen.js';
import { AiPreferencesScreen } from './components/AiPreferencesScreen.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'onboarding' | 'analytics' | 'preferences'>('analytics');

  return (
    <div className="min-h-screen bg-[#1a0a05] text-[#ffb4aa]">
      {/* Top Standalone Switcher */}
      <div className="max-w-md mx-auto p-2 bg-[#220e07] border-b border-[#e56c5e]/30 flex gap-1">
        <button
          onClick={() => setActiveTab('onboarding')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'onboarding'
              ? 'bg-[#e56c5e] text-white'
              : 'bg-black/20 text-white/70 hover:bg-black/40'
          }`}
        >
          M11 Khảo Sát A5
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'analytics'
              ? 'bg-[#e56c5e] text-white'
              : 'bg-black/20 text-white/70 hover:bg-black/40'
          }`}
        >
          M9 Tiến Trình SRS
        </button>
        <button
          onClick={() => setActiveTab('preferences')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'preferences'
              ? 'bg-[#e56c5e] text-white'
              : 'bg-black/20 text-white/70 hover:bg-black/40'
          }`}
        >
          M12 Cài Đặt AI
        </button>
      </div>

      {activeTab === 'onboarding' && <AdaptiveOnboardingScreen />}
      {activeTab === 'analytics' && <AnalyticsSrsScreen />}
      {activeTab === 'preferences' && <AiPreferencesScreen />}
    </div>
  );
};
export default App;
