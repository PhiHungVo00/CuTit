/**
 * Thuật toán A4: SuperMemo 2 (SM-2) Spaced Repetition
 * Tính chu kỳ ngày ôn tập tiếp theo dựa trên chất lượng phản hồi của người học (0 - 5)
 */
export interface SM2Result {
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: Date;
}

export function calculateSM2(
  currentEase: number,      // ease factor (ví dụ 250 nghĩa là 2.50)
  currentInterval: number,  // số ngày ôn tập hiện tại
  currentRepetitions: number,
  quality: number           // điểm đánh giá 0-5
): SM2Result {
  let q = Math.max(0, Math.min(5, quality));
  let ease = currentEase + (10 - (5 - q) * (8 + (5 - q) * 2));
  if (ease < 130) ease = 130; // giới hạn sàn hệ số 1.30

  let repetitions = currentRepetitions;
  let intervalDays = currentInterval;

  if (q >= 3) {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * (ease / 100));
    }
    repetitions += 1;
  } else {
    repetitions = 0;
    intervalDays = 1;
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + intervalDays);

  return { ease, intervalDays, repetitions, dueAt };
}
