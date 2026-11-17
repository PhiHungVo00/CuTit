import React, { useState, useMemo, useEffect } from 'react';
import { DialectMapper, DialectEntry } from '@vietlearning/content';
import { speechService } from '../services/speechService';
import { DialectQuizModal } from './DialectQuizModal';

export interface DialectSwitcherScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const DialectSwitcherScreen: React.FC<DialectSwitcherScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [selectedRegion, setSelectedRegion] = useState<'north' | 'central' | 'south'>('south');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  const [isPracticingSpeech, setIsPracticingSpeech] = useState(false);
  const [practiceSuccess, setPracticeSuccess] = useState(false);

  const mapper = useMemo(() => new DialectMapper(), []);
  const isDark = theme === 'dark';

  // Toggle dark/light theme on <html> element for Tailwind
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    return () => {
      root.classList.remove('dark');
    };
  }, [isDark]);

  // Active highlighted comparison item
  const [featuredItem, setFeaturedItem] = useState<DialectEntry>(mapper.getAllEntries()[0]); // 'bát' vs 'chén'

  const filteredEntries = useMemo(() => {
    return mapper.getByCategory(selectedCategory);
  }, [mapper, selectedCategory]);

  const handlePlayWord = async (text: string) => {
    if (playingWord === text) {
      speechService.stop();
      setPlayingWord(null);
      return;
    }

    setPlayingWord(text);
    await speechService.speak(text, {
      speed: 1.0,
      dialect: selectedRegion,
      onEnd: () => setPlayingWord(null),
      onError: () => setPlayingWord(null)
    });
  };

  // Sample sentences for regional trial
  const sampleSentences = {
    north: {
      title: 'Mẫu Chào Bắc Bộ (Hà Nội)',
      text: '"Bác ơi, cho cháu xin bát phở tái chín nhiều hành ạ!"',
      note: 'Âm thanh chuẩn mực, rõ ràng từng dấu hỏi ngã trang trọng'
    },
    central: {
      title: 'Mẫu Chào Trung Bộ (Cố Đô Huế)',
      text: '"Dạ mệ ơi, trưa ni mệ mần món chi rứa mệ?"',
      note: 'Ngữ điệu trầm ấm, âm hưởng sông Hương núi Ngự dịu dàng'
    },
    south: {
      title: 'Mẫu Chào Nam Bộ (Sài Gòn - Miền Tây)',
      text: '"Dạ, con thưa tía má con mới dìa!"',
      note: 'Âm "về" chuyển thành "dìa" ngọt lịm, mộc mạc và chân chất'
    }
  };

  const currentSample = sampleSentences[selectedRegion];

  const handlePracticeTrial = async () => {
    setIsPracticingSpeech(true);
    setPracticeSuccess(false);

    // Speak the sentence first as a guide
    await speechService.speak(currentSample.text, {
      speed: 1.0,
      dialect: selectedRegion,
      onEnd: () => {
        setIsPracticingSpeech(false);
        setPracticeSuccess(true);
        setTimeout(() => setPracticeSuccess(false), 3000);
      }
    });
  };

  return (
    <div
      className={`w-full min-h-screen font-sans ${
        isDark ? 'bg-[#220e07] text-[#ffdbcf]' : 'bg-[#FFFBF5] text-[#271900]'
      }`}
    >
      {/* MOBILE CONTAINER (Full width on mobile, max-w-md on desktop) */}
      <div className="w-full max-w-md mx-auto min-h-screen flex flex-col relative pb-28">
        {/* FIXED APP HEADER (STITCH HEADER) */}
        <header
          className={`fixed top-0 left-1/2 -translate-x-1/2 max-w-md w-full z-50 pt-safe backdrop-blur-xl transition-colors duration-200 ${
            isDark
              ? 'bg-[#220e07]/90 shadow-[0_4px_16px_rgba(28,9,4,0.4)]'
              : 'bg-[#FFFBF5]/90 shadow-[0_4px_16px_rgba(180,83,9,0.08)]'
          }`}
        >
          <div className="h-16 px-4 flex items-center justify-between gap-2">
            {/* Left: Back button + Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                aria-label="Quay lại"
                onClick={() => (onBack ? onBack() : window.history.back())}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform active:translate-y-0.5 ${
                  isDark
                    ? 'bg-[#3c241b] text-[#ffb4aa] shadow-[0_3px_0_#1c0904]'
                    : 'bg-[#EFE2D3] text-[#B45309] shadow-[0_3px_0_#D6C7B2]'
                }`}
              >
                <span className="material-symbols-outlined text-xl">arrow_back_ios_new</span>
              </button>

              <div className="flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[#f8bc4b] text-2xl">train</span>
                <h1 className="font-bold text-base truncate">Phương Ngữ 3 Miền</h1>
              </div>
            </div>

            {/* Right: Theme Switcher & Quiz Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                title="Đổi giao diện Dark/Light"
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform active:translate-y-0.5 ${
                  isDark
                    ? 'bg-[#3c241b] text-[#f8bc4b] shadow-[0_3px_0_#1c0904]'
                    : 'bg-[#EFE2D3] text-[#B45309] shadow-[0_3px_0_#D6C7B2]'
                }`}
              >
                <span className="material-symbols-outlined text-lg">
                  {isDark ? 'light_mode' : 'dark_mode'}
                </span>
              </button>

              <button
                onClick={() => setIsQuizOpen(true)}
                title="Đố vui phương ngữ"
                className="h-10 px-2.5 rounded-lg bg-[#e56c5e] text-[#5a0304] font-bold text-xs shadow-[0_3px_0_#5a0304] flex items-center gap-1 active:translate-y-0.5 transition-transform"
              >
                <span className="material-symbols-outlined text-base">quiz</span>
                <span>Đố Vui</span>
              </button>
            </div>
          </div>
        </header>

        {/* MAIN SCROLLABLE BODY */}
        <main className="flex-1 w-full pt-20 px-4 flex flex-col gap-4">
          {/* 1. REGIONAL ROUTE TRACKER BANNER */}
          <div
            className={`rounded-2xl p-3.5 flex items-center justify-between shadow-[0_4px_0_#1c0904] ${
              isDark ? 'bg-[#301a12]' : 'bg-[#EFE2D3]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#bc8714] text-[#271900] flex items-center justify-center shrink-0 shadow-[0_2px_0_#1c0904]">
                <span className="material-symbols-outlined text-lg">explore</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-xs text-[#f8bc4b] truncate">
                  Hành Trình Xuyên Việt
                </span>
                <span className="text-[11px] opacity-80 truncate">
                  Trạm dừng: Bắc (Hà Nội) - Trung (Huế) - Nam (Sài Gòn)
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#1c0904] text-[#9acde9] shrink-0">
              Ga 03
            </span>
          </div>

          {/* 2. REGION SEGMENTED CONTROL (CHUNKY WOODEN PILLS) */}
          <div
            className={`flex gap-1.5 p-1.5 rounded-2xl shadow-inner ${
              isDark ? 'bg-[#1c0904]' : 'bg-[#E5D5C0]'
            }`}
          >
            {[
              { id: 'north', name: 'Bắc Bộ', sub: '(Hà Nội)' },
              { id: 'central', name: 'Trung Bộ', sub: '(Huế)' },
              { id: 'south', name: 'Nam Bộ', sub: '(Sài Gòn)' }
            ].map((reg) => {
              const isActive = selectedRegion === reg.id;
              return (
                <button
                  key={reg.id}
                  onClick={() => setSelectedRegion(reg.id as any)}
                  className={`flex-1 py-2 px-1 rounded-xl text-center font-bold text-xs flex flex-col items-center transition-all ${
                    isActive
                      ? 'bg-[#f8bc4b] text-[#271900] shadow-[0_3px_0_#bc8714] -translate-y-0.5'
                      : isDark
                      ? 'bg-[#3c241b] text-[#ffdbcf] hover:text-white shadow-[0_2px_0_#1c0904]'
                      : 'bg-[#FFFBF5] text-[#271900] shadow-[0_2px_0_#D6C7B2]'
                  }`}
                >
                  <span>{reg.name}</span>
                  <span className="text-[10px] opacity-75 font-normal">{reg.sub}</span>
                </button>
              );
            })}
          </div>

          {/* 3. COMPARISON STAGE CARD: CRAFT PAPER AESTHETIC */}
          <section
            className={`rounded-2xl p-4 shadow-[0_6px_0_#1c0904] flex flex-col gap-3 ${
              isDark ? 'bg-[#3c241b]' : 'bg-[#EFE2D3]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#e56c5e] text-lg">
                  compare_arrows
                </span>
                <span className="font-bold text-xs uppercase tracking-wide">
                  Đối Chiếu Khẩu Ngữ 3 Miền
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1c0904] text-[#f8bc4b]">
                {featuredItem.categoryLabel}
              </span>
            </div>

            {/* Illustration Stage with Dynamic Dual Words */}
            <div className="relative w-full h-36 rounded-xl overflow-hidden bg-[#1c0904] shadow-inner">
              <img
                className="w-full h-full object-cover opacity-85"
                alt="Hai chiếc bát/chén truyền thống gốm Bát Tràng và gốm Nam Bộ"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAMQXr4tBA07j5UM5BdccOUDr7Mhu6fPKkEYLYrueAFH-Ua_BTubMKB_2ZysH8GqBDph-E4dVrBSnzu4oH29miMOUIf7XMiRvGLWQE2VnyNI5hMvqqWfGDN6Lj4J2_3PVordGNuunpTdzK6ShVIV3KAqNz3vu5aMmI1g456gD_ZsbPJMzUUWobiqLCMQH1cG4a8jCRVFOF_ucvGx7c4gjhkBvTjQoKAw-_LBvTxkKuqiOG4XVJPl7L3"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1c0904] via-transparent to-transparent flex items-end justify-between p-3">
                <div className="bg-[#220e07]/90 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-[#3c241b]">
                  <span className="font-bold text-xs text-[#e56c5e]">
                    Bắc: {featuredItem.north}
                  </span>
                </div>
                <div className="bg-[#220e07]/90 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-[#3c241b]">
                  <span className="font-bold text-xs text-[#9acde9]">
                    Nam: {featuredItem.south}
                  </span>
                </div>
              </div>
            </div>

            {/* Tone Wave Contour Comparison Graphic */}
            <div
              className={`rounded-xl p-3 flex flex-col gap-2 ${
                isDark ? 'bg-[#1c0904]' : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] opacity-80">
                <span className="flex items-center gap-1 font-semibold text-[#e56c5e]">
                  <span className="w-2 h-2 rounded-full bg-[#e56c5e] inline-block"></span>
                  Bắc: Sắc sảo, chuẩn thanh
                </span>
                <span className="flex items-center gap-1 font-semibold text-[#9acde9]">
                  <span className="w-2 h-2 rounded-full bg-[#9acde9] inline-block"></span>
                  Nam: Ngọt ngào, mộc mạc
                </span>
              </div>

              {/* Tone Graphic SVG */}
              <div className="h-12 w-full flex items-center justify-center">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 320 60">
                  <line
                    stroke="#dec0bc"
                    strokeDasharray="4 4"
                    strokeOpacity="0.15"
                    x1="0"
                    x2="320"
                    y1="15"
                    y2="15"
                  />
                  <line
                    stroke="#dec0bc"
                    strokeDasharray="4 4"
                    strokeOpacity="0.15"
                    x1="0"
                    x2="320"
                    y1="35"
                    y2="35"
                  />
                  <line
                    stroke="#dec0bc"
                    strokeDasharray="4 4"
                    strokeOpacity="0.15"
                    x1="0"
                    x2="320"
                    y1="55"
                    y2="55"
                  />
                  {/* Bac curve */}
                  <path
                    d="M 10 40 C 60 40, 90 12, 140 10"
                    fill="none"
                    stroke="#e56c5e"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  {/* Nam curve */}
                  <path
                    d="M 180 38 C 220 36, 260 22, 310 18"
                    fill="none"
                    stroke="#9acde9"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <circle cx="140" cy="10" r="4" fill="#e56c5e" />
                  <circle cx="310" cy="18" r="4" fill="#9acde9" />
                </svg>
              </div>
            </div>

            {/* Comparative Audio Controls (Bắc vs Nam) */}
            <div className="grid grid-cols-2 gap-2">
              {/* Bac Audio button */}
              <div
                className={`rounded-xl p-2.5 flex items-center justify-between ${
                  isDark ? 'bg-[#301a12]' : 'bg-[#FAF7F2]'
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm truncate">{featuredItem.north}</span>
                  <span className="text-[10px] opacity-75 truncate">{featuredItem.northIpa}</span>
                </div>
                <button
                  aria-label="Phát âm giọng Bắc"
                  onClick={() => handlePlayWord(featuredItem.north)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-[0_2px_0_#5a0304] ${
                    playingWord === featuredItem.north
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#e56c5e] text-[#5a0304]'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {playingWord === featuredItem.north ? 'stop' : 'volume_up'}
                  </span>
                </button>
              </div>

              {/* Nam Audio button */}
              <div
                className={`rounded-xl p-2.5 flex items-center justify-between ${
                  isDark ? 'bg-[#301a12]' : 'bg-[#FAF7F2]'
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm truncate">{featuredItem.south}</span>
                  <span className="text-[10px] opacity-75 truncate">{featuredItem.southIpa}</span>
                </div>
                <button
                  aria-label="Phát âm giọng Nam"
                  onClick={() => handlePlayWord(featuredItem.south)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-[0_2px_0_#0f4c64] ${
                    playingWord === featuredItem.south
                      ? 'bg-[#DC2626] text-white'
                      : 'bg-[#0f4c64] text-[#89bcd7]'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {playingWord === featuredItem.south ? 'stop' : 'volume_up'}
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* 4. CULTURAL STORY NOTE WITH CU TÍT MASCOT */}
          <div
            className={`rounded-2xl p-3.5 flex items-center gap-3 shadow-[0_4px_0_#1c0904] ${
              isDark ? 'bg-[#301a12]' : 'bg-[#EFE2D3]'
            }`}
          >
            <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-[#f8bc4b] shadow-[0_2px_0_#1c0904]">
              <img
                alt="Cu Tít Mascot"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCK_OKRdGrKRg7ii4PAhJdPCiFAR-Jp99rQQ5x47sE-l2kgtYFFOeemlwpKJMuijUjq1ZIxI7fAI3rGrmEdJhz3sO7bnUfEJHMXIn4WokRx_GCYYFrl4NV9BW5x7P5Mmd0o1rPRmg-9yBE7zSaqKjR7yVPaST8Vcqenq_Rs8yWwIX6Qm_c0SoWT5QxI8ZNeezVWVj1Iq-CZk5mLmzUYqRCUNY48ssJ4MSR56vacn7AZ9_2pP_qyU1GR"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1 text-[#f8bc4b] font-bold text-xs">
                <span className="material-symbols-outlined text-sm">tips_and_updates</span>
                <span>Mẹo Của Cu Tít:</span>
              </div>
              <p className="text-xs leading-relaxed opacity-90 mt-0.5">
                {featuredItem.culturalNote ||
                  'Mỗi vùng đất Việt Nam đều có cách dùng từ riêng đầy tình cảm, chỉ cần lắng nghe là hiểu được ngay!'}
              </p>
            </div>
          </div>

          {/* 5. REGIONAL VOCABULARY TABLE CARD (ALGORITHM A7) */}
          <section
            className={`rounded-2xl p-4 shadow-[0_6px_0_#1c0904] flex flex-col gap-3 ${
              isDark ? 'bg-[#3c241b]' : 'bg-[#EFE2D3]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <span className="material-symbols-outlined text-[#f8bc4b] text-base">menu_book</span>
                <span>Kho Từ Đồng Nghĩa 3 Miền (A7)</span>
              </div>
              <span className="text-[10px] opacity-75 font-semibold">
                {filteredEntries.length} từ tiêu biểu
              </span>
            </div>

            {/* Category Filter Chips */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'household', label: 'Đồ dùng' },
                { id: 'food', label: 'Ẩm thực' },
                { id: 'kinship', label: 'Xưng hô' },
                { id: 'action', label: 'Hành động' }
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-[#f8bc4b] text-[#271900] shadow-[0_2px_0_#bc8714]'
                      : isDark
                      ? 'bg-[#301a12] text-[#ffdbcf]'
                      : 'bg-[#FFFBF5] text-[#271900]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* List of Dictionary Rows */}
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {filteredEntries.map((item) => {
                const isSelected = item.id === featuredItem.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setFeaturedItem(item)}
                    className={`rounded-xl p-2.5 flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#e56c5e] text-[#5a0304] shadow-[0_3px_0_#5a0304]'
                        : isDark
                        ? 'bg-[#301a12] text-[#ffdbcf] hover:bg-[#482f25]'
                        : 'bg-[#FAF7F2] text-[#271900] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-[#5a0304] text-white'
                            : isDark
                            ? 'bg-[#482f25] text-[#f8bc4b]'
                            : 'bg-[#E5D5C0] text-[#B45309]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xl">{item.icon}</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1 font-bold text-xs truncate">
                          <span className={isSelected ? 'text-[#5a0304]' : 'text-[#e56c5e]'}>
                            {item.north}
                          </span>
                          <span className="opacity-60">•</span>
                          <span className={isSelected ? 'text-[#0f4c64]' : 'text-[#9acde9]'}>
                            {item.south}
                          </span>
                        </div>
                        <span className="text-[10px] opacity-80 truncate">{item.meaning}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayWord(
                          selectedRegion === 'north'
                            ? item.north
                            : selectedRegion === 'south'
                            ? item.south
                            : item.central
                        );
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform ${
                        isSelected
                          ? 'bg-[#5a0304] text-white'
                          : isDark
                          ? 'bg-[#482f25] text-[#f8bc4b]'
                          : 'bg-[#E5D5C0] text-[#B45309]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">volume_up</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 6. INTERACTIVE SPEECH TRIAL SECTION */}
          <section
            className={`rounded-2xl p-4 shadow-[0_6px_0_#1c0904] flex flex-col gap-3 ${
              isDark ? 'bg-[#3c241b]' : 'bg-[#EFE2D3]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <span className="material-symbols-outlined text-[#f8bc4b] text-base">
                  record_voice_over
                </span>
                <span>Thử Phát Âm Địa Phương</span>
              </div>
              <span className="text-[10px] font-bold text-[#f8bc4b]">+15 Điểm vui</span>
            </div>

            {/* Quote Slate */}
            <div
              className={`rounded-xl p-3.5 flex flex-col items-center justify-center text-center gap-1 shadow-inner ${
                isDark ? 'bg-[#1c0904]' : 'bg-white'
              }`}
            >
              <span className="text-[10px] font-bold text-[#9acde9] uppercase tracking-wider">
                {currentSample.title}
              </span>
              <p className="font-bold text-sm text-[#f8bc4b] leading-snug">{currentSample.text}</p>
              <span className="text-[10px] opacity-75 italic">{currentSample.note}</span>
            </div>

            {/* Voice Wave Simulator Visualizer */}
            <div className="flex items-center justify-center gap-1.5 py-1">
              <span
                className={`w-1.5 h-3 rounded-full bg-[#f8bc4b] ${
                  isPracticingSpeech ? 'animate-bounce' : ''
                }`}
                style={{ animationDelay: '0ms' }}
              ></span>
              <span
                className={`w-1.5 h-6 rounded-full bg-[#f8bc4b] ${
                  isPracticingSpeech ? 'animate-bounce' : ''
                }`}
                style={{ animationDelay: '100ms' }}
              ></span>
              <span
                className={`w-1.5 h-8 rounded-full bg-[#e56c5e] ${
                  isPracticingSpeech ? 'animate-bounce' : ''
                }`}
                style={{ animationDelay: '200ms' }}
              ></span>
              <span
                className={`w-1.5 h-10 rounded-full bg-[#e56c5e] ${
                  isPracticingSpeech ? 'animate-bounce' : ''
                }`}
                style={{ animationDelay: '150ms' }}
              ></span>
              <span
                className={`w-1.5 h-6 rounded-full bg-[#f8bc4b] ${
                  isPracticingSpeech ? 'animate-bounce' : ''
                }`}
                style={{ animationDelay: '50ms' }}
              ></span>
              <span
                className={`w-1.5 h-3 rounded-full bg-[#f8bc4b] ${
                  isPracticingSpeech ? 'animate-bounce' : ''
                }`}
                style={{ animationDelay: '250ms' }}
              ></span>
            </div>

            {/* Terracotta Action Button */}
            <button
              onClick={handlePracticeTrial}
              className="w-full py-3.5 px-4 bg-[#e56c5e] hover:bg-[#ffb4aa] text-[#5a0304] rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-[0_4px_0_#5a0304] active:translate-y-1 active:shadow-none transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">mic</span>
              <span>{isPracticingSpeech ? 'Đang đọc mẫu phát âm...' : 'Luyện Giọng Vùng Miền'}</span>
            </button>

            {practiceSuccess && (
              <div className="w-full p-2 rounded-xl bg-[#059669] text-white font-bold text-xs text-center animate-bounce">
                ✓ Giọng đọc rất mộc mạc và chuẩn xác! +15 Điểm vui!
              </div>
            )}
          </section>
        </main>

        {/* 7. FIXED BOTTOM NAVIGATION BAR */}
        <nav
          className={`fixed bottom-0 left-1/2 -translate-x-1/2 max-w-md w-full z-40 pb-safe backdrop-blur-xl border-t transition-colors duration-200 ${
            isDark
              ? 'bg-[#220e07]/95 border-[#3c241b] shadow-[0_-4px_20px_rgba(28,9,4,0.6)]'
              : 'bg-[#FFFBF5]/95 border-[#E5D5C0] shadow-[0_-4px_20px_rgba(180,83,9,0.06)]'
          }`}
        >
          <div className="flex items-center justify-between h-16 px-4 relative">
            <button
              onClick={() => onNavigateTab?.('conversation')}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity"
            >
              <span className="material-symbols-outlined text-xl">forum</span>
              <span className="text-[10px] font-semibold">Hội thoại</span>
            </button>

            {/* Active Tab: Luyện thanh & Phương ngữ */}
            <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#f8bc4b]">
              <span className="material-symbols-outlined text-xl">graphic_eq</span>
              <span className="text-[10px] font-bold">Luyện thanh</span>
            </button>

            {/* Center Floating Mic */}
            <div className="flex-shrink-0 px-1 -mt-6">
              <button
                onClick={handlePracticeTrial}
                className="w-13 h-13 p-3.5 rounded-full bg-[#e56c5e] text-[#5a0304] shadow-lg shadow-[#5a0304]/40 flex items-center justify-center active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-2xl">mic</span>
              </button>
            </div>

            <button
              onClick={() => onNavigateTab?.('honorifics')}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity"
            >
              <span className="material-symbols-outlined text-xl">diversity_3</span>
              <span className="text-[10px] font-semibold">Đại từ</span>
            </button>

            <button
              onClick={() => onNavigateTab?.('vision')}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity"
            >
              <span className="material-symbols-outlined text-xl">photo_camera</span>
              <span className="text-[10px] font-semibold">Camera AR</span>
            </button>
          </div>
        </nav>

        {/* DIALECT QUIZ MODAL */}
        <DialectQuizModal
          isOpen={isQuizOpen}
          onClose={() => setIsQuizOpen(false)}
          isDark={isDark}
        />
      </div>
    </div>
  );
};
