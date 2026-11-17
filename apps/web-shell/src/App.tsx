import React, { useCallback, useEffect, useState } from 'react';
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
  ALL_SCREEN_META,
  NAV_GROUPS,
  NavGroup,
  SubScreenType,
  groupOfScreen
} from './theme.js';
import {
  publishNav,
  installDevNavLog,
  NavSource
} from './shared/shellBus.js';

const VALID_SCREENS: SubScreenType[] = ['overview', ...ALL_SCREEN_META.map(i => i.id)];

/** Giao diện sáng/tối của chrome web — lưu lựa chọn vào localStorage (vứt đổi theo 'dark' mặc định như mobile) */
type SkinMode = 'dark' | 'light';
const SKIN_KEY = 'vlt.skin';
function initialSkin(): SkinMode {
  try {
    return localStorage.getItem(SKIN_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function screenFromHash(): SubScreenType {
  const raw = window.location.hash.replace(/^#\/?/, '') as SubScreenType;
  return VALID_SCREENS.includes(raw) ? raw : 'overview';
}

export const App: React.FC = () => {
  const [subScreen, setSubScreen] = useState<SubScreenType>(() => screenFromHash());
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [skin, setSkin] = useState<SkinMode>(() => initialSkin());

  // Áp skin lên <html data-skin> + nhớ lựa chọn
  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try {
      localStorage.setItem(SKIN_KEY, skin);
    } catch {
      /* bỏ qua storage bị chặn */
    }
  }, [skin]);
  const toggleSkin = () => setSkin(s => (s === 'dark' ? 'light' : 'dark'));

  // ---- GoF Observer (14): mọi điều hướng phát sự kiện qua EventBus do Host cấp ----
  const subRef = React.useRef<SubScreenType>(subScreen);
  const didBootRef = React.useRef<boolean>(false);

  // Đồng bộ ref với state (dùng làm "from" của sự kiện)
  useEffect(() => {
    subRef.current = subScreen;
  }, [subScreen]);

  useEffect(() => {
    const onHashChange = () => {
      const next = screenFromHash();
      if (next === subRef.current) return;
      publishNav({ to: next, from: subRef.current, source: 'url' });
      subRef.current = next;
      setSubScreen(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Gắn dev-nav-log (nếu DEV) TRƯỚC, rồi mới phát sự kiện khởi động để Observer bắt được
  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (import.meta.env.DEV) {
      unsub = installDevNavLog();
    }
    if (!didBootRef.current) {
      didBootRef.current = true;
      publishNav({ to: subRef.current, source: 'programmatic' });
    }
    return unsub;
  }, []);

  useEffect(() => {
    const desired = subScreen === 'overview' ? '#/' : `#/${subScreen}`;
    if (window.location.hash !== desired) window.history.replaceState(null, '', desired);
  }, [subScreen]);

  const go = useCallback((screen: SubScreenType, source: NavSource = 'programmatic') => {
    const from = subRef.current;
    setSubScreen(screen);
    setIsDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (from !== screen || source === 'url') {
      publishNav({ to: screen, from, source });
    }
  }, []);

  const activeGroup = groupOfScreen(subScreen);
  const activeMeta = subScreen === 'overview' ? null : ALL_SCREEN_META.find(i => i.id === subScreen);
  // Màn "tiếp theo cho bé": quay vòng danh sách 12 hoạt động — dữ liệu thật từ bảng điều hướng
  const nextMeta =
    subScreen === 'overview'
      ? ALL_SCREEN_META[0]
      : (() => {
          const idx = ALL_SCREEN_META.findIndex(i => i.id === subScreen);
          return ALL_SCREEN_META[(idx + 1) % ALL_SCREEN_META.length];
        })();
  const PARENT_TIPS: string[] = [
    'Nói chuyện với bé 5–10 phút mỗi ngày: đều đặn tốt hơn là học dồn một lúc.',
    'Khen cụ thể — "con nói câu chào lấy hay lắm!" — thay vì khen chung chung.',
    'Để bé tự chọn hoạt động: bé thích cái gì thì bé nhớ lâu hơn gấp đôi.',
    'Cùng bé nghe rồi nhại theo giọng Cu Tít; cứ vui vẻ, đừng biến thành bài kiểm tra.',
    'Cuối tuần mở màn "Tiến Trình", để bé tự kể: hôm nay con học được gì.'
  ];
  const todayTip = PARENT_TIPS[Math.floor(Date.now() / 86400000) % PARENT_TIPS.length];

  const jumpMap: Record<string, () => void> = {
    pitch: () => go('m2-pitch'),
    honorifics: () => go('m3-honorific'),
    dialect: () => go('m6-dialect'),
    practice: () => go('m5-drill'),
    sentence: () => go('m8-sentence'),
    drill: () => go('m5-drill'),
    chat: () => go('m1-chat'),
    conversation: () => go('m1-chat'),
    culture: () => go('m10-culture')
  };
  const jumpTo = (tab: string) => jumpMap[tab]?.();

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--tx)] selection:bg-[#e56c5e] selection:text-[#410001]">
      {/* ================= SIDEBAR BẢN WEB (lg+) ================= */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 bg-[var(--bg-elev)] border-r border-[var(--line-soft)] z-50">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-[var(--line-soft)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-9 rounded-lg bg-gradient-to-br from-[#e56c5e] to-[#f8bc4b] flex items-center justify-center text-lg shadow">
              🇻🇳
            </div>
            <div>
              <div className="font-black text-sm text-[var(--tx-strong)] flex items-center gap-1.5">
                <span>Bé Cu Tít</span>
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--badge-tx)] border border-[var(--badge-line)]">
                  BẢN WEB
                </span>
              </div>
              <div className="text-[10px] text-[var(--tx-muted)]">12 hoạt động học tập</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav aria-label="Điều hướng hoạt động học tập" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group: NavGroup) => (
            <div key={group.id}>
              <div className="px-2 pb-1.5 flex items-center gap-1.5">
                <span className="text-[11px]">{group.icon}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--tx-dim)]">
                  {group.label}
                </span>
              </div>
              <div className="space-y-1">
                {group.items.map(item => {
                  const isActive = subScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => go(item.id, 'sidebar')}
                      aria-current={isActive ? 'page' : undefined}
                      className={`web-focus w-full text-left rounded-xl px-2.5 py-2 flex items-center gap-2 transition-all border ${
                        isActive
                          ? `bg-[var(--bg-card3)] text-[var(--tx-strong)] font-bold ${group.accentBg}`
                          : 'border-transparent text-[var(--tx-muted)] hover:text-[var(--tx-strong)] hover:bg-[var(--bg-card)]'
                      }`}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="text-[11.5px] font-semibold block truncate">
                          {item.name}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            onClick={() => go('overview', 'sidebar')}
            className={`web-focus w-full text-left rounded-xl px-2.5 py-2 flex items-center gap-2 border transition-all ${
              subScreen === 'overview'
                ? 'bg-[var(--bg-card3)] border-l-[#f8bc4b] text-[var(--tx-strong)] font-bold'
                : 'border-transparent text-[var(--tx-muted)] hover:text-[var(--tx-strong)] hover:bg-[var(--bg-card)]'
            }`}
          >
            <span className="text-base leading-none">🏠</span>
            <span className="text-[11.5px] font-semibold">Trang chủ</span>
          </button>
        </nav>

        <div className="px-4 py-3 border-t border-[var(--line-soft)] text-[9px] text-[var(--tx-faint)] leading-relaxed">
          Học Tiếng Việt Cùng Bé Cu Tít
        </div>
      </aside>

      {/* ================= TOP BAR (chỉ mobile, <lg) — giống hệt bản mobile ================= */}
      <nav className="lg:hidden bg-[var(--bg-elev)] text-[var(--tx)] px-3.5 py-2.5 flex items-center justify-between border-b border-[var(--line-soft)] z-40 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#e56c5e] to-[#f8bc4b] flex items-center justify-center text-sm shadow">
            🇻🇳
          </div>
          <div>
            <div className="font-extrabold text-xs text-[var(--tx-strong)] flex items-center gap-1.5">
              <span>Bé Cu Tít</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--badge-bg)] text-[var(--badge-tx)] border border-[var(--badge-line)]">
                BẢN WEB
              </span>
            </div>
            <div className="text-[10px] text-[var(--tx-muted)]">Học Tiếng Việt Thông Minh</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleSkin}
            title={skin === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            aria-label="Chuyển giao diện sáng/tối"
            className="w-8 h-8 rounded-lg bg-[var(--bg-card3)] border border-[var(--line)] flex items-center justify-center transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-base">{skin === 'dark' ? 'light_mode' : 'dark_mode'}</span>
          </button>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-card3)] border border-[var(--line)] hover:border-[var(--amber)] text-xs font-bold text-[var(--amber)] flex items-center gap-1.5 transition-all active:scale-95 shadow"
          >
            <span>📋</span>
            <span>Bài Học</span>
          </button>
        </div>
      </nav>

      {/* ================= NỘI DUNG ================= */}
      <main className="lg:pl-64 flex-1 min-h-screen">
        {/* ---- TOPBAR DESKTOP (lg+): breadcrumb màn đang mở + lối tắt tiếp tục (kiểu Duolingo web) ---- */}
        <div className="hidden lg:flex h-12 shrink-0 items-center justify-between px-5 border-b border-[var(--line-soft)] bg-[var(--bg-elev)] sticky top-0 z-40">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest min-w-0">
            <span className="text-[var(--tx-dim)] font-bold shrink-0">Học tiếng Việt</span>
            <span className="text-[var(--tx-dim)]">›</span>
            {activeMeta ? (
              <span className="flex items-center gap-1.5 normal-case tracking-normal min-w-0">
                <span>{activeMeta.icon}</span>
                <span className="text-[var(--tx-strong)] font-bold text-[11px] truncate">{activeMeta.name}</span>
              </span>
            ) : (
              <span className="text-[var(--tx-strong)] font-bold normal-case tracking-normal text-[11px]">Trang chủ</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleSkin}
              title={skin === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              aria-label="Chuyển giao diện sáng/tối"
              className="web-focus w-8 h-8 rounded-lg bg-[var(--bg-card3)] border border-[var(--line)] hover:border-[var(--amber)] flex items-center justify-center transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-base">{skin === 'dark' ? 'light_mode' : 'dark_mode'}</span>
            </button>
            <button
              onClick={() => go(nextMeta.id, 'rail')}
              className="web-focus px-3 py-1.5 rounded-xl bg-[var(--bg-card3)] border border-[var(--line)] hover:border-[var(--amber)] text-[10.5px] font-bold text-[var(--amber)] flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
            >
              <span>▶</span>
              <span className="truncate max-w-[160px]">Tiếp tục: {nextMeta.name}</span>
            </button>
          </div>
        </div>

        <div className="flex items-start w-full">
          <div className="flex-1 min-w-0">
        {/* ---- MÀN 'overview': LANDING BẢN WEB (grid rộng, xanh như bản mobile) ---- */}
        {subScreen === 'overview' && (
          <div className="p-5 lg:p-10 max-w-5xl mx-auto flex flex-col gap-5 text-[var(--tx)]">
            {/* Hero */}
            <header className="p-6 lg:p-8 rounded-2xl bg-gradient-to-br from-[var(--bg-card3)] to-[var(--bg-card4)] border border-[var(--line)] shadow-xl">
              <div className="text-[11px] text-[var(--ok)] font-bold uppercase tracking-widest mb-1.5">
                Cùng Bé Học Nói Tiếng Việt
              </div>
              <h1 className="text-2xl lg:text-3xl font-black text-[var(--tx-strong)] leading-tight">
                Học Tiếng Việt Cùng Bé Cu Tít
                <span className="text-[var(--amber)]"> — Bản Web</span>
              </h1>
              <p className="text-xs lg:text-sm text-[var(--tx-muted)] mt-2 leading-relaxed max-w-2xl">
                Bé nói chuyện với trợ lý Cu Tít, luyện thanh điệu, học cách xưng hô
                với ông bà cha mẹ và khám phá phong tục quê hương. Chọn một hoạt động
                bên dưới hoặc bấm vào thanh điều hướng bên trái.
              </p>

              {/* Quick actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                {[
                  { id: 'm1-chat' as SubScreenType, icon: '💬', title: 'Hội Thoại cùng Cu Tít', sub: 'Nhắn và nói chuyện cùng Cu Tít', hot: true },
                  { id: 'm2-pitch' as SubScreenType, icon: '🎵', title: 'Tập Thanh Điệu', sub: 'Đồ thị trực quan theo giọng bé', hot: false },
                  { id: 'm4-vision' as SubScreenType, icon: '📷', title: 'AR Camera', sub: 'Bé chỉ camera vào đâu, nhãn hiện ở đó', hot: false }
                ].map(qc => (
                  <button
                    key={qc.id}
                    onClick={() => go(qc.id, 'quick_action')}
                    className={`web-focus rounded-xl px-4 py-3 text-left flex items-center gap-2.5 font-bold text-xs transition-all active:scale-[0.98] shadow border ${
                      qc.hot
                        ? 'bg-[#e56c5e] text-[#410001] border-[#e56c5e] hover:brightness-110'
                        : 'bg-[var(--bg-card3)] border-[var(--line)] text-[var(--tx)] hover:border-[var(--coral)]'
                    }`}
                  >
                    <span className="text-lg">{qc.icon}</span>
                    <span>
                      <span className="block">{qc.title}</span>
                      <span className={`text-[9.5px] font-semibold ${qc.hot ? 'text-[#722720]' : 'text-[var(--tx-faint)]'}`}>
                        {qc.sub}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </header>

            {/* Thông số nhanh — con số thật của nội dung sản phẩm */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { v: '12', l: 'Hoạt động học tập', hl: 'text-[var(--ok)]' },
                { v: '20', l: 'Cặp xưng hô chuẩn mực', hl: 'text-[var(--amber)]' },
                { v: '60', l: 'Câu ghép thực hành', hl: 'text-[var(--sky)]' },
                { v: '4', l: 'Bối cảnh nhập vai', hl: 'text-[var(--coral)]' }
              ].map(s => (
                <div
                  key={s.l}
                  className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--line)] hover:border-[var(--amber)]/60 transition-all"
                >
                  <div className={`text-xl font-black ${s.hl}`}>{s.v}</div>
                  <div className="text-[10px] text-[var(--tx-muted)] font-semibold mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>

            {/* Grid 12 hoạt động */}
            <section aria-label="Danh sách hoạt động học tập">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-bold text-[var(--tx-soft)] uppercase tracking-widest">
                  12 hoạt động — bấm để bắt đầu
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {ALL_SCREEN_META.map(screen => {
                  const g = groupOfScreen(screen.id);
                  return (
                    <button
                      key={screen.id}
                      onClick={() => go(screen.id, 'card')}
                      aria-current={subScreen === screen.id ? 'page' : undefined}
                      className={`web-focus p-4 rounded-xl border text-left flex items-start justify-between gap-2 transition-all active:scale-[0.98] hover:-translate-y-0.5 ${
                        subScreen === screen.id
                          ? 'bg-[var(--bg-raised)] border-[var(--amber)]'
                          : 'bg-[var(--bg-card2)] border-[var(--line)] hover:border-[var(--coral)]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-xl leading-none mt-0.5">{screen.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[var(--tx-strong)]">
                            {screen.name}
                          </div>
                          <div className="text-[10px] text-[var(--tx-muted)] mt-0.5 leading-relaxed">{screen.desc}</div>
                          <div
                            className={`text-[9px] mt-1.5 font-bold uppercase tracking-wider ${g ? g.accentText : ''}`}
                          >
                            {g ? g.icon + ' ' + g.label : ''}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <footer className="pt-2 pb-6 text-[10px] text-[var(--tx-faint)] text-center">
              Học Tiếng Việt Cùng Bé Cu Tít — đồng hành cùng bé từ câu đầu tiên
            </footer>
          </div>
        )}

        {/* ---- 12 MÀN HÌNH MFE — render nguyên vẹn như bản mobile ---- */}
        {subScreen === 'm1-chat' && (
          <RemoteErrorBoundary remoteName="M1: Khung Hội Thoại (@vietlearning/mfe-conversation)" key={`m1-${skin}`}>
            <ChatCanvasScreen initialTheme={skin} onNavigateTab={jumpTo} onBack={() => go('overview')} />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm7-roleplay' && (
          <RemoteErrorBoundary remoteName="M7: Nhập Vai 4 Bối Cảnh (@vietlearning/mfe-conversation)" key={`m7-${skin}`}>
            <RoleplaySimulatorScreen
              initialTheme={skin}
              onBack={() => go('overview')}
              onNavigateTab={jumpTo}
            />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm8-sentence' && (
          <RemoteErrorBoundary remoteName="M8: Ghép Câu Đốt Tre (@vietlearning/mfe-practice)" key={`m8-${skin}`}>
            <SentenceBuilderScreen initialTheme={skin} onBack={() => go('overview')} onNavigateTab={jumpTo} />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm5-drill' && (
          <RemoteErrorBoundary remoteName="M5: Bài Tập Thích Ứng (@vietlearning/mfe-practice)" key={`m5-${skin}`}>
            <AdaptiveDrillScreen initialTheme={skin} onBack={() => go('overview')} onNavigateTab={jumpTo} />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm3-honorific' && (
          <RemoteErrorBoundary remoteName="M3: Ma Trận Xưng Hô (@vietlearning/mfe-knowledge)" key={`m3-${skin}`}>
            <HonorificMatrixScreen
              initialTheme={skin}
              onBack={() => go('overview')}
              onNavigateTab={jumpTo}
            />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm10-culture' && (
          <RemoteErrorBoundary remoteName="M10: Sổ Tay Văn Hóa (@vietlearning/mfe-knowledge)" key={`m10-${skin}`}>
            <CultureGuideScreen
          initialTheme={skin}
              onBack={() => go('overview')}
              onNavigateTab={jumpTo}
            />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm4-vision' && (
          <RemoteErrorBoundary remoteName="M4: AR Camera Surface (@vietlearning/mfe-vision)" key={`m4-${skin}`}>
            <ArCameraSurfaceScreen initialTheme={skin} onBack={() => go('overview')} />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm2-pitch' && (
          <RemoteErrorBoundary remoteName="M2: Luyện Cao Độ F0 (@vietlearning/mfe-speech-lab)" key={`m2-${skin}`}>
            <PitchVisualizerScreen initialTheme={skin} onBack={() => go('overview')} onNavigateTab={jumpTo} />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm6-dialect' && (
          <RemoteErrorBoundary remoteName="M6: Phương Ngữ 3 Miền (@vietlearning/mfe-speech-lab)" key={`m6-${skin}`}>
            <DialectSwitcherScreen initialTheme={skin} onBack={() => go('overview')} onNavigateTab={jumpTo} />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm9-analytics' && (
          <RemoteErrorBoundary remoteName="M9: Thống Kê & SRS (@vietlearning/mfe-learner)" key={`m9-${skin}`}>
            <AnalyticsSrsScreen initialTheme={skin} onBack={() => go('overview')} onNavigateTab={jumpTo} />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm11-onboarding' && (
          <RemoteErrorBoundary remoteName="M11: Xếp Lớp Thích Ứng (@vietlearning/mfe-learner)" key={`m11-${skin}`}>
            <AdaptiveOnboardingScreen
              initialTheme={skin}
              onBack={() => go('overview')}
              onComplete={() => go('m9-analytics')}
              onNavigateTab={jumpTo}
            />
          </RemoteErrorBoundary>
        )}

        {subScreen === 'm12-preferences' && (
          <>
            {/* Card Chế Độ Hiển Thị — shell-owned, render trên đầu màn Cài Đặt (đôi với nút nhanh trên topbar) */}
            <div className="max-w-md mx-auto w-full px-3 pt-3 pb-1">
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
              <AiPreferencesScreen initialTheme={skin} onBack={() => go('overview')} onNavigateTab={jumpTo} />
            </RemoteErrorBoundary>
          </>
        )}
          </div>

          {/* ===== CỘT PHẢI (kiểu Duolingo web): widget "hôm nay" — chỉ shell, không chạm code màn MFE ===== */}
          <aside aria-label="Gợi ý học hôm nay" className="hidden xl:flex flex-col w-80 shrink-0 gap-3 p-4 pt-5 border-l border-[var(--line-soft)] bg-[var(--bg-elev)] sticky top-[3rem] h-[calc(100vh-3rem)] overflow-y-auto">
            {/* Tiếp theo cho bé */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-card3)] border border-[var(--line)]">
              <div className="text-[9px] uppercase tracking-widest text-[var(--amber)] font-bold">Tiếp theo cho bé</div>
              <button
                onClick={() => go(nextMeta.id, 'rail')}
                className="web-focus w-full mt-2 p-2.5 rounded-xl bg-[var(--bg-raised)] border border-[var(--line)] hover:border-[var(--coral)] flex items-center gap-2.5 text-left transition-all active:scale-[0.98]"
              >
                <span className="text-xl">{nextMeta.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-[var(--tx-strong)] truncate">{nextMeta.name}</span>
                  <span className="block text-[9px] text-[var(--tx-muted)] truncate">{nextMeta.desc}</span>
                </span>
              </button>
            </div>

            {/* Mẹo cho phụ huynh — đổi theo ngày */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-card4)] border border-[var(--line)]">
              <div className="text-[9px] uppercase tracking-widest text-[var(--ok)] font-bold">Mẹo cho phụ huynh</div>
              <p className="text-[10.5px] text-[var(--tx-muted)] leading-relaxed mt-1.5">{todayTip}</p>
            </div>

            {/* Trợ lý Cu Tít */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[var(--bg-raised)] to-[var(--bg-card2)] border border-[var(--line)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#e56c5e] to-[#f8bc4b] flex items-center justify-center text-sm shadow shrink-0">
                  🇻🇳
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[var(--tx-strong)] truncate">Trợ Lý Cu Tít đang chờ bé</div>
                  <div className="text-[9px] text-[var(--tx-muted)] truncate">Chỉnh giọng đọc + tính cách vừa ý bé</div>
                </div>
              </div>
              <button
                onClick={() => go('m12-preferences', 'rail')}
                className="web-focus w-full mt-2.5 py-2 rounded-xl bg-[#e56c5e] text-[#410001] text-[10.5px] font-black hover:brightness-110 transition-all active:scale-[0.98]"
              >
                ⚙️ Cài Đặt Trợ Lý
              </button>
            </div>

            <div className="text-[9px] text-[var(--tx-faint)] text-center pt-1">Học Tiếng Việt Cùng Bé Cu Tít</div>
          </aside>
        </div>
      </main>

      {/* ================= BOTTOM TABS (chỉ mobile, <lg) — giống hệt bản mobile ================= */}
      <footer className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-elev)] backdrop-blur-md border-t border-[var(--line-soft)] px-2 py-1.5 z-40">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
          {NAV_GROUPS.map(group => {
            const isActive = activeGroup?.id === group.id && subScreen !== 'overview';
            return (
              <button
                key={group.id}
                onClick={() => go(group.items[0].id, 'bottom_tab')}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
                  isActive ? `${group.accentText} font-black` : 'text-[var(--tx-muted)] hover:text-[var(--tx-strong)]'
                }`}
              >
                <span className="text-base">{group.icon}</span>
                <span className="text-[10px]">{group.label}</span>
              </button>
            );
          })}
        </div>
      </footer>

      {/* ================= DRAWER (chỉ mobile, <lg) ================= */}
      {isDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-in fade-in">
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
                aria-label="Đóng danh mục"
                className="w-7 h-7 rounded-full bg-[var(--bg-card3)] border border-[var(--line)] text-xs text-[var(--tx-muted)] hover:text-[var(--tx-strong)] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {NAV_GROUPS.map(group => (
                <div key={group.id}>
                  <div className="text-[9px] font-bold text-[var(--amber)] uppercase tracking-widest pb-1">
                    {group.icon} {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => go(item.id, 'drawer')}
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
                </div>
              ))}

              <button
                onClick={() => go('overview', 'drawer')}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                  subScreen === 'overview'
                    ? 'bg-[var(--bg-raised)] border-[var(--amber)] text-[var(--tx-strong)] font-bold'
                    : 'bg-[var(--bg-card)] border-[var(--line)] text-[var(--tx-muted)] hover:text-[var(--tx-strong)]'
                }`}
              >
                <span>🏠</span>
                <span>Trang chủ</span>
              </button>
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
