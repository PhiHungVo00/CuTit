/**
 * Thuật toán A5: Kiểm tra xếp lớp thích ứng (Staircase / Elo Adaptive Placement Test)
 * Tham chiếu chuẩn: AGENTS.md Mục 3 & TDD Mục 8
 * 
 * Nguyên lý:
 * - Khởi đầu ở độ khó trung bình (1.5).
 * - Mỗi câu trả lời đúng -> tăng độ khó (+0.4).
 * - Mỗi câu trả lời sai -> giảm độ khó (-0.4).
 * - Hội tụ sau 8 câu hỏi để xác định cấp độ CEFR A1 - B2 chính xác.
 */

export interface PlacementQuestion {
  id: string;
  tier: number; // 1: A1, 2: A2, 3: B1, 4: B2
  difficultyScore: number; // 1.0 -> 4.0
  category: 'honorific' | 'phonetics' | 'dialogue' | 'cuisine' | 'dialect' | 'custom' | 'syntax' | 'proverb';
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AnswerRecord {
  questionId: string;
  correct: boolean;
  difficulty: number;
}

export interface AdaptiveStepResult {
  finished: boolean;
  currentStep: number;
  totalSteps: number;
  nextQuestion?: PlacementQuestion;
  assignedLevel?: number; // 1: A1, 2: A2, 3: B1, 4: B2
  cefrCode?: 'A1' | 'A2' | 'B1' | 'B2';
  title?: string;
  scorePercent?: number;
  roadmapRecommendation?: string;
}

export class StaircaseAdaptiveEngine {
  public static readonly TOTAL_STEPS = 8;
  public static readonly INITIAL_DIFFICULTY = 1.5;

  /**
   * Tính toán câu hỏi tiếp theo hoặc hội tụ kết quả xếp lớp
   */
  public static processStep(
    answers: AnswerRecord[],
    questionBank: PlacementQuestion[]
  ): AdaptiveStepResult {
    const answeredIds = new Set(answers.map(a => a.questionId));

    // Kiểm tra hoàn thành sau 8 câu hỏi hoặc hết câu hỏi
    if (answers.length >= this.TOTAL_STEPS || answeredIds.size >= questionBank.length) {
      return this.computeFinalPlacement(answers);
    }

    // Tính độ khó hiện tại theo bước nhảy Staircase
    let difficulty = this.INITIAL_DIFFICULTY;
    for (let i = 0; i < answers.length; i++) {
      const stepSize = i < 4 ? 0.45 : 0.3; // Bước nhảy lớn ở giai đoạn đầu, tinh chỉnh ở cuối
      if (answers[i].correct) {
        difficulty += stepSize;
      } else {
        difficulty -= stepSize;
      }
    }
    difficulty = Math.max(1.0, Math.min(4.0, difficulty));

    // Tìm câu hỏi chưa làm có difficultyScore gần nhất với difficulty mục tiêu
    const candidates = questionBank.filter(q => !answeredIds.has(q.id));
    if (candidates.length === 0) {
      return this.computeFinalPlacement(answers);
    }

    candidates.sort((a, b) => 
      Math.abs(a.difficultyScore - difficulty) - Math.abs(b.difficultyScore - difficulty)
    );

    const nextQ = candidates[0];

    return {
      finished: false,
      currentStep: answers.length + 1,
      totalSteps: this.TOTAL_STEPS,
      nextQuestion: nextQ
    };
  }

  /**
   * Tính kết quả xếp lớp CEFR cuối cùng
   */
  public static computeFinalPlacement(answers: AnswerRecord[]): AdaptiveStepResult {
    if (answers.length === 0) {
      return {
        finished: true,
        currentStep: 0,
        totalSteps: this.TOTAL_STEPS,
        assignedLevel: 1,
        cefrCode: 'A1',
        title: 'Nhập môn (A1 - Starter)',
        scorePercent: 0,
        roadmapRecommendation: 'Bắt đầu từ M1 (Hội thoại chào hỏi cơ bản) và M3 (20 cặp xưng hô dân gian).'
      };
    }

    const correctCount = answers.filter(a => a.correct).length;
    const scorePercent = Math.round((correctCount / answers.length) * 100);

    // Tính trung bình trọng số độ khó của các câu trả lời đúng
    const weights = answers.map((a, idx) => {
      const recency = 1 + idx * 0.1; // Trọng số cao hơn cho các câu gần cuối
      return a.correct ? a.difficulty * recency : (a.difficulty * 0.5) * recency;
    });

    const avgDiff = weights.reduce((sum, w) => sum + w, 0) / weights.length;

    let assignedLevel = 1;
    let cefrCode: 'A1' | 'A2' | 'B1' | 'B2' = 'A1';
    let title = 'Nhập môn (A1)';
    let recommendation = 'Bắt đầu từ chào hỏi, số đếm và nhận diện 6 thanh điệu cơ bản.';

    if (correctCount === 0) {
      return {
        finished: true,
        currentStep: answers.length,
        totalSteps: this.TOTAL_STEPS,
        assignedLevel: 1,
        cefrCode: 'A1',
        title: 'Nhập môn (A1 - Starter)',
        scorePercent: 0,
        roadmapRecommendation: 'Bắt đầu từ M1 (Hội thoại chào hỏi) và M3 (20 cặp xưng hô).'
      };
    }

    if (avgDiff >= 3.2 && correctCount >= 6) {
      assignedLevel = 4;
      cefrCode = 'B2';
      title = 'Nâng cao (B2 - Advanced)';
      recommendation = 'Luyện ghép câu đốt tre A8 chuyên sâu và giao tiếp kịch bản nhập vai M7.';
    } else if (avgDiff >= 2.4 && correctCount >= 4) {
      assignedLevel = 3;
      cefrCode = 'B1';
      title = 'Trung cấp (B1 - Intermediate)';
      recommendation = 'Tập trung luyện biến thể phương ngữ 3 miền M6 và 20 thẻ văn hóa phong tục M10.';
    } else if (avgDiff >= 1.7 && correctCount >= 2) {
      assignedLevel = 2;
      cefrCode = 'A2';
      title = 'Sơ cấp (A2 - Elementary)';
      recommendation = 'Luyện các bài tập đi chợ, gọi món M5 và so khớp cao độ F0 M2.';
    } else {
      assignedLevel = 1;
      cefrCode = 'A1';
      title = 'Nhập môn (A1 - Starter)';
      recommendation = 'Bắt đầu từ nhận diện 6 thanh điệu cơ bản và đại từ xưng hô gia đình.';
    }

    return {
      finished: true,
      currentStep: answers.length,
      totalSteps: this.TOTAL_STEPS,
      assignedLevel,
      cefrCode,
      title,
      scorePercent,
      roadmapRecommendation: recommendation
    };
  }
}
