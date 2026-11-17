import React, { useState, useEffect } from 'react';
import { HonorificMatrixScreen, CultureGuideScreen } from '@vietlearning/mfe-knowledge';
import { PitchVisualizerScreen, DialectSwitcherScreen } from '@vietlearning/mfe-speech-lab';
import { ChatCanvasScreen, RoleplaySimulatorScreen } from '@vietlearning/mfe-conversation';
import { AdaptiveDrillScreen, SentenceBuilderScreen } from '@vietlearning/mfe-practice';
import {
  AdaptiveOnboardingScreen,
  AnalyticsSrsScreen,
  AiPreferencesScreen
} from '@vietlearning/mfe-learner';
import { ArCameraSurfaceScreen } from '@vietlearning/mfe-vision';
import { RemoteErrorBoundary } from './components/RemoteErrorBoundary.js';
import {
  publishNav,
  installDevNavLog,
  NavSource
} from './shared/shellBus.js';

export type MainTabType = 'conversation' | 'practice' | 'vision' | 'speech' | 'overview';
export type SubScreenType = 
  | 'm1-chat' 
  | 'm7-roleplay'
  | 'm5-drill' 
  | 'm8-sentence' 
  | 'm3-honorific' 
  | 'm10-culture' 
  | 'm4-vision'
  | 'm2-pitch' 
  | 'm6-dialect'
  | 'm9-analytics'
  | 'm11-onboarding'
  | 'm12-preferences'
  | 'overview';

/** Giao diện sáng/tối của chrome mobile — giống hệt bản web (localStorage 'vlt.skin', mặc định 'dark') */
type SkinMode = 'dark' | 'light';
const SKIN_KEY = 'vlt.skin';
function initialSkin(): SkinMode {
  try {
    return localStorage.getItem(SKIN_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export const App: React.FC = () => {
  const [mainTab, setMainTab] = useState<MainTabType>('conversation');
  const [subScreen, setSubScreen] = useState<SubScreenType>('m1-chat');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [skin, setSkin] = useState<SkinMode>(() => initialSkin());

  // Áp skin lên <html data-skin> + nhớ lựa chọn (đồng bộ cách làm với bản web)
  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try {
      localStorage.setItem(SKIN_KEY, skin);
    } catch {
      /* bỏ qua storage bị chặn */
    }
  }, [skin]);
  const toggleSkin = () => setSkin(s => (s === 'dark' ? 'light' : 'dark'));

  // ---- GoF Observer (14): EventBus do Host cấp, phát sự kiện shell.nav.screen_changed ----
  const screenRef = React.useRef<SubScreenType>('m1-chat');
  const didBootRef = React.useRef<boolean>(false);

  useEffect(() => {
    screenRef.current = subScreen;
  }, [subScreen]);

  // Định tuyến mọi thay đổi màn hình qua 1 cổng duy nhất để phát sự kiện
  const commitScreen = (next: SubScreenType, from: SubScreenType, source: NavSource, mainTab?: MainTabType) => {
    screenRef.current = next;
    setSubScreen(next);
    if (mainTab) setMainTab(mainTab);
    if (from !== next || source === 'url') {
      publishNav({ to: next, from, source, mainTab });
    }
  };

  // Gắn dev-nav-log (nếu DEV) TRƯỚC, rồi mới phát sự kiện khởi động để Observer bắt được
  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (import.meta.env.DEV) {
      unsub = installDevNavLog();
    }
    if (!didBootRef.current) {
      didBootRef.current = true;
      publishNav({ to: 'm1-chat', source: 'programmatic' });
    }
    return unsub;
  }, []);

  // Khi chuyển main tab, gán subScreen tương ứng
  const handleSelectMainTab = (tab: MainTabType, source: NavSource = 'main_tab') => {
    const from = screenRef.current;
    setMainTab(tab);
    let next: SubScreenType = 'm1-chat';
    if (tab === 'conversation') next = 'm1-chat';
    else if (tab === 'practice') next = 'm8-sentence';
    else if (tab === 'vision') next = 'm4-vision';
    else if (tab === 'speech') next = 'm2-pitch';
    else if (tab === 'overview') next = 'm9-analytics';
    commitScreen(next, from, source, tab);
  };

  const handleJumpToScreen = (screen: SubScreenType, source: NavSource = 'programmatic') => {
    const from = screenRef.current;
    setIsDrawerOpen(false);
    if (['m1-chat', 'm7-roleplay'].includes(screen)) commitScreen(screen, from, source, 'conversation');
    else if (['m5-drill', 'm8-sentence', 'm3-honorific', 'm10-culture'].includes(screen)) commitScreen(screen, from, source, 'practice');
    else if (screen === 'm4-vision') commitScreen(screen, from, source, 'vision');
    else if (['m2-pitch', 'm6-dialect'].includes(screen)) commitScreen(screen, from, source, 'speech');
    else commitScreen(screen, from, source, 'overview');
  };

  const handleSelectSubScreen = (screen: SubScreenType) => {
    commitScreen(screen, screenRef.current, 'subtab');
  };

  return (
    <div className="font-['Be_Vietnam_Pro',system-ui,sans-serif] min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--tx)] relative selection:bg-[#e56c5e] selection:text-[#410001]">
      {/* Top Shell Brand Header */}
      <nav className="bg-[var(--bg-elev)] text-[var(--tx)] px-3.5 py-2.5 flex items-center justify-between border-b border-[var(--line-soft)] z-40 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#e56c5e] to-[#f8bc4b] flex items-center justify-center text-sm shadow">
            🇻🇳
          </div>
          <div>
            <div className="font-extrabold text-xs text-[var(--tx-strong)] flex items-center gap-1.5">
              <span>Bé Cu Tít</span>
            </div>
            <div className="text-[10px] text-[var(--tx-muted)]">
              Học Tiếng Việt Thông Minh
            </div>
          </div>
        </div>

        {/* Presentation Drawer Button */}
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-card3)] border border-[var(--line)] hover:border-[var(--amber)] text-xs font-bold text-[var(--amber)] flex items-center gap-1.5 transition-all active:scale-95 shadow"
        >
          <span>📋</span>
          <span>Bài Học</span>
        </button>
      </nav>

      {/* Sub-Tabs for Conversation */}
      {mainTab === 'conversation' && (
        <div className="bg-[var(--bg-card)] px-3 py-1.5 border-b border-[var(--line-soft)] flex gap-1.5 overflow-x-auto no-scrollbar z-30 sticky top-[49px]">
          <button
            onClick={() => handleSelectSubScreen('m1-chat')}
            className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm1-chat'
                ? 'bg-[#e56c5e] text-[#410001] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            💬 Hội Thoại
          </button>
          <button
            onClick={() => handleSelectSubScreen('m7-roleplay')}
            className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm7-roleplay'
                ? 'bg-[#f8bc4b] text-[#220e07] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            🎭 Nhập Vai
          </button>
        </div>
      )}

      {/* Sub-Tabs for Practice */}
      {mainTab === 'practice' && (
        <div className="bg-[var(--bg-card)] px-3 py-1.5 border-b border-[var(--line-soft)] flex gap-1.5 overflow-x-auto no-scrollbar z-30 sticky top-[49px]">
          <button
            onClick={() => handleSelectSubScreen('m8-sentence')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm8-sentence'
                ? 'bg-[#e56c5e] text-[#410001] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            🎋 Ghép Câu
          </button>
          <button
            onClick={() => handleSelectSubScreen('m5-drill')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm5-drill'
                ? 'bg-[#f8bc4b] text-[#220e07] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            🎯 Luyện Tập
          </button>
          <button
            onClick={() => handleSelectSubScreen('m3-honorific')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm3-honorific'
                ? 'bg-[#b45309] text-[#fef3c7] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            🏮 Xưng Hô
          </button>
          <button
            onClick={() => handleSelectSubScreen('m10-culture')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm10-culture'
                ? 'bg-[#c2410c] text-[#ffedd5] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            📜 Văn Hóa
          </button>
        </div>
      )}

      {/* Sub-Tabs for Speech */}
      {mainTab === 'speech' && (
        <div className="bg-[var(--bg-card)] px-3 py-1.5 border-b border-[var(--line-soft)] flex gap-1.5 overflow-x-auto no-scrollbar z-30 sticky top-[49px]">
          <button
            onClick={() => handleSelectSubScreen('m2-pitch')}
            className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm2-pitch'
                ? 'bg-[#e56c5e] text-[#410001] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            🎵 Thanh Điệu
          </button>
          <button
            onClick={() => handleSelectSubScreen('m6-dialect')}
            className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm6-dialect'
                ? 'bg-[#f8bc4b] text-[#220e07] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            🚂 Phương Ngữ
          </button>
        </div>
      )}

      {/* Sub-Tabs for Overview / Profile */}
      {mainTab === 'overview' && (
        <div className="bg-[var(--bg-card)] px-3 py-1.5 border-b border-[var(--line-soft)] flex gap-1.5 overflow-x-auto no-scrollbar z-30 sticky top-[49px]">
          <button
            onClick={() => handleSelectSubScreen('m9-analytics')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm9-analytics'
                ? 'bg-[#e56c5e] text-[#410001] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            📊 Tiến Trình
          </button>
          <button
            onClick={() => handleSelectSubScreen('m11-onboarding')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm11-onboarding'
                ? 'bg-[#f8bc4b] text-[#220e07] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            🧭 Xếp Lớp
          </button>
          <button
            onClick={() => handleSelectSubScreen('m12-preferences')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'm12-preferences'
                ? 'bg-[#38bdf8] text-[#082f49] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            ⚙️ Cài Đặt
          </button>
          <button
            onClick={() => handleSelectSubScreen('overview')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              subScreen === 'overview'
                ? 'bg-[#4ade80] text-[#052e16] shadow'
                : 'bg-[var(--bg-card3)] text-[var(--tx-muted)]'
            }`}
          >
            🏠 Tất Cả Hoạt Động
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* OVERVIEW SCREEN */}
        {subScreen === 'overview' && (
          <div className="p-4 max-w-md mx-auto flex flex-col gap-4 text-[var(--tx)]">
            <header className="p-4 rounded-2xl bg-gradient-to-br from-[var(--bg-card3)] to-[var(--bg-card4)] border border-[var(--line)]">
              <div className="text-xs text-[var(--ok)] font-bold uppercase tracking-wider mb-1">
                Cùng Bé Học Nói Tiếng Việt
              </div>
              <h1 className="text-lg font-black text-[var(--tx-strong)]">
                Học Tiếng Việt Cùng Bé Cu Tít
              </h1>
              <p className="text-xs text-[var(--tx-muted)] mt-1 leading-relaxed">
               Ôn tập, nói chuyện, luyện thanh điệu và khám phá văn hóa — 12 hoạt activité
 cho bé, chọn một hoạt động bên dưới để bắt đầu.
              </p>
            </header>

            {/* Quick Screen Launch Grid */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[var(--tx-soft)] uppercase tracking-wider">
                Chọn một hoạt động:
              </div>

              {[
                { id: 'm1-chat', icon: '💬', title: 'Hội Thoại cùng Cu Tít', desc: 'Nhắn tin hoặc nói chuyện — Cu Tít trả lời ngay' },
                { id: 'm7-roleplay', icon: '🎭', title: 'Nhập Vai', desc: 'Giao tiếp trong chợ, quán phở, taxi và ngày Tết' },
                { id: 'm8-sentence', icon: '🎋', title: 'Ghép Câu', desc: 'Kéo chữ xếp thành câu đúng trật tự' },
                { id: 'm5-drill', icon: '🎯', title: 'Luyện Tập', desc: 'Bài tập tự tăng độ khó theo trình độ của bé' },
                { id: 'm3-honorific', icon: '🏮', title: 'Xưng Hô', desc: '20 cặp xưng hô chuẩn mực cho từng quan hệ' },
                { id: 'm10-culture', icon: '📜', title: 'Văn Hóa', desc: 'Điều nên và không nên, đố vui cùng Cu Tít' },
                { id: 'm4-vision', icon: '📷', title: 'AR Camera', desc: 'Dán nhãn đồ vật văn hóa khi bé chỉ camera vào' },
                { id: 'm2-pitch', icon: '🎵', title: 'Thanh Điệu', desc: 'Tập 6 thanh điệu theo đồ thị trực quan' },
                { id: 'm6-dialect', icon: '🚂', title: 'Phương Ngữ', desc: 'Nghe và bắt chước giọng Bắc – Trung – Nam' },
                { id: 'm9-analytics', icon: '📊', title: 'Tiến Trình', desc: 'Lộ trình học hằng ngày và kho từ vựng của bé' },
                { id: 'm11-onboarding', icon: '🧭', title: 'Xếp Lớp', desc: 'Vài câu hỏi nhẹ nhàng, đặt đúng cấp độ cho bé' },
                { id: 'm12-preferences', icon: '⚙️', title: 'Cài Đặt Trợ Lý', desc: 'Chọn giọng đọc và tính cách của trợ lý cho bé' }
              ].map(screen => (
                <div
                  key={screen.id}
                  onClick={() => handleJumpToScreen(screen.id as SubScreenType, 'card')}
                  className="p-3 rounded-xl bg-[var(--bg-card2)] border border-[var(--line)] hover:border-[var(--coral)] cursor-pointer flex items-center justify-between transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{screen.icon}</span>
                    <div>
                      <div className="text-xs font-bold text-[var(--tx-strong)]">{screen.title}</div>
                      <div className="text-[10px] text-[var(--tx-muted)]">{screen.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SCREEN M1: CHAT CANVAS */}
        {subScreen === 'm1-chat' && (
          <RemoteErrorBoundary remoteName="M1: Khung Hội Thoại (@vietlearning/mfe-conversation)" key={`m1-${skin}`}>
            <ChatCanvasScreen
              initialTheme={skin}
              onNavigateTab={(tab: string) => {
                if (tab === 'pitch') handleJumpToScreen('m2-pitch');
                else if (tab === 'honorifics') handleJumpToScreen('m3-honorific');
                else if (tab === 'dialect') handleJumpToScreen('m6-dialect');
              }}
              onBack={() => handleSelectMainTab('overview', 'programmatic')}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M7: ROLEPLAY SIMULATOR */}
        {subScreen === 'm7-roleplay' && (
          <RemoteErrorBoundary remoteName="M7: Nhập Vai 4 Bối Cảnh (@vietlearning/mfe-conversation)" key={`m7-${skin}`}>
            <RoleplaySimulatorScreen
              initialTheme={skin}
              onBack={() => handleSelectMainTab('conversation')}
              onNavigateTab={(tab: string) => {
                if (tab === 'practice') handleJumpToScreen('m5-drill');
              }}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M8: SENTENCE BUILDER */}
        {subScreen === 'm8-sentence' && (
          <RemoteErrorBoundary remoteName="M8: Ghép Câu Đốt Tre (@vietlearning/mfe-practice)" key={`m8-${skin}`}>
            <SentenceBuilderScreen
              initialTheme={skin}
              onBack={() => handleSelectMainTab('overview', 'programmatic')}
              onNavigateTab={(tab: string) => {
                if (tab === 'drill') handleSelectSubScreen('m5-drill');
              }}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M5: ADAPTIVE DRILLS */}
        {subScreen === 'm5-drill' && (
          <RemoteErrorBoundary remoteName="M5: Bài Tập Thích Ứng (@vietlearning/mfe-practice)" key={`m5-${skin}`}>
            <AdaptiveDrillScreen
              initialTheme={skin}
              onBack={() => handleSelectMainTab('overview', 'programmatic')}
              onNavigateTab={(tab: string) => {
                if (tab === 'sentence') handleSelectSubScreen('m8-sentence');
              }}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M3: HONORIFIC MATRIX */}
        {subScreen === 'm3-honorific' && (
          <RemoteErrorBoundary remoteName="M3: Ma Trận Xưng Hô (@vietlearning/mfe-knowledge)" key={`m3-${skin}`}>
            <HonorificMatrixScreen
              initialTheme={skin}
              onBack={() => handleJumpToScreen('overview', 'programmatic')}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M10: CULTURE GUIDE */}
        {subScreen === 'm10-culture' && (
          <RemoteErrorBoundary remoteName="M10: Sổ Tay Văn Hóa (@vietlearning/mfe-knowledge)" key={`m10-${skin}`}>
            <CultureGuideScreen
              initialTheme={skin}
              onBack={() => handleSelectMainTab('overview', 'programmatic')}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M4: AR CAMERA SURFACE */}
        {subScreen === 'm4-vision' && (
          <RemoteErrorBoundary remoteName="M4: AR Camera Surface (@vietlearning/mfe-vision)" key={`m4-${skin}`}>
            <ArCameraSurfaceScreen
              initialTheme={skin}
              onBack={() => handleSelectMainTab('overview', 'programmatic')}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M2: PITCH VISUALIZER */}
        {subScreen === 'm2-pitch' && (
          <RemoteErrorBoundary remoteName="M2: Luyện Cao Độ F0 (@vietlearning/mfe-speech-lab)" key={`m2-${skin}`}>
            <PitchVisualizerScreen
              initialTheme={skin}
              onBack={() => handleSelectMainTab('overview', 'programmatic')}
              onNavigateTab={(tab: string) => {
                if (tab === 'conversation') handleJumpToScreen('m1-chat');
                else if (tab === 'honorifics') handleJumpToScreen('m3-honorific');
                else if (tab === 'dialect') handleJumpToScreen('m6-dialect');
              }}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M6: DIALECT SWITCHER */}
        {subScreen === 'm6-dialect' && (
          <RemoteErrorBoundary remoteName="M6: Phương Ngữ 3 Miền (@vietlearning/mfe-speech-lab)" key={`m6-${skin}`}>
            <DialectSwitcherScreen
              initialTheme={skin}
              onBack={() => handleSelectMainTab('overview', 'programmatic')}
              onNavigateTab={(tab: string) => {
                if (tab === 'conversation') handleJumpToScreen('m1-chat');
                else if (tab === 'honorifics') handleJumpToScreen('m3-honorific');
                else if (tab === 'pitch') handleJumpToScreen('m2-pitch');
              }}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M9: ANALYTICS & SRS */}
        {subScreen === 'm9-analytics' && (
          <RemoteErrorBoundary remoteName="M9: Thống Kê & SRS (@vietlearning/mfe-learner)" key={`m9-${skin}`}>
            <AnalyticsSrsScreen
              initialTheme={skin}
              onBack={() => handleJumpToScreen('overview', 'programmatic')}
              onNavigateTab={(tab: string) => {
                if (tab === 'practice') handleJumpToScreen('m5-drill');
                else if (tab === 'sentence') handleJumpToScreen('m8-sentence');
              }}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M11: ADAPTIVE ONBOARDING (A5) */}
        {subScreen === 'm11-onboarding' && (
          <RemoteErrorBoundary remoteName="M11: Xếp Lớp Thích Ứng (@vietlearning/mfe-learner)" key={`m11-${skin}`}>
            <AdaptiveOnboardingScreen
              initialTheme={skin}
              onBack={() => handleJumpToScreen('overview', 'programmatic')}
              onComplete={(result) => {
                handleJumpToScreen('m9-analytics');
              }}
              onNavigateTab={(tab: string) => {
                if (tab === 'practice') handleJumpToScreen('m5-drill');
                else if (tab === 'chat') handleJumpToScreen('m1-chat');
              }}
            />
          </RemoteErrorBoundary>
        )}

        {/* SCREEN M12: AI PREFERENCES */}
        {subScreen === 'm12-preferences' && (
          <>
            {/* Card Chế Độ Hiển Thị — shell-owned, đưa chọn sáng/tối vào màn Cài Đặt (thay nút topbar) */}
            <div className="max-w-md mx-auto w-full px-3 pt-3">
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card3)] p-3 shadow flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--tx-strong)]">Chế độ hiển thị</div>
                  <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">Áp dụng cho toàn bộ ứng dụng</div>
                </div>
                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[var(--bg-card)] border border-[var(--line-soft)] shrink-0">
                  <button
                    onClick={() => setSkin('dark')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      skin === 'dark' ? 'bg-[var(--bg-raised)] text-[var(--amber)]' : 'text-[var(--tx-muted)]'
                    }`}
                  >
                    🌙 Tối
                  </button>
                  <button
                    onClick={() => setSkin('light')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      skin === 'light' ? 'bg-[var(--bg-raised)] text-[var(--amber)]' : 'text-[var(--tx-muted)]'
                    }`}
                  >
                    ☀️ Sáng
                  </button>
                </div>
              </div>
            </div>
            <RemoteErrorBoundary remoteName="M12: Cài Đặt AI (@vietlearning/mfe-learner)" key={`m12-${skin}`}>
              <AiPreferencesScreen
                initialTheme={skin}
                onBack={() => handleJumpToScreen('overview', 'programmatic')}
                onNavigateTab={(tab: string) => {
                  if (tab === 'chat') handleJumpToScreen('m1-chat');
                }}
              />
            </RemoteErrorBoundary>
          </>
        )}
      </main>

      {/* 5 Bottom Navigation Bar Tabs (Per User Alignment) */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[var(--bg-elev)] backdrop-blur-md border-t border-[var(--line-soft)] px-2 py-1.5 z-40">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
          <button
            onClick={() => handleSelectMainTab('conversation')}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
              mainTab === 'conversation'
                ? 'text-[var(--coral)] font-black'
                : 'text-[var(--tx-muted)] hover:text-[var(--tx-strong)]'
            }`}
          >
            <span className="text-base">💬</span>
            <span className="text-[10px]">Hội thoại</span>
          </button>

          <button
            onClick={() => handleSelectMainTab('practice')}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
              mainTab === 'practice'
                ? 'text-[var(--amber)] font-black'
                : 'text-[var(--tx-muted)] hover:text-[var(--tx-strong)]'
            }`}
          >
            <span className="text-base">🎋</span>
            <span className="text-[10px]">Luyện tập</span>
          </button>

          {/* DEDICATED CENTER TAB FOR AR CAMERA (M4) */}
          <button
            onClick={() => handleSelectMainTab('vision')}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
              mainTab === 'vision'
                ? 'text-[var(--ok)] font-black'
                : 'text-[var(--tx-muted)] hover:text-[var(--tx-strong)]'
            }`}
          >
            <span className="text-base">📷</span>
            <span className="text-[10px]">AR Camera</span>
          </button>

          <button
            onClick={() => handleSelectMainTab('speech')}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
              mainTab === 'speech'
                ? 'text-[var(--coral)] font-black'
                : 'text-[var(--tx-muted)] hover:text-[var(--tx-strong)]'
            }`}
          >
            <span className="text-base">🎙️</span>
            <span className="text-[10px]">Ngữ âm</span>
          </button>

          <button
            onClick={() => handleSelectMainTab('overview')}
            className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
              mainTab === 'overview'
                ? 'text-[var(--sky)] font-black'
                : 'text-[var(--tx-muted)] hover:text-[var(--tx-strong)]'
            }`}
          >
            <span className="text-base">👤</span>
            <span className="text-[10px]">Hồ sơ</span>
          </button>
        </div>
      </footer>

      {/* Presentation Drawer Overlay - 12/12 Screens Full List */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-80 max-w-[85vw] h-full bg-[var(--bg-page)] border-l border-[var(--line-soft)] flex flex-col p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--line-soft)] mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🇻🇳</span>
                <div>
                  <h3 className="text-xs font-bold text-[var(--tx-strong)]">Mục Lục Bài Học</h3>
                  <p className="text-[10px] text-[var(--ok)] font-bold">12 hoạt động cho bé</p>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="w-7 h-7 rounded-full bg-[var(--bg-card3)] border border-[var(--line)] text-xs text-[var(--tx-muted)] hover:text-[var(--tx-strong)] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
              <div className="text-[10px] font-bold text-[var(--amber)] uppercase tracking-wider">
                Chọn một hoạt động:
              </div>

              {[
                { id: 'm1-chat', name: 'Hội Thoại cùng Cu Tít', icon: '💬' },
                { id: 'm7-roleplay', name: 'Nhập Vai', icon: '🎭' },
                { id: 'm8-sentence', name: 'Ghép Câu', icon: '🎋' },
                { id: 'm5-drill', name: 'Luyện Tập', icon: '🎯' },
                { id: 'm3-honorific', name: 'Xưng Hô', icon: '🏮' },
                { id: 'm10-culture', name: 'Văn Hóa', icon: '📜' },
                { id: 'm4-vision', name: 'AR Camera', icon: '📷' },
                { id: 'm2-pitch', name: 'Thanh Điệu', icon: '🎵' },
                { id: 'm6-dialect', name: 'Phương Ngữ', icon: '🚂' },
                { id: 'm9-analytics', name: 'Tiến Trình', icon: '📊' },
                { id: 'm11-onboarding', name: 'Xếp Lớp', icon: '🧭' },
                { id: 'm12-preferences', name: 'Cài Đặt Trợ Lý', icon: '⚙️' }
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => handleJumpToScreen(item.id as SubScreenType, 'drawer')}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                    subScreen === item.id
                      ? 'bg-[var(--bg-raised)] border-[var(--amber)] text-[var(--tx-strong)] font-bold'
                      : 'bg-[var(--bg-card)] border-[var(--line)] text-[var(--tx-muted)] hover:text-[var(--tx-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{item.icon}</span>
                    <span className="truncate">{item.name}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-[var(--line-soft)] text-[10px] text-[var(--tx-muted)] text-center">
              Học Tiếng Việt Cùng Bé Cu Tít
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
