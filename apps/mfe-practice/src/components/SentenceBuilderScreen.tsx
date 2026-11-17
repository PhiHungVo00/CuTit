import React, { useState, useEffect } from 'react';
import { BambooTreeSyntaxChecker, type BambooToken, type SyntaxCheckResult } from '@vietlearning/shared';
import { SENTENCE_TEMPLATES_60 } from '@vietlearning/content';

interface SentenceBuilderScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const SentenceBuilderScreen: React.FC<SentenceBuilderScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [selectedTokens, setSelectedTokens] = useState<BambooToken[]>([]);
  const [availableTokens, setAvailableTokens] = useState<BambooToken[]>([]);
  const [checkResult, setCheckResult] = useState<SyntaxCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [activeTopic, setActiveTopic] = useState<string>('Tất cả');

  const currentTemplate = SENTENCE_TEMPLATES_60[currentIdx];

  const topics = ['Tất cả', 'Chào hỏi', 'Ẩm thực', 'Chợ quê', 'Hỏi đường', 'Gia đình', 'Văn hóa'];

  // Khởi tạo và xáo trộn đốt tre khi chuyển câu
  useEffect(() => {
    if (!currentTemplate) return;
    const shuffled = [...currentTemplate.tokens].sort(() => Math.random() - 0.5);
    setAvailableTokens(shuffled);
    setSelectedTokens([]);
    setCheckResult(null);
  }, [currentIdx]);

  // Chọn hoặc bỏ token
  const handleSelectToken = (token: BambooToken) => {
    setAvailableTokens(prev => prev.filter(t => t.id !== token.id));
    setSelectedTokens(prev => [...prev, token]);
    setCheckResult(null);
  };

  const handleRemoveToken = (token: BambooToken) => {
    setSelectedTokens(prev => prev.filter(t => t.id !== token.id));
    setAvailableTokens(prev => [...prev, token]);
    setCheckResult(null);
  };

  const handleReset = () => {
    if (!currentTemplate) return;
    const shuffled = [...currentTemplate.tokens].sort(() => Math.random() - 0.5);
    setAvailableTokens(shuffled);
    setSelectedTokens([]);
    setCheckResult(null);
  };

  // Kiểm tra A8
  const handleCheckSyntax = async () => {
    if (selectedTokens.length === 0) return;
    setIsChecking(true);

    try {
      // Gọi Gateway A8 hoặc chạy trực tiếp thư viện A8 client (Offline-First)
      const tokenTexts = selectedTokens.map(t => t.text);
      const res = BambooTreeSyntaxChecker.checkOrder(tokenTexts, currentTemplate);
      setCheckResult(res);

      if (res.valid) {
        // Tự động phát âm câu đúng
        speakSentence(res.reconstructedSentence);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsChecking(false);
    }
  };

  // Phát âm câu qua Web Speech API
  const speakSentence = (text: string) => {
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

  const getRoleBadge = (role: BambooToken['role']) => {
    switch (role) {
      case 'honorific_start':
      case 'honorific_end':
        return { label: 'Kính ngữ', bg: 'bg-purple-900/60 text-purple-200 border-purple-500/40' };
      case 'subject':
        return { label: 'Chủ ngữ', bg: 'bg-emerald-900/60 text-emerald-200 border-emerald-500/40' };
      case 'verb':
        return { label: 'Động từ', bg: 'bg-rose-900/60 text-rose-200 border-rose-500/40' };
      case 'object':
        return { label: 'Tân ngữ', bg: 'bg-amber-900/60 text-amber-200 border-amber-500/40' };
      default:
        return { label: 'Trợ từ', bg: 'bg-blue-900/60 text-blue-200 border-blue-500/40' };
    }
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#190a05] text-[#ffdbcf]' : 'bg-[#fff8f6] text-[#220e07]'} font-['Be_Vietnam_Pro',system-ui,sans-serif]`}>
      <div className="max-w-md mx-auto min-h-screen flex flex-col px-4 pt-3 pb-24">
        {/* Top Header */}
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-emerald-700 flex items-center justify-center text-base shadow">
              🎋
            </div>
            <div>
              <h1 className={`text-sm font-black tracking-wide flex items-center gap-1.5 ${theme === 'dark' ? 'text-white' : 'text-[#220e07]'}`}>
                Ghép Câu Đốt Tre
              </h1>
              <p className="text-[10px] text-[#cca79b]">Cây tre trăm đốt • Cú pháp tiếng Việt</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg bg-[#2a130c] border border-[#482014] text-xs hover:bg-[#3d1c12]"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* Topic Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto py-2.5 no-scrollbar text-xs">
          {topics.map(t => (
            <button
              key={t}
              onClick={() => {
                setActiveTopic(t);
                const found = SENTENCE_TEMPLATES_60.findIndex((item: { topic: string }) => t === 'Tất cả' || item.topic === t);
                if (found !== -1) setCurrentIdx(found);
              }}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap text-[11px] font-semibold transition-all ${
                (activeTopic === t)
                  ? 'bg-[#e56c5e] text-[#410001] shadow'
                  : 'bg-[#2a130c] text-[#cca79b] border border-[#482014]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Mission / Context Card */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#2a130c] to-[#200d07] border border-[#482014] shadow-sm mb-3">
          <div className="flex items-center justify-between text-xs mb-1.5 text-[#cca79b]">
            <span className="font-bold flex items-center gap-1 text-[#f8bc4b]">
              <span>Chủ đề:</span> {currentTemplate.topic} (Cấp độ {currentTemplate.level})
            </span>
            <span className="font-mono text-[11px] bg-[#190a05] px-2 py-0.5 rounded-full border border-[#482014]">
              {currentIdx + 1} / {SENTENCE_TEMPLATES_60.length}
            </span>
          </div>

          <div className="text-xs text-[#ffdbcf] font-medium leading-relaxed">
            Ý nghĩa: <span className="italic text-[#f8bc4b]">"{currentTemplate.grammarNote}"</span>
          </div>
        </div>

        {/* Bamboo Stalk Section (Thân Tre Ghép Câu) */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5 text-[#ffb4aa]">
            <span className="flex items-center gap-1">
              <span>🎋</span>
              <span>Thân tre của bạn:</span>
            </span>
            <span className="text-[10px] text-[#cca79b]">
              Chạm vào đốt tre để gỡ xuống
            </span>
          </div>

          {/* Stalk Container */}
          <div className={`min-h-[92px] p-2.5 rounded-2xl border-2 transition-all flex flex-wrap items-center gap-2 relative ${
            checkResult?.valid
              ? 'bg-[#1b2f1e] border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
              : checkResult && !checkResult.valid
              ? 'bg-[#2d1211] border-rose-500'
              : 'bg-[#120703] border-dashed border-[#572719]'
          }`}>
            {selectedTokens.length === 0 ? (
              <div className="w-full text-center py-4 text-xs text-[#cca79b]/60 italic flex flex-col items-center gap-1">
                <span>🍃 Thân tre còn rỗng</span>
                <span>Hãy chọn các đốt tre từ khay từ vựng bên dưới</span>
              </div>
            ) : (
              selectedTokens.map((tok, idx) => {
                const isMisplaced = checkResult?.misplacedIndices?.includes(idx);
                return (
                  <button
                    key={tok.id}
                    onClick={() => handleRemoveToken(tok)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all active:scale-95 shadow-md ${
                      isMisplaced
                        ? 'bg-rose-950/80 text-rose-200 border-rose-500 animate-pulse'
                        : 'bg-[#3b1a10] text-[#ffdbcf] border-[#743522] hover:bg-[#4d2316]'
                    }`}
                  >
                    <span>{tok.text}</span>
                    <span className="text-[10px] opacity-60">✕</span>
                  </button>
                );
              })
            )}

            {/* Glowing Bamboo Knots Indicator */}
            {checkResult?.valid && (
              <div className="absolute -top-3 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-[#052e16] text-[10px] font-black shadow flex items-center gap-1">
                <span>✨</span> KHẮC NHẬP THÀNH CÔNG!
              </div>
            )}
          </div>
        </div>

        {/* Bamboo Token Drawer (Khay Đốt Tre Sẵn Có) */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5 text-[#ffb4aa]">
            <span className="flex items-center gap-1">
              <span>🧺</span>
              <span>Khay đốt tre (Chạm để ghép):</span>
            </span>
            <span className="text-[10px] text-[#cca79b]">
              Còn {availableTokens.length} đốt
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#200d07] border border-[#482014] flex flex-wrap gap-2 min-h-[80px]">
            {availableTokens.length === 0 ? (
              <div className="w-full text-center py-3 text-xs text-emerald-400 font-medium">
                🎋 Đã đưa hết các đốt tre lên thân câu! Bấm "Khắc Nhập" để kiểm tra.
              </div>
            ) : (
              availableTokens.map((tok) => {
                const badge = getRoleBadge(tok.role);
                return (
                  <button
                    key={tok.id}
                    onClick={() => handleSelectToken(tok)}
                    className="group px-3 py-2 rounded-xl bg-[#2e140d] border border-[#5a281a] hover:border-[#f8bc4b] text-xs font-bold text-[#ffdbcf] flex items-center gap-1.5 transition-all active:scale-95 shadow hover:shadow-amber-500/10"
                  >
                    <span>{tok.text}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md border ${badge.bg}`}>
                      {badge.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={handleReset}
            className="px-3 py-3 rounded-xl bg-[#2a130c] border border-[#482014] text-xs font-bold text-[#cca79b] hover:text-white transition-colors"
          >
            🔄 Xáo lại
          </button>

          <button
            onClick={handleCheckSyntax}
            disabled={isChecking || selectedTokens.length === 0}
            className={`flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${
              selectedTokens.length === 0
                ? 'bg-[#3b1a10] text-[#784334] cursor-not-allowed'
                : 'bg-gradient-to-r from-[#e56c5e] to-[#f8bc4b] text-[#220e07] hover:brightness-110 shadow-[#e56c5e]/20'
            }`}
          >
            <span>🎋</span>
            <span>{isChecking ? 'Đang so khớp A8...' : 'Khắc Nhập! (Kiểm Tra)'}</span>
          </button>

          {checkResult?.valid && (
            <button
              onClick={() => speakSentence(checkResult.reconstructedSentence)}
              disabled={isPlayingAudio}
              className="p-3 rounded-xl bg-amber-500 text-[#220e07] font-bold text-xs flex items-center justify-center hover:bg-amber-400 transition-colors shadow"
              title="Phát âm câu"
            >
              {isPlayingAudio ? '🔊 Đang đọc' : '🔊 Nghe'}
            </button>
          )}
        </div>

        {/* Feedback / Result Card */}
        {checkResult && (
          <div className={`p-4 rounded-2xl border mb-4 animate-in fade-in duration-200 ${
            checkResult.valid
              ? 'bg-[#162719] border-emerald-500/50 text-emerald-100'
              : 'bg-[#2b100e] border-rose-500/50 text-rose-100'
          }`}>
            <div className="flex items-start gap-2.5">
              <span className="text-2xl">{checkResult.valid ? '🎉' : '💡'}</span>
              <div className="flex-1 text-xs">
                <div className="font-bold text-sm mb-1 flex items-center justify-between">
                  <span>{checkResult.valid ? 'Chính xác hoàn hảo!' : 'Cần sắp xếp lại trật tự:'}</span>
                </div>

                <div className="mb-2 font-medium leading-relaxed">
                  {checkResult.hint}
                </div>

                {checkResult.errors.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-rose-300 mb-2">
                    {checkResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}

                <div className="pt-2 border-t border-white/10 text-[11px] opacity-80">
                  <span className="font-bold">Giải thích cú pháp:</span> {checkResult.explanation}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="mt-auto pt-3 flex items-center justify-between border-t border-[#3b1a10] text-xs">
          <button
            onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
            disabled={currentIdx === 0}
            className="px-3 py-2 rounded-xl bg-[#2a130c] border border-[#482014] text-[#cca79b] disabled:opacity-40"
          >
            ← Câu trước
          </button>

          <span className="font-mono text-xs text-[#cca79b]">
            Câu {currentIdx + 1} / {SENTENCE_TEMPLATES_60.length}
          </span>

          <button
            onClick={() => setCurrentIdx(prev => Math.min(SENTENCE_TEMPLATES_60.length - 1, prev + 1))}
            disabled={currentIdx === SENTENCE_TEMPLATES_60.length - 1}
            className="px-3 py-2 rounded-xl bg-[#e56c5e] text-[#410001] font-bold disabled:opacity-40"
          >
            Câu kế →
          </button>
        </div>
      </div>
    </div>
  );
};
