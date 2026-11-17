import React, { useState, useMemo, useEffect } from 'react';
import {
  HonorificInterpreter,
  HonorificPairItem,
  HONORIFIC_PAIRS_20,
  RelationCategory
} from '@vietlearning/content';
import { HonorificExplorerDrawer } from './HonorificExplorerDrawer';
import { speechService } from '../services/speechSynthesis';

export interface HonorificMatrixScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onPairChange?: (pair: { speaker: string; listener: string; pairId: string }) => void;
  onNavigateTab?: (tab: string) => void;
}

export const HonorificMatrixScreen: React.FC<HonorificMatrixScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onPairChange,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sliders: Age (0..3) & Context (0..2) exactly matching Stitch
  const [ageStep, setAgeStep] = useState<number>(0);
  const [contextStep, setContextStep] = useState<number>(0);

  // Gender & Perspective
  const [userGender, setUserGender] = useState<'male' | 'female'>('male');
  const [partnerGender, setPartnerGender] = useState<'male' | 'female'>('male');
  const [isReversed, setIsReversed] = useState<boolean>(false);

  // Explicit selected pair from Drawer
  const [explicitPair, setExplicitPair] = useState<HonorificPairItem | null>(null);

  // Audio state
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [applyToast, setApplyToast] = useState<string | null>(null);

  const interpreter = useMemo(() => new HonorificInterpreter(), []);
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

  // Compute speaker & listener age from ageStep
  const { speakerAge, listenerAge, speakerGender, listenerGender } = useMemo(() => {
    let uAge = 20;
    let pAge = 55;

    switch (ageStep) {
      case 0: // Bề trên
        uAge = 20;
        pAge = 60;
        break;
      case 1: // Lớn hơn
        uAge = 20;
        pAge = 26;
        break;
      case 2: // Ngang hàng
        uAge = 22;
        pAge = 22;
        break;
      case 3: // Nhỏ hơn
        uAge = 28;
        pAge = 16;
        break;
      default:
        uAge = 20;
        pAge = 55;
    }

    if (isReversed) {
      return {
        speakerAge: pAge,
        listenerAge: uAge,
        speakerGender: partnerGender,
        listenerGender: userGender
      };
    }

    return {
      speakerAge: uAge,
      listenerAge: pAge,
      speakerGender: userGender,
      listenerGender: partnerGender
    };
  }, [ageStep, isReversed, userGender, partnerGender]);

  // Map contextStep (0: Trang trọng đình làng, 1: Lịch sự xã giao, 2: Thân mật ngõ xóm)
  const formality = useMemo(() => {
    switch (contextStep) {
      case 0:
        return 'formal' as const;
      case 1:
        return 'polite' as const;
      case 2:
      default:
        return 'intimate' as const;
    }
  }, [contextStep]);

  // Execute Algorithm A6
  const evaluatedResult = useMemo(() => {
    if (explicitPair) {
      return interpreter.interpret({
        speakerAge,
        listenerAge,
        relation: explicitPair.relation,
        listenerGender,
        speakerGender,
        formality,
        pairId: explicitPair.id
      });
    }

    return interpreter.interpret({
      speakerAge,
      listenerAge,
      relation: ageStep === 0 && contextStep === 0 ? 'traditional' : 'kin',
      listenerGender,
      speakerGender,
      formality
    });
  }, [interpreter, speakerAge, listenerAge, listenerGender, speakerGender, formality, explicitPair, ageStep, contextStep]);

  // Notify parent
  useEffect(() => {
    if (onPairChange) {
      onPairChange({
        speaker: evaluatedResult.speaker,
        listener: evaluatedResult.listener,
        pairId: evaluatedResult.pairId
      });
    }
  }, [evaluatedResult, onPairChange]);

  // Audio playback handler
  const handlePlayAudio = () => {
    if (isSpeaking) {
      speechService.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    speechService.speak(evaluatedResult.sampleSentence, {
      speed: 1.0,
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    });
  };

  const handleSelectPairFromDrawer = (pair: HonorificPairItem) => {
    setExplicitPair(pair);
    setIsDrawerOpen(false);
  };

  const handleApplyClick = () => {
    setApplyToast('Đã áp dụng quy tắc xưng hô vào cuộc trò chuyện!');
    setTimeout(() => setApplyToast(null), 2500);
  };

  // Step Labels matching Stitch
  const ageLabels = [
    { title: 'Bề trên', badge: 'Bậc Bề Trên' },
    { title: 'Lớn hơn', badge: 'Người Lớn Hơn' },
    { title: 'Ngang hàng', badge: 'Ngang Hàng Bạn Bè' },
    { title: 'Nhỏ hơn', badge: 'Người Nhỏ Hơn' }
  ];

  const contextLabels = [
    { title: 'Trang trọng', badge: 'Trang Trọng Đình Làng' },
    { title: 'Lịch sự xã giao', badge: 'Lịch Sự Xã Giao' },
    { title: 'Thân mật ngõ xóm', badge: 'Thân Mật Ngõ Xóm' }
  ];

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
            {/* Left: Back button + Logo + Title */}
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

              <img
                alt="Cu Tít Logo"
                className="h-7 w-auto object-contain shrink-0"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCK_OKRdGrKRg7ii4PAhJdPCiFAR-Jp99rQQ5x47sE-l2kgtYFFOeemlwpKJMuijUjq1ZIxI7fAI3rGrmEdJhz3sO7bnUfEJHMXIn4WokRx_GCYYFrl4NV9BW5x7P5Mmd0o1rPRmg-9yBE7zSaqKjR7yVPaST8Vcqenq_Rs8yWwIX6Qm_c0SoWT5QxI8ZNeezVWVj1Iq-CZk5mLmzUYqRCUNY48ssJ4MSR56vacn7AZ9_2pP_qyU1GR"
              />

              <h1 className="font-bold text-base truncate">Ma Trận Xưng Hô</h1>
            </div>

            {/* Right: Theme Switcher & 20-Pair Drawer & Volume Button */}
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
                onClick={() => setIsDrawerOpen(true)}
                title="Mở Bảng 20 Cặp A6"
                className={`h-10 px-2.5 rounded-lg flex items-center gap-1 font-bold text-xs transition-transform active:translate-y-0.5 ${
                  isDark
                    ? 'bg-[#e56c5e] text-[#5a0304] shadow-[0_3px_0_#5a0304]'
                    : 'bg-[#B45309] text-white shadow-[0_3px_0_#78350F]'
                }`}
              >
                <span className="material-symbols-outlined text-base">format_list_bulleted</span>
                <span>20 Cặp</span>
              </button>
            </div>
          </div>
        </header>

        {/* MAIN BODY CONTENT (STITCH MOBILE LAYOUT) */}
        <main className="flex-1 flex flex-col w-full pt-20 px-4 gap-y-4">
          {/* 1. HERO FOLK BANNER: CU TÍT & TRE TRÚC SCROLL */}
          <div
            className={`relative w-full rounded-2xl overflow-hidden p-4 shadow-[0_6px_0_#1c0904] ${
              isDark ? 'bg-[#301a12]' : 'bg-[#F6EDE3]'
            }`}
          >
            {/* Subtle folk glow */}
            <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-[#ffb4aa]/10 blur-xl pointer-events-none" />
            <div className="absolute -left-6 -top-6 w-28 h-28 rounded-full bg-[#f8bc4b]/10 blur-lg pointer-events-none" />

            <div className="flex items-center gap-3 relative z-10">
              {/* Mascot Token */}
              <div className="relative shrink-0">
                <div
                  className={`w-16 h-16 rounded-full p-1 shadow-[0_4px_0_#1c0904] flex items-center justify-center ${
                    isDark ? 'bg-[#3c241b]' : 'bg-[#EFE2D3]'
                  }`}
                >
                  <img
                    alt="Cu Tít đội mũ cối sao ngũ sắc"
                    className="w-full h-full rounded-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCjlHqM4ja6b3yJPmFXr5H4ic99XcWJ3djNNT05x-xxGQFdd8feLD5EHbGmx8EfkKTI90ajUnresuuw8iyqcuRrBjWXgVA96T8xMEet7L4xiHBmyg_lUJKoX1BZ1diBsz10_Nfu1oex8IAgCCY0NTnVfdU9B7WO9ufX0M-q6v0gCh4kkjlb84r0RVwCJrlgZQ41D9c4I0GaXnrt3l_3L5ZNNNfcLDSjBj8YM2Ho0asyYFJySoAtgIHt"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-[#f8bc4b] text-[#271900] px-1.5 py-0.5 rounded-full font-bold text-[10px] shadow-[0_2px_0_#1c0904] flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[11px]">psychology</span>
                  <span>Bí Kíp</span>
                </div>
              </div>

              {/* Scroll Title Frame */}
              <div className="flex flex-col min-w-0 flex-1">
                <div
                  className={`inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full font-semibold text-[11px] mb-1 ${
                    isDark
                      ? 'bg-[#e56c5e]/25 text-[#ffb4aa]'
                      : 'bg-[#B45309]/15 text-[#B45309]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">nature_people</span>
                  <span>Nếp Sống Sân Đình</span>
                </div>

                <h2 className="font-bold text-lg leading-tight truncate">Cây Xưng Hô Làng Xóm</h2>
                <p
                  className={`text-xs mt-0.5 line-clamp-1 ${
                    isDark ? 'text-[#dec0bc]' : 'text-[#78716C]'
                  }`}
                >
                  Kéo thanh gỗ mộc để đổi ngôi xưng chuẩn tình làng nghĩa xóm
                </p>
              </div>
            </div>
          </div>

          {/* 2. DYNAMIC LIVE DIALOG PREVIEW CARD (PARCHMENT TEXTURE STYLE) */}
          <div
            className={`relative w-full rounded-2xl p-4 shadow-[0_6px_0_#1c0904] transition-all duration-200 ${
              isDark
                ? 'bg-[#ffdeaa] text-[#271900]'
                : 'bg-[#FEF3C7] text-[#1C1917] border border-[#FCD34D]'
            }`}
          >
            {/* Ribbon Tag Top Right */}
            <div className="absolute top-0 right-4 -translate-y-1/2 bg-[#e56c5e] text-[#5a0304] font-bold px-3 py-0.5 rounded-full shadow-[0_3px_0_#1c0904] flex items-center gap-1 text-[11px]">
              <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
              <span>
                {ageLabels[ageStep].title} • {contextLabels[contextStep].title}
              </span>
            </div>

            {/* Speech Header */}
            <div className="flex items-center justify-between mb-2 pt-1">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-[#5f4100]">
                <span className="material-symbols-outlined text-base">record_voice_over</span>
                <span>Lời Chào Trong Ngữ Cảnh:</span>
              </div>

              {/* Nghe đọc Button */}
              <button
                onClick={handlePlayAudio}
                className={`h-8 px-2.5 rounded-lg flex items-center gap-1 font-bold text-xs transition-all active:translate-y-0.5 ${
                  isSpeaking
                    ? 'bg-[#DC2626] text-white shadow-[0_2px_0_#991B1B]'
                    : 'bg-[#220e07] text-[#f8bc4b] shadow-[0_2px_0_#1c0904]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {isSpeaking ? 'stop' : 'volume_up'}
                </span>
                <span>{isSpeaking ? 'Đang đọc...' : 'Nghe đọc'}</span>
              </button>
            </div>

            {/* The Sentence Output Box */}
            <div className="min-h-[72px] flex flex-col justify-center rounded-xl bg-white/80 backdrop-blur-sm p-3 shadow-inner mb-3">
              <div className="text-[11px] text-[#392600]/70 mb-1 flex items-center gap-1 font-medium">
                <span className="material-symbols-outlined text-[13px]">translate</span>
                <span>Câu gốc: "How are you today?"</span>
              </div>
              <p className="font-bold text-base text-[#271900] leading-snug tracking-tight">
                {evaluatedResult.sampleSentence}
              </p>
            </div>

            {/* Chunky Wooden Folk Grammatical Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {/* Tag Ngôi 1 (Sage/Teal tint) */}
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#9acde9] text-[#003548] font-bold text-xs shadow-[0_2px_0_#0f4c64]">
                <span className="material-symbols-outlined text-[13px]">face</span>
                <span>Ngôi 1: {evaluatedResult.speaker}</span>
              </div>

              {/* Tag Ngôi 2 (Terracotta tint) */}
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#e56c5e] text-[#5a0304] font-bold text-xs shadow-[0_2px_0_#5a0304]">
                <span className="material-symbols-outlined text-[13px]">elderly</span>
                <span>Ngôi 2: {evaluatedResult.listener}</span>
              </div>

              {/* Tag Trợ từ / Kính ngữ (Mustard ochre tint) */}
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#bc8714] text-[#392600] font-bold text-xs shadow-[0_2px_0_#5f4100]">
                <span className="material-symbols-outlined text-[13px]">verified</span>
                <span>Kính ngữ: {evaluatedResult.politeParticle}</span>
              </div>
            </div>
          </div>

          {/* 3. HANDCRAFTED FOLK CONTROLS (WOODEN CONSOLE CARD) */}
          <div
            className={`w-full rounded-2xl p-4 shadow-[0_6px_0_#1c0904] flex flex-col gap-y-4 ${
              isDark ? 'bg-[#301a12]' : 'bg-[#F6EDE3]'
            }`}
          >
            {/* Section Title */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-4 rounded-full bg-[#f8bc4b]" />
                <h3 className="font-bold text-sm tracking-tight">Bàn Quay Chuyển Ngôi Xưng</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3c241b] text-[#f8bc4b]">
                {evaluatedResult.pairId.toUpperCase()}
              </span>
            </div>

            {/* Slider 1: Độ Tuổi Tương Quan */}
            <div className="flex flex-col gap-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#f8bc4b] text-sm">
                    diversity_3
                  </span>
                  1. Quan Hệ & Độ Tuổi
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold text-[11px] shadow-[0_2px_0_#1c0904] ${
                    isDark ? 'bg-[#3c241b] text-[#f8bc4b]' : 'bg-[#EFE2D3] text-[#B45309]'
                  }`}
                >
                  {ageLabels[ageStep].badge}
                </span>
              </div>

              {/* Wooden Track with notches */}
              <div className="relative py-2 select-none">
                <div
                  className={`w-full h-3 rounded-full shadow-inner flex items-center justify-between px-2 ${
                    isDark ? 'bg-[#1c0904]' : 'bg-[#E5D5C0]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[#482f25]" />
                  <span className="w-2 h-2 rounded-full bg-[#482f25]" />
                  <span className="w-2 h-2 rounded-full bg-[#482f25]" />
                  <span className="w-2 h-2 rounded-full bg-[#482f25]" />
                </div>

                <input
                  type="range"
                  min="0"
                  max="3"
                  step="1"
                  value={ageStep}
                  onChange={(e) => {
                    setExplicitPair(null);
                    setAgeStep(parseInt(e.target.value, 10));
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />

                <div className="flex justify-between items-center px-0.5 mt-2 text-xs">
                  {ageLabels.map((lbl, idx) => (
                    <span
                      key={lbl.title}
                      className={
                        ageStep === idx
                          ? 'text-[#f8bc4b] font-bold'
                          : isDark
                          ? 'text-[#dec0bc] opacity-60'
                          : 'text-[#78716C]'
                      }
                    >
                      {lbl.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Divider Bar */}
            <div
              className={`w-full h-0.5 rounded-full ${isDark ? 'bg-[#3c241b]' : 'bg-[#E4D8C6]'}`}
            />

            {/* Slider 2: Bối Cảnh Làng Xóm */}
            <div className="flex flex-col gap-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#9acde9] text-sm">
                    temple_buddhist
                  </span>
                  2. Bối Cảnh Giao Tiếp
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold text-[11px] shadow-[0_2px_0_#1c0904] ${
                    isDark ? 'bg-[#3c241b] text-[#9acde9]' : 'bg-[#EFE2D3] text-[#0369A1]'
                  }`}
                >
                  {contextLabels[contextStep].badge}
                </span>
              </div>

              <div className="relative py-2 select-none">
                <div
                  className={`w-full h-3 rounded-full shadow-inner flex items-center justify-between px-3 ${
                    isDark ? 'bg-[#1c0904]' : 'bg-[#E5D5C0]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[#482f25]" />
                  <span className="w-2 h-2 rounded-full bg-[#482f25]" />
                  <span className="w-2 h-2 rounded-full bg-[#482f25]" />
                </div>

                <input
                  type="range"
                  min="0"
                  max="2"
                  step="1"
                  value={contextStep}
                  onChange={(e) => {
                    setExplicitPair(null);
                    setContextStep(parseInt(e.target.value, 10));
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />

                <div className="flex justify-between items-center px-0.5 mt-2 text-xs">
                  {contextLabels.map((lbl, idx) => (
                    <span
                      key={lbl.title}
                      className={
                        contextStep === idx
                          ? 'text-[#9acde9] font-bold'
                          : isDark
                          ? 'text-[#dec0bc] opacity-60'
                          : 'text-[#78716C]'
                      }
                    >
                      {lbl.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Divider Bar */}
            <div
              className={`w-full h-0.5 rounded-full ${isDark ? 'bg-[#3c241b]' : 'bg-[#E4D8C6]'}`}
            />

            {/* Giới tính & Góc nhìn đảo ngôi */}
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Giới tính người nói */}
                <div>
                  <span className="block font-medium mb-1 opacity-80 text-[11px]">Tôi là:</span>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'male', label: '👨 Nam' },
                      { id: 'female', label: '👩 Nữ' }
                    ].map((g) => {
                      const active = userGender === g.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => {
                            setExplicitPair(null);
                            setUserGender(g.id as any);
                          }}
                          className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                            active
                              ? isDark
                                ? 'bg-[#e56c5e] text-[#5a0304]'
                                : 'bg-[#B45309] text-white'
                              : isDark
                              ? 'bg-[#3c241b] text-[#dec0bc]'
                              : 'bg-[#EFE2D3] text-[#78716C]'
                          }`}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Giới tính đối phương */}
                <div>
                  <span className="block font-medium mb-1 opacity-80 text-[11px]">Đối phương:</span>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'male', label: '👨 Nam' },
                      { id: 'female', label: '👩 Nữ' }
                    ].map((g) => {
                      const active = partnerGender === g.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => {
                            setExplicitPair(null);
                            setPartnerGender(g.id as any);
                          }}
                          className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                            active
                              ? isDark
                                ? 'bg-[#9acde9] text-[#003548]'
                                : 'bg-[#0369A1] text-white'
                              : isDark
                              ? 'bg-[#3c241b] text-[#dec0bc]'
                              : 'bg-[#EFE2D3] text-[#78716C]'
                          }`}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Nút Đảo góc nhìn */}
              <button
                onClick={() => {
                  setExplicitPair(null);
                  setIsReversed((prev) => !prev);
                }}
                className={`w-full py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:translate-y-0.5 ${
                  isReversed
                    ? 'bg-[#f8bc4b] text-[#271900] shadow-[0_2px_0_#1c0904]'
                    : isDark
                    ? 'bg-[#3c241b] text-[#ffb4aa]'
                    : 'bg-[#EFE2D3] text-[#B45309]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">sync_alt</span>
                <span>
                  {isReversed ? 'Đối phương đang nói với Tôi' : 'Tôi đang nói với Đối phương'}
                </span>
              </button>
            </div>
          </div>

          {/* 4. CU TÍT FOLK WISDOM CARD */}
          <div
            className={`rounded-2xl p-4 shadow-[0_4px_0_#1c0904] flex items-start gap-3 ${
              isDark ? 'bg-[#3c241b]' : 'bg-[#EFE2D3]'
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-[#f8bc4b] text-[#271900] flex items-center justify-center shrink-0 shadow-[0_2px_0_#1c0904]">
              <span className="material-symbols-outlined text-xl">lightbulb</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-xs text-[#f8bc4b] mb-0.5">Lời Nhắn Của Cu Tít:</span>
              <p className="text-xs leading-relaxed opacity-90">{evaluatedResult.wisdomTip}</p>
            </div>
          </div>

          {/* 5. CHUNKY ACTION BUTTON: STAMPED TOY STYLE */}
          <button
            onClick={handleApplyClick}
            className="w-full h-14 rounded-2xl bg-[#e56c5e] text-[#5a0304] font-bold text-sm shadow-[0_5px_0_#5a0304] active:translate-y-1 active:shadow-[0_1px_0_#5a0304] transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-xl">check_circle</span>
            <span>Áp Dụng Vào Cuộc Trò Chuyện</span>
          </button>

          {/* Toast feedback */}
          {applyToast && (
            <div className="w-full p-2.5 rounded-xl bg-[#10B981] text-white font-bold text-xs text-center shadow-lg animate-bounce">
              ✓ {applyToast}
            </div>
          )}
        </main>

        {/* 6. FIXED BOTTOM NAVIGATION BAR (STITCH MOBILE TAB) */}
        <nav
          className={`fixed bottom-0 left-1/2 -translate-x-1/2 max-w-md w-full z-40 pb-safe backdrop-blur-xl border-t transition-colors duration-200 ${
            isDark
              ? 'bg-[#220e07]/95 border-[#3c241b] shadow-[0_-4px_20px_rgba(28,9,4,0.6)]'
              : 'bg-[#FFFBF5]/95 border-[#E5D5C0] shadow-[0_-4px_20px_rgba(180,83,9,0.06)]'
          }`}
        >
          <div className="flex items-center justify-between h-16 px-4 relative">
            <button className="flex-1 flex flex-col items-center justify-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-xl">forum</span>
              <span className="text-[10px] font-semibold">Hội thoại</span>
            </button>

            <button className="flex-1 flex flex-col items-center justify-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-xl">graphic_eq</span>
              <span className="text-[10px] font-semibold">Luyện thanh</span>
            </button>

            {/* Center Floating Mic */}
            <div className="flex-shrink-0 px-1 -mt-6">
              <button
                onClick={handlePlayAudio}
                className="w-13 h-13 p-3.5 rounded-full bg-[#e56c5e] text-[#5a0304] shadow-lg shadow-[#5a0304]/40 flex items-center justify-center active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-2xl">mic</span>
              </button>
            </div>

            {/* Active Tab: Đại từ */}
            <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#f8bc4b]">
              <span className="material-symbols-outlined text-xl">diversity_3</span>
              <span className="text-[10px] font-bold">Đại từ</span>
            </button>

            <button className="flex-1 flex flex-col items-center justify-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-xl">photo_camera</span>
              <span className="text-[10px] font-semibold">Camera AR</span>
            </button>
          </div>
        </nav>

        {/* 20-PAIR EXPLORER DRAWER MODAL */}
        <HonorificExplorerDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onSelectPair={handleSelectPairFromDrawer}
          theme={theme}
        />
      </div>
    </div>
  );
};
