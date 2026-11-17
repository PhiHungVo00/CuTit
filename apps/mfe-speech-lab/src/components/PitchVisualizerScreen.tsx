import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ToneSelectorDrawer, VIETNAMESE_6_TONES, ToneItem } from './ToneSelectorDrawer';
import { speechService } from '../services/speechService';
import { AudioPitchTracker, PitchAnalysisResult } from '../services/audioPitchTracker';

export interface PitchVisualizerScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const PitchVisualizerScreen: React.FC<PitchVisualizerScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTone, setSelectedTone] = useState<ToneItem>(VIETNAMESE_6_TONES[0]); // Thanh Hỏi 'Phở'
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingModel, setIsPlayingModel] = useState(false);
  const [scanProgress, setScanProgress] = useState<number | null>(null);

  // Analysis result from YIN (A1) and DTW (A2)
  const [analysisResult, setAnalysisResult] = useState<PitchAnalysisResult>({
    score: 88,
    userPoints: [
      { x: 30, y: 58 },
      { x: 75, y: 65 },
      { x: 110, y: 125 },
      { x: 175, y: 125 },
      { x: 220, y: 125 },
      { x: 255, y: 95 },
      { x: 292, y: 50 }
    ],
    targetPoints: [
      { x: 30, y: 55 },
      { x: 80, y: 60 },
      { x: 120, y: 145 },
      { x: 180, y: 145 },
      { x: 230, y: 145 },
      { x: 260, y: 85 },
      { x: 295, y: 45 }
    ],
    inflectionPoint: { x: 178, y: 145 },
    advice: 'Âm đầu rất êm! Hãy để vòm họng thả lỏng và nén nhẹ hơi xuống sâu hơn một chút ở giữa từ trước khi vút lên nhé!'
  });

  const isDark = theme === 'dark';
  const pitchTracker = useMemo(() => new AudioPitchTracker(), []);
  const scanAnimRef = useRef<number | null>(null);

  // Apply dark class to documentElement
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

  // Recalculate target points when selectedTone changes
  useEffect(() => {
    const initialEval = pitchTracker.evaluate(selectedTone.id);
    setAnalysisResult(initialEval);
  }, [selectedTone, pitchTracker]);

  // Animation sweep across graph
  const runScanAnimation = (durationMs: number) => {
    if (scanAnimRef.current) cancelAnimationFrame(scanAnimRef.current);
    const start = performance.now();

    const frame = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      setScanProgress(progress);

      if (progress < 1) {
        scanAnimRef.current = requestAnimationFrame(frame);
      } else {
        setTimeout(() => setScanProgress(null), 250);
      }
    };

    scanAnimRef.current = requestAnimationFrame(frame);
  };

  // Play model pronunciation
  const handlePlayModel = async () => {
    if (isPlayingModel) {
      speechService.stop();
      setIsPlayingModel(false);
      setScanProgress(null);
      return;
    }

    setIsPlayingModel(true);
    runScanAnimation(1200 / playbackSpeed);

    await speechService.speak(selectedTone.sampleWord, {
      speed: playbackSpeed,
      onEnd: () => setIsPlayingModel(false),
      onError: () => setIsPlayingModel(false)
    });
  };

  // Start holding mic recording
  const handleStartRecording = async (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) e.preventDefault();
    setIsRecording(true);
    runScanAnimation(2000);

    await pitchTracker.start(() => {
      // Dynamic live wave updates can be rendered here
    });
  };

  // Stop holding mic recording
  const handleStopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    pitchTracker.stop();

    // Evaluate via Algorithm A2 (DTW)
    const result = pitchTracker.evaluate(selectedTone.id);
    setAnalysisResult(result);
  };

  // Convert points to SVG smooth path string
  const generatePathString = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += ` Q ${prev.x},${prev.y} ${cx},${(prev.y + curr.y) / 2} T ${curr.x},${curr.y}`;
    }
    return d;
  };

  const targetPath = useMemo(
    () => generatePathString(analysisResult.targetPoints),
    [analysisResult.targetPoints]
  );
  const userPath = useMemo(
    () => generatePathString(analysisResult.userPoints),
    [analysisResult.userPoints]
  );

  return (
    <div
      className={`w-full min-h-screen font-sans ${
        isDark ? 'bg-[#220e07] text-[#ffdbcf]' : 'bg-[#FFFBF5] text-[#271900]'
      }`}
    >
      {/* MOBILE CONTAINER (Full width on mobile, centered max-w-md on desktop) */}
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

              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold text-[#f8bc4b] uppercase tracking-wider">
                  Tiếng Việt Cu Tít
                </span>
                <h1 className="font-bold text-base truncate">Luyện Thanh F0</h1>
              </div>
            </div>

            {/* Right: Streak Flame + Theme Switcher + Tone Drawer button */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                  isDark ? 'bg-[#3c241b] text-[#f8bc4b]' : 'bg-[#EFE2D3] text-[#B45309]'
                }`}
              >
                <span className="material-symbols-outlined text-sm text-[#f8bc4b]">
                  local_fire_department
                </span>
                <span>7 ngày</span>
              </div>

              <button
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                title="Đổi giao diện Dark/Light"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-transform active:translate-y-0.5 ${
                  isDark
                    ? 'bg-[#3c241b] text-[#f8bc4b] shadow-[0_2px_0_#1c0904]'
                    : 'bg-[#EFE2D3] text-[#B45309] shadow-[0_2px_0_#D6C7B2]'
                }`}
              >
                <span className="material-symbols-outlined text-lg">
                  {isDark ? 'light_mode' : 'dark_mode'}
                </span>
              </button>

              <button
                onClick={() => setIsDrawerOpen(true)}
                title="Chọn thanh điệu"
                className="h-9 px-2.5 rounded-lg bg-[#e56c5e] text-[#5a0304] font-bold text-xs shadow-[0_2px_0_#5a0304] flex items-center gap-1 active:translate-y-0.5 transition-transform"
              >
                <span className="material-symbols-outlined text-sm">tune</span>
                <span>6 Thanh</span>
              </button>
            </div>
          </div>
        </header>

        {/* MAIN BODY SCROLLABLE CONTENT */}
        <main className="flex-1 w-full pt-20 px-4 flex flex-col gap-4">
          {/* 1. WORD SHOWCASE & FOLKLORE TOY BEZEL */}
          <section
            className={`rounded-2xl p-4 shadow-[0_6px_0_#1c0904] relative overflow-hidden flex flex-col gap-3 transition-colors ${
              isDark ? 'bg-[#3c241b]' : 'bg-[#EFE2D3]'
            }`}
          >
            {/* Tone Badge & Score Tag */}
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-[0_2px_0_#1c0904] ${
                  isDark ? 'bg-[#301a12] text-[#f8bc4b]' : 'bg-white text-[#B45309]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">music_note</span>
                <span>{selectedTone.name}</span>
              </div>

              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  isDark ? 'bg-[#2c160e] text-[#9acde9]' : 'bg-[#FAF7F2] text-[#003548]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">speed</span>
                <span>
                  Độ chuẩn: <b className="text-[#f8bc4b] font-bold">{analysisResult.score}%</b>
                </span>
              </div>
            </div>

            {/* Main Word Spotlight */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-[#e56c5e] leading-none">
                    {selectedTone.sampleWord.slice(0, -1)}
                  </span>
                  <span
                    className="text-4xl font-extrabold text-[#f8bc4b] leading-none animate-bounce inline-block"
                    style={{ animationDuration: '2s' }}
                  >
                    {selectedTone.sampleWord.slice(-1)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs font-bold bg-[#0f4c64] text-[#89bcd7] px-2 py-0.5 rounded">
                    {selectedTone.ipa}
                  </span>
                  <span className="text-xs opacity-80">Giọng Hà Nội chuẩn</span>
                </div>
              </div>

              {/* Avatar Cu Tít Demonstration Hand Gesture */}
              <div
                className={`relative w-20 h-20 shrink-0 flex items-center justify-center rounded-2xl shadow-[0_3px_0_#1c0904] p-1.5 ${
                  isDark ? 'bg-[#301a12]' : 'bg-white'
                }`}
              >
                <img
                  alt="Cu Tít làm cử chỉ tay uốn lượn theo thanh hỏi"
                  className="w-full h-full object-contain rounded-xl"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCjlHqM4ja6b3yJPmFXr5H4ic99XcWJ3djNNT05x-xxGQFdd8feLD5EHbGmx8EfkKTI90ajUnresuuw8iyqcuRrBjWXgVA96T8xMEet7L4xiHBmyg_lUJKoX1BZ1diBsz10_Nfu1oex8IAgCCY0NTnVfdU9B7WO9ufX0M-q6v0gCh4kkjlb84r0RVwCJrlgZQ41D9c4I0GaXnrt3l_3L5ZNNNfcLDSjBj8YM2Ho0asyYFJySoAtgIHt"
                />
                <div className="absolute -bottom-2 -left-1 bg-[#f8bc4b] text-[#271900] font-bold text-[10px] px-1.5 py-0.5 rounded-full shadow-[0_2px_0_#1c0904] flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[10px]">gesture</span>
                  <span>Hạ rồi vút</span>
                </div>
              </div>
            </div>

            {/* Hand-Carved Speaker Audio Trigger */}
            <button
              onClick={handlePlayModel}
              className="w-full mt-1 py-2.5 px-4 bg-[#bc8714] hover:bg-[#f8bc4b] text-[#271900] rounded-xl font-bold text-xs shadow-[0_4px_0_#392600] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-lg">
                {isPlayingModel ? 'graphic_eq' : 'volume_up'}
              </span>
              <span>
                {isPlayingModel ? 'Đang phát âm mẫu...' : `Nghe Cu Tít phát âm mẫu "${selectedTone.sampleWord}"`}
              </span>
            </button>
          </section>

          {/* 2. PITCH CURVE LAB VIEWPORT (F0 PITCH TRAJECTORY SLATE) */}
          <section
            className={`rounded-2xl p-4 shadow-[0_8px_0_#1c0904] flex flex-col gap-3 relative overflow-hidden ${
              isDark ? 'bg-[#1c0904]' : 'bg-[#FFFDF9] border border-[#E5D5C0]'
            }`}
          >
            {/* Header & Legend */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <span className="material-symbols-outlined text-[#9acde9] text-base">ssid_chart</span>
                <span>Đồ thị Cao độ F0 (Hz)</span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#9acde9] inline-block"></span>
                  <span className="opacity-80">Mẫu chuẩn</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e56c5e] inline-block"></span>
                  <span className="opacity-80">Giọng bạn</span>
                </div>
              </div>
            </div>

            {/* Canvas Slate Screen */}
            <div className="w-full bg-[#110502] rounded-xl p-3 shadow-[inset_0_3px_8px_rgba(0,0,0,0.6)] relative flex flex-col justify-between overflow-hidden">
              {/* Grid Overlay / Tone Tiers */}
              <div className="absolute inset-0 flex flex-col justify-between p-3 opacity-20 pointer-events-none">
                <div className="w-full border-t border-dashed border-[#a58b87]"></div>
                <div className="w-full border-t border-dashed border-[#a58b87]"></div>
                <div className="w-full border-t border-dashed border-[#a58b87]"></div>
                <div className="w-full border-t border-dashed border-[#a58b87]"></div>
              </div>

              {/* Tone Contour Labels on Y-axis */}
              <div className="absolute top-2 left-2 flex flex-col gap-3 text-[10px] font-semibold text-[#a58b87]/60 pointer-events-none">
                <span>Cao (250Hz)</span>
                <span>Trung (180Hz)</span>
                <span>Trũng (120Hz)</span>
              </div>

              {/* SVG Pitch Trajectory Curves */}
              <svg
                className="w-full h-44 drop-shadow-[0_2px_10px_rgba(248,188,75,0.15)] relative z-10 overflow-visible"
                viewBox="0 0 320 180"
              >
                <defs>
                  <linearGradient id="targetGrad" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#9acde9" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#6E8B7F" stopOpacity="1" />
                    <stop offset="100%" stopColor="#9acde9" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="userGrad" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#ffb4aa" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#e56c5e" stopOpacity="1" />
                    <stop offset="100%" stopColor="#f8bc4b" stopOpacity="0.9" />
                  </linearGradient>
                </defs>

                {/* Target Native Dipping Curve */}
                <path
                  d={targetPath}
                  fill="none"
                  stroke="url(#targetGrad)"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                  className="opacity-75"
                />

                {/* User Attempted Curve */}
                <path
                  d={userPath}
                  fill="none"
                  stroke="url(#userGrad)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="4.5"
                />

                {/* Inflection Marker: Deep Dip Point */}
                {analysisResult.inflectionPoint && (
                  <g
                    transform={`translate(${analysisResult.inflectionPoint.x}, ${analysisResult.inflectionPoint.y})`}
                  >
                    <circle className="fill-[#f8bc4b] animate-ping opacity-60" r="7" />
                    <circle className="fill-[#f8bc4b]" r="4.5" />
                    <text
                      className="fill-[#f8bc4b] text-[10px] font-bold"
                      textAnchor="middle"
                      x="0"
                      y="18"
                    >
                      Điểm uốn trũng
                    </text>
                  </g>
                )}

                {/* Live Scanner Needle Line */}
                {scanProgress !== null && (
                  <line
                    stroke="#f8bc4b"
                    strokeDasharray="3 3"
                    strokeWidth="2"
                    x1={30 + scanProgress * 265}
                    x2={30 + scanProgress * 265}
                    y1="10"
                    y2="170"
                  />
                )}
              </svg>

              {/* Timing Guides along X-Axis */}
              <div className="flex justify-between items-center px-4 pt-1 text-[10px] text-[#a58b87]/70">
                <span>0ms (Bắt đầu)</span>
                <span>180ms (Đáy giọng)</span>
                <span>350ms (Nhả hơi)</span>
              </div>
            </div>

            {/* Playback Speed Wooden Chunk Toggles */}
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[11px] font-semibold opacity-80">
                Tốc độ phát chậm để phân tích:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { speed: 0.5, label: '0.5x Chậm' },
                  { speed: 0.75, label: '0.75x Êm tai' },
                  { speed: 1.0, label: '1.0x Chuẩn' }
                ].map((item) => (
                  <button
                    key={item.speed}
                    onClick={() => setPlaybackSpeed(item.speed)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                      playbackSpeed === item.speed
                        ? 'bg-[#0f4c64] text-[#89bcd7] shadow-[0_2px_0_#003548]'
                        : isDark
                        ? 'bg-[#3c241b] text-[#ffdbcf] shadow-[0_2px_0_#1c0904]'
                        : 'bg-[#EFE2D3] text-[#271900] shadow-[0_2px_0_#D6C7B2]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 3. CU TÍT TEACHER'S WARM FOLK CRAFT CARD */}
          <section
            className={`rounded-2xl p-4 shadow-[0_4px_0_#1c0904] flex items-start gap-3 ${
              isDark ? 'bg-[#301a12]' : 'bg-[#EFE2D3]'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-[#482f25] flex items-center justify-center shrink-0 shadow-[0_2px_0_#1c0904]">
              <span className="material-symbols-outlined text-[#f8bc4b] text-xl">wb_incandescent</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-bold text-xs text-[#f8bc4b]">Mẹo nhỏ từ Cu Tít:</span>
                <span className="text-[10px] font-bold bg-[#3c241b] text-[#ffdbcf] px-1.5 py-0.2 rounded">
                  Độ khớp {analysisResult.score}%
                </span>
              </div>
              <p className="text-xs leading-relaxed opacity-90">{analysisResult.advice}</p>
            </div>
          </section>

          {/* 4. BIG INTERACTIVE PRACTICE CONSOLE DOCK */}
          <div className="flex flex-col gap-2 pt-1 pb-4">
            <button
              onMouseDown={handleStartRecording}
              onMouseUp={handleStopRecording}
              onMouseLeave={handleStopRecording}
              onTouchStart={handleStartRecording}
              onTouchEnd={handleStopRecording}
              className={`w-full py-4 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                isRecording
                  ? 'bg-[#93000a] text-white shadow-none translate-y-1'
                  : 'bg-[#e56c5e] text-[#5a0304] shadow-[0_5px_0_#5a0304] active:translate-y-1 active:shadow-none'
              }`}
            >
              <span className="material-symbols-outlined text-2xl">
                {isRecording ? 'graphic_eq' : 'mic'}
              </span>
              <span>
                {isRecording
                  ? `Đang thu âm... Hãy ngân vang "${selectedTone.sampleWord}"`
                  : `Giữ Nút Để Luyện Âm "${selectedTone.sampleWord}"`}
              </span>
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] opacity-75">
              <span className="material-symbols-outlined text-xs text-[#f8bc4b]">lock_reset</span>
              <span>Thuật toán A1 (YIN) & A2 (DTW) chấm điểm thời gian thực</span>
            </div>
          </div>
        </main>

        {/* 5. FIXED BOTTOM NAVIGATION BAR */}
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

            {/* Active Tab: Luyện thanh (M2) */}
            <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#f8bc4b]">
              <span className="material-symbols-outlined text-xl">graphic_eq</span>
              <span className="text-[10px] font-bold">Luyện thanh</span>
            </button>

            {/* Center Floating Mic */}
            <div className="flex-shrink-0 px-1 -mt-6">
              <button
                onClick={handlePlayModel}
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

        {/* 6-TONE SELECTOR DRAWER */}
        <ToneSelectorDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          selectedToneId={selectedTone.id}
          onSelectTone={(t) => setSelectedTone(t)}
          isDark={isDark}
        />
      </div>
    </div>
  );
};
