import React, { useState, useEffect } from 'react';
import { calculateSM2, SRSIterator, type SRSCardItem } from '@vietlearning/shared';

interface AnalyticsSrsScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

interface SrsReviewCard extends SRSCardItem {
  type: 'honorific' | 'phonetics' | 'bamboo_syntax' | 'dialect' | 'culture';
  front: string;
  back: string;
  hint: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  audioPrompt?: string;
}

const INITIAL_SRS_CARDS: SrsReviewCard[] = [
  {
    id: 'srs-1',
    itemRef: 'Kính ngữ bề trên: Dạ thưa',
    type: 'honorific',
    dueAt: new Date(),
    front: 'Khi thưa gửi với người lớn tuổi hơn (bậc Bác, Chú), từ mở đầu bắt buộc là gì?',
    back: 'Từ "Dạ" hoặc "Dạ thưa" ở đầu câu, kèm trợ từ "ạ" ở cuối câu (Ví dụ: "Dạ thưa Bác, cháu mới về ạ").',
    hint: 'Thuật toán A6: Cặp xưng hô Cháu - Bác.',
    ease: 250,
    intervalDays: 1,
    repetitions: 2,
    audioPrompt: 'Dạ thưa Bác, cháu mới về ạ'
  },
  {
    id: 'srs-2',
    itemRef: 'Phân biệt thanh Ngã (~) và Hỏi (?)',
    type: 'phonetics',
    dueAt: new Date(),
    front: 'Đặc điểm contour cao độ F0 của thanh Ngã khác thanh Hỏi như thế nào?',
    back: 'Thanh Ngã có bước gãy thanh môn (glottal stop) ở giữa rồi vút lên cao. Thanh Hỏi lượn xuống đáy rồi lên nhẹ.',
    hint: 'Thuật toán A1 & A2: Phân tích đường cong cao độ F0.',
    ease: 236,
    intervalDays: 3,
    repetitions: 1,
    audioPrompt: 'Mãnh liệt và Mảnh khảnh'
  },
  {
    id: 'srs-3',
    itemRef: 'Đốt tre: Trật tự bổ ngữ chỉ nơi chốn',
    type: 'bamboo_syntax',
    dueAt: new Date(),
    front: 'Trong câu "Bé Cu Tít đi bắt cá ở ngoài đồng", cụm từ "ở ngoài đồng" đóng vai trò đốt tre gì?',
    back: 'Đốt tre Trạng ngữ / Bổ ngữ chỉ nơi chốn [LOC_MOD], thường đứng sau vị ngữ hành động [VP].',
    hint: 'Thuật toán A8: Cú pháp đốt tre ghép câu tiếng Việt.',
    ease: 260,
    intervalDays: 6,
    repetitions: 3,
    audioPrompt: 'Bé Cu Tít đi bắt cá ở ngoài đồng'
  },
  {
    id: 'srs-4',
    itemRef: 'Phương ngữ Nam Bộ: Nước mắm cá linh',
    type: 'dialect',
    dueAt: new Date(),
    front: 'Người miền Nam thường nói "Thiệt hông?" tương đương với câu gì ở miền Bắc?',
    back: '"Thật không?" hoặc "Thật thế à?". Từ "thiệt" là biến âm của "thật".',
    hint: 'Thuật toán A7: Bản đồ từ vựng phương ngữ 3 miền.',
    ease: 240,
    intervalDays: 2,
    repetitions: 2,
    audioPrompt: 'Thiệt hông vậy nè trời'
  }
];

const MASTERED_VOCABULARY = [
  { word: 'Kính cẩn', pinyin: 'kính cẩn', tag: 'Kính ngữ', level: 'B1', meaning: 'Thái độ tôn kính, lễ phép tuyệt đối' },
  { word: 'Dạ thưa', pinyin: 'dạ thưa', tag: 'Kính ngữ', level: 'A1', meaning: 'Lời thưa gửi mở đầu chuẩn mực của người nhỏ tuổi' },
  { word: 'Tròn vành rõ chữ', pinyin: 'tròn vành rõ chữ', tag: 'Phát âm', level: 'B2', meaning: 'Phát âm chuẩn xác nguyên âm và phụ âm cuối' },
  { word: 'Khắc nhập', pinyin: 'khắc nhập', tag: 'Đốt tre', level: 'A2', meaning: 'Ghép nối các thành phần câu theo đúng trật tự' },
  { word: 'Miệt vườn', pinyin: 'miệt vườn', tag: 'Phương ngữ', level: 'A2', meaning: 'Vùng đất trồng cây ăn trái trù phú ở Tây Nam Bộ' },
  { word: 'Nón bài thơ', pinyin: 'nón bài thơ', tag: 'Văn hóa', level: 'A1', meaning: 'Nón lá truyền thống xứ Huế soi dưới nắng hiện câu thơ' },
  { word: 'Cơm tấm sườn bì', pinyin: 'cơm tấm', tag: 'Văn hóa', level: 'A1', meaning: 'Món ăn đặc trưng gắn liền với đời sống Sài Gòn' },
  { word: 'Trống đồng Đông Sơn', pinyin: 'trống đồng', tag: 'Văn hóa', level: 'B1', meaning: 'Biểu tượng tinh hoa văn hóa thời kỳ dựng nước' }
];

export const AnalyticsSrsScreen: React.FC<AnalyticsSrsScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'srs' | 'mastered'>('overview');
  
  // SRS state
  const [srsCards, setSrsCards] = useState<SrsReviewCard[]>(INITIAL_SRS_CARDS);
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [reviewComplete, setReviewComplete] = useState<boolean>(false);
  const [lastReviewFeedback, setLastReviewFeedback] = useState<string | null>(null);

  // Vocabulary search & filter
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Audio speech preview
  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Đánh giá ôn tập theo SuperMemo-2 (A4)
  const handleRateCard = (quality: number) => {
    const currentCard = srsCards[activeCardIndex];
    if (!currentCard) return;

    const result = calculateSM2(
      currentCard.ease,
      currentCard.intervalDays,
      currentCard.repetitions,
      quality
    );

    const updatedCard: SrsReviewCard = {
      ...currentCard,
      ease: result.ease,
      intervalDays: result.intervalDays,
      repetitions: result.repetitions,
      dueAt: result.dueAt
    };

    const nextList = [...srsCards];
    nextList[activeCardIndex] = updatedCard;
    setSrsCards(nextList);

    setLastReviewFeedback(
      `Đã tính xong chu kỳ SM-2: Khoảng cách mới ${result.intervalDays} ngày (Hệ số Ease ${(result.ease / 100).toFixed(2)})`
    );

    setTimeout(() => {
      setIsFlipped(false);
      setLastReviewFeedback(null);
      if (activeCardIndex + 1 < srsCards.length) {
        setActiveCardIndex(activeCardIndex + 1);
      } else {
        setReviewComplete(true);
      }
    }, 1200);
  };

  const isDark = theme === 'dark';

  // Lọc từ vựng
  const filteredVocab = MASTERED_VOCABULARY.filter((item) => {
    const matchesTag = selectedTag === 'all' || item.tag === selectedTag;
    const matchesSearch = item.word.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      item.meaning.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchesTag && matchesSearch;
  });

  return (
    <div
      className={`min-h-screen w-full max-w-md mx-auto flex flex-col font-sans transition-colors duration-200 pb-24 ${
        isDark ? 'bg-[#220e07] text-[#ffb4aa]' : 'bg-[#fcf9f2] text-[#220e07]'
      }`}
    >
      {/* Top Header */}
      <header
        className={`px-4 pt-4 pb-3 sticky top-0 z-30 flex items-center justify-between border-b ${
          isDark ? 'bg-[#220e07]/90 border-[#e56c5e]/20 backdrop-blur-md' : 'bg-[#fcf9f2]/90 border-[#7d3326]/10 backdrop-blur-md'
        }`}
      >
        <div className="flex items-center space-x-2">
          <button
            aria-label="Quay lại"
            onClick={() => (onBack ? onBack() : window.history.back())}
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform active:translate-y-0.5 ${
              isDark
                ? 'bg-[#3c241b] text-[#ffb4aa] shadow-[0_3px_0_#1c0904]'
                : 'bg-[#EFE2D3] text-[#B45309] shadow-[0_3px_0_#D6C7B2]'
            }`}
          >
            <span className="material-symbols-outlined text-xl">arrow_back_ios_new</span>
          </button>
          <div className="w-9 h-9 rounded-full bg-[#e56c5e]/20 border border-[#e56c5e] flex items-center justify-center text-lg">
            📊
          </div>
          <div>
            <h1 className={`text-base font-bold tracking-tight flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-[#220e07]'}`}>
              <span>Tiến Trình & Ôn Tập SRS</span>
            </h1>
            <p className="text-[11px] opacity-70">
              Ôn tập đúng lúc & Phân tích 6 kỹ năng
            </p>
          </div>
        </div>

        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`p-1.5 rounded-lg border text-xs transition-colors ${
            isDark
              ? 'border-[#e56c5e]/40 bg-[#1a0a05] text-[#f8bc4b]'
              : 'border-[#7d3326]/30 bg-[#f3ede2] text-[#b84835]'
          }`}
          title="Chuyển chế độ màu"
        >
          {isDark ? '☀️ Tre Sáng' : '🌙 Gỗ Mộc'}
        </button>
      </header>

      {/* Sub Tabs */}
      <div className="px-4 pt-3 flex gap-2">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
            activeSubTab === 'overview'
              ? 'bg-[#e56c5e] text-white border-[#e56c5e] shadow-md shadow-[#e56c5e]/20'
              : isDark
              ? 'bg-[#1a0a05] text-white/70 border-white/10 hover:border-[#e56c5e]/40'
              : 'bg-[#f3ede2] text-[#220e07]/70 border-black/10 hover:border-[#b84835]/40'
          }`}
        >
          📈 Tổng Quan
        </button>
        <button
          onClick={() => setActiveSubTab('srs')}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
            activeSubTab === 'srs'
              ? 'bg-[#e56c5e] text-white border-[#e56c5e] shadow-md shadow-[#e56c5e]/20'
              : isDark
              ? 'bg-[#1a0a05] text-white/70 border-white/10 hover:border-[#e56c5e]/40'
              : 'bg-[#f3ede2] text-[#220e07]/70 border-black/10 hover:border-[#b84835]/40'
          }`}
        >
          <span>🧠 Thẻ Ôn SM-2</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#f8bc4b] text-[#220e07] font-bold">
            {srsCards.length}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('mastered')}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
            activeSubTab === 'mastered'
              ? 'bg-[#e56c5e] text-white border-[#e56c5e] shadow-md shadow-[#e56c5e]/20'
              : isDark
              ? 'bg-[#1a0a05] text-white/70 border-white/10 hover:border-[#e56c5e]/40'
              : 'bg-[#f3ede2] text-[#220e07]/70 border-black/10 hover:border-[#b84835]/40'
          }`}
        >
          🏆 Kho Đã Thuộc
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-4 space-y-4">
        {activeSubTab === 'overview' && (
          <div className="space-y-4">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-3 gap-2.5">
              <div
                className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center ${
                  isDark ? 'bg-[#1a0a05] border-[#e56c5e]/20' : 'bg-white border-[#7d3326]/10'
                }`}
              >
                <span className="text-xl">🔥</span>
                <span className="text-lg font-black text-[#f8bc4b] mt-0.5">7 Ngày</span>
                <span className="text-[10px] opacity-70">Chuỗi học tập</span>
              </div>
              <div
                className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center ${
                  isDark ? 'bg-[#1a0a05] border-[#e56c5e]/20' : 'bg-white border-[#7d3326]/10'
                }`}
              >
                <span className="text-xl">⏱️</span>
                <span className={`text-lg font-black ${isDark ? 'text-white' : 'text-[#3f2418]'}` }>52 Phút</span>
                <span className="text-[10px] opacity-70">Tổng thời gian</span>
              </div>
              <div
                className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center ${
                  isDark ? 'bg-[#1a0a05] border-[#e56c5e]/20' : 'bg-white border-[#7d3326]/10'
                }`}
              >
                <span className="text-xl">🎯</span>
                <span className="text-lg font-black text-[#e56c5e] mt-0.5">92%</span>
                <span className="text-[10px] opacity-70">Độ chuẩn xác</span>
              </div>
            </div>

            {/* 7-Day Streak Calendar */}
            <div
              className={`p-4 rounded-2xl border ${
                isDark ? 'bg-[#1a0a05] border-[#e56c5e]/25' : 'bg-white border-[#7d3326]/15'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">📅</span>
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#3f2418]'}` }>
                    Chuỗi Giữ Lửa 7 Ngày Qua
                  </h3>
                </div>
                <span className="text-[11px] font-medium text-[#f8bc4b]">
                  Tuyệt vời! Không đứt gãy
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center">
                {[
                  { day: 'T2', active: true, mins: 12 },
                  { day: 'T3', active: true, mins: 15 },
                  { day: 'T4', active: true, mins: 8 },
                  { day: 'T5', active: true, mins: 18 },
                  { day: 'T6', active: true, mins: 20 },
                  { day: 'T7', active: true, mins: 25 },
                  { day: 'CN', active: true, mins: 14 }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={`py-2 px-1 rounded-xl flex flex-col items-center justify-between border ${
                      item.active
                        ? 'bg-[#e56c5e]/15 border-[#e56c5e] border-[#e56c5e]'
                        : isDark
                        ? 'bg-black/20 border-white/5 opacity-40'
                        : 'bg-black/5 border-black/5 opacity-40'
                    }`}
                  >
                    <span className="text-[10px] opacity-75">{item.day}</span>
                    <span className="text-sm my-1">🔥</span>
                    <span className="text-[9px] font-bold text-[#f8bc4b]">{item.mins}p</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 6-Skill Progress Metrics */}
            <div
              className={`p-4 rounded-2xl border space-y-3 ${
                isDark ? 'bg-[#1a0a05] border-[#e56c5e]/25' : 'bg-white border-[#7d3326]/15'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🎯</span>
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#3f2418]'}` }>
                    Đánh Giá Năng Lực 6 Trọng Tâm
                  </h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0f4c64] text-[#38bdf8] font-bold border border-[#38bdf8]/30">
                  Ước tính CEFR: A2+
                </span>
              </div>

              {[
                { label: 'Phát âm & Thanh điệu', score: 88, color: '#e56c5e', icon: '🎤' },
                { label: 'Ghép câu Đốt tre', score: 92, color: '#f8bc4b', icon: '🎋' },
                { label: 'Xưng hô 20 cặp', score: 96, color: '#38bdf8', icon: '🏮' },
                { label: 'Phương ngữ 3 miền', score: 84, color: '#4ade80', icon: '🗺️' },
                { label: 'Văn hóa & Tục ngữ phong tục', score: 90, color: '#c084fc', icon: '📜' },
                { label: 'Phản xạ giao tiếp tự nhiên', score: 86, color: '#fb923c', icon: '💬' }
              ].map((skill, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className={`flex items-center gap-1 ${isDark ? 'text-white/90' : 'text-[#3f2418]'}` }>
                      <span>{skill.icon}</span>
                      <span className="text-[11px] font-medium">{skill.label}</span>
                    </span>
                    <span className="font-bold text-xs" style={{ color: skill.color }}>
                      {skill.score}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${skill.score}%`,
                        backgroundColor: skill.color
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Action: Start Practice */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between ${
                isDark
                  ? 'bg-gradient-to-r from-[#e56c5e]/20 to-[#0f4c64]/30 border-[#e56c5e]/30'
                  : 'bg-gradient-to-r from-[#f8bc4b]/20 to-[#e56c5e]/15 border-[#7d3326]/20'
              }`}
            >
              <div>
                <h4 className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#3f2418]'}` }>Có 4 thẻ đến kỳ ôn tập hôm nay</h4>
                <p className="text-[11px] opacity-75 mt-0.5">
                  Ôn đúng nhịp ngắt quãng giúp não bộ ghi nhớ sâu hơn gấp 3 lần!
                </p>
              </div>
              <button
                onClick={() => setActiveSubTab('srs')}
                className="px-3.5 py-2 rounded-xl bg-[#e56c5e] text-white text-xs font-bold hover:bg-[#d4584b] shadow-md shadow-[#e56c5e]/30 transition-all shrink-0 ml-2"
              >
                Ôn Tập Ngay
              </button>
            </div>
          </div>
        )}

        {/* SRS Flashcards Review Tab */}
        {activeSubTab === 'srs' && (
          <div className="space-y-4">
            {reviewComplete ? (
              <div
                className={`p-6 rounded-2xl border text-center space-y-4 ${
                  isDark ? 'bg-[#1a0a05] border-[#e56c5e]/30' : 'bg-white border-[#7d3326]/20'
                }`}
              >
                <div className="w-16 h-16 rounded-full bg-[#f8bc4b]/20 border border-[#f8bc4b] flex items-center justify-center mx-auto text-3xl">
                  🎉
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Hoàn Thành Đợt Ôn Tập SRS!
                  </h3>
                  <p className="text-xs opacity-75 mt-1 max-w-xs mx-auto">
                    Bé Cu Tít đã tính toán lại chu kỳ ôn tập cho tất cả các thẻ của bạn.
                  </p>
                </div>
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setReviewComplete(false);
                      setActiveCardIndex(0);
                      setIsFlipped(false);
                    }}
                    className="w-full py-2.5 rounded-xl border border-white/20 text-xs font-bold text-white hover:bg-white/5 transition-all"
                  >
                    🔄 Xem Lại Danh Sách Thẻ
                  </button>
                  {onNavigateTab && (
                    <button
                      onClick={() => onNavigateTab('practice')}
                      className="w-full py-2.5 rounded-xl bg-[#e56c5e] text-white text-xs font-bold shadow-md shadow-[#e56c5e]/30 hover:bg-[#d4584b] transition-all"
                    >
                      🎋 Luyện Tập Bài Thực Tế (M5 / M8)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Progress bar */}
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-semibold text-white/80">
                    Thẻ {activeCardIndex + 1} / {srsCards.length}
                  </span>
                  <span className="text-[11px] text-[#f8bc4b] font-bold">
                    Chu kỳ hiện tại: {srsCards[activeCardIndex].intervalDays} ngày
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[#e56c5e] rounded-full transition-all duration-300"
                    style={{
                      width: `${((activeCardIndex + 1) / srsCards.length) * 100}%`
                    }}
                  />
                </div>

                {/* Flip Card Container */}
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className={`min-h-[260px] p-5 rounded-2xl border cursor-pointer relative flex flex-col justify-between transition-all duration-300 select-none shadow-lg ${
                    isDark
                      ? isFlipped
                        ? 'bg-[#2d150d] border-[#f8bc4b]/50 shadow-[#2d150d]/60'
                        : 'bg-[#1a0a05] border-[#e56c5e]/30 shadow-[#1a0a05]/60'
                      : isFlipped
                      ? 'bg-[#fcf3e6] border-[#f8bc4b] shadow-amber-900/10'
                      : 'bg-white border-[#7d3326]/20 shadow-stone-300'
                  }`}
                >
                  {/* Top card pill & audio */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border uppercase tracking-wider ${
                        srsCards[activeCardIndex].type === 'honorific'
                          ? 'bg-[#e56c5e]/20 text-[#e56c5e] border-[#e56c5e]/40'
                          : srsCards[activeCardIndex].type === 'bamboo_syntax'
                          ? 'bg-[#f8bc4b]/20 text-[#f8bc4b] border-[#f8bc4b]/40'
                          : 'bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8]/40'
                      }`}
                    >
                      {srsCards[activeCardIndex].itemRef}
                    </span>

                    {srsCards[activeCardIndex].audioPrompt && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playAudio(srsCards[activeCardIndex].audioPrompt!);
                        }}
                        className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
                        title="Nghe mẫu phát âm"
                      >
                        🔊
                      </button>
                    )}
                  </div>

                  {/* Card Content (Front vs Back) */}
                  <div className="py-4 text-center">
                    {!isFlipped ? (
                      <div className="space-y-3">
                        <p className="text-xs text-[#f8bc4b] font-medium">❓ CÂU HỎI NHẮC NHỚ</p>
                        <h4 className="text-base font-bold text-white leading-relaxed">
                          {srsCards[activeCardIndex].front}
                        </h4>
                        <p className="text-[11px] opacity-60 italic">
                          (Chạm vào thẻ để lật xem đáp án và giải thích)
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-[#4ade80] font-medium">💡 ĐÁP ÁN & GIẢI THÍCH</p>
                        <h4 className="text-sm font-semibold text-white leading-relaxed">
                          {srsCards[activeCardIndex].back}
                        </h4>
                        <div className="p-2 rounded-xl bg-black/20 text-[11px] text-[#f8bc4b]">
                          {srsCards[activeCardIndex].hint}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom hint */}
                  <div className="text-center text-[10px] opacity-50">
                    {!isFlipped ? 'Chạm để lật thẻ' : 'Đánh giá mức độ nhớ bên dưới'}
                  </div>
                </div>

                {/* Rating Feedback Message */}
                {lastReviewFeedback && (
                  <div className="p-2.5 rounded-xl bg-[#4ade80]/20 border border-[#4ade80] text-[#4ade80] text-xs text-center font-bold animate-pulse">
                    {lastReviewFeedback}
                  </div>
                )}

                {/* Rating Buttons (SM-2 Quality 0 - 5) */}
                {isFlipped && !lastReviewFeedback && (
                  <div className="space-y-2 pt-1">
                    <p className="text-center text-xs font-semibold text-white/80">
                      Bạn nhớ kiến thức này ở mức độ nào?
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => handleRateCard(1)}
                        className="p-2 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/30 flex flex-col items-center text-center transition-all"
                      >
                        <span className="text-sm">😵</span>
                        <span className="text-[10px] font-bold mt-1">Quên Hẳn</span>
                        <span className="text-[8px] opacity-75">1 ngày</span>
                      </button>
                      <button
                        onClick={() => handleRateCard(2)}
                        className="p-2 rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/30 flex flex-col items-center text-center transition-all"
                      >
                        <span className="text-sm">🤔</span>
                        <span className="text-[10px] font-bold mt-1">Khó Khăn</span>
                        <span className="text-[8px] opacity-75">1 ngày</span>
                      </button>
                      <button
                        onClick={() => handleRateCard(4)}
                        className="p-2 rounded-xl border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/30 flex flex-col items-center text-center transition-all"
                      >
                        <span className="text-sm">👍</span>
                        <span className="text-[10px] font-bold mt-1">Nhớ Tốt</span>
                        <span className="text-[8px] opacity-75">Tăng kỳ</span>
                      </button>
                      <button
                        onClick={() => handleRateCard(5)}
                        className="p-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30 flex flex-col items-center text-center transition-all"
                      >
                        <span className="text-sm">⚡</span>
                        <span className="text-[10px] font-bold mt-1">Rất Dễ</span>
                        <span className="text-[8px] opacity-75">Tối đa</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mastered Vocabulary Bank Tab */}
        {activeSubTab === 'mastered' && (
          <div className="space-y-3">
            {/* Search and Tag Filters */}
            <div className="space-y-2">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="🔍 Tìm từ vựng hoặc ý nghĩa..."
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none transition-all ${
                  isDark
                    ? 'bg-[#1a0a05] border-[#e56c5e]/30 text-white placeholder-white/40 focus:border-[#e56c5e]'
                    : 'bg-white border-[#7d3326]/20 text-[#220e07] placeholder-black/40 focus:border-[#b84835]'
                }`}
              />

              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'Kính ngữ', label: '🏮 Kính ngữ' },
                  { id: 'Đốt tre', label: '🎋 Đốt tre' },
                  { id: 'Phương ngữ', label: '🗺️ Phương ngữ' },
                  { id: 'Phát âm', label: '🎤 Phát âm' },
                  { id: 'Văn hóa', label: '📜 Văn hóa' }
                ].map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => setSelectedTag(tag.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap border transition-all ${
                      selectedTag === tag.id
                        ? 'bg-[#e56c5e] text-white border-[#e56c5e]'
                        : isDark
                        ? 'bg-[#1a0a05] text-white/70 border-white/10'
                        : 'bg-white text-black/70 border-black/10'
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List of cards */}
            <div className="space-y-2">
              {filteredVocab.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    isDark ? 'bg-[#1a0a05] border-[#e56c5e]/20' : 'bg-white border-[#7d3326]/10'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{item.word}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0f4c64] text-[#38bdf8] font-mono">
                        {item.level}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-[#f8bc4b]">
                        {item.tag}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-75">{item.meaning}</p>
                  </div>

                  <button
                    onClick={() => playAudio(item.word)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors shrink-0 ml-2"
                    title="Phát âm"
                  >
                    🔊
                  </button>
                </div>
              ))}

              {filteredVocab.length === 0 && (
                <div className="text-center py-8 text-xs opacity-60">
                  Không tìm thấy từ vựng phù hợp với từ khóa này.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
