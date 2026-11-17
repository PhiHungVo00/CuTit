/**
 * Thuật toán A8: Kiểm tra trật tự câu ghép đốt tre (Bamboo Token Syntax Checker)
 * Tham chiếu chuẩn: AGENTS.md Mục 3 & TDD Mục 8
 * 
 * Quy tắc ngữ pháp tiếng Việt:
 * 1. Kính ngữ mở đầu ("Dạ", "Vâng", "Thưa") phải nằm ở vị trí đầu câu (index 0).
 * 2. Trợ từ kính ngữ kết thúc ("ạ", "nhé", "nha", "nghe", "đấy") phải nằm ở cuối câu.
 * 3. Phó từ chỉ thời gian / phủ định ("đã", "đang", "sẽ", "không", "chưa") phải đứng trước Động từ.
 * 4. Trật tự ngữ pháp nòng cốt S-V-O: Chủ ngữ -> Vị ngữ (Động từ) -> Tân ngữ / Bổ ngữ.
 * 5. Cấu trúc câu hỏi đuôi: "có... không?", "đã... chưa?".
 */

export interface BambooToken {
  id: string;
  text: string;
  role: 'subject' | 'verb' | 'object' | 'modifier' | 'honorific_start' | 'honorific_end' | 'particle' | 'punctuation';
}

export interface BambooTemplate {
  id: string;
  topic: string;
  level: number;
  tokens: BambooToken[];
  canonicalSentence: string;
  acceptableOrders?: string[][]; // Các hoán vị hợp lệ
  grammarNote: string;
}

export interface SyntaxCheckResult {
  valid: boolean;
  reconstructedSentence: string;
  errors: string[];
  hint: string;
  misplacedIndices: number[];
  explanation: string;
}

export class BambooTreeSyntaxChecker {
  /**
   * So khớp và kiểm tra tính đúng đắn trật tự đốt tre
   */
  public static checkOrder(
    userTokens: string[],
    template?: BambooTemplate
  ): SyntaxCheckResult {
    const rawTokens = userTokens.map(t => t.trim()).filter(Boolean);
    const reconstructed = rawTokens.join(' ').replace(/\s+([.,?!])/g, '$1');

    if (rawTokens.length === 0) {
      return {
        valid: false,
        reconstructedSentence: '',
        errors: ['Chưa có đốt tre nào được ghép vào câu!'],
        hint: 'Hãy chọn các đốt tre từ khay từ vựng bên dưới.',
        misplacedIndices: [],
        explanation: 'Câu rỗng không thể kiểm tra.'
      };
    }

    const errors: string[] = [];
    const misplacedIndices: number[] = [];

    // Nếu có mẫu chuẩn (template)
    if (template) {
      const canonicalTokens = template.tokens.map(t => t.text);

      // Kiểm tra xem có đủ từ không
      if (rawTokens.length !== canonicalTokens.length) {
        errors.push(`Số lượng đốt tre (${rawTokens.length}) chưa đủ hoặc vượt quá mẫu (${canonicalTokens.length}).`);
      }

      // Kiểm tra hoán vị hợp lệ nếu có
      if (template.acceptableOrders && template.acceptableOrders.length > 0) {
        const isAcceptable = template.acceptableOrders.some(order => 
          order.length === rawTokens.length && order.every((tok, idx) => tok.toLowerCase() === rawTokens[idx].toLowerCase())
        );
        if (isAcceptable) {
          return {
            valid: true,
            reconstructedSentence: reconstructed,
            errors: [],
            hint: 'Ghép câu xuất sắc! Biến thể ngữ pháp này hoàn toàn chính xác.',
            misplacedIndices: [],
            explanation: template.grammarNote
          };
        }
      }

      // So sánh trực tiếp với canonical
      let matches = true;
      for (let i = 0; i < rawTokens.length; i++) {
        if (i >= canonicalTokens.length || rawTokens[i].toLowerCase() !== canonicalTokens[i].toLowerCase()) {
          matches = false;
          misplacedIndices.push(i);
        }
      }

      if (matches && rawTokens.length === canonicalTokens.length) {
        return {
          valid: true,
          reconstructedSentence: reconstructed,
          errors: [],
          hint: 'Khắc nhập thành công! Câu văn chuẩn mực dân gian.',
          misplacedIndices: [],
          explanation: template.grammarNote
        };
      }
    }

    // Kiểm tra các luật cú pháp độc lập (Heuristic Rules A8)
    // Luật 1: Kính ngữ mở đầu ("Dạ", "Vâng", "Thưa")
    const honorificStarts = ['dạ', 'vâng', 'thưa'];
    const honorificEnds = ['ạ', 'nhé', 'nha', 'nghe', 'nào'];

    rawTokens.forEach((token, idx) => {
      const lower = token.toLowerCase();
      if (honorificStarts.includes(lower) && idx !== 0) {
        errors.push(`Từ xưng hô kính cẩn "${token}" phải đặt ở đầu câu để thể hiện phép lịch sự.`);
        if (!misplacedIndices.includes(idx)) misplacedIndices.push(idx);
      }

      if (honorificEnds.includes(lower) && idx !== rawTokens.length - 1 && !rawTokens[idx + 1].match(/^[.,?!]/)) {
        errors.push(`Trợ từ kính ngữ "${token}" cần đặt ở cuối câu để trọn vẹn ngữ điệu.`);
        if (!misplacedIndices.includes(idx)) misplacedIndices.push(idx);
      }
    });

    // Luật 2: Phó từ phủ định / nghi vấn ("không", "chưa")
    const questionParticles = ['không?', 'không', 'chưa?', 'chưa', 'hả?', 'hả'];
    rawTokens.forEach((token, idx) => {
      const lower = token.toLowerCase();
      if (questionParticles.includes(lower) && idx === 0) {
        errors.push(`Từ nghi vấn "${token}" không đứng đầu câu hỏi tiếng Việt.`);
        if (!misplacedIndices.includes(idx)) misplacedIndices.push(idx);
      }
    });

    const isValid = errors.length === 0 && misplacedIndices.length === 0;

    return {
      valid: isValid,
      reconstructedSentence: reconstructed,
      errors: isValid ? [] : (errors.length > 0 ? errors : ['Trật tự các đốt tre chưa đúng chuẩn ngữ pháp tiếng Việt.']),
      hint: template ? `Gợi ý từ Cu Tít: Bắt đầu bằng "${template.tokens[0]?.text}"...` : 'Hãy đặt Chủ ngữ trước Động từ và kính ngữ ở cuối câu.',
      misplacedIndices,
      explanation: template ? template.grammarNote : 'Tiếng Việt tuân theo cấu trúc S-V-O cơ bản (Chủ ngữ - Vị ngữ - Bổ ngữ).'
    };
  }
}
