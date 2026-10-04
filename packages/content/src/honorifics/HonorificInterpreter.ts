/**
 * Thuật toán A6 & GoF Interpreter Pattern (21)
 * Diễn giải ngữ cảnh (Tuổi, Giới tính, Quan hệ) thành cặp đại từ xưng hô tiếng Việt chuẩn xác
 */
export interface ContextExpression {
  speakerAge: number;
  listenerAge: number;
  relation: 'kin' | 'social' | 'teacher_student' | 'stranger';
  listenerGender?: 'male' | 'female';
}

export class HonorificInterpreter {
  public interpret(ctx: ContextExpression): { speaker: string; listener: string } {
    if (ctx.relation === 'teacher_student') {
      return ctx.speakerAge > ctx.listenerAge
        ? { speaker: 'thầy/cô', listener: 'em' }
        : { speaker: 'em', listener: 'thầy/cô' };
    }

    if (ctx.relation === 'kin') {
      const ageDiff = ctx.listenerAge - ctx.speakerAge;
      if (ageDiff > 20) {
        return ctx.listenerGender === 'female'
          ? { speaker: 'cháu', listener: 'bác' }
          : { speaker: 'cháu', listener: 'chú' };
      }
    }

    // Mặc định giao tiếp xã hội
    return ctx.speakerAge >= ctx.listenerAge
      ? { speaker: 'anh/chị', listener: 'em' }
      : { speaker: 'em', listener: 'anh/chị' };
  }
}
