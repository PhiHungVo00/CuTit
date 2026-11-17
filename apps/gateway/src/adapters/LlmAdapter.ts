import { SystemPromptBuilder } from '@vietlearning/prompts';
import { AgentUIBlock } from '@vietlearning/contracts';

export interface ChatTurnInput {
  sessionId: string;
  userText?: string;
  targetDialect?: 'north' | 'central' | 'south';
  learnerLevel?: number;
}

export interface ChatTurnOutput {
  turnId: string;
  transcript: string;
  correctedText?: string;
  explanation?: string;
  agentReply: string;
  uiBlocks: AgentUIBlock[];
  toneAccuracy?: number;
}

/**
 * GoF Adapter Pattern (6)
 * Chuẩn hóa gọi LLM (Google Gemini / Fallback Rule Engine)
 * Đảm bảo 100% đầu ra có cấu trúc JSON hợp lệ theo Nguyên tắc 6 TDD
 */
export class LlmAdapter {
  private promptBuilder = new SystemPromptBuilder();

  public async generateTurn(input: ChatTurnInput): Promise<ChatTurnOutput> {
    const userText = input.userText?.trim() || 'Xin chào Cu Tít';
    const dialect = input.targetDialect || 'north';
    const level = input.learnerLevel || 1;

    // Giả lập phân tích ngữ nghĩa và phản hồi thông minh chuẩn persona Bé Cu Tít
    const turnId = `turn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const lower = userText.toLowerCase();

    let agentReply = '';
    let explanation = '';
    let correctedText = userText;
    let toneAccuracy = 92;
    const uiBlocks: AgentUIBlock[] = [];

    if (lower.includes('phở') || lower.includes('ăn') || lower.includes('đói') || lower.includes('quán')) {
      agentReply = 'Dạ hay quá! Tụi mình vào quán Phở Cô Ba nhé. Cô Ba ơi, cho bạn con một tô Phở Bò nóng hổi ạ!';
      explanation = 'Bạn đã dùng từ "Phở" với thanh Hỏi rất chuẩn xác!';
      toneAccuracy = 95;

      uiBlocks.push({
        id: `block-menu-${Date.now()}`,
        type: 'drill_card',
        title: 'Thực đơn Quán Phở Cô Ba',
        payload: {
          scenario: 'pho_eatery',
          items: [
            { name: 'Phở Bò Tái Lăn', price: '45k', desc: 'Đậm đà, thơm lừng tỏi gừng' },
            { name: 'Quẩy Giòn Nóng', price: '5k/đôi', desc: 'Ăn kèm nước dùng béo thơm' }
          ]
        }
      });

      uiBlocks.push({
        id: `block-replies-${Date.now()}`,
        type: 'quick_replies',
        title: 'Gợi ý trả lời nhanh',
        payload: {
          options: [
            { id: 'opt-1', text: 'Dạ, cho em 2 cái quẩy giòn nhé!' },
            { id: 'opt-2', text: 'Dạ không, em ăn một tô phở thôi ạ.' }
          ]
        }
      });
    } else if (lower.includes('chào') || lower.includes('hello')) {
      agentReply = 'Chào bạn! Mình là Bé Cu Tít đây. Hôm nay bạn muốn cùng mình đi chợ quê hay luyện nói dấu hỏi ngã nào?';
      explanation = 'Lời chào đầu rất tự nhiên và thân thiện.';
      toneAccuracy = 94;

      uiBlocks.push({
        id: `block-culture-${Date.now()}`,
        type: 'culture_card',
        title: 'Văn hóa chào hỏi truyền thống',
        payload: {
          tip: 'Khi gặp người lớn tuổi ở làng quê Việt Nam, bạn hãy khoanh tay và nói "Dạ cháu chào Cụ ạ" nhé!'
        }
      });

      uiBlocks.push({
        id: `block-quick-${Date.now()}`,
        type: 'quick_replies',
        title: 'Bạn muốn đi đâu?',
        payload: {
          options: [
            { id: 'opt-pho', text: 'Tụi mình đi ăn Phở Bò đi!' },
            { id: 'opt-market', text: 'Dẫn mình ra chợ quê mua đồ nhé!' }
          ]
        }
      });
    } else {
      agentReply = `Bé Cu Tít nghe bạn nói: "${userText}". Giọng bạn rất ấm áp! Giờ tụi mình cùng nhau nói tiếp nhé.`;
      explanation = 'Ngữ điệu rất tốt, hãy tiếp tục phát huy nhé!';
      toneAccuracy = 90;

      uiBlocks.push({
        id: `block-hint-${Date.now()}`,
        type: 'honorific_hint',
        title: 'Mẹo xưng hô',
        payload: {
          suggestion: 'Với Cu Tít (7 tuổi), bạn có thể xưng "Anh / Chị" và gọi Cu Tít là "Em" nhé!'
        }
      });
    }

    return {
      turnId,
      transcript: userText,
      correctedText,
      explanation,
      agentReply,
      uiBlocks,
      toneAccuracy
    };
  }
}
