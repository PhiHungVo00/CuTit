import React, { useState } from 'react';
import {
  StaircaseAdaptiveEngine,
  type AnswerRecord,
  type AdaptiveStepResult,
  type PlacementQuestion
} from '@vietlearning/shared';
import { PLACEMENT_QUESTIONS_8 } from '@vietlearning/content';

interface AdaptiveOnboardingScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onComplete?: (result: { goal: string; dialect: string; level: number; cefr: string }) => void;
  onNavigateTab?: (tab: string) => void;
}

export const AdaptiveOnboardingScreen: React.FC<AdaptiveOnboardingScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onComplete,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [currentStep, setCurrentStep] = useState<'goal' | 'test' | 'result'>('goal');

  // Step 1: Goals & Preferences
  const [selectedGoal, setSelectedGoal] = useState<string>('travel');
  const [selectedDialect, setSelectedDialect] = useState<'north' | 'central' | 'south'>('north');
  const [nativeLanguage, setNativeLanguage] = useState<string>('en');

  // Step 2: Adaptive Placement Test (A5)
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<PlacementQuestion>(PLACEMENT_QUESTIONS_8[0]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [stepResult, setStepResult] = useState<AdaptiveStepResult | null>(null);

  // Step 3: Consent & Confirmation
  const [audioConsent, setAudioConsent] = useState<boolean>(true);

  // Khi chọn đáp án trong bài test A5
  const handleSelectAnswer = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);

    const isCorrect = idx === currentQuestion.correctIndex;
    const newRecord: AnswerRecord = {
      questionId: currentQuestion.id,
      correct: isCorrect,
      difficulty: currentQuestion.difficultyScore
    };

    const nextAnswers = [...answers, newRecord];
    setAnswers(nextAnswers);

    // Tính bước nhảy Staircase A5
    setTimeout(() => {
      const res = StaircaseAdaptiveEngine.processStep(nextAnswers, PLACEMENT_QUESTIONS_8);
      if (res.finished) {
        setStepResult(res);
        setCurrentStep('result');
      } else if (res.nextQuestion) {
        setCurrentQuestion(res.nextQuestion);
        setSelectedOption(null);
        setIsAnswered(false);
      }
    }, 1200);
  };

  const handleStartTest = () => {
    // Khởi tạo câu hỏi đầu tiên theo Staircase A5
    const initRes = StaircaseAdaptiveEngine.processStep([], PLACEMENT_QUESTIONS_8);
    if (initRes.nextQuestion) {
      setCurrentQuestion(initRes.nextQuestion);
    }
    setAnswers([]);
    setSelectedOption(null);
    setIsAnswered(false);
    setCurrentStep('test');
  };

  const handleFinishOnboarding = () => {
    const finalLevel = stepResult?.assignedLevel || 1;
    const finalCefr = stepResult?.cefrCode || 'A1';

    // Lưu vào LocalStorage
    localStorage.setItem('vietlearning_onboarding_done', 'true');
    localStorage.setItem('vietlearning_goal', selectedGoal);
    localStorage.setItem('vietlearning_dialect', selectedDialect);
    localStorage.setItem('vietlearning_level', String(finalLevel));
    localStorage.setItem('vietlearning_cefr', finalCefr);
    localStorage.setItem('vietlearning_audio_consent', String(audioConsent));

    if (onComplete) {
      onComplete({
        goal: selectedGoal,
        dialect: selectedDialect,
        level: finalLevel,
        cefr: finalCefr
      });
    } else if (onNavigateTab) {
      onNavigateTab('conversation');
    }
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#190a05] text-[#ffdbcf]' : 'bg-[#fff8f6] text-[#220e07]'} font-['Be_Vietnam_Pro',system-ui,sans-serif]`}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col px-4 pt-3 pb-20">
        {/* Header */}
        <header className="flex items-center justify-between pb-3 border-b border-[#3b1a10]">
          <div className="flex items-center gap-2">
            <button
              aria-label="Quay lại"
              onClick={() => (onBack ? onBack() : window.history.back())}
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform active:translate-y-0.5 ${
                theme === 'dark'
                  ? 'bg-[#2a130c] border border-[#482014] text-[#ffdbcf]'
                  : 'bg-[#f6e6da] border border-[#dcc2ae] text-[#220e07]'
              }`}
            >
              <span className="material-symbols-outlined text-base">arrow_back_ios_new</span>
            </button>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e56c5e] to-[#f8bc4b] flex items-center justify-center text-base shadow">
              🧭
            </div>
            <div>
              <h1 className={`text-sm font-black tracking-wide flex items-center gap-1.5 ${theme === 'dark' ? 'text-white' : 'text-[#220e07]'}`}>
                Khảo Sát Xếp Lớp
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  A5 Staircase
                </span>
              </h1>
              <p className="text-[10px] text-[#cca79b]">Lộ Trình Thích Ứng • Bé Cu Tít Đồng Hành</p>
            </div>
          </div>

          <button
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-lg bg-[#2a130c] border border-[#482014] text-xs hover:bg-[#3d1c12]"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </header>

        {/* STEP 1: GOAL & DIALECT SELECTION */}
        {currentStep === 'goal' && (
          <div className="flex-1 flex flex-col justify-between py-4 animate-in fade-in">
            <div className="space-y-4">
              {/* Cu Tit Welcome Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#2a130c] to-[#1e0a05] border border-[#482014] shadow flex items-center gap-3">
                <span className="text-4xl">🏮</span>
                <div className="text-xs">
                  <div className="font-extrabold text-sm text-[#f8bc4b]">Chào mừng bạn đến với Việt Nam!</div>
                  <p className="text-[#cca79b] mt-0.5 leading-relaxed">
                    Hãy chia sẻ mục tiêu học để Bé Cu Tít cá nhân hóa lộ trình và xếp lớp thích ứng cho bạn nhé.
                  </p>
                </div>
              </div>

              {/* Goal Selection */}
              <div>
                <label className="block text-xs font-bold text-[#ffb4aa] uppercase tracking-wider mb-2">
                  1. Mục tiêu học tiếng Việt của bạn:
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'travel', icon: '✈️', label: 'Du lịch & Khám phá' },
                    { id: 'business', icon: '💼', label: 'Công việc & Đi làm' },
                    { id: 'family', icon: '👨‍👩‍👧‍👦', label: 'Giao tiếp gia đình' },
                    { id: 'culture', icon: '🍜', label: 'Ẩm thực & Văn hóa' }
                  ].map(g => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGoal(g.id)}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                        selectedGoal === g.id
                          ? 'bg-[#3b1a10] border-[#f8bc4b] text-white font-bold shadow'
                          : 'bg-[#200d07] border-[#482014] text-[#cca79b] hover:border-[#6d301e]'
                      }`}
                    >
                      <span className="text-2xl">{g.icon}</span>
                      <span className="text-center">{g.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Dialect Selection */}
              <div>
                <label className="block text-xs font-bold text-[#ffb4aa] uppercase tracking-wider mb-2">
                  2. Chọn phương ngữ mục tiêu bạn muốn học:
                </label>
                <div className="space-y-2 text-xs">
                  {[
                    { id: 'north', icon: '🏛️', name: 'Giọng Miền Bắc (Hà Nội)', desc: 'Thanh điệu chuẩn mực, trang trọng, phổ biến trong văn bản' },
                    { id: 'central', icon: '🏯', name: 'Giọng Miền Trung (Huế / Đà Nẵng)', desc: 'Mộc mạc, âm hưởng sông Hương, từ vựng đậm chất xứ Quảng' },
                    { id: 'south', icon: '🌴', name: 'Giọng Miền Nam (Sài Gòn)', desc: 'Thân thiện, phóng khoáng, dễ nghe và cực kỳ thông dụng đời thường' }
                  ].map(d => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDialect(d.id as any)}
                      className={`w-full p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                        selectedDialect === d.id
                          ? 'bg-[#3b1a10] border-[#e56c5e] text-white shadow'
                          : 'bg-[#200d07] border-[#482014] text-[#cca79b] hover:border-[#6d301e]'
                      }`}
                    >
                      <span className="text-2xl">{d.icon}</span>
                      <div className="flex-1">
                        <div className="font-bold text-white text-xs">{d.name}</div>
                        <div className="text-[10px] text-[#cca79b] mt-0.5">{d.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleStartTest}
              className="mt-6 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#e56c5e] to-[#f8bc4b] text-[#220e07] font-black text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span>Bắt đầu bài kiểm tra thích ứng A5</span>
              <span>→</span>
            </button>
          </div>
        )}

        {/* STEP 2: ADAPTIVE PLACEMENT TEST (A5 STAIRCASE) */}
        {currentStep === 'test' && (
          <div className="flex-1 flex flex-col justify-between py-4 animate-in fade-in">
            <div>
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-[#cca79b] mb-1 font-mono">
                  <span>Câu hỏi thích ứng A5</span>
                  <span>{answers.length + 1} / 8</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#200d07] overflow-hidden border border-[#482014]">
                  <div
                    className="h-full bg-gradient-to-r from-[#e56c5e] to-[#f8bc4b] transition-all duration-300"
                    style={{ width: `${((answers.length + 1) / 8) * 100}%` }}
                  />
                </div>
              </div>

              {/* Question Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#2a130c] to-[#1e0a05] border border-[#482014] shadow-md mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                    Cấp độ Tier {currentQuestion.tier} (Độ khó: {currentQuestion.difficultyScore.toFixed(1)})
                  </span>
                  <span className="text-[10px] text-[#cca79b]">
                    Chủ đề: {currentQuestion.category}
                  </span>
                </div>

                <h2 className="text-sm font-bold text-white mb-2 leading-relaxed">
                  {currentQuestion.question}
                </h2>
              </div>

              {/* 4 Options */}
              <div className="space-y-2">
                {currentQuestion.options.map((opt, idx) => {
                  const isChosen = selectedOption === idx;
                  const isCorrect = idx === currentQuestion.correctIndex;

                  let style = 'bg-[#200d07] border-[#482014] text-[#ffdbcf] hover:border-[#f8bc4b]';
                  if (isAnswered) {
                    if (isCorrect) {
                      style = 'bg-emerald-950 border-emerald-500 text-emerald-200 font-bold';
                    } else if (isChosen && !isCorrect) {
                      style = 'bg-rose-950 border-rose-500 text-rose-200';
                    } else {
                      style = 'bg-[#1b0a05] border-[#38160c] opacity-50';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectAnswer(idx)}
                      disabled={isAnswered}
                      className={`w-full p-3.5 rounded-xl border text-left text-xs font-medium flex items-center justify-between transition-all ${style}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-[#3b1a10] border border-[#5a281a] flex items-center justify-center text-[10px] font-bold text-[#f8bc4b]">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span>{opt}</span>
                      </div>
                      {isAnswered && isCorrect && <span className="text-emerald-400 font-bold">✓</span>}
                      {isAnswered && isChosen && !isCorrect && <span className="text-rose-400 font-bold">✕</span>}
                    </button>
                  );
                })}
              </div>

              {/* Real-time Explanation */}
              {isAnswered && (
                <div className="mt-4 p-3 rounded-xl bg-[#2a130c] border border-[#482014] text-xs text-[#cca79b] leading-relaxed animate-in fade-in">
                  <span className="font-bold text-amber-300">💡 Giải thích: </span>
                  {currentQuestion.explanation}
                </div>
              )}
            </div>

            <div className="text-[10px] text-center text-[#cca79b] opacity-70">
              Thuật toán Staircase A5 tự động nâng/hạ độ khó sau mỗi câu trả lời
            </div>
          </div>
        )}

        {/* STEP 3: CEFR RESULT & AUDIO CONSENT */}
        {currentStep === 'result' && stepResult && (
          <div className="flex-1 flex flex-col justify-between py-4 animate-in fade-in">
            <div className="space-y-4">
              {/* CEFR Placement Badge Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#2e140c] to-[#1c0803] border border-[#f8bc4b]/50 shadow-xl text-center">
                <span className="text-4xl mb-2 inline-block">🎉</span>
                <div className="text-xs text-[#f8bc4b] font-bold uppercase tracking-widest">
                  Kết Quả Xếp Lớp Thích Ứng
                </div>

                <div className="text-3xl font-black text-white mt-1 mb-1">
                  CEFR {stepResult.cefrCode}
                </div>
                <div className="text-sm font-bold text-[#ffb4aa]">
                  {stepResult.title}
                </div>

                <div className="mt-3 py-2 px-3 rounded-xl bg-[#170803] border border-[#3b1a10] text-xs text-[#cca79b] flex items-center justify-around">
                  <div>
                    <span className="block text-[10px] text-[#784334]">Độ chính xác</span>
                    <span className="font-bold text-emerald-400">{stepResult.scorePercent}%</span>
                  </div>
                  <div className="w-px h-6 bg-[#3b1a10]" />
                  <div>
                    <span className="block text-[10px] text-[#784334]">Phương ngữ</span>
                    <span className="font-bold text-[#f8bc4b] capitalize">Miền {selectedDialect === 'north' ? 'Bắc' : selectedDialect === 'central' ? 'Trung' : 'Nam'}</span>
                  </div>
                </div>

                <p className="text-xs text-[#ffdbcf] mt-3 leading-relaxed italic">
                  "{stepResult.roadmapRecommendation}"
                </p>
              </div>

              {/* Audio Consent Card (Mục 11 TDD: Quyền riêng tư & Thu âm) */}
              <div className="p-4 rounded-2xl bg-[#200d07] border border-[#482014] text-xs">
                <div className="font-bold text-white flex items-center gap-2 mb-1.5">
                  <span>🎙️</span>
                  <span>Chấp thuận ghi âm giọng nói (Audio Consent)</span>
                </div>
                <p className="text-[11px] text-[#cca79b] leading-relaxed mb-3">
                  Theo quy chuẩn bảo mật dự án (Mục 11 TDD), giọng nói của bạn chỉ được xử lý tạm thời để tính toán cao độ F0 YIN và so khớp DTW A2. Dữ liệu âm thanh thô tự động xóa sau 30 ngày (TTL 30 days).
                </p>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={audioConsent}
                    onChange={(e) => setAudioConsent(e.target.checked)}
                    className="w-4 h-4 rounded text-[#e56c5e] focus:ring-0 bg-[#2a130c] border-[#482014]"
                  />
                  <span>Tôi đồng ý cấp quyền micro và phân tích ngữ âm học tập</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleFinishOnboarding}
              className="mt-6 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#e56c5e] to-[#f8bc4b] text-[#220e07] font-black text-sm shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span>Vào học ngay cùng Bé Cu Tít!</span>
              <span>🚀</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
