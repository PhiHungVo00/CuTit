import React, { useState } from 'react';
import { CULTURE_CARDS_20, type CultureCard } from '@vietlearning/content';

interface CultureGuideScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const CultureGuideScreen: React.FC<CultureGuideScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeCard, setActiveCard] = useState<CultureCard | null>(CULTURE_CARDS_20[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userQuestion, setUserQuestion] = useState<string>('');
  const [askAnswer, setAskAnswer] = useState<{ answer: string; sources: string[] } | null>(null);
  const [isAsking, setIsAsking] = useState<boolean>(false);
  const [quizAnswered, setQuizAnswered] = useState<number | null>(null);

  const categories = [
    { id: 'all', label: 'Tất cả (20)' },
    { id: 'communication', label: 'Giao tiếp & Lễ nghi' },
    { id: 'cuisine', label: 'Ẩm thực & Mâm cơm' },
    { id: 'custom', label: 'Phong tục dân gian' },
    { id: 'holiday', label: 'Lễ hội & Tết' }
  ];

  const filteredCards = CULTURE_CARDS_20.filter(card => {
    const matchCat = selectedCategory === 'all' || card.category === selectedCategory;
    const matchSearch = searchQuery.trim() === '' || 
      `${card.title} ${card.summary} ${card.proverb}`.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleAskCuTit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userQuestion.trim()) return;

    setIsAsking(true);
    setAskAnswer(null);

    try {
      const res = await fetch('http://localhost:4000/v1/culture/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userQuestion })
      });
      if (res.ok) {
        const data = await res.json();
        setAskAnswer(data);
      } else {
        throw new Error('Gateway request failed');
      }
    } catch {
      // Local fallback matching
      const norm = userQuestion.toLowerCase();
      const found = CULTURE_CARDS_20.find(c => 
        `${c.title} ${c.summary} ${c.proverb}`.toLowerCase().includes(norm)
      ) || CULTURE_CARDS_20[0];

      setAskAnswer({
        answer: `Bé Cu Tít giải đáp: "${found.story}"\n\nQuy tắc ứng xử: ${found.summary}`,
        sources: [found.title]
      });
    } finally {
      setIsAsking(false);
    }
  };

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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#b45309] to-[#d97706] flex items-center justify-center text-base shadow">
              📜
            </div>
            <div>
              <h1 className={`text-sm font-black tracking-wide flex items-center gap-1.5 ${theme === 'dark' ? 'text-white' : 'text-[#220e07]'}`}>
                Sổ Tay Văn Hóa
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                  20 Thẻ
                </span>
              </h1>
              <p className="text-[10px] text-[#cca79b]">Phong Tục & Quy Tắc Ứng Xử Đời Thường</p>
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

        {/* Ask Cu Tit Search Input */}
        <div className="py-2.5">
          <form onSubmit={handleAskCuTit} className="flex gap-2">
            <input
              type="text"
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              placeholder="Hỏi Cu Tít: Tại sao mua muối đầu năm?..."
              className="flex-1 px-3 py-2 rounded-xl bg-[#200d07] border border-[#482014] text-xs text-white placeholder-[#8d5d4f] focus:outline-none focus:border-[#f8bc4b]"
            />
            <button
              type="submit"
              disabled={isAsking || !userQuestion.trim()}
              className="px-3 py-2 rounded-xl bg-[#e56c5e] text-[#410001] font-bold text-xs flex items-center gap-1 shadow active:scale-95 disabled:opacity-40"
            >
              <span>{isAsking ? '...' : 'Hỏi'}</span>
              <span>💬</span>
            </button>
          </form>

          {/* Cu Tit Answer Popup */}
          {askAnswer && (
            <div className="mt-2 p-3 rounded-2xl bg-[#2a130c] border border-[#f8bc4b]/50 text-xs text-[#ffdbcf] shadow-md animate-in fade-in">
              <div className="flex items-center justify-between font-bold text-[#f8bc4b] mb-1">
                <span>🏮 Bé Cu Tít giải đáp:</span>
                <button onClick={() => setAskAnswer(null)} className="text-[#cca79b]">✕</button>
              </div>
              <p className="whitespace-pre-line leading-relaxed mb-1.5">{askAnswer.answer}</p>
              {askAnswer.sources.length > 0 && (
                <div className="text-[10px] text-[#cca79b] opacity-80">
                  Nguồn thẻ: {askAnswer.sources.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-2.5 no-scrollbar text-xs">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap text-[11px] font-semibold transition-all ${
                selectedCategory === c.id
                  ? 'bg-[#f8bc4b] text-[#220e07] shadow'
                  : 'bg-[#2a130c] text-[#cca79b] border border-[#482014]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Selected Card Spotlight Detail */}
        {activeCard && (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[#2e140c] to-[#1e0a05] bg-[#2e140c] border border-[#5a281a] shadow-lg mb-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-3xl p-1.5 rounded-xl bg-[#170803] border border-[#482014]">
                  {activeCard.icon}
                </span>
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                    {activeCard.categoryLabel}
                  </span>
                  <h2 className="text-sm font-extrabold text-white mt-1 leading-snug">
                    {activeCard.title}
                  </h2>
                </div>
              </div>
            </div>

            {/* Proverb Quote */}
            <div className="p-2.5 rounded-xl bg-[#170803] border-l-4 border-[#f8bc4b] text-xs italic text-[#f8bc4b] font-medium mb-3">
              "{activeCard.proverb}"
            </div>

            {/* Story */}
            <div className="text-xs text-[#ffdbcf] leading-relaxed mb-3">
              <span className="font-bold text-amber-300">Bé Cu Tít kể chuyện: </span>
              {activeCard.story}
            </div>

            {/* Dos and Don'ts */}
            <div className="grid grid-cols-1 gap-2 pt-2 border-t border-[#482014] text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/50">
                <div className="font-bold text-emerald-300 mb-1 flex items-center gap-1">
                  <span>✓</span> Nên làm (Do):
                </div>
                <ul className="space-y-1 text-emerald-100 text-[11px]">
                  {activeCard.dos.map((d, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-emerald-400">•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/50">
                <div className="font-bold text-rose-300 mb-1 flex items-center gap-1">
                  <span>✕</span> Kiêng kỵ (Don't):
                </div>
                <ul className="space-y-1 text-rose-100 text-[11px]">
                  {activeCard.donts.map((d, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-rose-400">•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Mini Quiz */}
            <div className="mt-3 p-3 rounded-xl bg-[#170803] border border-[#482014]">
              <div className="text-[11px] font-bold text-[#f8bc4b] mb-1.5 flex items-center gap-1">
                <span>🎯</span> Câu đố văn hóa Cu Tít:
              </div>
              <p className="text-xs text-white font-medium mb-2">
                {activeCard.quiz.question}
              </p>

              <div className="space-y-1.5">
                {activeCard.quiz.options.map((opt, oIdx) => {
                  const isPicked = quizAnswered === oIdx;
                  const isRight = activeCard.quiz.answerIndex === oIdx;
                  let style = 'bg-[#260f08] border-[#482014] text-[#cca79b]';
                  if (quizAnswered !== null) {
                    if (isRight) style = 'bg-emerald-950 border-emerald-500 text-emerald-200 font-bold';
                    else if (isPicked) style = 'bg-rose-950 border-rose-500 text-rose-200';
                  }

                  return (
                    <button
                      key={oIdx}
                      onClick={() => setQuizAnswered(oIdx)}
                      className={`w-full p-2 rounded-lg border text-left text-xs transition-all ${style}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {quizAnswered !== null && (
                <div className="mt-2 text-[11px] text-amber-200 italic">
                  💡 {activeCard.quiz.explanation}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Culture Cards List Scroll */}
        <div className="mb-2">
          <div className="text-xs font-bold text-[#ffb4aa] mb-2 flex items-center justify-between">
            <span>Danh Sách 20 Thẻ Văn Hóa:</span>
            <span className="text-[10px] text-[#cca79b]">Chạm thẻ để xem chi tiết</span>
          </div>

          <div className="space-y-2">
            {filteredCards.map((c) => {
              const isSelected = activeCard?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveCard(c);
                    setQuizAnswered(null);
                  }}
                  className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-[#3b1a10] border-[#f8bc4b] shadow-md'
                      : 'bg-[#200d07] border-[#482014] hover:border-[#6d301e]'
                  }`}
                >
                  <span className="text-2xl">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-xs font-bold text-white truncate">
                        {c.title}
                      </h3>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-300 whitespace-nowrap">
                        {c.categoryLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#cca79b] truncate mt-0.5">
                      {c.summary}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
