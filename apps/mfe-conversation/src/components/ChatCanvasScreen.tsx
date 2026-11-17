import React, { useState, useEffect, useRef } from 'react';
import { conversationService, ChatMessage } from '../services/conversationService';
import { AgentUIBlockRenderer } from './AgentUIBlockRenderer';
import { AgentUIBlock } from '@vietlearning/contracts';

interface Props {
  initialTheme?: 'dark' | 'light';
  onNavigateTab?: (tab: string) => void;
  onBack?: () => void;
}

const CU_TIT_AVATAR = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAVJFgSevw7kfLNs-9lsDmQbpuEqb4fsRCHFyCjl0bSA8pKLz_b4iQ6JTLi1ID3PW7km3AZqF9y_TGXOPKAwpFBcENgUm4b29u53b7phEGmGvtRZ18mu5rtUEfi8rvCsLaoSyPeqNtLOhBvup5AjOTx7FLrbTHejdHqykTtnRamJMnqMqjYdZ7hWXVaxDrzZ1w9OeFn5qPXsCIQbeZ_IVgDxoWCmJJw1lxYuT7jfSS6qEvHlCihSana';
const USER_AVATAR = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCjlHqM4ja6b3yJPmFXr5H4ic99XcWJ3djNNT05x-xxGQFdd8feLD5EHbGmx8EfkKTI90ajUnresuuw8iyqcuRrBjWXgVA96T8xMEet7L4xiHBmyg_lUJKoX1BZ1diBsz10_Nfu1oex8IAgCCY0NTnVfdU9B7WO9ufX0M-q6v0gCh4kkjlb84r0RVwCJrlgZQ41D9c4I0GaXnrt3l_3L5ZNNNfcLDSjBj8YM2Ho0asyYFJySoAtgIHt';

export const ChatCanvasScreen: React.FC<Props> = ({ initialTheme = 'dark', onNavigateTab, onBack }) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const isDark = theme === 'dark';

  // Quản lý class dark với hàm dọn dẹp (BUG-07 Fix)
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

  // Danh sách tin nhắn khởi tạo chuẩn theo Stitch M1
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'cu-tit',
      text: 'Chào bạn Tây! Bạn đã đói bụng chưa? Hôm nay tụi mình học cách gọi một tô Phở Bò nóng hổi chuẩn vị nhé!',
      timestamp: '10:24 sáng',
      dialectBadge: 'Bản ngữ Hà Nội',
      blocks: [
        {
          id: 'block-menu-initial',
          type: 'drill_card',
          title: 'Thực đơn Quán Phở Cô Ba',
          payload: {
            items: [
              { name: 'Phở Bò Tái Lăn', price: '45k', desc: 'Đậm đà, thơm lừng tỏi gừng' },
              { name: 'Quẩy Giòn Nóng', price: '5k/đôi', desc: 'Ăn kèm nước dùng béo ngậy' }
            ]
          }
        }
      ]
    },
    {
      id: 'msg-2',
      sender: 'user',
      text: 'Dạ sẵn sàng! Cho em xin một bát Phở Bò ít bánh nhiều thịt nhé!',
      timestamp: '10:25 sáng',
      toneAccuracy: 94,
      phoneticFeedback: 'Đã phát âm chuẩn dấu hỏi • ngã'
    },
    {
      id: 'msg-3',
      sender: 'cu-tit',
      text: 'Giỏi quá đi thôi! Giờ Cô Ba hỏi tiếp: "Dạ con có dùng thêm quẩy giòn không?", bạn sẽ đáp như thế nào?',
      timestamp: '10:25 sáng',
      dialectBadge: 'Bản ngữ Hà Nội',
      blocks: [
        {
          id: 'block-replies-initial',
          type: 'quick_replies',
          title: 'Gợi ý trả lời nhanh',
          payload: {
            options: [
              { id: 'opt-quay', text: 'Dạ, cho em 2 cái quẩy giòn nhé!' },
              { id: 'opt-du-roi', text: 'Dạ không, em ăn thế là đủ rồi ạ.' }
            ]
          }
        }
      ]
    }
  ]);

  const [isRecording, setIsRecording] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAiStreaming]);

  // Xử lý gửi lượt thoại
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isAiStreaming) return;

    const userMsgId = `user-${Date.now()}`;
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      toneAccuracy: Math.floor(Math.random() * 8) + 90,
      phoneticFeedback: 'Ngữ điệu thanh thoát, tự nhiên'
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setInputText('');
    setIsKeyboardOpen(false);

    // Chuẩn bị tin nhắn streaming từ Bé Cu Tít
    const aiMsgId = `cu-tit-${Date.now()}`;
    const initialAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: 'cu-tit',
      text: '',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      dialectBadge: 'Bản ngữ Hà Nội',
      blocks: [],
      isStreaming: true
    };

    setMessages((prev) => [...prev, initialAiMsg]);
    setIsAiStreaming(true);

    try {
      const response = await conversationService.sendTurn(textToSend, {
        dialect: 'north',
        onToken: (token) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsgId ? { ...m, text: m.text + token } : m))
          );
        },
        onBlock: (block: AgentUIBlock) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, blocks: [...(m.blocks || []), block] } : m
            )
          );
        }
      });

      // Cập nhật lượt thoại cuối cùng
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                text: response.agentReply || m.text,
                blocks: response.uiBlocks?.length ? response.uiBlocks : m.blocks,
                isStreaming: false
              }
            : m
        )
      );

      // Tự động phát âm lời thoại phản hồi của Cu Tít
      handlePlayVoice(aiMsgId, response.agentReply);
    } catch (err) {
      console.error('[ChatCanvas] Lỗi phản hồi lượt thoại:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                text: 'Cu Tít đang lắng nghe bạn đây! Bạn nói tiếp nhé.',
                isStreaming: false
              }
            : m
        )
      );
    } finally {
      setIsAiStreaming(false);
    }
  };

  // Phát âm lời thoại Cu Tít
  const handlePlayVoice = async (messageId: string, text: string) => {
    setPlayingMessageId(messageId);
    await conversationService.speak(text, 'north');
    setPlayingMessageId(null);
  };

  // Giả lập thu âm giữ nút Mic
  const handleStartRecording = () => {
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    // Giả lập nhận diện giọng nói câu chào tự nhiên
    const samplePhrases = [
      'Dạ cho em một tô Phở Bò Tái Lăn nhé!',
      'Cu Tít ơi, quán phở này mở cửa lâu chưa?',
      'Cho mình 2 cái quẩy giòn thơm phức nha!'
    ];
    const picked = samplePhrases[Math.floor(Math.random() * samplePhrases.length)];
    handleSendMessage(picked);
  };

  return (
    <div className="font-['Be_Vietnam_Pro',system-ui,sans-serif] min-h-screen flex flex-col bg-[#220e07] text-[#ffdbcf] selection:bg-[#f8bc4b] selection:text-[#271900] max-w-md mx-auto relative overflow-x-hidden shadow-2xl">
      {/* 1. Fixed Top Header */}
      <header className="fixed top-0 max-w-md w-full z-50 pt-safe bg-[#220e07]/95 backdrop-blur-xl border-b border-[#301a12] shadow-[0_4px_16px_rgba(28,9,4,0.6)]">
        <div className="h-16 px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="w-8 h-8 rounded-full bg-[#301a12] flex items-center justify-center text-[#dec0bc] hover:text-white"
              >
                <span className="material-symbols-outlined text-xl">arrow_back</span>
              </button>
            )}
            <div className="w-10 h-10 rounded-full bg-[#301a12] p-0.5 border border-[#ffb4aa]/20 shrink-0">
              <img src={CU_TIT_AVATAR} alt="Cu Tít Logo" className="w-full h-full object-cover rounded-full" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-[#f8bc4b] uppercase font-bold tracking-wider truncate">
                Tiếng Việt Cu Tít
              </span>
              <h1 className="text-base font-extrabold text-white truncate">Hội Thoại</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-[#3c241b] px-2.5 py-1 rounded-full shadow-[0_2px_0_#1c0904] border border-[#ffb4aa]/10">
              <span className="material-symbols-outlined text-[#f8bc4b] text-base">local_fire_department</span>
              <span className="text-xs font-bold text-[#f8bc4b]">7 ngày</span>
            </div>

            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="w-8 h-8 rounded-full bg-[#301a12] border border-[#ffb4aa]/20 flex items-center justify-center text-[#f8bc4b] text-sm"
              title="Đổi giao diện"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Scrollable Chat Area */}
      <main className="flex-1 w-full pt-20 pb-44 px-4 flex flex-col gap-4 overflow-y-auto">
        {/* Quest Banner: Đi chợ quê mua Phở Bò */}
        <div className="relative bg-[#301a12] border border-[#ffb4aa]/15 rounded-2xl p-3.5 shadow-[0_4px_0_#1c0904] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[#f8bc4b] text-lg shrink-0">explore</span>
              <span className="text-[11px] text-[#f8bc4b] font-bold uppercase tracking-wider truncate">
                Nhiệm vụ hôm nay
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="material-symbols-outlined text-[#f8bc4b] text-sm">star</span>
              <span className="material-symbols-outlined text-[#f8bc4b] text-sm">star</span>
              <span className="material-symbols-outlined text-[#57423f] text-sm">star</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white truncate">Đi chợ quê mua Phở Bò cùng Cu Tít</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0f4c64] text-[#89bcd7] font-bold shrink-0">
              Chặng 2/3
            </span>
          </div>

          <div className="w-full h-1.5 rounded-full bg-[#1c0904] overflow-hidden">
            <div className="h-full bg-[#f8bc4b] rounded-full transition-all duration-500" style={{ width: '66%' }} />
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex flex-col gap-4">
          {messages.map((msg) => {
            const isCuTit = msg.sender === 'cu-tit';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isCuTit ? 'items-start max-w-[92%]' : 'items-end max-w-[92%] self-end'}`}
              >
                <div className={`flex items-start gap-2.5 ${isCuTit ? 'flex-row' : 'flex-row-reverse'}`}>
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-[#301a12] p-0.5 border border-[#ffb4aa]/20 shrink-0 shadow-[0_2px_0_#1c0904]">
                    <img
                      src={isCuTit ? CU_TIT_AVATAR : USER_AVATAR}
                      alt={isCuTit ? 'Bé Cu Tít' : 'Bạn'}
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>

                  {/* Message Bubble Container */}
                  <div className="flex flex-col gap-1 min-w-0">
                    <div
                      className={`rounded-2xl p-3 shadow-[0_3px_0_#1c0904] flex flex-col gap-1.5 relative ${
                        isCuTit
                          ? 'bg-[#301a12] border border-[#ffb4aa]/15 text-[#ffdbcf]'
                          : 'bg-[#0f4c64] text-[#c1e8ff] border border-[#9acde9]/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-xs font-bold ${isCuTit ? 'text-[#ffb4aa]' : 'text-[#9acde9]'}`}>
                          {isCuTit ? 'Bé Cu Tít' : 'Bạn'}
                        </span>

                        {isCuTit ? (
                          <button
                            onClick={() => handlePlayVoice(msg.id, msg.text)}
                            className="flex items-center gap-1 bg-[#220e07] hover:bg-[#3c241b] active:scale-95 px-2 py-0.5 rounded-full text-[10px] text-[#f8bc4b] font-bold transition-all shadow"
                          >
                            <span className="material-symbols-outlined text-sm">
                              {playingMessageId === msg.id ? 'graphic_eq' : 'volume_up'}
                            </span>
                            <span>{playingMessageId === msg.id ? 'Đang đọc' : 'Phát âm'}</span>
                          </button>
                        ) : msg.toneAccuracy ? (
                          <div className="flex items-center gap-1 bg-black/30 px-2 py-0.5 rounded-full text-[10px] text-[#f8bc4b] font-bold">
                            <span className="material-symbols-outlined text-xs">verified</span>
                            <span>Thanh điệu: {msg.toneAccuracy}%</span>
                          </div>
                        ) : null}
                      </div>

                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.text}
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 bg-[#f8bc4b] ml-1 animate-pulse" />
                        )}
                      </p>
                    </div>

                    {/* Metadata Subtext */}
                    <div
                      className={`flex items-center gap-1 text-[11px] text-[#a58b87] px-1 ${
                        isCuTit ? 'justify-start' : 'justify-end'
                      }`}
                    >
                      {isCuTit ? (
                        <>
                          <span className="material-symbols-outlined text-xs">schedule</span>
                          <span>{msg.timestamp}</span>
                          {msg.dialectBadge && <span>• {msg.dialectBadge}</span>}
                        </>
                      ) : (
                        <>
                          {msg.phoneticFeedback && <span>{msg.phoneticFeedback}</span>}
                          <span className="material-symbols-outlined text-xs text-[#f8bc4b]">check_circle</span>
                        </>
                      )}
                    </div>

                    {/* Agent UI Blocks */}
                    {msg.blocks && msg.blocks.length > 0 && (
                      <AgentUIBlockRenderer
                        blocks={msg.blocks}
                        onSendQuickReply={(text) => handleSendMessage(text)}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* 3. Bottom Voice & Typing Interaction Bar */}
      <div className="fixed bottom-20 max-w-md w-full z-40 px-3 py-2 bg-[#220e07]/95 backdrop-blur-xl border-t border-[#301a12]">
        {isKeyboardOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="flex items-center gap-2 bg-[#301a12] p-1.5 rounded-2xl border border-[#ffb4aa]/20 shadow-lg"
          >
            <button
              type="button"
              onClick={() => setIsKeyboardOpen(false)}
              className="w-10 h-10 rounded-xl bg-[#220e07] flex items-center justify-center text-[#dec0bc] hover:text-white"
            >
              <span className="material-symbols-outlined text-xl">mic</span>
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Nhập câu đối thoại tiếng Việt..."
              className="flex-1 bg-transparent text-sm text-white placeholder-[#a58b87] outline-none px-2"
              autoFocus
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-10 h-10 rounded-xl bg-[#e56c5e] text-[#410001] disabled:opacity-40 flex items-center justify-center font-bold active:scale-95 transition-all shadow"
            >
              <span className="material-symbols-outlined text-xl">send</span>
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-2.5">
            <button
              onClick={() => setIsKeyboardOpen(true)}
              className="w-12 h-12 rounded-2xl bg-[#301a12] hover:bg-[#3c241b] active:translate-y-0.5 transition-all flex items-center justify-center text-[#dec0bc] border border-[#ffb4aa]/15 shadow-[0_3px_0_#1c0904]"
              title="Bật bàn phím nhập liệu"
            >
              <span className="material-symbols-outlined text-2xl">keyboard</span>
            </button>

            <button
              id="mic-trigger"
              onMouseDown={handleStartRecording}
              onMouseUp={handleStopRecording}
              onTouchStart={handleStartRecording}
              onTouchEnd={handleStopRecording}
              className={`flex-1 h-12 rounded-full flex items-center justify-center gap-2 font-bold text-sm tracking-wide uppercase transition-all shadow-[0_4px_0_#5a0304] active:translate-y-1 active:shadow-none ${
                isRecording
                  ? 'bg-[#bc8714] text-[#271900] ring-4 ring-[#f8bc4b]/50 animate-pulse'
                  : 'bg-[#e56c5e] text-[#410001] hover:brightness-110'
              }`}
            >
              <span className="material-symbols-outlined text-2xl">
                {isRecording ? 'graphic_eq' : 'mic'}
              </span>
              <span>{isRecording ? 'Đang lắng nghe...' : 'Nhấn giữ để nói'}</span>
            </button>

            <button
              onClick={() => handleSendMessage('Gợi ý cho mình cách xưng hô lịch sự với cô bán phở')}
              className="w-12 h-12 rounded-2xl bg-[#301a12] hover:bg-[#3c241b] active:translate-y-0.5 transition-all flex items-center justify-center text-[#f8bc4b] border border-[#ffb4aa]/15 shadow-[0_3px_0_#1c0904]"
              title="Gợi ý Cu Tít"
            >
              <span className="material-symbols-outlined text-2xl">help_outline</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Fixed Bottom Navigation Bar (5 tabs) */}
      <nav className="fixed bottom-0 max-w-md w-full z-50 pb-safe bg-[#1c0904]/98 backdrop-blur-xl border-t border-[#301a12] shadow-[0_-4px_20px_rgba(28,9,4,0.6)]">
        <div className="h-16 px-2 flex items-center justify-around">
          <button
            onClick={() => onNavigateTab?.('conversation')}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[54px] text-[#f8bc4b]"
          >
            <span className="material-symbols-outlined text-2xl font-bold">chat</span>
            <span className="text-[10px] font-bold">Hội thoại</span>
          </button>

          <button
            onClick={() => onNavigateTab?.('pitch')}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[54px] text-[#a58b87] hover:text-[#ffdbcf] transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">graphic_eq</span>
            <span className="text-[10px]">Luyện thanh</span>
          </button>

          <button
            onClick={() => onNavigateTab?.('practice')}
            className="flex flex-col items-center justify-center -mt-5 group"
          >
            <div className="w-12 h-12 rounded-full bg-[#e56c5e] flex items-center justify-center shadow-[0_4px_0_#5a0304] active:translate-y-1 active:shadow-none transition-all">
              <span className="material-symbols-outlined text-[#410001] text-2xl font-bold">star</span>
            </div>
            <span className="text-[10px] text-[#f8bc4b] font-bold mt-0.5">Học bài</span>
          </button>

          <button
            onClick={() => onNavigateTab?.('honorifics')}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[54px] text-[#a58b87] hover:text-[#ffdbcf] transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">auto_stories</span>
            <span className="text-[10px]">Xưng hô</span>
          </button>

          <button
            onClick={() => onNavigateTab?.('dialect')}
            className="flex flex-col items-center justify-center gap-0.5 min-w-[54px] text-[#a58b87] hover:text-[#ffdbcf] transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">travel_explore</span>
            <span className="text-[10px]">Phương ngữ</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
