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
  acceptableOrders?: string[][];
  grammarNote: string;
}

export const SENTENCE_TEMPLATES_60: BambooTemplate[] = [
  // CHỦ ĐỀ 1: CHÀO HỎI & LỄ NGHI (GREETINGS) - 10 câu
  {
    id: 's1',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Dạ, em chào cô Ba ạ.',
    grammarNote: 'Dạ đứng đầu câu và ạ đứng cuối câu biểu thị sự lễ phép của người nhỏ tuổi đối với người lớn tuổi.',
    tokens: [
      { id: 't1_1', text: 'Dạ,', role: 'honorific_start' },
      { id: 't1_2', text: 'em', role: 'subject' },
      { id: 't1_3', text: 'chào', role: 'verb' },
      { id: 't1_4', text: 'cô Ba', role: 'object' },
      { id: 't1_5', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's2',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Cháu chúc bác mạnh khỏe ạ.',
    grammarNote: 'Chủ ngữ (Cháu) + Động từ (chúc) + Bổ ngữ (bác mạnh khỏe) + Kính ngữ (ạ).',
    tokens: [
      { id: 't2_1', text: 'Cháu', role: 'subject' },
      { id: 't2_2', text: 'chúc', role: 'verb' },
      { id: 't2_3', text: 'bác', role: 'object' },
      { id: 't2_4', text: 'mạnh khỏe', role: 'modifier' },
      { id: 't2_5', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's3',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Hôm nay bạn có khỏe không?',
    grammarNote: 'Cấu trúc câu hỏi thăm: Trạng ngữ thời gian (Hôm nay) + Chủ ngữ (bạn) + có + Tính từ (khỏe) + không?',
    tokens: [
      { id: 't3_1', text: 'Hôm nay', role: 'modifier' },
      { id: 't3_2', text: 'bạn', role: 'subject' },
      { id: 't3_3', text: 'có', role: 'particle' },
      { id: 't3_4', text: 'khỏe', role: 'verb' },
      { id: 't3_5', text: 'không?', role: 'punctuation' }
    ]
  },
  {
    id: 's4',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Rất vui được gặp anh.',
    grammarNote: 'Phó từ (Rất) + Tính từ (vui) + Động từ (được gặp) + Đại từ xưng hô (anh).',
    tokens: [
      { id: 't4_1', text: 'Rất', role: 'modifier' },
      { id: 't4_2', text: 'vui', role: 'verb' },
      { id: 't4_3', text: 'được', role: 'particle' },
      { id: 't4_4', text: 'gặp', role: 'verb' },
      { id: 't4_5', text: 'anh.', role: 'object' }
    ]
  },
  {
    id: 's5',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Vâng, con cảm ơn mẹ nhiều ạ.',
    grammarNote: 'Vâng đứng đầu câu và ạ đứng cuối câu là nét văn hóa hiếu thảo đối với cha mẹ.',
    tokens: [
      { id: 't5_1', text: 'Vâng,', role: 'honorific_start' },
      { id: 't5_2', text: 'con', role: 'subject' },
      { id: 't5_3', text: 'cảm ơn', role: 'verb' },
      { id: 't5_4', text: 'mẹ', role: 'object' },
      { id: 't5_5', text: 'nhiều', role: 'modifier' },
      { id: 't5_6', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's6',
    topic: 'Chào hỏi',
    level: 2,
    canonicalSentence: 'Thưa thầy, em nộp bài tập ạ.',
    grammarNote: 'Thưa + chức danh/ngôi trên để mở đầu lời trình bày trang trọng.',
    tokens: [
      { id: 't6_1', text: 'Thưa thầy,', role: 'honorific_start' },
      { id: 't6_2', text: 'em', role: 'subject' },
      { id: 't6_3', text: 'nộp', role: 'verb' },
      { id: 't6_4', text: 'bài tập', role: 'object' },
      { id: 't6_5', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's7',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Chào mừng bạn đến Việt Nam.',
    grammarNote: 'Động từ chào đón + tân ngữ + động từ di chuyển + địa danh.',
    tokens: [
      { id: 't7_1', text: 'Chào mừng', role: 'verb' },
      { id: 't7_2', text: 'bạn', role: 'subject' },
      { id: 't7_3', text: 'đến', role: 'verb' },
      { id: 't7_4', text: 'Việt Nam.', role: 'object' }
    ]
  },
  {
    id: 's8',
    topic: 'Chào hỏi',
    level: 2,
    canonicalSentence: 'Hẹn gặp lại bạn ngày mai nhé.',
    grammarNote: 'Trợ từ "nhé" ở cuối câu mang sắc thái thân mật, hẹn ước nhẹ nhàng.',
    tokens: [
      { id: 't8_1', text: 'Hẹn', role: 'verb' },
      { id: 't8_2', text: 'gặp lại', role: 'verb' },
      { id: 't8_3', text: 'bạn', role: 'object' },
      { id: 't8_4', text: 'ngày mai', role: 'modifier' },
      { id: 't8_5', text: 'nhé.', role: 'honorific_end' }
    ]
  },
  {
    id: 's9',
    topic: 'Chào hỏi',
    level: 2,
    canonicalSentence: 'Bác đi đâu đấy ạ?',
    grammarNote: 'Đấy ạ ở cuối câu hỏi thăm xã giao quen thuộc của người làng quê Việt Nam.',
    tokens: [
      { id: 't9_1', text: 'Bác', role: 'subject' },
      { id: 't9_2', text: 'đi', role: 'verb' },
      { id: 't9_3', text: 'đâu', role: 'object' },
      { id: 't9_4', text: 'đấy', role: 'particle' },
      { id: 't9_5', text: 'ạ?', role: 'honorific_end' }
    ]
  },
  {
    id: 's10',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Chúc anh một ngày tốt lành.',
    grammarNote: 'Động từ chúc + Đại từ đối thoại + Cụm danh từ bổ nghĩa.',
    tokens: [
      { id: 't10_1', text: 'Chúc', role: 'verb' },
      { id: 't10_2', text: 'anh', role: 'object' },
      { id: 't10_3', text: 'một ngày', role: 'modifier' },
      { id: 't10_4', text: 'tốt lành.', role: 'modifier' }
    ]
  },

  // CHỦ ĐỀ 2: GỌI MÓN & QUÁN ĂN (ORDERING FOOD) - 10 câu
  {
    id: 's11',
    topic: 'Ẩm thực',
    level: 1,
    canonicalSentence: 'Cho em một bát phở bò tái ạ.',
    grammarNote: 'Mẫu câu gọi món: Cho + Ngôi xưng + Lượng từ + Tên món + ạ.',
    tokens: [
      { id: 't11_1', text: 'Cho', role: 'verb' },
      { id: 't11_2', text: 'em', role: 'subject' },
      { id: 't11_3', text: 'một bát', role: 'modifier' },
      { id: 't11_4', text: 'phở bò', role: 'object' },
      { id: 't11_5', text: 'tái', role: 'modifier' },
      { id: 't11_6', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's12',
    topic: 'Ẩm thực',
    level: 1,
    canonicalSentence: 'Cô ơi, đừng cho nhiều ớt nhé.',
    grammarNote: 'Từ xưng hô + ơi để gọi người bán hàng; đừng + cho là cấu trúc khuyên bảo/yêu cầu lịch sự.',
    tokens: [
      { id: 't12_1', text: 'Cô ơi,', role: 'honorific_start' },
      { id: 't12_2', text: 'đừng', role: 'particle' },
      { id: 't12_3', text: 'cho', role: 'verb' },
      { id: 't12_4', text: 'nhiều', role: 'modifier' },
      { id: 't12_5', text: 'ớt', role: 'object' },
      { id: 't12_6', text: 'nhé.', role: 'honorific_end' }
    ]
  },
  {
    id: 's13',
    topic: 'Ẩm thực',
    level: 2,
    canonicalSentence: 'Làm ơn cho tôi xin hóa đơn.',
    grammarNote: 'Làm ơn đứng đầu câu biểu thị lời đề nghị lịch sự.',
    tokens: [
      { id: 't13_1', text: 'Làm ơn', role: 'honorific_start' },
      { id: 't13_2', text: 'cho', role: 'verb' },
      { id: 't13_3', text: 'tôi', role: 'subject' },
      { id: 't13_4', text: 'xin', role: 'verb' },
      { id: 't13_5', text: 'hóa đơn.', role: 'object' }
    ]
  },
  {
    id: 's14',
    topic: 'Ẩm thực',
    level: 1,
    canonicalSentence: 'Món này ăn kèm với rau thơm.',
    grammarNote: 'Chủ ngữ (Món này) + Vị ngữ (ăn kèm) + Giới từ (với) + Bổ ngữ (rau thơm).',
    tokens: [
      { id: 't14_1', text: 'Món này', role: 'subject' },
      { id: 't14_2', text: 'ăn kèm', role: 'verb' },
      { id: 't14_3', text: 'với', role: 'particle' },
      { id: 't14_4', text: 'rau thơm.', role: 'object' }
    ]
  },
  {
    id: 's15',
    topic: 'Ẩm thực',
    level: 2,
    canonicalSentence: 'Quán này có bán cà phê sữa đá không?',
    grammarNote: 'Cấu trúc nghi vấn có... không?: Chủ ngữ + có + Động từ + Tân ngữ + không?',
    tokens: [
      { id: 't15_1', text: 'Quán này', role: 'subject' },
      { id: 't15_2', text: 'có bán', role: 'verb' },
      { id: 't15_3', text: 'cà phê', role: 'object' },
      { id: 't15_4', text: 'sữa đá', role: 'modifier' },
      { id: 't15_5', text: 'không?', role: 'punctuation' }
    ]
  },
  {
    id: 's16',
    topic: 'Ẩm thực',
    level: 1,
    canonicalSentence: 'Nước dùng phở hôm nay rất đậm đà.',
    grammarNote: 'Chủ ngữ (Nước dùng phở hôm nay) + Phó từ chỉ mức độ (rất) + Tính từ (đậm đà).',
    tokens: [
      { id: 't16_1', text: 'Nước dùng', role: 'subject' },
      { id: 't16_2', text: 'phở', role: 'modifier' },
      { id: 't16_3', text: 'hôm nay', role: 'modifier' },
      { id: 't16_4', text: 'rất', role: 'particle' },
      { id: 't16_5', text: 'đậm đà.', role: 'verb' }
    ]
  },
  {
    id: 's17',
    topic: 'Ẩm thực',
    level: 2,
    canonicalSentence: 'Em xin thêm một đôi đũa nữa ạ.',
    grammarNote: 'Mẫu câu xin thêm vật dụng: Ngôi xưng + xin thêm + lượng từ + danh từ + nữa ạ.',
    tokens: [
      { id: 't17_1', text: 'Em', role: 'subject' },
      { id: 't17_2', text: 'xin thêm', role: 'verb' },
      { id: 't17_3', text: 'một đôi', role: 'modifier' },
      { id: 't17_4', text: 'đũa', role: 'object' },
      { id: 't17_5', text: 'nữa', role: 'particle' },
      { id: 't17_6', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's18',
    topic: 'Ẩm thực',
    level: 1,
    canonicalSentence: 'Bánh mì thịt nướng này ngon quá.',
    grammarNote: 'Tính từ (ngon) + Trợ từ cảm thán (quá) tạo câu khen ngợi tự nhiên.',
    tokens: [
      { id: 't18_1', text: 'Bánh mì', role: 'subject' },
      { id: 't18_2', text: 'thịt nướng', role: 'modifier' },
      { id: 't18_3', text: 'này', role: 'modifier' },
      { id: 't18_4', text: 'ngon', role: 'verb' },
      { id: 't18_5', text: 'quá.', role: 'particle' }
    ]
  },
  {
    id: 's19',
    topic: 'Ẩm thực',
    level: 2,
    canonicalSentence: 'Anh muốn uống trà đá hay trà nóng?',
    grammarNote: 'Liên từ lựa chọn "hay" đứng giữa hai danh ngữ.',
    tokens: [
      { id: 't19_1', text: 'Anh', role: 'subject' },
      { id: 't19_2', text: 'muốn uống', role: 'verb' },
      { id: 't19_3', text: 'trà đá', role: 'object' },
      { id: 't19_4', text: 'hay', role: 'particle' },
      { id: 't19_5', text: 'trà nóng?', role: 'object' }
    ]
  },
  {
    id: 's20',
    topic: 'Ẩm thực',
    level: 1,
    canonicalSentence: 'Dạ, tính tiền cho bàn số hai ạ.',
    grammarNote: 'Mẫu câu thanh toán thân thiện và nhã nhặn.',
    tokens: [
      { id: 't20_1', text: 'Dạ,', role: 'honorific_start' },
      { id: 't20_2', text: 'tính tiền', role: 'verb' },
      { id: 't20_3', text: 'cho bàn', role: 'modifier' },
      { id: 't20_4', text: 'số hai', role: 'object' },
      { id: 't20_5', text: 'ạ.', role: 'honorific_end' }
    ]
  },

  // CHỦ ĐỀ 3: MUA SẮM & CHỢ QUÊ (MARKET & BARGAINING) - 10 câu
  {
    id: 's21',
    topic: 'Chợ quê',
    level: 1,
    canonicalSentence: 'Quả dưa hấu này bao nhiêu tiền một cân?',
    grammarNote: 'Danh từ chỉ vật + này + bao nhiêu tiền + lượng từ đơn vị.',
    tokens: [
      { id: 't21_1', text: 'Quả dưa hấu', role: 'subject' },
      { id: 't21_2', text: 'này', role: 'modifier' },
      { id: 't21_3', text: 'bao nhiêu', role: 'particle' },
      { id: 't21_4', text: 'tiền', role: 'object' },
      { id: 't21_5', text: 'một cân?', role: 'modifier' }
    ]
  },
  {
    id: 's22',
    topic: 'Chợ quê',
    level: 2,
    canonicalSentence: 'Cô bớt cho cháu một chút được không ạ?',
    grammarNote: 'Cấu trúc trả giá lịch thiệp: Cô bớt cho cháu... được không ạ?',
    tokens: [
      { id: 't22_1', text: 'Cô', role: 'subject' },
      { id: 't22_2', text: 'bớt cho', role: 'verb' },
      { id: 't22_3', text: 'cháu', role: 'object' },
      { id: 't22_4', text: 'một chút', role: 'modifier' },
      { id: 't22_5', text: 'được không', role: 'particle' },
      { id: 't22_6', text: 'ạ?', role: 'honorific_end' }
    ]
  },
  {
    id: 's23',
    topic: 'Chợ quê',
    level: 1,
    canonicalSentence: 'Rau muống này vừa hái sáng nay.',
    grammarNote: 'Chủ ngữ (Rau muống này) + Phó từ (vừa) + Động từ (hái) + Trạng ngữ (sáng nay).',
    tokens: [
      { id: 't23_1', text: 'Rau muống', role: 'subject' },
      { id: 't23_2', text: 'này', role: 'modifier' },
      { id: 't23_3', text: 'vừa', role: 'particle' },
      { id: 't23_4', text: 'hái', role: 'verb' },
      { id: 't23_5', text: 'sáng nay.', role: 'modifier' }
    ]
  },
  {
    id: 's24',
    topic: 'Chợ quê',
    level: 2,
    canonicalSentence: 'Cháu muốn mua hai nải chuối tiêu.',
    grammarNote: 'Động từ chỉ ý muốn + mua + số lượng + loại từ (nải) + danh từ (chuối tiêu).',
    tokens: [
      { id: 't24_1', text: 'Cháu', role: 'subject' },
      { id: 't24_2', text: 'muốn mua', role: 'verb' },
      { id: 't24_3', text: 'hai nải', role: 'modifier' },
      { id: 't24_4', text: 'chuối tiêu.', role: 'object' }
    ]
  },
  {
    id: 's25',
    topic: 'Chợ quê',
    level: 2,
    canonicalSentence: 'Bác có tiền lẻ trả lại không ạ?',
    grammarNote: 'Hỏi tiền thối (tiền lẻ trả lại) bằng cấu trúc có... không ạ.',
    tokens: [
      { id: 't25_1', text: 'Bác', role: 'subject' },
      { id: 't25_2', text: 'có', role: 'verb' },
      { id: 't25_3', text: 'tiền lẻ', role: 'object' },
      { id: 't25_4', text: 'trả lại', role: 'verb' },
      { id: 't25_5', text: 'không', role: 'particle' },
      { id: 't25_6', text: 'ạ?', role: 'honorific_end' }
    ]
  },
  {
    id: 's26',
    topic: 'Chợ quê',
    level: 1,
    canonicalSentence: 'Đồ lưu niệm này làm bằng tre nứa.',
    grammarNote: 'Chủ ngữ + làm bằng + chất liệu dân gian.',
    tokens: [
      { id: 't26_1', text: 'Đồ lưu niệm', role: 'subject' },
      { id: 't26_2', text: 'này', role: 'modifier' },
      { id: 't26_3', text: 'làm bằng', role: 'verb' },
      { id: 't26_4', text: 'tre nứa.', role: 'object' }
    ]
  },
  {
    id: 's27',
    topic: 'Chợ quê',
    level: 2,
    canonicalSentence: 'Cháu gửi bác năm mươi nghìn đồng ạ.',
    grammarNote: 'Động từ trao đưa (gửi) + người nhận + số tiền + kính ngữ.',
    tokens: [
      { id: 't27_1', text: 'Cháu', role: 'subject' },
      { id: 't27_2', text: 'gửi', role: 'verb' },
      { id: 't27_3', text: 'bác', role: 'object' },
      { id: 't27_4', text: 'năm mươi', role: 'modifier' },
      { id: 't27_5', text: 'nghìn đồng', role: 'object' },
      { id: 't27_6', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's28',
    topic: 'Chợ quê',
    level: 1,
    canonicalSentence: 'Nón lá này khâu rất khéo tay.',
    grammarNote: 'Phó từ (rất) bổ nghĩa cho cụm tính từ (khéo tay).',
    tokens: [
      { id: 't28_1', text: 'Nón lá', role: 'subject' },
      { id: 't28_2', text: 'này', role: 'modifier' },
      { id: 't28_3', text: 'khâu', role: 'verb' },
      { id: 't28_4', text: 'rất', role: 'particle' },
      { id: 't28_5', text: 'khéo tay.', role: 'verb' }
    ]
  },
  {
    id: 's29',
    topic: 'Chợ quê',
    level: 2,
    canonicalSentence: 'Cô cho cháu xin túi đựng nhé.',
    grammarNote: 'Lời xin xỏ nhẹ nhàng: cho... xin... nhé.',
    tokens: [
      { id: 't29_1', text: 'Cô', role: 'subject' },
      { id: 't29_2', text: 'cho cháu', role: 'modifier' },
      { id: 't29_3', text: 'xin', role: 'verb' },
      { id: 't29_4', text: 'túi đựng', role: 'object' },
      { id: 't29_5', text: 'nhé.', role: 'honorific_end' }
    ]
  },
  {
    id: 's30',
    topic: 'Chợ quê',
    level: 1,
    canonicalSentence: 'Hoa quả ở đây tươi ngon và rẻ.',
    grammarNote: 'Chủ ngữ + tính từ kép nối bằng liên từ "và".',
    tokens: [
      { id: 't30_1', text: 'Hoa quả', role: 'subject' },
      { id: 't30_2', text: 'ở đây', role: 'modifier' },
      { id: 't30_3', text: 'tươi ngon', role: 'verb' },
      { id: 't30_4', text: 'và', role: 'particle' },
      { id: 't30_5', text: 'rẻ.', role: 'verb' }
    ]
  },

  // CHỦ ĐỀ 4: HỎI ĐƯỜNG & GIAO THÔNG (DIRECTIONS & TRAVEL) - 10 câu
  {
    id: 's31',
    topic: 'Hỏi đường',
    level: 1,
    canonicalSentence: 'Làm ơn cho tôi hỏi đường đi Bến Thành.',
    grammarNote: 'Làm ơn cho tôi hỏi... là mẫu câu hỏi đường lịch sự nhất.',
    tokens: [
      { id: 't31_1', text: 'Làm ơn', role: 'honorific_start' },
      { id: 't31_2', text: 'cho tôi', role: 'subject' },
      { id: 't31_3', text: 'hỏi', role: 'verb' },
      { id: 't31_4', text: 'đường đi', role: 'object' },
      { id: 't31_5', text: 'Bến Thành.', role: 'modifier' }
    ]
  },
  {
    id: 's32',
    topic: 'Hỏi đường',
    level: 1,
    canonicalSentence: 'Bạn đi thẳng rồi rẽ tay phải.',
    grammarNote: 'Liên từ nối chuỗi hành động: đi thẳng + rồi + rẽ tay phải.',
    tokens: [
      { id: 't32_1', text: 'Bạn', role: 'subject' },
      { id: 't32_2', text: 'đi thẳng', role: 'verb' },
      { id: 't32_3', text: 'rồi', role: 'particle' },
      { id: 't32_4', text: 'rẽ', role: 'verb' },
      { id: 't32_5', text: 'tay phải.', role: 'modifier' }
    ]
  },
  {
    id: 's33',
    topic: 'Hỏi đường',
    level: 2,
    canonicalSentence: 'Từ đây đến hồ Hoàn Kiếm bao xa?',
    grammarNote: 'Cấu trúc đo khoảng cách: Từ [A] đến [B] bao xa?',
    tokens: [
      { id: 't33_1', text: 'Từ đây', role: 'modifier' },
      { id: 't33_2', text: 'đến', role: 'particle' },
      { id: 't33_3', text: 'hồ Hoàn Kiếm', role: 'object' },
      { id: 't33_4', text: 'bao', role: 'particle' },
      { id: 't33_5', text: 'xa?', role: 'verb' }
    ]
  },
  {
    id: 's34',
    topic: 'Hỏi đường',
    level: 1,
    canonicalSentence: 'Bến xe buýt nằm ở đối diện công viên.',
    grammarNote: 'Chủ ngữ + Động từ vị trí (nằm ở) + Cụm vị trí (đối diện công viên).',
    tokens: [
      { id: 't34_1', text: 'Bến xe buýt', role: 'subject' },
      { id: 't34_2', text: 'nằm ở', role: 'verb' },
      { id: 't34_3', text: 'đối diện', role: 'modifier' },
      { id: 't34_4', text: 'công viên.', role: 'object' }
    ]
  },
  {
    id: 's35',
    topic: 'Hỏi đường',
    level: 2,
    canonicalSentence: 'Bác ơi, cho cháu hỏi thăm đường ạ.',
    grammarNote: 'Bác ơi gọi thu hút sự chú ý + ạ kết thúc tôn kính.',
    tokens: [
      { id: 't35_1', text: 'Bác ơi,', role: 'honorific_start' },
      { id: 't35_2', text: 'cho cháu', role: 'subject' },
      { id: 't35_3', text: 'hỏi thăm', role: 'verb' },
      { id: 't35_4', text: 'đường', role: 'object' },
      { id: 't35_5', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's36',
    topic: 'Hỏi đường',
    level: 1,
    canonicalSentence: 'Đi bộ mất khoảng mười phút.',
    grammarNote: 'Động từ di chuyển + mất (thời gian) + khoảng + lượng thời gian.',
    tokens: [
      { id: 't36_1', text: 'Đi bộ', role: 'verb' },
      { id: 't36_2', text: 'mất', role: 'particle' },
      { id: 't36_3', text: 'khoảng', role: 'modifier' },
      { id: 't36_4', text: 'mười phút.', role: 'object' }
    ]
  },
  {
    id: 's37',
    topic: 'Hỏi đường',
    level: 2,
    canonicalSentence: 'Anh lái xe cẩn thận nhé.',
    grammarNote: 'Lời dặn dò an toàn giao thông thân thiết: Chủ ngữ + Động từ + Trạng từ + nhé.',
    tokens: [
      { id: 't37_1', text: 'Anh', role: 'subject' },
      { id: 't37_2', text: 'lái xe', role: 'verb' },
      { id: 't37_3', text: 'cẩn thận', role: 'modifier' },
      { id: 't37_4', text: 'nhé.', role: 'honorific_end' }
    ]
  },
  {
    id: 's38',
    topic: 'Hỏi đường',
    level: 1,
    canonicalSentence: 'Tôi muốn bắt xe ôm công nghệ.',
    grammarNote: 'Chủ ngữ + muốn bắt (đón) + phương tiện giao thông phổ biến ở Việt Nam.',
    tokens: [
      { id: 't38_1', text: 'Tôi', role: 'subject' },
      { id: 't38_2', text: 'muốn', role: 'particle' },
      { id: 't38_3', text: 'bắt', role: 'verb' },
      { id: 't38_4', text: 'xe ôm', role: 'object' },
      { id: 't38_5', text: 'công nghệ.', role: 'modifier' }
    ]
  },
  {
    id: 's39',
    topic: 'Hỏi đường',
    level: 2,
    canonicalSentence: 'Đèn đỏ xin vui lòng dừng lại.',
    grammarNote: 'Câu hiệu lệnh văn minh: Đèn đỏ + xin vui lòng + động từ.',
    tokens: [
      { id: 't39_1', text: 'Đèn đỏ', role: 'subject' },
      { id: 't39_2', text: 'xin vui lòng', role: 'honorific_start' },
      { id: 't39_3', text: 'dừng', role: 'verb' },
      { id: 't39_4', text: 'lại.', role: 'particle' }
    ]
  },
  {
    id: 's40',
    topic: 'Hỏi đường',
    level: 1,
    canonicalSentence: 'Nhà ga nằm ở bên tay trái.',
    grammarNote: 'Xác định phương hướng: bên tay trái / bên tay phải.',
    tokens: [
      { id: 't40_1', text: 'Nhà ga', role: 'subject' },
      { id: 't40_2', text: 'nằm ở', role: 'verb' },
      { id: 't40_3', text: 'bên tay', role: 'modifier' },
      { id: 't40_4', text: 'trái.', role: 'modifier' }
    ]
  },

  // CHỦ ĐỀ 5: GIA ĐÌNH & PHONG TỤC (FAMILY & CUSTOMS) - 10 câu
  {
    id: 's41',
    topic: 'Gia đình',
    level: 1,
    canonicalSentence: 'Gia đình tôi gồm có bốn người.',
    grammarNote: 'Cấu trúc giới thiệu số lượng thành viên: Gia đình... gồm có... người.',
    tokens: [
      { id: 't41_1', text: 'Gia đình tôi', role: 'subject' },
      { id: 't41_2', text: 'gồm có', role: 'verb' },
      { id: 't41_3', text: 'bốn', role: 'modifier' },
      { id: 't41_4', text: 'người.', role: 'object' }
    ]
  },
  {
    id: 's42',
    topic: 'Gia đình',
    level: 2,
    canonicalSentence: 'Con mời bố mẹ xơi cơm ạ.',
    grammarNote: 'Phép lịch sự mời cơm truyền thống Việt Nam: Ngôi nhỏ + mời + ngôi lớn + xơi cơm ạ.',
    tokens: [
      { id: 't42_1', text: 'Con', role: 'subject' },
      { id: 't42_2', text: 'mời', role: 'verb' },
      { id: 't42_3', text: 'bố mẹ', role: 'object' },
      { id: 't42_4', text: 'xơi cơm', role: 'verb' },
      { id: 't42_5', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's43',
    topic: 'Gia đình',
    level: 1,
    canonicalSentence: 'Bà ngoại đang ngồi têm trầu cay.',
    grammarNote: 'Thì hiện tại tiếp diễn: Chủ ngữ + đang + Động từ + Tân ngữ.',
    tokens: [
      { id: 't43_1', text: 'Bà ngoại', role: 'subject' },
      { id: 't43_2', text: 'đang', role: 'particle' },
      { id: 't43_3', text: 'ngồi', role: 'verb' },
      { id: 't43_4', text: 'têm trầu', role: 'verb' },
      { id: 't43_5', text: 'cay.', role: 'modifier' }
    ]
  },
  {
    id: 's44',
    topic: 'Gia đình',
    level: 2,
    canonicalSentence: 'Anh chị em trong nhà phải hòa thuận.',
    grammarNote: 'Cụm danh từ đồng vị + động từ tình thái (phải) + tính từ.',
    tokens: [
      { id: 't44_1', text: 'Anh chị em', role: 'subject' },
      { id: 't44_2', text: 'trong nhà', role: 'modifier' },
      { id: 't44_3', text: 'phải', role: 'particle' },
      { id: 't44_4', text: 'hòa thuận.', role: 'verb' }
    ]
  },
  {
    id: 's45',
    topic: 'Gia đình',
    level: 2,
    canonicalSentence: 'Ngày Tết gia đình sum họp bên nồi bánh chưng.',
    grammarNote: 'Trạng ngữ thời gian (Ngày Tết) + Chủ ngữ + Động từ + Vị ngữ chỉ nơi chốn.',
    tokens: [
      { id: 't45_1', text: 'Ngày Tết', role: 'modifier' },
      { id: 't45_2', text: 'gia đình', role: 'subject' },
      { id: 't45_3', text: 'sum họp', role: 'verb' },
      { id: 't45_4', text: 'bên nồi', role: 'modifier' },
      { id: 't45_5', text: 'bánh chưng.', role: 'object' }
    ]
  },
  {
    id: 's46',
    topic: 'Gia đình',
    level: 1,
    canonicalSentence: 'Em gái tôi rất thích học đàn tranh.',
    grammarNote: 'Cụm danh từ làm chủ ngữ + thích + động từ + nhạc cụ truyền thống.',
    tokens: [
      { id: 't46_1', text: 'Em gái tôi', role: 'subject' },
      { id: 't46_2', text: 'rất thích', role: 'verb' },
      { id: 't46_3', text: 'học', role: 'verb' },
      { id: 't46_4', text: 'đàn tranh.', role: 'object' }
    ]
  },
  {
    id: 's47',
    topic: 'Gia đình',
    level: 2,
    canonicalSentence: 'Cháu chúc ông bà sống lâu trăm tuổi.',
    grammarNote: 'Câu chúc thọ dân gian chuẩn mực.',
    tokens: [
      { id: 't47_1', text: 'Cháu', role: 'subject' },
      { id: 't47_2', text: 'chúc', role: 'verb' },
      { id: 't47_3', text: 'ông bà', role: 'object' },
      { id: 't47_4', text: 'sống lâu', role: 'verb' },
      { id: 't47_5', text: 'trăm tuổi.', role: 'modifier' }
    ]
  },
  {
    id: 's48',
    topic: 'Gia đình',
    level: 1,
    canonicalSentence: 'Mẹ tôi nấu ăn rất ngon.',
    grammarNote: 'Chủ ngữ + Động từ + Bổ ngữ mức độ.',
    tokens: [
      { id: 't48_1', text: 'Mẹ tôi', role: 'subject' },
      { id: 't48_2', text: 'nấu ăn', role: 'verb' },
      { id: 't48_3', text: 'rất', role: 'particle' },
      { id: 't48_4', text: 'ngon.', role: 'modifier' }
    ]
  },
  {
    id: 's49',
    topic: 'Gia đình',
    level: 2,
    canonicalSentence: 'Con đi học về rồi ạ.',
    grammarNote: 'Lời thưa chào cha mẹ khi đi học về.',
    tokens: [
      { id: 't49_1', text: 'Con', role: 'subject' },
      { id: 't49_2', text: 'đi học', role: 'verb' },
      { id: 't49_3', text: 'về rồi', role: 'particle' },
      { id: 't49_4', text: 'ạ.', role: 'honorific_end' }
    ]
  },
  {
    id: 's50',
    topic: 'Gia đình',
    level: 1,
    canonicalSentence: 'Cả nhà quây quần bên mâm cơm ấm cúng.',
    grammarNote: 'Hình ảnh văn hóa mâm cơm tròn của gia đình Việt.',
    tokens: [
      { id: 't50_1', text: 'Cả nhà', role: 'subject' },
      { id: 't50_2', text: 'quây quần', role: 'verb' },
      { id: 't50_3', text: 'bên mâm', role: 'modifier' },
      { id: 't50_4', text: 'cơm ấm cúng.', role: 'object' }
    ]
  },

  // CHỦ ĐỀ 6: CUỘC SỐNG & VĂN HÓA ĐỜI THƯỜNG - 10 câu
  {
    id: 's51',
    topic: 'Văn hóa',
    level: 1,
    canonicalSentence: 'Tiếng Việt có sáu thanh điệu trầm bổng.',
    grammarNote: 'Chủ ngữ + Động từ sở hữu (có) + Số từ + Danh từ + Tính từ đặc trưng.',
    tokens: [
      { id: 't51_1', text: 'Tiếng Việt', role: 'subject' },
      { id: 't51_2', text: 'có', role: 'verb' },
      { id: 't51_3', text: 'sáu', role: 'modifier' },
      { id: 't51_4', text: 'thanh điệu', role: 'object' },
      { id: 't51_5', text: 'trầm bổng.', role: 'modifier' }
    ]
  },
  {
    id: 's52',
    topic: 'Văn hóa',
    level: 2,
    canonicalSentence: 'Cây tre là biểu tượng kiên cường của làng quê.',
    grammarNote: 'Cấu trúc định nghĩa: [A] là [B] của [C].',
    tokens: [
      { id: 't52_1', text: 'Cây tre', role: 'subject' },
      { id: 't52_2', text: 'là', role: 'particle' },
      { id: 't52_3', text: 'biểu tượng', role: 'object' },
      { id: 't52_4', text: 'kiên cường', role: 'modifier' },
      { id: 't52_5', text: 'của làng quê.', role: 'modifier' }
    ]
  },
  {
    id: 's53',
    topic: 'Văn hóa',
    level: 2,
    canonicalSentence: 'Lời chào cao hơn mâm cỗ.',
    grammarNote: 'Thành ngữ dân gian ca ngợi phép lịch sự giao tiếp.',
    tokens: [
      { id: 't53_1', text: 'Lời chào', role: 'subject' },
      { id: 't53_2', text: 'cao hơn', role: 'verb' },
      { id: 't53_3', text: 'mâm cỗ.', role: 'object' }
    ]
  },
  {
    id: 's54',
    topic: 'Văn hóa',
    level: 1,
    canonicalSentence: 'Mùa thu Hà Nội có hoa sữa nồng nàn.',
    grammarNote: 'Trạng ngữ không gian - thời gian + có + danh từ đặc trưng.',
    tokens: [
      { id: 't54_1', text: 'Mùa thu', role: 'modifier' },
      { id: 't54_2', text: 'Hà Nội', role: 'subject' },
      { id: 't54_3', text: 'có', role: 'verb' },
      { id: 't54_4', text: 'hoa sữa', role: 'object' },
      { id: 't54_5', text: 'nồng nàn.', role: 'modifier' }
    ]
  },
  {
    id: 's55',
    topic: 'Văn hóa',
    level: 2,
    canonicalSentence: 'Uống nước nhớ nguồn là đạo lý tốt đẹp.',
    grammarNote: 'Câu tục ngữ làm chủ ngữ + là + bổ ngữ đánh giá.',
    tokens: [
      { id: 't55_1', text: 'Uống nước', role: 'verb' },
      { id: 't55_2', text: 'nhớ nguồn', role: 'verb' },
      { id: 't55_3', text: 'là', role: 'particle' },
      { id: 't55_4', text: 'đạo lý', role: 'object' },
      { id: 't55_5', text: 'tốt đẹp.', role: 'modifier' }
    ]
  },
  {
    id: 's56',
    topic: 'Văn hóa',
    level: 1,
    canonicalSentence: 'Tôi rất yêu mến con người Việt Nam.',
    grammarNote: 'Chủ ngữ + Phó từ mức độ + Động từ tình cảm + Tân ngữ.',
    tokens: [
      { id: 't56_1', text: 'Tôi', role: 'subject' },
      { id: 't56_2', text: 'rất yêu mến', role: 'verb' },
      { id: 't56_3', text: 'con người', role: 'object' },
      { id: 't56_4', text: 'Việt Nam.', role: 'modifier' }
    ]
  },
  {
    id: 's57',
    topic: 'Văn hóa',
    level: 2,
    canonicalSentence: 'Đến nhà người Việt Nam nhớ cởi giày dép ra.',
    grammarNote: 'Quy tắc ứng xử khi vào nhà người Việt.',
    tokens: [
      { id: 't57_1', text: 'Đến nhà', role: 'modifier' },
      { id: 't57_2', text: 'người Việt Nam', role: 'subject' },
      { id: 't57_3', text: 'nhớ cởi', role: 'verb' },
      { id: 't57_4', text: 'giày dép', role: 'object' },
      { id: 't57_5', text: 'ra.', role: 'particle' }
    ]
  },
  {
    id: 's58',
    topic: 'Văn hóa',
    level: 1,
    canonicalSentence: 'Áo dài là trang phục truyền thống thướt tha.',
    grammarNote: 'Trang phục dân tộc mang vẻ đẹp dịu dàng.',
    tokens: [
      { id: 't58_1', text: 'Áo dài', role: 'subject' },
      { id: 't58_2', text: 'là', role: 'particle' },
      { id: 't58_3', text: 'trang phục', role: 'object' },
      { id: 't58_4', text: 'truyền thống', role: 'modifier' },
      { id: 't58_5', text: 'thướt tha.', role: 'modifier' }
    ]
  },
  {
    id: 's59',
    topic: 'Văn hóa',
    level: 2,
    canonicalSentence: 'Bé Cu Tít chúc bạn học tiếng Việt vui vẻ nhé.',
    grammarNote: 'Linh vật Cu Tít gửi lời chúc thân ái tới người học.',
    tokens: [
      { id: 't59_1', text: 'Bé Cu Tít', role: 'subject' },
      { id: 't59_2', text: 'chúc bạn', role: 'verb' },
      { id: 't59_3', text: 'học', role: 'verb' },
      { id: 't59_4', text: 'tiếng Việt', role: 'object' },
      { id: 't59_5', text: 'vui vẻ', role: 'modifier' },
      { id: 't59_6', text: 'nhé.', role: 'honorific_end' }
    ]
  },
  {
    id: 's60',
    topic: 'Văn hóa',
    level: 2,
    canonicalSentence: 'Học ăn học nói học gói học mở.',
    grammarNote: 'Câu tục ngữ bốn vế dạy cách giao tiếp và ứng xử toàn diện của người xưa.',
    tokens: [
      { id: 't60_1', text: 'Học ăn', role: 'verb' },
      { id: 't60_2', text: 'học nói', role: 'verb' },
      { id: 't60_3', text: 'học gói', role: 'verb' },
      { id: 't60_4', text: 'học mở.', role: 'verb' }
    ]
  }
];
