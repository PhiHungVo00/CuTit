import React, { useState, useEffect } from 'react';
import { AI_PERSONAS_3, type AiPersonaItem } from '@vietlearning/content';
import { EventBus } from '@vietlearning/shared';

interface AiPreferencesScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onSave?: (prefs: any) => void;
  onNavigateTab?: (tab: string) => void;
}

export const AiPreferencesScreen: React.FC<AiPreferencesScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onSave,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [selectedPersonaId, setSelectedPersonaId] = useState<'folk_boy' | 'village_scholar' | 'modern_peer'>('folk_boy');
  const [dialect, setDialect] = useState<'north' | 'central' | 'south'>('north');
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [pitchLevel, setPitchLevel] = useState<'low' | 'normal' | 'high'>('normal');
  const [strictness, setStrictness] = useState<'gentle' | 'balanced' | 'strict'>('balanced');
  const [audioConsent, setAudioConsent] = useState<boolean>(true);
  
  // UI states
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Load from LocalStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cu_tit_preferences');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.personaId) setSelectedPersonaId(parsed.personaId);
        if (parsed.dialect) setDialect(parsed.dialect);
        if (parsed.speechSpeed) setSpeechSpeed(parsed.speechSpeed);
        if (parsed.pitchLevel) setPitchLevel(parsed.pitchLevel);
        if (parsed.strictness) setStrictness(parsed.strictness);
        if (parsed.audioConsent !== undefined) setAudioConsent(parsed.audioConsent);
      }
    } catch {
      // Ignore
    }
  }, []);

  const activePersona: AiPersonaItem = AI_PERSONAS_3.find((p) => p.id === selectedPersonaId) || AI_PERSONAS_3[0];

  // Khi đổi persona, cập nhật dialect và speed mặc định của persona đó
  const handleSelectPersona = (persona: AiPersonaItem) => {
    setSelectedPersonaId(persona.id);
    setDialect(persona.defaultDialect);
    setSpeechSpeed(persona.defaultSpeed);
  };

  // Phát âm thử giọng nói của Persona
  const handlePreviewSpeech = () => {
    if (!('speechSynthesis' in window)) {
      alert('Trình duyệt không hỗ trợ Web Speech API.');
      return;
    }

    window.speechSynthesis.cancel();
    setIsPlayingAudio(true);

    const textToSpeak = activePersona.sampleGreeting;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'vi-VN';
    utterance.rate = speechSpeed;
    utterance.pitch = pitchLevel === 'low' ? 0.8 : pitchLevel === 'high' ? 1.2 : 1.0;

    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    window.speechSynthesis.speak(utterance);
  };

  // Lưu cài đặt
  const handleSavePreferences = async () => {
    const prefs = {
      personaId: selectedPersonaId,
      personaName: activePersona.name,
      dialect,
      speechSpeed,
      pitchLevel,
      strictness,
      audioConsent,
      updatedAt: new Date().toISOString()
    };

    // 1. Lưu LocalStorage
    try {
      localStorage.setItem('cu_tit_preferences', JSON.stringify(prefs));
    } catch {
      // Ignore
    }

    // 2. Gửi Gateway PUT /v1/preferences
    try {
      await fetch('http://localhost:4000/v1/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs)
      });
    } catch {
      // Fallback offline
    }

    // 3. Bắn event lên EventBus
    try {
      EventBus.getInstance().emit('PREFERENCES_UPDATED', prefs);
    } catch {
      // Ignore
    }

    if (onSave) onSave(prefs);

    setSaveToast('Đã lưu thiết lập trợ lý AI thành công! ✨');
    setTimeout(() => {
      setSaveToast(null);
    }, 2500);
  };

  const isDark = theme === 'dark';

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
            ⚙️
          </div>
          <div>
            <h1 className={`text-base font-bold tracking-tight flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-[#220e07]'}`}>
              <span>Cài Đặt Trợ Lý AI</span>
            </h1>
            <p className="text-[11px] opacity-70">
              Nhân cách AI, giọng đọc & phản hồi thích ứng
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

      {/* Main Form */}
      <main className="flex-1 px-4 py-4 space-y-5">
        {/* Section 1: 3 AI Personas */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5">
              <span>🎭 Chọn Hình Tượng Trợ Lý AI</span>
            </h2>
            <span className="text-[10px] text-[#f8bc4b] font-medium">3 phong cách</span>
          </div>

          <div className="space-y-2.5">
            {AI_PERSONAS_3.map((persona) => {
              const isSelected = selectedPersonaId === persona.id;
              return (
                <div
                  key={persona.id}
                  onClick={() => handleSelectPersona(persona)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? isDark
                        ? 'bg-[#2d150d] border-[#e56c5e] ring-2 ring-[#e56c5e]/30 shadow-md'
                        : 'bg-white border-[#b84835] ring-2 ring-[#b84835]/20 shadow-md'
                      : isDark
                      ? 'bg-[#1a0a05] border-[#e56c5e]/20 opacity-80 hover:opacity-100 hover:border-[#e56c5e]/40'
                      : 'bg-white border-[#7d3326]/10 opacity-80 hover:opacity-100 hover:border-[#b84835]/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ backgroundColor: `${persona.themeColor}25`, border: `1px solid ${persona.themeColor}` }}
                      >
                        {persona.avatarIcon}
                      </div>
                      <div>
                        <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5`}>
                          <span>{persona.name}</span>
                          {isSelected && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#e56c5e] text-white font-bold">
                              Đang chọn
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] opacity-75">{persona.title}</p>
                      </div>
                    </div>
                  </div>

                  <p className={`text-xs mt-2.5 opacity-90 leading-relaxed ${isDark ? 'text-white/90' : 'text-[#3f2418]'}`}>
                    {persona.toneOfVoice}
                  </p>

                  <div className={`mt-2 text-[11px] p-2 rounded-xl ${isDark ? 'bg-black/20 text-[#f8bc4b]' : 'bg-[#7d3326]/5 text-[#3f2418]'}`}>
                    <span className="font-semibold">Phong cách sửa lỗi:</span> {persona.correctionStyle}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quote Preview & Voice Testing */}
        <section
          className={`p-4 rounded-2xl border space-y-3 ${
            isDark ? 'bg-[#1a0a05] border-[#e56c5e]/25' : 'bg-white border-[#7d3326]/15'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5">
              <span>🔊 Giọng Nói & Lời Chào Mẫu</span>
            </h3>
            <span className="text-[10px] text-[#38bdf8] font-mono">Web Speech / TTS</span>
          </div>

          {/* Sample Greeting Box */}
          <div className="p-3 rounded-xl bg-black/25 border border-white/5 space-y-1">
            <span className="text-[10px] text-[#f8bc4b] font-semibold uppercase">
              Lời chào của {activePersona.name}:
            </span>
            <p className={`text-xs ${isDark ? 'text-white/95' : 'text-[#3f2418]'} italic leading-relaxed`}>
              "{activePersona.sampleGreeting}"
            </p>
          </div>

          {/* Button to listen */}
          <button
            onClick={handlePreviewSpeech}
            disabled={isPlayingAudio}
            className={`w-full py-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
              isPlayingAudio
                ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] animate-pulse'
                : `bg-[#e56c5e]/20 border-[#e56c5e] ${isDark ? 'text-white' : 'text-[#b84835]'} hover:bg-[#e56c5e]/30`
            }`}
          >
            <span>{isPlayingAudio ? '🔊 Đang phát giọng mẫu...' : '🔊 Nghe Thử Giọng Của Nhân Vật'}</span>
          </button>
        </section>

        {/* Section 2: Dialect Selection */}
        <section
          className={`p-4 rounded-2xl border space-y-3 ${
            isDark ? 'bg-[#1a0a05] border-[#e56c5e]/25' : 'bg-white border-[#7d3326]/15'
          }`}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5">
            <span>🗺️ Phương Ngữ Mục Tiêu</span>
          </h3>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'north', label: 'Miền Bắc', sub: 'Hà Nội mộc mạc' },
              { id: 'central', label: 'Miền Trung', sub: 'Huế dịu dàng' },
              { id: 'south', label: 'Miền Nam', sub: 'Sài Gòn phóng khoáng' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setDialect(item.id as any)}
                className={`py-2 px-1 rounded-xl border text-center transition-all ${
                  dialect === item.id
                    ? 'bg-[#e56c5e] text-white border-[#e56c5e] shadow-md shadow-[#e56c5e]/20'
                    : isDark
                    ? 'bg-black/20 text-white/70 border-white/10 hover:border-white/30'
                    : 'bg-stone-50 text-black/70 border-black/10 hover:border-black/30'
                }`}
              >
                <div className="text-xs font-bold">{item.label}</div>
                <div className="text-[9px] opacity-75 mt-0.5">{item.sub}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Section 3: Speed & Pitch */}
        <section
          className={`p-4 rounded-2xl border space-y-4 ${
            isDark ? 'bg-[#1a0a05] border-[#e56c5e]/25' : 'bg-white border-[#7d3326]/15'
          }`}
        >
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className={`font-bold ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1`}>
                <span>⏱️ Tốc độ nói:</span>
              </span>
              <span className="text-[#f8bc4b] font-bold">{speechSpeed}x</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.25"
              step="0.05"
              value={speechSpeed}
              onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
              className="w-full accent-[#e56c5e] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-60">
              <span>0.75x (Chậm rãi)</span>
              <span>1.0x (Tự nhiên)</span>
              <span>1.25x (Lưu loát)</span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#220e07]'} block`}>
              🎵 Cao độ giọng (Pitch F0):
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'low', label: 'Trầm ấm' },
                { id: 'normal', label: 'Tự nhiên' },
                { id: 'high', label: 'Trong trẻo' }
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPitchLevel(p.id as any)}
                  className={`py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    pitchLevel === p.id
                      ? 'bg-[#0f4c64] text-[#38bdf8] border-[#38bdf8]'
                      : isDark
                      ? 'bg-black/20 text-white/70 border-white/10'
                      : 'bg-stone-50 text-black/70 border-black/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Section 4: Strictness */}
        <section
          className={`p-4 rounded-2xl border space-y-3 ${
            isDark ? 'bg-[#1a0a05] border-[#e56c5e]/25' : 'bg-white border-[#7d3326]/15'
          }`}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5">
            <span>⚖️ Mức Độ Sửa Lỗi Giao Tiếp</span>
          </h3>

          <div className="space-y-2">
            {[
              {
                id: 'gentle',
                label: 'Nhẹ nhàng',
                desc: 'Chỉ nhắc nhở khi câu gây hiểu lầm lớn, ưu tiên kích thích sự tự tin nói tiếng Việt.'
              },
              {
                id: 'balanced',
                label: 'Cân bằng (Khuyên dùng)',
                desc: 'Sửa lỗi sai thanh điệu cơ bản và chỉ ra cách xưng hô chuẩn mực theo bối cảnh.'
              },
              {
                id: 'strict',
                label: 'Nghiêm khắc & Học thuật',
                desc: 'So khớp từng thanh điệu, dấu ngã/hỏi và yêu cầu đúng hoàn toàn trật tự đốt tre.'
              }
            ].map((item) => (
              <div
                key={item.id}
                onClick={() => setStrictness(item.id as any)}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                  strictness === item.id
                    ? isDark
                      ? 'bg-[#e56c5e]/15 border-[#e56c5e] text-white'
                      : 'bg-[#e56c5e]/10 border-[#b84835] text-[#220e07]'
                    : isDark
                    ? 'bg-black/20 border-white/5 opacity-70'
                    : 'bg-stone-50 border-black/5 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#220e07]'}`}>{item.label}</span>
                  {strictness === item.id && <span className="text-xs text-[#e56c5e]">✓</span>}
                </div>
                <p className="text-[11px] opacity-75 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 5: Audio Data Retention (TDD Section 11 Compliance) */}
        <section
          className={`p-3.5 rounded-2xl border space-y-2 ${
            isDark ? 'bg-[#1a0a05] border-[#e56c5e]/20' : 'bg-white border-[#7d3326]/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5`}>
                <span>🔒 Phân tích âm thanh & quyền riêng tư</span>
              </span>
              <p className="text-[10px] opacity-70">
                Tuân thủ TDD Mục 11: Dữ liệu âm thanh tự động xóa sau 30 ngày (TTL).
              </p>
            </div>
            <input
              type="checkbox"
              checked={audioConsent}
              onChange={(e) => setAudioConsent(e.target.checked)}
              className="w-4 h-4 accent-[#e56c5e] cursor-pointer"
            />
          </div>
        </section>

        {/* Toast */}
        {saveToast && (
          <div className="p-3 rounded-xl bg-[#4ade80]/20 border border-[#4ade80] text-[#4ade80] text-xs font-bold text-center animate-bounce">
            {saveToast}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSavePreferences}
          className="w-full py-3.5 rounded-2xl bg-[#e56c5e] text-white text-sm font-bold shadow-lg shadow-[#e56c5e]/30 hover:bg-[#d4584b] transition-all active:scale-[0.99]"
        >
          💾 Lưu Thiết Lập Trợ Lý AI
        </button>
      </main>
    </div>
  );
};
