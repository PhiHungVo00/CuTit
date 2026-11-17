import React, { useState } from 'react';

export interface DialectQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const QUIZ_QUESTIONS: Question[] = [
  {
    id: 1,
    question: 'Ở miền Bắc gọi là "Quả dứa", người miền Nam thường gọi loại trái cây này là gì?',
    options: ['Trái dừa', 'Trái khóm / Trái thơm', 'Trái ổi', 'Trái na'],
    correctIndex: 1,
    explanation: 'Chính xác! Người miền Nam gọi quả dứa là trái khóm hoặc trái thơm.'
  },
  {
    id: 2,
    question: 'Khi vào quán cơm ở Sài Gòn (miền Nam), để xin đồ đựng cơm bạn nên gọi là gì?',
    options: ['Cái bát', 'Cái chén', 'Cái đĩa', 'Cái liễn'],
    correctIndex: 1,
    explanation: 'Chuẩn luôn! Ở miền Nam dùng "cái chén" đựng cơm, "bát" ở miền Bắc tương đương với "chén" ở miền Nam.'
  },
  {
    id: 3,
    question: 'Người miền Tây Nam Bộ thường gọi người Cha thân thương là gì?',
    options: ['Thầy', 'Chú', 'Tía', 'Bác'],
    correctIndex: 2,
    explanation: 'Rất giỏi! "Tía má" là cách xưng hô ruột thịt vô cùng đằm thắm của bà con Nam Bộ.'
  }
];

export const DialectQuizModal: React.FC<DialectQuizModalProps> = ({
  isOpen,
  onClose,
  isDark = true
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  if (!isOpen) return null;

  const currentQ = QUIZ_QUESTIONS[currentIdx];

  const handleSelect = (idx: number) => {
    if (isSubmitted) return;
    setSelectedAnswer(idx);
  };

  const handleConfirm = () => {
    if (selectedAnswer === null) return;
    setIsSubmitted(true);
    if (selectedAnswer === currentQ.correctIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIdx + 1 < QUIZ_QUESTIONS.length) {
      setCurrentIdx((c) => c + 1);
      setSelectedAnswer(null);
      setIsSubmitted(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setScore(0);
    setIsSubmitted(false);
    setIsFinished(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm rounded-2xl p-5 shadow-2xl flex flex-col gap-4 ${
          isDark ? 'bg-[#220e07] text-[#ffdbcf] border border-[#3c241b]' : 'bg-[#FFFBF5] text-[#271900]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#3c241b]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f8bc4b] text-2xl">quiz</span>
            <h3 className="font-bold text-base">Đố Vui Phương Ngữ 3 Miền</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#3c241b] text-[#ffb4aa] flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {!isFinished ? (
          <>
            <div className="flex items-center justify-between text-xs text-[#f8bc4b] font-bold">
              <span>Câu hỏi {currentIdx + 1}/{QUIZ_QUESTIONS.length}</span>
              <span>Điểm số: {score * 10}đ</span>
            </div>

            <p className="font-bold text-sm leading-relaxed">{currentQ.question}</p>

            {/* Options */}
            <div className="flex flex-col gap-2">
              {currentQ.options.map((opt, idx) => {
                let btnStyle = isDark ? 'bg-[#301a12] text-[#ffdbcf]' : 'bg-[#EFE2D3] text-[#271900]';

                if (selectedAnswer === idx) {
                  btnStyle = 'bg-[#0f4c64] text-[#89bcd7] border-2 border-[#9acde9]';
                }

                if (isSubmitted) {
                  if (idx === currentQ.correctIndex) {
                    btnStyle = 'bg-[#059669] text-white font-bold';
                  } else if (selectedAnswer === idx) {
                    btnStyle = 'bg-[#DC2626] text-white';
                  }
                }

                return (
                  <button
                    key={idx}
                    disabled={isSubmitted}
                    onClick={() => handleSelect(idx)}
                    className={`p-3 rounded-xl text-left text-xs font-semibold transition-all ${btnStyle}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {/* Explanation when submitted */}
            {isSubmitted && (
              <div className="p-3 rounded-xl bg-[#3c241b] text-xs leading-relaxed border-l-4 border-[#f8bc4b]">
                {currentQ.explanation}
              </div>
            )}

            {/* Action button */}
            {!isSubmitted ? (
              <button
                disabled={selectedAnswer === null}
                onClick={handleConfirm}
                className="w-full py-3 rounded-xl bg-[#e56c5e] text-[#5a0304] font-bold text-xs shadow-[0_3px_0_#5a0304] disabled:opacity-50 transition-all cursor-pointer"
              >
                Xác Nhận Đáp Án
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="w-full py-3 rounded-xl bg-[#f8bc4b] text-[#271900] font-bold text-xs shadow-[0_3px_0_#bc8714] transition-all cursor-pointer"
              >
                {currentIdx + 1 < QUIZ_QUESTIONS.length ? 'Câu Tiếp Theo ➔' : 'Xem Kết Quả Tổng Kết 🏆'}
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
            <span className="text-5xl animate-bounce">🎉</span>
            <h4 className="font-bold text-lg text-[#f8bc4b]">Hoàn Thành Thử Thách!</h4>
            <p className="text-xs opacity-90">
              Bạn đã trả lời đúng <b>{score}/{QUIZ_QUESTIONS.length}</b> câu hỏi về văn hóa phương ngữ 3 miền!
            </p>
            <div className="w-full flex gap-2 mt-2">
              <button
                onClick={handleRestart}
                className="flex-1 py-2.5 rounded-xl bg-[#3c241b] text-[#ffb4aa] font-bold text-xs"
              >
                Chơi lại
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-[#e56c5e] text-[#5a0304] font-bold text-xs shadow-[0_3px_0_#5a0304]"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
