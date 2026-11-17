import React, { useState, useRef, useEffect } from 'react';
import { VISION_OBJECT_BANK_8, type VisionObjectItem } from '@vietlearning/content';

interface ArCameraSurfaceScreenProps {
  initialTheme?: 'dark' | 'light';
  onBack?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const ArCameraSurfaceScreen: React.FC<ArCameraSurfaceScreenProps> = ({
  initialTheme = 'dark',
  onBack,
  onNavigateTab
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [activeItem, setActiveItem] = useState<VisionObjectItem>(VISION_OBJECT_BANK_8[0]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanConfidence, setScanConfidence] = useState<number>(96);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Mở luồng Camera WebRTC (Camera sau trên di động nếu có)
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Trình duyệt không hỗ trợ truy cập Camera trực tiếp.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera error:', err);
      setCameraError('Không thể mở Camera (chưa cấp quyền hoặc không có thiết bị). Bạn vẫn có thể dùng kho 8 vật thể mẫu hoặc tải ảnh bên dưới.');
      setCameraActive(false);
    }
  };

  // Dừng luồng Camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Quét vật thể
  const handleTriggerScan = () => {
    setIsScanning(true);
    // Giả lập quét AI nhận diện trong 1 giây
    setTimeout(() => {
      // Random chọn một vật thể trong kho hoặc giữ nguyên
      const randomIndex = Math.floor(Math.random() * VISION_OBJECT_BANK_8.length);
      const detected = VISION_OBJECT_BANK_8[randomIndex];
      setActiveItem(detected);
      setScanConfidence(Math.floor(Math.random() * 8) + 92); // 92 - 99%
      setIsScanning(false);
      playAudio(detected.audioPrompt);
    }, 1000);
  };

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

  // Tải ảnh từ thiết bị
  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsScanning(true);
      setTimeout(() => {
        // Khớp theo tên file hoặc chọn ngẫu nhiên
        const matched = VISION_OBJECT_BANK_8.find((item) =>
          file.name.toLowerCase().includes(item.id.replace('_', ''))
        ) || VISION_OBJECT_BANK_8[Math.floor(Math.random() * VISION_OBJECT_BANK_8.length)];
        setActiveItem(matched);
        setScanConfidence(98);
        setIsScanning(false);
        playAudio(matched.audioPrompt);
      }, 800);
    }
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
          <div className="w-9 h-9 rounded-full bg-[#e56c5e]/20 border border-[#e56c5e] flex items-center justify-center text-lg">
            📷
          </div>
          <div>
            <h1 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5`}>
              <span>Thị Giác AR Camera M4</span>
            </h1>
            <p className="text-[11px] opacity-70">
              Nhận diện vật thể & dán nhãn văn hóa đa tầng
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

      {/* Main Content */}
      <main className="flex-1 px-4 py-4 space-y-4">
        {/* AR Viewport Container */}
        <div
          className={`relative w-full aspect-4/3 rounded-3xl overflow-hidden border-2 flex flex-col items-center justify-center shadow-xl ${
            isDark
              ? 'bg-black/60 border-[#e56c5e]/40 shadow-[#220e07]'
              : 'bg-stone-900 border-[#7d3326]/40 shadow-stone-300'
          }`}
        >
          {/* Live WebRTC Video */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {/* Placeholder if Camera is Off */}
          {!cameraActive && (
            <div className="flex flex-col items-center justify-center text-center p-4 z-10 space-y-2">
              <span className="text-5xl animate-bounce">{activeItem.icon}</span>
              <p className="text-xs text-white/90 font-bold">
                {activeItem.name} ({activeItem.english})
              </p>
              <p className="text-[10px] text-white/60 max-w-[200px]">
                {cameraError || 'Camera đang tắt. Bấm nút bên dưới để mở camera hoặc chọn đồ vật mẫu.'}
              </p>
            </div>
          )}

          {/* AR Target Reticle / Khung Ngắm Tre Trúc */}
          <div className="absolute inset-8 border border-white/20 rounded-2xl pointer-events-none flex flex-col justify-between p-2">
            <div className="flex justify-between">
              <span className="w-4 h-4 border-t-2 border-l-2 border-[#f8bc4b]" />
              <span className="w-4 h-4 border-t-2 border-r-2 border-[#f8bc4b]" />
            </div>
            
            {/* Scanning Laser Beam */}
            {isScanning && (
              <div className="w-full h-0.5 bg-[#f8bc4b] shadow-[0_0_12px_#f8bc4b] animate-pulse" />
            )}

            <div className="flex justify-between">
              <span className="w-4 h-4 border-b-2 border-l-2 border-[#f8bc4b]" />
              <span className="w-4 h-4 border-b-2 border-r-2 border-[#f8bc4b]" />
            </div>
          </div>

          {/* Floating AR Target Badge */}
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-white font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>AR TRACKING • {scanConfidence}%</span>
          </div>

          {/* Quick Toggle Camera Button */}
          <button
            onClick={() => {
              if (cameraActive) stopCamera();
              else startCamera();
            }}
            className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] text-white font-bold hover:bg-black/80 transition-all"
          >
            {cameraActive ? '⏹️ Tắt Cam' : '📹 Mở Cam'}
          </button>
        </div>

        {/* Scan & Upload Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleTriggerScan}
            disabled={isScanning}
            className={`flex-1 py-3 rounded-2xl bg-[#e56c5e] text-white text-xs font-bold shadow-lg shadow-[#e56c5e]/30 flex items-center justify-center gap-2 transition-all active:scale-95 ${
              isScanning ? 'opacity-70 animate-pulse' : 'hover:bg-[#d4584b]'
            }`}
          >
            <span>{isScanning ? '🔍 Đang Phân Tích...' : '✨ Quét Vật Thể AR'}</span>
          </button>

          <label className="p-3 rounded-2xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-bold cursor-pointer flex items-center justify-center shrink-0 transition-colors">
            📁 Tải Ảnh
            <input type="file" accept="image/*" onChange={handleUploadImage} className="hidden" />
          </label>
        </div>

        {/* 8 Cultural Objects Carousel */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-bold ${isDark ? 'text-white' : 'text-[#220e07]'} flex items-center gap-1.5`}>
              <span>🎋 Kho 8 Vật Thể Văn Hóa Mẫu</span>
            </span>
            <span className="text-[10px] text-[#f8bc4b]">Chạm để quét ngay</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {VISION_OBJECT_BANK_8.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveItem(item);
                  playAudio(item.audioPrompt);
                }}
                className={`py-2 px-3 rounded-xl border text-center shrink-0 flex items-center gap-2 transition-all ${
                  activeItem.id === item.id
                    ? 'bg-[#e56c5e] text-white border-[#e56c5e] shadow-md shadow-[#e56c5e]/20'
                    : isDark
                    ? 'bg-[#1a0a05] text-white/70 border-white/10 hover:border-white/30'
                    : 'bg-white text-black/70 border-black/10 hover:border-black/30'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-xs font-bold">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Multi-layer AR Semantic Card (Dán Nhãn Đa Tầng) */}
        <section
          className={`p-4 rounded-2xl border space-y-3 shadow-lg ${
            isDark ? 'bg-[#1a0a05] border-[#e56c5e]/30' : 'bg-white border-[#7d3326]/15'
          }`}
        >
          {/* Card Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-3xl">{activeItem.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className={`text-base font-black ${isDark ? 'text-white' : 'text-[#220e07]'}`}>{activeItem.name}</h3>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-[#0f4c64] text-[#38bdf8] font-bold">
                    {activeItem.category}
                  </span>
                </div>
                <p className="text-[11px] opacity-75">{activeItem.english}</p>
              </div>
            </div>

            <button
              onClick={() => playAudio(activeItem.audioPrompt)}
              className="p-2.5 rounded-xl bg-[#e56c5e]/20 border border-[#e56c5e] text-white text-xs hover:bg-[#e56c5e]/30 transition-colors"
              title="Phát âm chuẩn tiếng Việt"
            >
              🔊 Nghe
            </button>
          </div>

          {/* Phonetics & Tone breakdown */}
          <div
            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
              isDark ? 'bg-black/20 border-white/5' : 'bg-stone-50 border-black/5'
            }`}
          >
            <div>
              <span className="text-[10px] opacity-60 block">Phiên âm IPA:</span>
              <span className="font-mono text-xs font-bold text-[#f8bc4b]">
                {activeItem.ipa}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] opacity-60 block">Thanh điệu tiếng Việt:</span>
              <span className="text-xs font-bold text-[#4ade80]">
                {activeItem.tone}
              </span>
            </div>
          </div>

          {/* Cultural Note */}
          <div className={`text-xs ${isDark ? 'text-white/90' : 'text-[#3f2418]'} leading-relaxed bg-black/10 p-2.5 rounded-xl`}>
            <span className="text-[10px] text-[#f8bc4b] font-bold uppercase block mb-0.5">
              Ý nghĩa văn hóa dân gian:
            </span>
            {activeItem.cultureNote}
          </div>

          {/* Honorific Context (A6) */}
          <div
            className={`p-2.5 rounded-xl border text-xs leading-relaxed ${
              isDark ? 'bg-[#2d150d] border-[#e56c5e]/20 text-[#ffb4aa]' : 'bg-[#fff7ed] border-[#c2410c]/20 text-[#9a3412]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase block mb-0.5">
              🏮 Ứng xử xưng hô khi biếu tặng:
            </span>
            {activeItem.honorificContext}
          </div>

          {/* Bamboo Tree Sample Sentence (A8) */}
          <div
            className={`p-2.5 rounded-xl border text-xs leading-relaxed ${
              isDark ? 'bg-[#14231b] border-[#4ade80]/20 text-[#bbf7d0]' : 'bg-[#f0fdf4] border-[#16a34a]/20 text-[#166534]'
            }`}
          >
            <span className="text-[10px] font-bold uppercase block mb-0.5">
              🎋 Mẫu câu ghép đốt tre:
            </span>
            "{activeItem.bambooSampleSentence}"
          </div>
        </section>
      </main>
    </div>
  );
};
