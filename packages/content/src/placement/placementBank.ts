export interface PlacementQuestionItem {
  id: string;
  tier: number;
  difficultyScore: number;
  category: 'honorific' | 'phonetics' | 'dialogue' | 'cuisine' | 'dialect' | 'custom' | 'syntax' | 'proverb';
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const PLACEMENT_QUESTIONS_8: PlacementQuestionItem[] = [
  {
    id: 'q1_a1_greeting',
    tier: 1,
    difficultyScore: 1.0,
    category: 'honorific',
    question: 'Khi lần đầu gặp một người lớn tuổi ở Việt Nam, câu chào hỏi nào thể hiện sự lễ phép chuẩn mực nhất?',
    options: [
      'Chào bác!',
      'Dạ, cháu chào bác ạ!',
      'Bác khỏe không?',
      'Xin chào ông bạn!'
    ],
    correctIndex: 1,
    explanation: 'Từ "Dạ" ở đầu câu và "ạ" ở cuối câu là cặp kính ngữ bắt buộc khi người nhỏ tuổi chào người lớn.'
  },
  {
    id: 'q2_a1_tone',
    tier: 1,
    difficultyScore: 1.2,
    category: 'phonetics',
    question: 'Thanh nào sau đây trong tiếng Việt có cao độ bằng phẳng và không có dấu thanh trên chữ viết?',
    options: [
      'Thanh Huyền',
      'Thanh Ngang (Thanh Không)',
      'Thanh Sắc',
      'Thanh Nặng'
    ],
    correctIndex: 1,
    explanation: 'Thanh Ngang (như "ba", "hoa") giữ nguyên cao độ trung bình ổn định từ đầu đến cuối âm tiết.'
  },
  {
    id: 'q3_a2_market',
    tier: 2,
    difficultyScore: 2.0,
    category: 'dialogue',
    question: 'Khi đi chợ truyền thống, bạn muốn người bán hàng giảm giá một chút, câu nào sau đây tự nhiên và lịch sự nhất?',
    options: [
      'Bán rẻ đi, đắt quá không mua!',
      'Cô bớt cho cháu một chút được không ạ?',
      'Giảm nửa giá ngay đi!',
      'Cái này không đáng tiền đâu.'
    ],
    correctIndex: 1,
    explanation: 'Cấu trúc "Cô bớt cho cháu một chút được không ạ?" là văn hóa trả giá duyên dáng, tôn trọng người bán.'
  },
  {
    id: 'q4_a2_order',
    tier: 2,
    difficultyScore: 2.2,
    category: 'cuisine',
    question: 'Khi gọi phở bò, người học muốn ăn thịt bò mềm vừa chần qua nước sôi chín tới thì gọi món gì?',
    options: [
      'Phở bò nạm',
      'Phở bò sốt vang',
      'Phở bò tái',
      'Phở bò chín kỹ'
    ],
    correctIndex: 2,
    explanation: '"Tái" chỉ thịt bò thái mỏng chần nhanh qua nước dùng sôi để giữ vị ngọt đậm đà.'
  },
  {
    id: 'q5_b1_dialect',
    tier: 3,
    difficultyScore: 2.8,
    category: 'dialect',
    question: 'Từ "Bắp" trong phương ngữ miền Nam và miền Trung tương ứng với từ nào trong tiếng Bắc?',
    options: [
      'Quả Khóm',
      'Quả Ngô',
      'Đậu Phộng',
      'Quả Mận'
    ],
    correctIndex: 1,
    explanation: 'Người miền Bắc gọi bắp ngô là "ngô", trong khi miền Trung và Nam gọi là "bắp".'
  },
  {
    id: 'q6_b1_culture',
    tier: 3,
    difficultyScore: 3.0,
    category: 'custom',
    question: 'Hành động nào sau đây bị coi là điều kiêng kỵ tối kỵ nhất trong mâm cơm của người Việt?',
    options: [
      'Dùng thìa để múc canh',
      'Cắm thẳng đứng đôi đũa vào giữa bát cơm',
      'Mời cơm người lớn tuổi trước khi ăn',
      'Gắp thức ăn cho khách quý'
    ],
    correctIndex: 1,
    explanation: 'Cắm đũa thẳng đứng vào bát cơm gợi liên tưởng đến bát cơm cúng tang lễ, mang lại điềm gở.'
  },
  {
    id: 'q7_b2_syntax',
    tier: 4,
    difficultyScore: 3.6,
    category: 'syntax',
    question: 'Chọn trật tự từ đúng theo cấu trúc ngữ pháp câu ghép đốt tre tiếng Việt:',
    options: [
      'Ạ em chào dạ cô Ba.',
      'Dạ, em chào cô Ba ạ.',
      'Chào cô Ba em ạ dạ.',
      'Cô Ba em chào dạ ạ.'
    ],
    correctIndex: 1,
    explanation: 'Trật tự cú pháp tiếng Việt: [Kính ngữ mở đầu "Dạ"] -> [Chủ ngữ "em"] -> [Vị ngữ "chào"] -> [Tân ngữ "cô Ba"] -> [Trợ từ kính ngữ "ạ"].'
  },
  {
    id: 'q8_b2_proverb',
    tier: 4,
    difficultyScore: 4.0,
    category: 'proverb',
    question: 'Câu tục ngữ "Học ăn, học nói, học gói, học mở" khuyên răn con người điều gì?',
    options: [
      'Cách nấu nướng các món ăn ngon',
      'Kỹ năng mở gói quà ngày Tết',
      'Cách ứng xử, giao tiếp và làm việc chu đáo, toàn diện trong đời sống',
      'Thói quen ăn uống nhanh nhẹn'
    ],
    correctIndex: 2,
    explanation: 'Đây là bài học sâu sắc của ông cha dạy về lễ nghĩa, sự khéo léo và thận trọng trong toàn bộ hành vi đối nhân xử thế.'
  }
];
