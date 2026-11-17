import React, { useState } from 'react';
import {
  ROLEPLAY_SCENARIOS_4,
  type RoleplayScenarioItem,
  type RoleplayStep,
  type RoleplayChoice
} from '@vietlearning/content';

interface RoleplaySimulatorScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const RoleplaySimulatorScreen: React.FC<RoleplaySimulatorScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [selectedScenario, setSelectedScenario] = useState<RoleplayScenarioItem | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  
  // Trạng thái hội thoại
  const [selectedChoice, setSelectedChoice] = useState<RoleplayChoice | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [dialogueHistory, setDialogueHistory] = useState<Array<{ sender: 'npc' | 'user'; text: string; sub?: string }>>([]);
  
  // Điểm số tích lũy
  const [accumulatedScores, setAccumulatedScores] = useState({
    honorific: 95,
    natural: 92,
    syntax: 94
  });

  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  // Phát âm audio bằng Web Speech API
  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Chọn kịch bản
  const handleSelectScenario = (scenario: RoleplayScenarioItem) => {
    setSelectedScenario(scenario);
    setCurrentStepIndex(0);
    setSelectedChoice(null);
    setIsCompleted(false);
    setAccumulatedScores({ honorific: 95, natural: 90, syntax: 92 });
    setDialogueHistory([
      { sender: 'npc', text: scenario.steps[0].npcPrompt, sub: scenario.npcRole }
    ]);
    playAudio(scenario.steps[0].npcPrompt);
  };

  // Người học chọn một câu đối thoại
  const handlePickChoice = async (choice: RoleplayChoice) => {
    if (!selectedScenario || isProcessing) return;

    setSelectedChoice(choice);
    setIsProcessing(true);

    // Phát âm câu người học vừa chọn
    playAudio(choice.text);

    // Cập nhật lịch sử
    const newHistory = [
      ...dialogueHistory,
      { sender: 'user' as const, text: choice.text, sub: choice.englishMeaning }
    ];
    setDialogueHistory(newHistory);

    // Cập nhật điểm tích lũy
    setAccumulatedScores({
      honorific: Math.round((accumulatedScores.honorific + choice.honorificScore) / 2),
      natural: Math.round((accumulatedScores.natural + choice.naturalScore) / 2),
      syntax: Math.round((accumulatedScores.syntax + choice.syntaxScore) / 2)
    });

    // NPC phản hồi sau 1 giây
    setTimeout(() => {
      newHistory.push({
        sender: 'npc',
        text: choice.npcResponse,
        sub: selectedScenario.npcName
      });
      setDialogueHistory([...newHistory]);
      playAudio(choice.npcResponse);

      setIsProcessing(false);

      if (choice.isCompleted || currentStepIndex + 1 >= selectedScenario.steps.length) {
        setIsCompleted(true);
      } else {
        setCurrentStepIndex(currentStepIndex + 1);
        setSelectedChoice(null);
      }
    }, 1200);
  };

  const isDark = theme === 'dark';
  const currentStep: RoleplayStep | undefined = selectedScenario?.steps[currentStepIndex];

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
          {selectedScenario ? (
            <button
              onClick={() => setSelectedScenario(null)}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${isDark ? 'border-white/20 hover:bg-white/10 text-white' : 'border-black/10 hover:bg-black/5 text-[#220e07]'}`}
            >
              ← Trở về
            </button>
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#e56c5e]/20 border border-[#e56c5e] flex items-center justify-center text-lg">
              🎭
            </div>
          )}
          <div>
            <h1 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5`}>
              <span>{selectedScenario ? selectedScenario.title : 'Nhập Vai Giao Tiếp'}</span>
            </h1>
            <p className="text-[11px] opacity-70">
              {selectedScenario ? selectedScenario.location : '4 Bối cảnh đời sống'}
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

      {/* Main Area */}
      <main className="flex-1 px-4 py-4 space-y-4">
        {/* VIEW 1: Chọn Kịch Bản (Scenario Selection) */}
        {!selectedScenario && (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-2xl border ${
                isDark ? 'bg-[#1a0a05] border-[#e56c5e]/25' : 'bg-white border-[#7d3326]/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">🏮</span>
                <div>
                  <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#220e07]'}`}>
                    4 Bối Cảnh Nhập Vai Đời Sống
                  </h2>
                  <p className="text-[11px] opacity-75 mt-0.5 leading-relaxed">
                    Tập phản xạ giao tiếp tự nhiên cùng nhân vật ảo NPC. Hệ thống tự động đánh giá Lễ phép, Phương ngữ và Cú pháp.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {ROLEPLAY_SCENARIOS_4.map((scenario) => (
                <div
                  key={scenario.id}
                  onClick={() => handleSelectScenario(scenario)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md ${
                    isDark
                      ? 'bg-[#1a0a05] border-[#e56c5e]/25 hover:border-[#e56c5e]'
                      : 'bg-white border-[#7d3326]/15 hover:border-[#b84835]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 border"
                        style={{
                          backgroundColor: `${scenario.themeColor}20`,
                          borderColor: scenario.themeColor
                        }}
                      >
                        {scenario.npcAvatar}
                      </div>
                      <div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-white/10 text-[#f8bc4b]">
                          {scenario.location}
                        </span>
                        <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#220e07]'} mt-1`}>
                          {scenario.title}
                        </h3>
                        <p className="text-[11px] opacity-75">
                          {scenario.npcName} • {scenario.npcRole}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className={`text-xs mt-3 opacity-90 leading-relaxed ${isDark ? 'text-white/90' : 'text-[#3f2418]'}`}>
                    {scenario.description}
                  </p>

                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-[#4ade80] font-bold">
                      🏆 {scenario.culturalBadge}
                    </span>
                    <button className="px-3 py-1 rounded-xl bg-[#e56c5e] text-white text-xs font-bold shadow-md shadow-[#e56c5e]/30">
                      Bắt Đầu Nhập Vai →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 2: Màn Hình Đối Thoại Nhập Vai Đang Diễn Ra */}
        {selectedScenario && !isCompleted && currentStep && (
          <div className="space-y-4">
            {/* Header info & Step counter */}
            <div
              className={`p-3 rounded-2xl border flex items-center justify-between ${
                isDark ? 'bg-[#1a0a05] border-[#e56c5e]/25' : 'bg-white border-[#7d3326]/15'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{selectedScenario.npcAvatar}</span>
                <div>
                  <h3 className="text-xs font-bold text-white">{selectedScenario.npcName}</h3>
                  <p className="text-[10px] opacity-70">{selectedScenario.npcRole}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-[#f8bc4b]">
                  Lượt {currentStepIndex + 1} / {selectedScenario.steps.length}
                </span>
                <div className="w-20 h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden">
                  <div
                    className="h-full bg-[#e56c5e] rounded-full transition-all duration-300"
                    style={{
                      width: `${((currentStepIndex + 1) / selectedScenario.steps.length) * 100}%`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Target Tasks Progress */}
            <div
              className={`p-3 rounded-xl border space-y-1.5 ${
                isDark ? 'bg-black/20 border-white/5' : 'bg-stone-50 border-black/5'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#f8bc4b] block">
                Nhiệm vụ cần hoàn thành:
              </span>
              <div className="space-y-1">
                {selectedScenario.targetTasks.map((task, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-[11px] text-white/85">
                    <span className={idx <= currentStepIndex ? 'text-[#4ade80]' : 'text-white/40'}>
                      {idx <= currentStepIndex ? '✓' : '○'}
                    </span>
                    <span className={idx < currentStepIndex ? 'line-through opacity-60' : ''}>
                      {task}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dialogue Conversation Balloon */}
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-none">
              {dialogueHistory.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    item.sender === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed shadow-md ${
                      item.sender === 'user'
                        ? 'bg-[#e56c5e] text-white rounded-br-xs'
                        : isDark
                        ? 'bg-[#2d150d] text-white border border-[#e56c5e]/30 rounded-bl-xs'
                        : 'bg-white text-[#220e07] border border-[#7d3326]/20 rounded-bl-xs'
                    }`}
                  >
                    <p className="font-semibold">{item.text}</p>
                    {item.sub && (
                      <p className="text-[10px] opacity-75 mt-1 italic">{item.sub}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Cu Tit Folk Hint Card */}
            <div
              className={`p-2.5 rounded-xl border flex items-center justify-between ${
                isDark ? 'bg-[#1a0a05] border-[#f8bc4b]/30' : 'bg-[#fffbeb] border-[#f59e0b]/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <span className="text-[11px] text-[#f8bc4b] font-medium leading-tight">
                  {currentStep.hint}
                </span>
              </div>
              <button
                onClick={() => playAudio(currentStep.npcPrompt)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors shrink-0 ml-2"
                title="Nghe lại lời NPC"
              >
                🔊 Nghe lại
              </button>
            </div>

            {/* 3 User Response Options */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold text-white block">
                Chọn câu thoại của bạn để phản hồi:
              </span>

              {currentStep.choices.map((choice) => (
                <div
                  key={choice.id}
                  onClick={() => handlePickChoice(choice)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all active:scale-[0.98] ${
                    isProcessing
                      ? 'opacity-60 pointer-events-none'
                      : isDark
                      ? 'bg-[#1a0a05] border-[#e56c5e]/25 hover:border-[#e56c5e] hover:bg-[#2d150d]'
                      : 'bg-white border-[#7d3326]/15 hover:border-[#b84835]'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-xs font-bold text-white leading-relaxed">
                      "{choice.text}"
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playAudio(choice.text);
                      }}
                      className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] shrink-0"
                      title="Nghe trước câu này"
                    >
                      🔊
                    </button>
                  </div>
                  <p className="text-[10px] opacity-75 mt-0.5">{choice.englishMeaning}</p>
                </div>
              ))}
            </div>

            {/* Realtime 3 Scores Meter */}
            <div
              className={`p-3 rounded-xl border grid grid-cols-3 gap-2 text-center ${
                isDark ? 'bg-black/20 border-white/5' : 'bg-stone-50 border-black/5'
              }`}
            >
              <div>
                <span className="text-[9px] opacity-75 block">🏮 Lễ Phép (A6)</span>
                <span className="text-xs font-black text-[#e56c5e]">
                  {accumulatedScores.honorific}%
                </span>
              </div>
              <div>
                <span className="text-[9px] opacity-75 block">🗺️ Tự Nhiên (A7)</span>
                <span className="text-xs font-black text-[#38bdf8]">
                  {accumulatedScores.natural}%
                </span>
              </div>
              <div>
                <span className="text-[9px] opacity-75 block">🎋 Cú Pháp (A8)</span>
                <span className="text-xs font-black text-[#f8bc4b]">
                  {accumulatedScores.syntax}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: Hoàn Thành Kịch Bản (Quest Completion) */}
        {selectedScenario && isCompleted && (
          <div
            className={`p-6 rounded-2xl border text-center space-y-4 shadow-xl ${
              isDark ? 'bg-[#1a0a05] border-[#e56c5e]/40' : 'bg-white border-[#7d3326]/20'
            }`}
          >
            <div className="w-16 h-16 rounded-full bg-[#f8bc4b]/20 border border-[#f8bc4b] flex items-center justify-center mx-auto text-3xl">
              🏆
            </div>

            <div>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#e56c5e] text-white font-bold uppercase tracking-wider">
                Hoàn Thành Kịch Bản
              </span>
              <h2 className="text-base font-black text-white mt-2">
                Chúc Mừng Bạn Đã Tốt Nghiệp Bối Cảnh!
              </h2>
              <p className="text-xs text-[#f8bc4b] font-bold mt-1">
                Được trao huy hiệu: {selectedScenario.culturalBadge}
              </p>
            </div>

            {/* Summary scores */}
            <div
              className={`p-3.5 rounded-xl border grid grid-cols-3 gap-2 text-center ${
                isDark ? 'bg-black/20 border-white/10' : 'bg-stone-50 border-black/10'
              }`}
            >
              <div>
                <span className="text-[10px] opacity-75 block">Lễ phép A6</span>
                <span className="text-sm font-black text-[#e56c5e]">
                  {accumulatedScores.honorific}%
                </span>
              </div>
              <div>
                <span className="text-[10px] opacity-75 block">Phương ngữ A7</span>
                <span className="text-sm font-black text-[#38bdf8]">
                  {accumulatedScores.natural}%
                </span>
              </div>
              <div>
                <span className="text-[10px] opacity-75 block">Cú pháp A8</span>
                <span className="text-sm font-black text-[#f8bc4b]">
                  {accumulatedScores.syntax}%
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80] text-xs font-bold">
              ✨ +150 Điểm Kinh Nghiệm Bé Cu Tít
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => handleSelectScenario(selectedScenario)}
                className="w-full py-2.5 rounded-xl border border-white/20 text-xs font-bold text-white hover:bg-white/5 transition-all"
              >
                🔄 Chơi Lại Kịch Bản Này
              </button>
              <button
                onClick={() => setSelectedScenario(null)}
                className="w-full py-2.5 rounded-xl bg-[#e56c5e] text-white text-xs font-bold shadow-md shadow-[#e56c5e]/30 hover:bg-[#d4584b] transition-all"
              >
                📜 Chọn Bối Cảnh Nhập Vai Khác
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
