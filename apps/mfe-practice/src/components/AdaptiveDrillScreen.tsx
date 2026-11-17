import React, { useState } from 'react';
import { calculateSM2, DrillFactory } from '@vietlearning/shared';
import { DRILL_BANK_ITEMS, type DrillBankItem } from '@vietlearning/content';

interface AdaptiveDrillScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const AdaptiveDrillScreen: React.FC<AdaptiveDrillScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | string | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [matchedPairs, setMatchedPairs] = useState<{ [vi: string]: string }>({});
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [streakCount, setStreakCount] = useState<number>(3);
  const [srsStats, setSrsStats] = useState<{ ease: number; interval: number; reps: number }>({
    ease: 2.5,
    interval: 1,
    reps: 0
  });

  const currentItem: DrillBankItem = DRILL_BANK_ITEMS[currentIdx];

  // Phát âm Web Speech
  const speakWord = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.9;
    utterance.onstart = () => setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);
    window.speechSynthesis.speak(utterance);
  };

  // Nộp đáp án cho quiz / fill / listen
  const handleSubmitAnswer = (optionIdx: number | string) => {
    if (isAnswered) return;
    setSelectedOption(optionIdx);
    setIsAnswered(true);

    const correct = optionIdx === currentItem.correctAnswer;
    setIsCorrect(correct);

    // Tính điểm SRS chất lượng 0 - 5
    const quality = correct ? 5 : 2;
    const nextSRS = calculateSM2(
      Math.round(srsStats.ease * 100),
      srsStats.interval,
      srsStats.reps,
      quality
    );
    setSrsStats({
      ease: nextSRS.ease / 100,
      interval: nextSRS.intervalDays,
      reps: nextSRS.repetitions
    });

    if (correct) {
      setStreakCount(prev => prev + 1);
    }
  };

  // Xử lý nối cặp cho dạng bài 'match'
  const handleMatchSelect = (type: 'vi' | 'en', val: string) => {
    if (type === 'vi') {
      setSelectedLeft(val);
    } else if (type === 'en' && selectedLeft) {
      // Ghép cặp
      const newMatches = { ...matchedPairs, [selectedLeft]: val };
      setMatchedPairs(newMatches);
      setSelectedLeft(null);

      if (currentItem.pairs && Object.keys(newMatches).length === currentItem.pairs.length) {
        setIsAnswered(true);
        setIsCorrect(true);
        setStreakCount(prev => prev + 1);
      }
    }
  };

  // Next drill
  const handleNextDrill = () => {
    setIsAnswered(false);
    setSelectedOption(null);
    setIsCorrect(false);
    setMatchedPairs({});
    setSelectedLeft(null);
    setCurrentIdx(prev => (prev + 1) % DRILL_BANK_ITEMS.length);
  };

  const getFormatBadge = (type: DrillBankItem['type']) => {
    switch (type) {
      case 'quiz': return { label: 'Trắc nghiệm', icon: '📝', color: 'bg-indigo-900/60 text-indigo-200 border-indigo-700' };
      case 'fill': return { label: 'Điền từ', icon: '✍️', color: 'bg-emerald-900/60 text-emerald-200 border-emerald-700' };
      case 'listen': return { label: 'Luyện nghe', icon: '🎧', color: 'bg-rose-900/60 text-rose-200 border-rose-700' };
      case 'match': return { label: 'Nối cặp', icon: '🔗', color: 'bg-amber-900/60 text-amber-200 border-amber-700' };
      case 'echo': return { label: 'Luyện nói', icon: '🎙️', color: 'bg-purple-900/60 text-purple-200 border-purple-700' };
      default: return { label: 'Bài tập', icon: '📝', color: 'bg-slate-900/60 text-slate-200 border-slate-700' };
    }
  };

  const badge = getFormatBadge(currentItem.type);

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#190a05] text-[#ffdbcf]' : 'bg-[#fff8f6] text-[#220e07]'} font-['Be_Vietnam_Pro',system-ui,sans-serif]`}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col px-4 pt-3 pb-24">
        {/* Header */}
        <header className="flex items-center justify-between pb-3 border-b border-[#3b1a10]">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="w-8 h-8 rounded-full bg-[#2a130c] border border-[#482014] flex items-center justify-center text-xs hover:bg-[#3b1a10]"
              >
                ←
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e56c5e] to-[#f8bc4b] flex items-center justify-center text-base shadow">
              🎯
            </div>
            <div>
              <h1 className={`text-sm font-black tracking-wide flex items-center gap-1.5 ${theme === 'dark' ? 'text-white' : 'text-[#220e07]'}`}>
                Bài Tập Thích Ứng
              </h1>
              <p className="text-[10px] text-[#cca79b]">5 Dạng Luyện Tập • Chu kỳ lặp lại ngắt quãng</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-2 py-1 rounded-lg bg-[#2a130c] border border-[#482014] text-xs font-bold text-amber-400 flex items-center gap-1 shadow">
              <span>🔥</span>
              <span>{streakCount}</span>
            </div>
            <button
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg bg-[#2a130c] border border-[#482014] text-xs hover:bg-[#3d1c12]"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* Progress & Format Pill */}
        <div className="flex items-center justify-between py-2.5 text-xs">
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 ${badge.color}`}>
            <span>{badge.icon}</span>
            <span>{badge.label}</span>
          </div>

          <div className="text-[11px] text-[#cca79b] font-mono">
            Câu {currentIdx + 1} / {DRILL_BANK_ITEMS.length}
          </div>
        </div>

        {/* Main Question Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#2a130c] to-[#200d07] bg-[#2a130c] border border-[#482014] shadow-md mb-4">
          <div className="text-xs font-bold text-[#f8bc4b] uppercase tracking-wider mb-1">
            Chủ đề: {currentItem.topic} (Cấp độ {currentItem.level})
          </div>

          <h2 className="text-sm font-bold text-white mb-2 leading-relaxed">
            {currentItem.question}
          </h2>

          {/* Large Vietnamese Phrase / Audio Anchor */}
          <div className="p-3 rounded-xl bg-[#170803] border border-[#3b1a10] flex items-center justify-between mb-2">
            <div>
              <div className="text-base font-extrabold text-[#ffb4aa]">
                {currentItem.vietnameseText}
              </div>
              <div className="text-xs text-[#cca79b] italic">
                {currentItem.englishMeaning}
              </div>
            </div>

            <button
              onClick={() => speakWord(currentItem.audioPrompt || currentItem.vietnameseText)}
              disabled={isPlayingAudio}
              className="w-10 h-10 rounded-full bg-[#e56c5e] text-[#410001] flex items-center justify-center font-bold text-base hover:scale-105 active:scale-95 transition-all shadow"
              title="Phát âm tiếng Việt"
            >
              {isPlayingAudio ? '🔊' : '▶'}
            </button>
          </div>
        </div>

        {/* Interactive Exercise Body by Format */}

        {/* FORMAT: QUIZ, FILL, LISTEN */}
        {(currentItem.type === 'quiz' || currentItem.type === 'fill' || currentItem.type === 'listen') && currentItem.options && (
          <div className="space-y-2 mb-4">
            {currentItem.options.map((opt: string, idx: number) => {
              const optionValue = currentItem.type === 'fill' ? opt : idx;
              const isChosen = selectedOption === optionValue;
              const isRight = currentItem.correctAnswer === optionValue;

              let btnStyle = 'bg-[#260f08] border-[#482014] text-[#ffdbcf] hover:border-[#f8bc4b]';
              if (isAnswered) {
                if (isRight) {
                  btnStyle = 'bg-emerald-950/80 border-emerald-500 text-emerald-200 font-bold';
                } else if (isChosen && !isRight) {
                  btnStyle = 'bg-rose-950/80 border-rose-500 text-rose-200';
                } else {
                  btnStyle = 'bg-[#1b0a05] border-[#38160c] opacity-50';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSubmitAnswer(optionValue)}
                  disabled={isAnswered}
                  className={`w-full p-3.5 rounded-xl border text-left text-xs font-medium flex items-center justify-between transition-all active:scale-[0.98] shadow ${btnStyle}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-[#3b1a10] border border-[#5a281a] flex items-center justify-center text-[10px] font-bold text-[#f8bc4b]">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{opt}</span>
                  </div>

                  {isAnswered && isRight && <span className="text-emerald-400 font-bold">✓</span>}
                  {isAnswered && isChosen && !isRight && <span className="text-rose-400 font-bold">✕</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* FORMAT: MATCH (NỐI CẶP) */}
        {currentItem.type === 'match' && currentItem.pairs && (
          <div className="space-y-3 mb-4">
            <div className="text-xs text-[#cca79b] italic text-center">
              Chạm thẻ Tiếng Việt trước, sau đó chạm thẻ Tiếng Anh tương ứng để ghép nối
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Cột Trái (Tiếng Việt) */}
              <div className="space-y-2">
                {currentItem.pairs.map((p: { vi: string; en: string }) => {
                  const isMatched = !!matchedPairs[p.vi];
                  const isSelected = selectedLeft === p.vi;
                  return (
                    <button
                      key={p.vi}
                      onClick={() => !isMatched && handleMatchSelect('vi', p.vi)}
                      disabled={isMatched}
                      className={`w-full p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                        isMatched
                          ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300 line-through opacity-70'
                          : isSelected
                          ? 'bg-amber-950/90 border-amber-400 text-amber-200 ring-2 ring-amber-400'
                          : 'bg-[#260f08] border-[#482014] text-[#ffdbcf] hover:border-[#f8bc4b]'
                      }`}
                    >
                      {p.vi}
                    </button>
                  );
                })}
              </div>

              {/* Cột Phải (Tiếng Anh) */}
              <div className="space-y-2">
                {currentItem.pairs.map((p: { vi: string; en: string }) => {
                  const isMatched = Object.values(matchedPairs).includes(p.en);
                  return (
                    <button
                      key={p.en}
                      onClick={() => !isMatched && handleMatchSelect('en', p.en)}
                      disabled={isMatched}
                      className={`w-full p-2.5 rounded-xl border text-xs transition-all text-left ${
                        isMatched
                          ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300 line-through opacity-70'
                          : 'bg-[#260f08] border-[#482014] text-[#ffdbcf] hover:border-[#f8bc4b]'
                      }`}
                    >
                      {p.en}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* FORMAT: ECHO / SPEAK */}
        {currentItem.type === 'echo' && (
          <div className="p-4 rounded-2xl bg-[#260f08] border border-[#482014] text-center mb-4">
            <div className="text-xs text-[#cca79b] mb-3">
              Nhấn giữ nút microphone bên dưới để đọc to câu mẫu:
            </div>

            <button
              onClick={() => handleSubmitAnswer(currentItem.vietnameseText)}
              disabled={isAnswered}
              className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center text-2xl shadow-xl transition-all active:scale-95 ${
                isAnswered
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-tr from-[#e56c5e] to-[#f8bc4b] text-[#410001] animate-pulse'
              }`}
            >
              🎙️
            </button>

            <div className="text-xs text-white font-bold mt-2">
              {isAnswered ? 'Đã thu âm chuẩn!' : 'Nhấn để nộp âm'}
            </div>
          </div>
        )}

        {/* Feedback Card */}
        {isAnswered && (
          <div className={`p-4 rounded-2xl border mb-4 animate-in fade-in duration-200 ${
            isCorrect
              ? 'bg-[#162719] border-emerald-500/50 text-emerald-100'
              : 'bg-[#2b100e] border-rose-500/50 text-rose-100'
          }`}>
            <div className="flex items-start gap-2.5">
              <span className="text-2xl">{isCorrect ? '🌟' : '💡'}</span>
              <div className="flex-1 text-xs">
                <div className="font-bold text-sm mb-1 flex items-center justify-between">
                  <span>{isCorrect ? 'Chính xác xuất sắc!' : 'Chưa đúng rồi!'}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 border border-white/20">
                    Ôn lại sau: {srsStats.interval} ngày
                  </span>
                </div>

                <div className="mb-2 leading-relaxed">
                  {currentItem.explanation}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] opacity-80">
                  <span>Hệ số nhớ SRS (Ease): {srsStats.ease.toFixed(2)}</span>
                  <span>Lượt ôn: {srsStats.reps}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Next Drill Action */}
        {isAnswered && (
          <button
            onClick={handleNextDrill}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#e56c5e] to-[#f8bc4b] text-[#220e07] font-black text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <span>Bài tiếp theo</span>
            <span>→</span>
          </button>
        )}
      </div>
    </div>
  );
};
