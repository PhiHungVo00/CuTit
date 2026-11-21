import { CuTit } from '@vietlearning/ui';
import { haptic, playSfx } from '@vietlearning/shared/audio';

/** Âm + rung ngay lúc có kết quả đúng/sai (gọi MỘT lần ở chỗ chốt đáp án, không gọi trong lúc render). */
export function answerFeedback(correct: boolean): void {
  playSfx(correct ? 'dung' : 'sai');
  haptic(correct ? 'thanh-cong' : 'loi');
}

/** Cu Tít khen khi đúng, động viên khi sai — đặt trong khung phản hồi của bài. */
export function FeedbackMascot({ correct, size = 56 }: { correct: boolean; size?: number }) {
  return <CuTit mood={correct ? 'khen' : 'dong-vien'} size={size} />;
}
