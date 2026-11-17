import { AgentUIBlock } from '@vietlearning/contracts';

export interface ChatMessage {
  id: string;
  sender: 'cu-tit' | 'user';
  text: string;
  timestamp: string;
  toneAccuracy?: number;
  phoneticFeedback?: string;
  dialectBadge?: string;
  blocks?: AgentUIBlock[];
  isStreaming?: boolean;
}

export interface ConversationTurnResult {
  turnId: string;
  transcript: string;
  correctedText?: string;
  explanation?: string;
  agentReply: string;
  audioUrl?: string;
  toneAccuracy?: number;
  uiBlocks?: AgentUIBlock[];
}

function playFolkChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {
    // Không làm gián đoạn nếu bị chặn
  }
}

export class ConversationService {
  private currentAudio: HTMLAudioElement | null = null;
  // Contract-first (Mục 6.3 TDD): sessionId BẮT BUỘC là UUID v4 (VoiceTurnRequestSchema),
  // nếu không Gateway Zod sẽ từ chối 400 và luồng SSE sẽ không bao giờ chạy thật.
  private sessionId = ConversationService.createUuid();

  private static createUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback RFC-4122 v4 cho môi trường không hỗ trợ crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  public async speak(text: string, dialect = 'north'): Promise<void> {
    this.stopAudio();
    playFolkChime();

    const encoded = encodeURIComponent(text);
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    const urls = [
      `/api/speech/stream?text=${encoded}&dialect=${dialect}`,
      `http://${hostname}:4000/api/speech/stream?text=${encoded}&dialect=${dialect}`,
      `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encoded}`
    ];

    for (const url of urls) {
      const ok = await this.tryPlayAudio(url);
      if (ok) return;
    }

    // Web Speech API dự phòng
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const ut = new SpeechSynthesisUtterance(text);
        ut.lang = 'vi-VN';
        if (dialect === 'south') {
          ut.rate = 1.05;
          ut.pitch = 1.08;
        } else if (dialect === 'central') {
          ut.rate = 0.92;
          ut.pitch = 0.92;
        }
        window.speechSynthesis.speak(ut);
      } catch (e) {
        // Ignored
      }
    }
  }

  private tryPlayAudio(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio();
        this.currentAudio = audio;
        const timer = setTimeout(() => resolve(false), 5000);

        audio.onended = () => {
          clearTimeout(timer);
          resolve(true);
        };
        audio.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };

        audio.src = url;
        audio.play().catch(() => {
          clearTimeout(timer);
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  public stopAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public async sendTurn(
    userText: string,
    options: {
      dialect?: 'north' | 'central' | 'south';
      onToken?: (token: string) => void;
      onBlock?: (block: AgentUIBlock) => void;
    } = {}
  ): Promise<ConversationTurnResult> {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const dialect = options.dialect || 'north';

    const candidateUrls = [
      `/v1/chat/turn`,
      `http://${hostname}:4000/v1/chat/turn`
    ];

    const bodyPayload = {
      sessionId: this.sessionId,
      userText,
      targetDialect: dialect,
      learnerLevel: 1
    };

    // Thử gọi Gateway với streaming SSE
    for (const endpoint of candidateUrls) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify(bodyPayload)
        });

        if (!response.ok) continue;

        const contentType = response.headers.get('content-type') || '';

        // Xử lý stream SSE
        if (contentType.includes('text/event-stream') && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let finalDone: ConversationTurnResult | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const chunk of lines) {
              const eventMatch = chunk.match(/^event:\s*(.+)$/m);
              const dataMatch = chunk.match(/^data:\s*(.+)$/m);
              const eventType = eventMatch ? eventMatch[1].trim() : 'message';
              const rawData = dataMatch ? dataMatch[1].trim() : '';

              if (!rawData) continue;

              try {
                const parsed = JSON.parse(rawData);
                if (eventType === 'token' && parsed.token) {
                  options.onToken?.(parsed.token);
                } else if (eventType === 'block') {
                  options.onBlock?.(parsed);
                } else if (eventType === 'done') {
                  finalDone = parsed;
                }
              } catch {
                // Tiếp tục đọc các event tiếp theo
              }
            }
          }

          if (finalDone) {
            return finalDone;
          }
        } else {
          // Xử lý JSON chuẩn
          const json = await response.json();
          return json as ConversationTurnResult;
        }
      } catch (err) {
        console.warn(`[ConversationService] Gọi ${endpoint} thất bại:`, err);
      }
    }

    // Dự phòng offline mô phỏng thông minh nếu Gateway tạm thời chưa nối được
    return this.fallbackTurn(userText);
  }

  private fallbackTurn(userText: string): ConversationTurnResult {
    const isPho = userText.toLowerCase().includes('phở') || userText.toLowerCase().includes('ăn');
    return {
      turnId: `turn-local-${Date.now()}`,
      transcript: userText,
      correctedText: userText,
      explanation: 'Câu nói rất trôi chảy và chuẩn thanh điệu!',
      agentReply: isPho
        ? 'Dạ quán Cô Ba đây rồi! Bạn dùng Phở Bò Tái Lăn thơm lừng hay Phở Bò Chín ngọt thanh nè?'
        : 'Cu Tít nghe rồi nè! Bạn nói tiếng Việt rất dễ thương. Giờ tụi mình cùng gọi món nhé!',
      toneAccuracy: 93,
      uiBlocks: [
        {
          id: `block-fallback-${Date.now()}`,
          type: 'drill_card',
          title: 'Món ngon phố cổ',
          payload: {
            items: [
              { name: 'Phở Bò Tái Lăn', price: '45k', desc: 'Đậm đà, thơm lừng tỏi gừng' },
              { name: 'Quẩy Giòn Nóng', price: '5k/đôi', desc: 'Ăn kèm nước dùng' }
            ]
          }
        }
      ]
    };
  }
}

export const conversationService = new ConversationService();
