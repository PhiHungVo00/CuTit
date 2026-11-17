export interface DrillBankItem {
  id: string;
  type: 'quiz' | 'fill' | 'listen' | 'match' | 'echo';
  topic: string;
  level: number;
  question: string;
  vietnameseText: string;
  englishMeaning: string;
  audioPrompt?: string;
  options?: string[];
  correctAnswer: string | number;
  pairs?: { vi: string; en: string }[];
  hint: string;
  explanation: string;
}

export const DRILL_BANK_ITEMS: DrillBankItem[] = [
  // 1. TRẮC NGHIỆM (QUIZ)
  {
    id: 'd1_quiz',
    type: 'quiz',
    topic: 'Xưng hô',
    level: 1,
    question: 'Khi gặp người phụ nữ trạc tuổi mẹ mình bán hàng ở chợ, bạn nên xưng hô như thế nào để thể hiện sự lễ phép?',
    vietnameseText: 'Dạ, cháu chào cô ạ!',
    englishMeaning: 'Hello auntie (polite greeting to a woman your mother\'s age)',
    options: ['Tôi - Bà', 'Cháu - Cô', 'Anh - Em', 'Em - Chị'],
    correctAnswer: 1,
    hint: 'Người ngang tuổi mẹ thì gọi là Cô hoặc Bác.',
    explanation: 'Xưng "Cháu" và gọi "Cô" là chuẩn mực đạo đức giao tiếp trong văn hóa gia đình và xã hội Việt Nam.'
  },
  {
    id: 'd2_quiz',
    type: 'quiz',
    topic: 'Thanh điệu',
    level: 1,
    question: 'Thanh nào trong tiếng Việt có cao độ cao nhất và đi vút lên?',
    vietnameseText: 'Thanh Sắc (Á)',
    englishMeaning: 'High rising tone (Thanh Sắc)',
    options: ['Thanh Huyền (À)', 'Thanh Sắc (Á)', 'Thanh Nặng (Ạ)', 'Thanh Hỏi (Ả)'],
    correctAnswer: 1,
    hint: 'Ký hiệu là dấu chéo nghiêng lên từ trái sang phải.',
    explanation: 'Thanh Sắc bắt đầu ở âm vực trung-cao và lượn vút lên âm vực cao nhất (khoảng 5-5 trên thang cao độ).'
  },
  {
    id: 'd3_quiz',
    type: 'quiz',
    topic: 'Ẩm thực',
    level: 1,
    question: 'Món "Phở bò tái" khác món "Phở bò chín" ở điểm nào?',
    vietnameseText: 'Phở bò tái',
    englishMeaning: 'Pho with rare beef slices',
    options: [
      'Bánh phở làm từ ngô',
      'Thịt bò được chần tái lăn mềm ngọt, chưa ninh nhừ',
      'Nước dùng phở có màu đỏ cay',
      'Không cho hành lá'
    ],
    correctAnswer: 1,
    hint: '"Tái" chỉ thịt vừa chần qua nước sôi giữ độ mềm ngọt.',
    explanation: 'Thịt bò tái được thái mỏng, chần nhanh qua nồi nước dùng sôi sùng sục để giữ nguyên vị ngọt đậm đà.'
  },
  {
    id: 'd4_quiz',
    type: 'quiz',
    topic: 'Phương ngữ',
    level: 2,
    question: 'Người miền Nam gọi quả "Ngô" (tiếng Bắc) là quả gì?',
    vietnameseText: 'Bắp ngô / Trái bắp',
    englishMeaning: 'Corn / Maize',
    options: ['Trái thơm', 'Trái bắp', 'Trái đậu phụng', 'Trái mận'],
    correctAnswer: 1,
    hint: 'Một từ bắt đầu bằng chữ "B".',
    explanation: 'Miền Bắc gọi là "ngô", miền Trung và miền Nam gọi là "bắp" (như bắp nướng mỡ hành, bắp xào).'
  },

  // 2. ĐIỀN TỪ VÀO CHỖ TRỐNG (FILL)
  {
    id: 'd5_fill',
    type: 'fill',
    topic: 'Chào hỏi',
    level: 1,
    question: 'Điền kính ngữ thích hợp vào chỗ trống: "Dạ, em chào cô Ba ___."',
    vietnameseText: 'Dạ, em chào cô Ba ạ.',
    englishMeaning: 'Polite greeting with "ạ" particle at the end.',
    options: ['ạ', 'ơi', 'hả', 'nhé'],
    correctAnswer: 'ạ',
    hint: 'Trợ từ biểu thị lòng kính cẩn đứng cuối câu.',
    explanation: '"Ạ" đứng ở cuối câu là kính ngữ bắt buộc khi người nhỏ tuổi nói chuyện với bề trên.'
  },
  {
    id: 'd6_fill',
    type: 'fill',
    topic: 'Ẩm thực',
    level: 1,
    question: 'Hoàn thành câu gọi đồ uống: "Cho em một ly cà phê ___ đá ít đường ạ."',
    vietnameseText: 'cà phê sữa đá',
    englishMeaning: 'Vietnamese iced milk coffee',
    options: ['sữa', 'trứng', 'muối', 'đen'],
    correctAnswer: 'sữa',
    hint: 'Loại sữa đặc có đường màu trắng béo ngọt rất nổi tiếng ở Việt Nam.',
    explanation: 'Cà phê sữa đá (nâu đá ở miền Bắc) là thức uống biểu tượng của ẩm thực Việt Nam.'
  },
  {
    id: 'd7_fill',
    type: 'fill',
    topic: 'Giao tiếp',
    level: 2,
    question: 'Điền từ nối hành động: "Bạn đi thẳng ___ rẽ tay phải vào ngõ."',
    vietnameseText: 'rồi',
    englishMeaning: 'and then / afterwards',
    options: ['rồi', 'nhưng', 'bởi vì', 'tuy'],
    correctAnswer: 'rồi',
    hint: 'Từ chỉ sự tiếp nối của hành động trong câu chỉ đường.',
    explanation: '"Rồi" dùng để liên kết hai hành động diễn ra tuần tự: Đi thẳng trước, rồi rẽ phải sau.'
  },

  // 3. NGHE VÀ CHỌN (LISTEN)
  {
    id: 'd8_listen',
    type: 'listen',
    topic: 'Từ vựng',
    level: 1,
    question: 'Nghe phát âm và chọn từ vựng đúng:',
    vietnameseText: 'Cảm ơn',
    englishMeaning: 'Thank you',
    audioPrompt: 'Cảm ơn',
    options: ['Cảm ơn', 'Cảm cúm', 'Cảm động', 'Cảm giác'],
    correctAnswer: 0,
    hint: 'Lời nói bày tỏ lòng biết ơn.',
    explanation: '"Cảm ơn" (hoặc cám ơn) là từ dùng để tri ân người khác khi nhận được sự giúp đỡ.'
  },
  {
    id: 'd9_listen',
    type: 'listen',
    topic: 'Thanh điệu',
    level: 1,
    question: 'Nghe âm thanh và phân biệt từ có thanh Hỏi:',
    vietnameseText: 'Quả vải',
    englishMeaning: 'Lychee fruit',
    audioPrompt: 'Quả vải',
    options: ['Quả vải', 'Quá vội', 'Qua vai', 'Quạ vỗ'],
    correctAnswer: 0,
    hint: 'Dấu hỏi lượn xuống rồi vút lên nhẹ.',
    explanation: '"Quả vải" chứa hai thanh Hỏi lượn sóng đặc trưng của tiếng Việt miền Bắc.'
  },

  // 4. NỐI CẶP TỪ VỰNG (MATCH)
  {
    id: 'd10_match',
    type: 'match',
    topic: 'Ẩm thực',
    level: 1,
    question: 'Nối từ tiếng Việt với nghĩa tiếng Anh tương ứng:',
    vietnameseText: 'Món ăn Việt Nam',
    englishMeaning: 'Vietnamese traditional dishes',
    pairs: [
      { vi: 'Bánh mì', en: 'Vietnamese baguette' },
      { vi: 'Phở bò', en: 'Beef noodle soup' },
      { vi: 'Cà phê sữa đá', en: 'Iced milk coffee' },
      { vi: 'Gỏi cuốn', en: 'Fresh spring rolls' }
    ],
    correctAnswer: 4,
    hint: 'Ghép nối tất cả 4 cặp thẻ bài hoàn chỉnh.',
    explanation: 'Bốn món ăn đại diện nổi tiếng của nền ẩm thực đường phố Việt Nam.'
  },
  {
    id: 'd11_match',
    type: 'match',
    topic: 'Đại từ xưng hô',
    level: 1,
    question: 'Nối vai vế xưng hô trong gia đình:',
    vietnameseText: 'Quan hệ họ hàng',
    englishMeaning: 'Family relationship terms',
    pairs: [
      { vi: 'Ông bà', en: 'Grandparents' },
      { vi: 'Bố mẹ', en: 'Parents' },
      { vi: 'Anh chị', en: 'Older siblings' },
      { vi: 'Em út', en: 'Youngest sibling' }
    ],
    correctAnswer: 4,
    hint: 'Quan sát các thế hệ trong gia đình Việt.',
    explanation: 'Hệ thống xưng hô gia đình phản ánh thứ bậc và tình cảm yêu thương ruột thịt.'
  },

  // 5. ĐỌC LẠI & PHÁT ÂM (ECHO / SPEAK)
  {
    id: 'd12_echo',
    type: 'echo',
    topic: 'Giao tiếp hàng ngày',
    level: 1,
    question: 'Hãy bấm micro và đọc lại câu chúc sau với ngữ điệu tự nhiên:',
    vietnameseText: 'Chúc bạn một ngày tốt lành!',
    englishMeaning: 'Wishing you a wonderful day!',
    audioPrompt: 'Chúc bạn một ngày tốt lành!',
    correctAnswer: 'Chúc bạn một ngày tốt lành!',
    hint: 'Nhấn giọng tươi vui ở hai từ "tốt lành".',
    explanation: 'Câu chúc thông dụng mang lại năng lượng tích cực khi bắt đầu một ngày mới.'
  },
  {
    id: 'd13_echo',
    type: 'echo',
    topic: 'Gọi món',
    level: 1,
    question: 'Hãy đọc to câu gọi món lịch thiệp sau:',
    vietnameseText: 'Cho em xin một cốc trà đá ạ.',
    englishMeaning: 'Please give me a glass of iced tea.',
    audioPrompt: 'Cho em xin một cốc trà đá ạ.',
    correctAnswer: 'Cho em xin một cốc trà đá ạ.',
    hint: 'Nhớ hạ giọng nhẹ nhàng ở âm "ạ" cuối câu.',
    explanation: 'Một câu thoại thực tế rất cần thiết khi bạn ngồi ở bất kỳ quán ăn hay quán cóc nào tại Việt Nam.'
  }
];
