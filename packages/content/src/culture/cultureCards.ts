export interface CultureCard {
  id: string;
  title: string;
  category: 'communication' | 'cuisine' | 'custom' | 'holiday';
  categoryLabel: string;
  icon: string;
  summary: string;
  story: string;
  dos: string[];
  donts: string[];
  proverb: string;
  quiz: {
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
  };
}

export const CULTURE_CARDS_20: CultureCard[] = [
  {
    id: 'c1',
    title: 'Khoanh tay cúi đầu khi chào hỏi người lớn tuổi',
    category: 'communication',
    categoryLabel: 'Giao tiếp & Ứng xử',
    icon: '🙏',
    summary: 'Nét đẹp lễ giáo truyền thống thể hiện sự kính trọng tuyệt đối với bề trên.',
    story: 'Hồi bé Cu Tít lên 3 tuổi, mỗi khi ông bà hay các cụ ở làng sang chơi, Cu Tít đều khoanh hai tay trước ngực, hơi cúi đầu và thưa: "Dạ, con chào cụ ạ!". Người lớn ai nhìn thấy cũng xoa đầu khen bé ngoan.',
    dos: [
      'Khoanh hai tay ngang ngực trước khi cất lời chào người lớn tuổi.',
      'Gặp người quen lớn tuổi cần chào trước thay vì chờ người lớn chào mình.',
      'Dùng từ "Dạ" ở đầu câu và "ạ" ở cuối câu.'
    ],
    donts: [
      'Không đứng đút tay túi quần hoặc vừa đi vừa hất đầu chào người lớn.',
      'Không dùng lời chào cộc lốc như "Chào!", "Ê!" với bề trên.'
    ],
    proverb: 'Lời chào cao hơn mâm cỗ.',
    quiz: {
      question: 'Khi gặp người lớn tuổi ở Việt Nam, tư thế chào hỏi chuẩn mực của người nhỏ tuổi là gì?',
      options: ['Đứng thẳng bắt tay chặt', 'Khoanh hai tay trước ngực và hơi cúi đầu', 'Vẫy tay từ xa', 'Gật đầu nhẹ'],
      answerIndex: 1,
      explanation: 'Khoanh tay trước ngực kèm lời thưa gửi là biểu tượng của sự lễ phép và tôn kính người lớn.'
    }
  },
  {
    id: 'c2',
    title: 'Văn hóa mời cơm trước khi cầm đũa',
    category: 'cuisine',
    categoryLabel: 'Văn hóa ẩm thực',
    icon: '🥢',
    summary: 'Quy tắc mời cơm theo thứ tự tôn ti trật tự trong gia đình trước bữa ăn.',
    story: 'Trong mâm cơm gia đình Việt, khi mọi người ngồi đông đủ và xới cơm xong, con cháu sẽ mời từ người lớn nhất đến người nhỏ tuổi hơn: "Con mời ông bà, con mời bố mẹ xơi cơm ạ!".',
    dos: [
      'Mời người lớn tuổi nhất trong mâm cơm trước rồi mới tới người kế tiếp.',
      'Chờ người lớn cầm đũa gắp miếng đầu tiên rồi mình mới gắp ăn.',
      'Khi gắp thức ăn cho người khác, nên trở đầu đũa để giữ vệ sinh.'
    ],
    donts: [
      'Không cắm thẳng đôi đũa vào bát cơm (giống bát cơm cúng tế người mất).',
      'Không dùng đũa khuấy đảo tìm miếng ngon trong đĩa chung.',
      'Không vừa nhai vừa nói to tiếng.'
    ],
    proverb: 'Ăn trông nồi, ngồi trông hướng.',
    quiz: {
      question: 'Hành động nào bị coi là kiêng kỵ tối kỵ nhất khi cầm đũa trong bữa ăn của người Việt?',
      options: ['Dùng cả thìa và đũa', 'Cắm thẳng đôi đũa đứng thẳng vào bát cơm', 'Gắp thức ăn vào bát trước khi ăn', 'Mời người lớn xơi cơm'],
      answerIndex: 1,
      explanation: 'Cắm đũa thẳng đứng vào bát cơm gợi nhớ bát cơm cúng người đã khuất, mang lại điềm xấu.'
    }
  },
  {
    id: 'c3',
    title: 'Phong tục têm trầu cánh phượng',
    category: 'custom',
    categoryLabel: 'Phong tục dân gian',
    icon: '🍃',
    summary: 'Miếng trầu là đầu câu chuyện, biểu tượng son sắt thủy chung và lòng hiếu khách.',
    story: 'Miếng trầu têm khéo hình cánh phượng vừa cay nồng vừa đượm thắm, luôn xuất hiện trong lễ cưới hỏi, giỗ chạp và hội làng ở vùng đồng bằng Bắc Bộ.',
    dos: [
      'Nhận miếng trầu bằng hai tay kèm lời cảm ơn khi được các cụ mời trầu.',
      'Hiểu ý nghĩa biểu tượng của trầu cau trong văn hóa cưới hỏi Việt Nam.'
    ],
    donts: [
      'Không từ chối trầu cau một cách khiếm nhã trong các nghi lễ cưới hỏi truyền thống.'
    ],
    proverb: 'Miếng trầu là đầu câu chuyện.',
    quiz: {
      question: 'Trong văn hóa dân gian Việt Nam, "Miếng trầu" mang ý nghĩa khởi đầu cho điều gì?',
      options: ['Khởi đầu bữa tiệc rượu', 'Khởi đầu cuộc trò chuyện và kết giao tình cảm', 'Khởi đầu buổi chợ sớm', 'Khởi đầu mùa gặt lúa'],
      answerIndex: 1,
      explanation: 'Miếng trầu giúp người ta mở đầu câu chuyện thân tình, phá tan khoảng cách ban đầu.'
    }
  },
  {
    id: 'c4',
    title: 'Phong bao lì xì đỏ ngày Tết Nguyên Đán',
    category: 'holiday',
    categoryLabel: 'Lễ hội & Tết',
    icon: '🧧',
    summary: 'Mừng tuổi đầu năm trao gửi may mắn, bình an và lời chúc hanh thông.',
    story: 'Sáng mùng một Tết, sau khi thắp hương gia tiên, Cu Tít diện áo the khăn xếp chúc thọ ông bà sống lâu trăm tuổi. Ông bà mỉm cười trao cho Cu Tít chiếc bao lì xì đỏ thắm lấy may mắn.',
    dos: [
      'Nói lời chúc mừng năm mới tốt lành trước khi đón nhận bao lì xì.',
      'Cầm bao lì xì bằng cả hai tay và nói lời cảm ơn.',
      'Lì xì cho trẻ nhỏ và người già để mừng tuổi, cầu may mắn.'
    ],
    donts: [
      'Tuyệt đối không bóc phong bao lì xì xem số tiền ngay trước mặt người tặng.',
      'Không so sánh tiền lì xì ít hay nhiều trước mặt khách.'
    ],
    proverb: 'Mồng một Tết cha, mồng hai Tết mẹ, mồng ba Tết thầy.',
    quiz: {
      question: 'Khi nhận phong bao lì xì ngày Tết, hành động nào là bất lịch sự?',
      options: ['Nhận bằng hai tay', 'Nói lời chúc mừng năm mới', 'Bóc bao lì xì xem tiền ngay trước mặt người tặng', 'Cất cẩn thận vào túi áo'],
      answerIndex: 2,
      explanation: 'Bóc bao lì xì ngay tại chỗ bị xem là vụ lợi, làm mất đi ý nghĩa mừng may mắn tốt đẹp.'
    }
  },
  {
    id: 'c5',
    title: 'Văn hóa trả giá (mặc cả) duyên dáng ở chợ quê',
    category: 'custom',
    categoryLabel: 'Phong tục dân gian',
    icon: '🧺',
    summary: 'Giao thương chợ truyền thống mang tính giao lưu tình cảm, vui vẻ đôi bên.',
    story: 'Đi chợ quê không chỉ để mua đồ mà còn để thăm hỏi bà con xóm giềng. Người mua thường khen mớ rau tươi rồi xin cô bán hàng bớt cho chút đỉnh lấy lộc: "Cô bớt cho cháu năm nghìn uống nước mía nhé!".',
    dos: [
      'Trả giá với thái độ vui vẻ, lịch sự và tôn trọng người bán.',
      'Mua nhiều món hoặc mua mở hàng lúc người bán đã đón khách trưa/chiều.'
    ],
    donts: [
      'Tránh trả giá kỳ kèo quá gắt gao với người mở hàng sáng sớm (khách mở hàng).',
      'Nếu chưa thực sự muốn mua thì đừng nâng lên đặt xuống nhiều lần vào sáng sớm.'
    ],
    proverb: 'Thuận mua vừa bán, mười vạn vừa lòng.',
    quiz: {
      question: 'Tại sao người Việt thường tránh mặc cả kỳ kèo với người bán vào sáng sớm?',
      options: ['Vì sáng sớm chợ chưa mở cửa', 'Vì quan niệm người mở hàng quyết định vận may cả ngày của người bán', 'Vì đồ sáng sớm đắt hơn', 'Vì người bán chưa có tiền lẻ'],
      answerIndex: 1,
      explanation: 'Người bán hàng rất kiêng kỵ khách mở hàng đầu ngày trả giá khó khăn làm mất vía buôn bán.'
    }
  },
  {
    id: 'c6',
    title: 'Cởi giày dép trước khi bước vào nhà',
    category: 'communication',
    categoryLabel: 'Giao tiếp & Ứng xử',
    icon: '👞',
    summary: 'Giữ gìn không gian sống sạch sẽ và bày tỏ lòng tôn trọng chủ nhà.',
    story: 'Nhà người Việt thường lau sạch bóng sàn gạch hoặc sàn gỗ, là nơi trẻ con lăn lê chơi đùa và cả nhà quây quần ngồi ăn cơm. Bởi vậy trước thềm nhà luôn có bậc thềm để giày dép.',
    dos: [
      'Cởi giày dép đặt ngay ngắn ở bậc cửa hoặc trên giá giày trước khi bước vào.',
      'Hỏi chủ nhà xem có dép đi trong nhà không.'
    ],
    donts: [
      'Không bao giờ đi giày dép dính bụi đất thẳng vào phòng khách.',
      'Không để giày dép lộn xộn chắn ngang lối đi chính.'
    ],
    proverb: 'Nhà sạch thì mát, bát sạch ngon cơm.',
    quiz: {
      question: 'Khi đến thăm nhà người Việt Nam, điều đầu tiên cần làm tại cửa là gì?',
      options: ['Gõ cửa ba lần thật to', 'Cởi giày dép và xếp gọn gàng ở bậc cửa', 'Bước thẳng vào phòng khách', 'Tìm chỗ ngồi ngay lập tức'],
      answerIndex: 1,
      explanation: 'Cởi giày dép ở cửa giúp giữ nhà cửa tinh tươm và thể hiện sự tôn trọng không gian gia chủ.'
    }
  },
  {
    id: 'c7',
    title: 'Cà phê vỉa hè và thói quen trò chuyện',
    category: 'cuisine',
    categoryLabel: 'Văn hóa ẩm thực',
    icon: '☕',
    summary: 'Ngồi ghế nhựa thấp ven đường ngắm phố xá, đàm đạo chuyện đời.',
    story: 'Từ Cà phê sữa đá Sài Gòn ngọt ngào đến Cà phê trứng Hà Nội béo ngậy, những quán cóc ven đường với chiếc ghế đẩu con là nơi nhịp sống Việt Nam thể hiện chân thực và gần gũi nhất.',
    dos: [
      'Thử gọi "Cà phê đen đá" hoặc "Cà phê sữa đá" theo đúng phong vị người Việt.',
      'Thưởng thức chậm rãi bên ly trà đá kèm theo.'
    ],
    donts: [
      'Đừng vội vã giục giã khi ly cà phê phin đang nhỏ từng giọt chậm rãi.'
    ],
    proverb: 'Vô tửu bất thành lễ, trà dư tửu hậu.',
    quiz: {
      question: 'Thức uống đi kèm miễn phí phổ biến nhất tại các quán cà phê Việt Nam là gì?',
      options: ['Nước khoáng có ga', 'Trà đá (hoặc trà nóng)', 'Nước dừa', 'Nước cam'],
      answerIndex: 1,
      explanation: 'Trà đá luôn là người bạn đồng hành thân thuộc miễn phí tại hầu hết các quán cà phê Việt.'
    }
  },
  {
    id: 'c8',
    title: 'Bánh chưng xanh ngày Tết và sự tích vuông tròn',
    category: 'holiday',
    categoryLabel: 'Lễ hội & Tết',
    icon: '🎋',
    summary: 'Biểu tượng của Đất Mẹ hiền hòa, hạt gạo nuôi sống bao đời người dân Việt.',
    story: 'Theo truyền thuyết hoàng tử Lang Liêu thời Hùng Vương, bánh chưng vuông tượng trưng cho Đất, gói bằng lá dong xanh, đỗ xanh và thịt mỡ, nhắc nhở con cháu về công ơn cội nguồn nông nghiệp.',
    dos: [
      'Cùng gia đình thức thâu đêm canh nồi bánh chưng đỏ lửa để cảm nhận trọn vẹn không khí Tết.',
      'Dùng lạt tre tước mỏng để cắt bánh chưng thành 8 miếng đều tăm tắp.'
    ],
    donts: [
      'Tránh dùng dao sắt cùn ấn nát bánh khi cắt.'
    ],
    proverb: 'Thịt mỡ dưa hành câu đối đỏ - Cây nêu tràng pháo bánh chưng xanh.',
    quiz: {
      question: 'Theo sự tích dân gian, chiếc Bánh Chưng hình vuông tượng trưng cho điều gì?',
      options: ['Bầu trời bao la', 'Mặt đất màu mỡ', 'Mặt trăng rằm', 'Ngôi nhà ấm cúng'],
      answerIndex: 1,
      explanation: 'Bánh chưng vuông tượng trưng cho Đất, bánh giầy tròn tượng trưng cho Trời.'
    }
  },
  {
    id: 'c9',
    title: 'Cách cầm chén trà và nghệ thuật thưởng trà',
    category: 'cuisine',
    categoryLabel: 'Văn hóa ẩm thực',
    icon: '🍵',
    summary: 'Nâng chén trà bằng hai tay thể hiện sự cung kính và tao nhã.',
    story: 'Khi mời trà các bậc tiền bối, chén trà hạt mít được dâng bằng hai tay: ngón trỏ đỡ đáy chén, ngón cái giữ miệng chén (gọi là thế Tam long giá ngọc), làn khói hương sen ngào ngạt lan tỏa.',
    dos: [
      'Dâng chén trà cho người lớn tuổi bằng hai tay.',
      'Nhấp ngụm nhỏ, giữ lại nơi đầu lưỡi để cảm nhận vị chát ngọt hậu vị.'
    ],
    donts: [
      'Không uống một hơi ừng ực cạn chén như uống nước lã.'
    ],
    proverb: 'Nhất nước, nhì trà, tam bôi, tứ ấm.',
    quiz: {
      question: 'Động tác chuẩn mực khi trao và nhận chén trà nóng với người lớn tuổi là gì?',
      options: ['Dùng một tay đưa nhanh', 'Dâng và đón nhận bằng cả hai tay', 'Đặt lên bàn đẩy sang', 'Cầm một ngón tay'],
      answerIndex: 1,
      explanation: 'Dùng hai tay thể hiện lòng thành kính và sự cẩn trọng đối với người đối diện.'
    }
  },
  {
    id: 'c10',
    title: 'Tục xông đất đầu năm cầu may mắn',
    category: 'holiday',
    categoryLabel: 'Lễ hội & Tết',
    icon: '🚪',
    summary: 'Người đầu tiên bước vào nhà sau giao thừa mang lại vận khí cho cả năm.',
    story: 'Sau khoảnh khắc giao thừa thiêng liêng, gia chủ thường nhờ một người hợp tuổi, tính tình xởi lởi, vui vẻ, làm ăn phát đạt đến bước chân đầu tiên qua ngưỡng cửa để xông đất.',
    dos: [
      'Chọn người có tính cách hào sảng, đức độ để xông đất.',
      'Chuẩn bị bao lì xì và lời chúc may mắn gửi gia chủ khi xông đất.'
    ],
    donts: [
      'Những người đang có tang chế trong năm nên kiêng đi xông đất nhà khác vào sáng mùng một.'
    ],
    proverb: 'Đầu năm mua muối, cuối năm mua vôi.',
    quiz: {
      question: 'Người xông đất ngày Tết thường được gia chủ lựa chọn dựa trên tiêu chí nào?',
      options: ['Người giàu nhất xóm', 'Người hợp tuổi, vui vẻ, đạo đức tốt và làm ăn phát đạt', 'Người chạy nhanh nhất', 'Người ở xa nhất'],
      answerIndex: 1,
      explanation: 'Người hợp tuổi và tính tình xởi lởi được tin rằng sẽ đem lại vượng khí tốt lành cho gia đình.'
    }
  },
  {
    id: 'c11',
    title: 'Chào hỏi bằng đại từ xưng hô thân mật',
    category: 'communication',
    categoryLabel: 'Giao tiếp & Ứng xử',
    icon: '👥',
    summary: 'Hệ thống xưng hô coi cả xã hội như một đại gia đình đầm ấm.',
    story: 'Người Việt ít khi dùng "Tôi - Bạn" trong đời thường mà gọi nhau là "Bác - Cháu", "Cô - Em", "Anh - Em". Cách xưng hô này kéo gần khoảng cách, khiến mọi người đối đãi với nhau như người nhà.',
    dos: [
      'Quan sát độ tuổi để xưng hô nhã nhặn: người trạc tuổi bố mẹ thì gọi "cô, chú, bác".',
      'Xưng "em" khi nói chuyện với người lớn tuổi hơn mình một chút.'
    ],
    donts: [
      'Tránh xưng "mày - tao" nơi công cộng vì thể hiện sự thô lỗ, thiếu tôn trọng.'
    ],
    proverb: 'Học ăn, học nói, học gói, học mở.',
    quiz: {
      question: 'Khi nói chuyện với một người phụ nữ trạc tuổi mẹ mình, bạn nên xưng hô thế nào?',
      options: ['Tôi - Bà', 'Cháu - Cô (hoặc Bác)', 'Em - Chị', 'Bạn - Tôi'],
      answerIndex: 1,
      explanation: 'Xưng "Cháu" và gọi "Cô/Bác" thể hiện đúng trật tự tuổi tác và tình cảm tôn kính trong xã hội.'
    }
  },
  {
    id: 'c12',
    title: 'Tục ngữ "Đầu năm mua muối, cuối năm mua vôi"',
    category: 'custom',
    categoryLabel: 'Phong tục dân gian',
    icon: '🧂',
    summary: 'Mua muối đầu năm cầu sự mặn mà, gắn kết tình cảm gia đình và xua đuổi tà khí.',
    story: 'Vào sáng mùng một Tết, các gánh muối rong khắp phố làng. Người Việt hân hoan mua một bát muối đầy có ngọn về đặt trang trọng trên bàn thờ để cả năm tình cảm gia đình đậm đà, thắm thiết.',
    dos: [
      'Mua một gói muối nhỏ có gắn nơ đỏ vào đầu xuân lấy may.',
      'Đong bát muối đầy có ngọn, không gạt bằng miệng bát.'
    ],
    donts: [
      'Không trả giá kỳ kèo khi mua muối đầu năm.'
    ],
    proverb: 'Đầu năm mua muối, cuối năm mua vôi.',
    quiz: {
      question: 'Ý nghĩa của việc mua muối vào những ngày đầu năm mới là gì?',
      options: ['Để tích trữ thực phẩm', 'Cầu tình cảm gia đình đậm đà, may mắn và xua đuổi điều xui', 'Để làm gia vị nấu bánh chưng', 'Để làm quà tặng hàng xóm'],
      answerIndex: 1,
      explanation: 'Muối mặn tượng trưng cho sự gắn kết son sắt, đượm thắm tình cảm gia đình và tẩy uế đầu năm.'
    }
  },
  {
    id: 'c13',
    title: 'Văn hóa xe máy và nhịp sống đường phố',
    category: 'custom',
    categoryLabel: 'Phong tục dân gian',
    icon: '🛵',
    summary: 'Phương tiện huyết mạch tạo nên bản sắc năng động của đô thị Việt Nam.',
    story: 'Tiếng còi xe máy rộn rã, những dòng xe uốn lượn nhịp nhàng như dòng nước trên các ngả đường Hà Nội, TP.HCM tạo nên một bức tranh sinh hoạt đường phố sống động không nơi nào có được.',
    dos: [
      'Luôn đội mũ bảo hiểm đạt chuẩn khi ngồi trên xe máy.',
      'Bấm còi nhẹ nhàng khi đi qua các khúc cua khuất tầm nhìn trong ngõ hẻm.'
    ],
    donts: [
      'Không phóng nhanh, lạng lách hoặc sử dụng điện thoại khi đang lái xe.'
    ],
    proverb: 'Đi thưa về trình, an toàn là bạn.',
    quiz: {
      question: 'Quy định bắt buộc đối với mọi người khi tham gia giao thông bằng xe máy ở Việt Nam là gì?',
      options: ['Phải mặc áo mưa', 'Phải đội mũ bảo hiểm', 'Phải đeo kính râm', 'Phải đi giày thể thao'],
      answerIndex: 1,
      explanation: 'Đội mũ bảo hiểm là quy định pháp luật bắt buộc và bảo vệ an toàn tính mạng cho người đi xe.'
    }
  },
  {
    id: 'c14',
    title: 'Áo dài truyền thống - Quốc phục thanh lịch',
    category: 'custom',
    categoryLabel: 'Phong tục dân gian',
    icon: '👘',
    summary: 'Tà áo dài thướt tha tôn vinh nét đẹp kín đáo, duyên dáng của người phụ nữ Việt.',
    story: 'Từ tà áo dài trắng tinh khôi của nữ sinh trung học đến chiếc áo dài gấm rực rỡ trong ngày cưới hay dịp lễ hội, chiếc áo dài ôm sát cơ thể với hai tà bay bay trong gió là niềm tự hào của văn hóa Việt.',
    dos: [
      'Mặc áo dài trong các dịp trang trọng: cưới hỏi, lễ Tết, hội nghị văn hóa.',
      'Bước đi nhẹ nhàng, giữ tà áo khi lên xuống xe hoặc bậc thang.'
    ],
    donts: [
      'Tránh chọn chất liệu quá mỏng hoặc tà áo quét đất gây mất thẩm mỹ.'
    ],
    proverb: 'Người đẹp vì lụa, lúa tốt vì phân.',
    quiz: {
      question: 'Áo dài truyền thống của phụ nữ Việt Nam thường được mặc kèm với trang phục nào bên dưới?',
      options: ['Váy ngắn xòe', 'Quần lụa dài chạm gót chân', 'Quần bò (jeans)', 'Quần lửng'],
      answerIndex: 1,
      explanation: 'Áo dài luôn được mặc kết hợp với quần lụa ống rộng dài chấm gót, tạo vẻ thướt tha uyển chuyển.'
    }
  },
  {
    id: 'c15',
    title: 'Bát nước chấm chung và nghệ thuật nêm nếm',
    category: 'cuisine',
    categoryLabel: 'Văn hóa ẩm thực',
    icon: '🥣',
    summary: 'Trung tâm kết nối tình cảm gia đình trên mâm cơm người Việt.',
    story: 'Dù mâm cơm có nhiều món đến đâu thì ở giữa mâm luôn luôn có một bát nước mắm tỏi ớt chua ngọt vàng óng. Bát nước chấm chung thể hiện tính cộng đồng, chia sẻ ngọt bùi của người Việt.',
    dos: [
      'Pha nước mắm cân bằng đủ vị: mặn của mắm, chua của chanh, ngọt của đường, cay của ớt.',
      'Chấm vừa phải, để ráo bớt nước chấm trước khi đưa vào bát cơm của mình.'
    ],
    donts: [
      'Không nhúng cả miếng thức ăn đang cắn dở vào bát nước chấm chung.'
    ],
    proverb: 'Khéo ăn thì no, khéo co thì ấm.',
    quiz: {
      question: 'Ý nghĩa văn hóa sâu sắc nhất của bát nước chấm đặt ở trung tâm mâm cơm người Việt là gì?',
      options: ['Để trang trí cho đẹp', 'Biểu hiện cho tinh thần cộng đồng và sự gắn kết sẻ chia', 'Để đỡ tốn bát đĩa', 'Để ăn nhanh hơn'],
      answerIndex: 1,
      explanation: 'Bát nước chấm chung kết nối mọi thành viên, thể hiện sự đồng điệu trong khẩu vị gia đình.'
    }
  },
  {
    id: 'c16',
    title: 'Tết Trung Thu - Lễ hội trăng rằm của trẻ thơ',
    category: 'holiday',
    categoryLabel: 'Lễ hội & Tết',
    icon: '🏮',
    summary: 'Đêm hội rước đèn ông sao, múa lân sư rồng và phá cỗ trông trăng.',
    story: 'Rằm tháng Tám âm lịch, dưới ánh trăng vằng vặc, tiếng trống lân tùng cắc vang dội khắp xóm. Bé Cu Tít cùng chúng bạn rước đèn lồng cá chép, đèn ông sao năm cánh rồi cùng nhau phá cỗ bánh nướng bánh dẻo ngọt lịm.',
    dos: [
      'Tặng bánh Trung thu cho người thân, thầy cô và đối tác để tri ân.',
      'Cùng trẻ nhỏ làm đèn lồng giấy và ngắm trăng rằm.'
    ],
    donts: [
      'Không xả rác bừa bãi sau các buổi rước đèn và xem múa lân.'
    ],
    proverb: 'Tết Trung thu rước đèn đi chơi, em rước đèn đi khắp phố phường.',
    quiz: {
      question: 'Hai loại bánh đặc trưng không thể thiếu trong mâm cỗ Tết Trung Thu là gì?',
      options: ['Bánh chưng và bánh giầy', 'Bánh nướng và bánh dẻo', 'Bánh bò và bánh tiêu', 'Bánh xèo và bánh khọt'],
      answerIndex: 1,
      explanation: 'Bánh nướng vàng ruộm và bánh dẻo trắng ngần là cặp bánh biểu tượng của Tết Trung Thu rằm tháng Tám.'
    }
  },
  {
    id: 'c17',
    title: 'Lễ Vu Lan báo hiếu - Bông hồng cài áo',
    category: 'holiday',
    categoryLabel: 'Lễ hội & Tết',
    icon: '🌹',
    summary: 'Ngày rằm tháng Bảy tri ân công ơn sinh thành dưỡng dục của cha mẹ.',
    story: 'Vào ngày lễ Vu Lan, đến chùa ai còn mẹ sẽ được cài lên ngực bông hồng đỏ thắm, ai mất mẹ sẽ cài bông hồng trắng ngậm ngùi. Đó là dịp để mỗi người con tự nhắc nhở bổn phận hiếu kính.',
    dos: [
      'Thăm hỏi, chăm sóc cha mẹ và ông bà bằng những hành động thiết thực.',
      'Cài bông hoa hồng lên ngực áo để tưởng nhớ công ơn sinh thành.'
    ],
    donts: [
      'Tránh làm cha mẹ phiền lòng, buồn bã trong những ngày này.'
    ],
    proverb: 'Công cha như núi Thái Sơn - Nghĩa mẹ như nước trong nguồn chảy ra.',
    quiz: {
      question: 'Trong nghi thức Vu Lan báo hiếu, bông hoa hồng đỏ cài trên ngực áo mang ý nghĩa gì?',
      options: ['Người cài hoa đã thành đạt', 'Người cài hoa còn cha mẹ trên đời', 'Người cài hoa vừa lập gia đình', 'Người cài hoa là phật tử mới'],
      answerIndex: 1,
      explanation: 'Hoa hồng đỏ tượng trưng cho niềm hạnh phúc lớn lao khi còn cha mẹ bên cạnh.'
    }
  },
  {
    id: 'c18',
    title: 'Cây tre Việt Nam và tinh thần quật cường',
    category: 'custom',
    categoryLabel: 'Phong tục dân gian',
    icon: '🎋',
    summary: 'Biểu tượng xanh tươi che chở xóm làng, gắn bó keo sơn từ ngàn đời.',
    story: 'Lũy tre xanh bao bọc làng quê, thân tre dẻo dai làm nhà, đan rổ rá, làm đũa ăn, làm cần câu và làm vũ khí giữ nước thuở Thánh Gióng đánh giặc Ân.',
    dos: [
      'Trân trọng các sản phẩm thủ công mỹ nghệ đan lát từ tre trúc truyền thống.',
      'Hiểu hình tượng "Tre già măng mọc" tượng trưng cho sự tiếp nối thế hệ.'
    ],
    donts: [
      'Không chặt phá bừa bãi các rặng tre chắn sóng chắn gió ven làng.'
    ],
    proverb: 'Tre già măng mọc.',
    quiz: {
      question: 'Thành ngữ "Tre già măng mọc" thể hiện quy luật và giá trị tốt đẹp nào trong cuộc sống?',
      options: ['Tre dùng để xây nhà', 'Thế hệ sau kế thừa và phát triển nối tiếp thế hệ trước', 'Rừng tre mọc rất nhanh', 'Trồng tre lấy măng ăn'],
      answerIndex: 1,
      explanation: 'Tre già măng mọc tượng trưng cho sự tiếp nối truyền thống, thế hệ trẻ kế tục lớp người đi trước.'
    }
  },
  {
    id: 'c19',
    title: 'Trà đá vỉa hè - Nét văn hóa bình dân độc đáo',
    category: 'cuisine',
    categoryLabel: 'Văn hóa ẩm thực',
    icon: '🧊',
    summary: 'Cốc trà đá vài nghìn đồng xua tan cái nóng mùa hè nơi góc phố.',
    story: 'Chỉ cần một chiếc thùng xốp đựng đá, vài chiếc ghế nhựa con và bình trà hoa nhài là thành một quán trà đá vỉa hè. Mọi tầng lớp từ bác xe ôm, sinh viên đến nhân viên công sở đều ngồi chung thưởng thức rôm rả.',
    dos: [
      'Ghé quán trà đá nghỉ chân trò chuyện thân thiện với người xung quanh.',
      'Gọi thêm chiếc kẹo lạc hoặc kẹo dồi giòn tan ăn kèm.'
    ],
    donts: [
      'Không ngồi chiếm dụng lấn chiếm lòng lề đường giao thông.'
    ],
    proverb: 'Trà dư tửu hậu, ấm áp nghĩa tình.',
    quiz: {
      question: 'Món quà quê nào thường được ăn kèm hoàn hảo nhất với một cốc trà đá vỉa hè?',
      options: ['Kẹo cao su', 'Kẹo lạc (kẹo đậu phộng) giòn tan', 'Bánh kem', 'Bánh quy bơ'],
      answerIndex: 1,
      explanation: 'Kẹo lạc ngọt bùi hòa quyện cùng vị chát thanh mát của trà đá là combo kinh điển của vỉa hè Việt.'
    }
  },
  {
    id: 'c20',
    title: 'Tinh thần tương thân tương ái "Lá lành đùm lá rách"',
    category: 'communication',
    categoryLabel: 'Giao tiếp & Ứng xử',
    icon: '🤝',
    summary: 'Truyền thống đùm bọc, sẻ chia lúc gian khó của dân tộc Việt Nam.',
    story: 'Mỗi khi miền Trung bão lũ hay có hoàn cảnh hoạn nạn, từ trẻ nhỏ đập heo đất đến các cụ già gom từng chiếc bánh chưng, bao gạo gửi vào vùng khó khăn. Tình người ấm áp luôn tỏa sáng trong giông bão.',
    dos: [
      'Sẵn lòng giúp đỡ người gặp hoàn cảnh khó khăn hơn mình.',
      'Trao quà cứu trợ với thái độ trân trọng, khiêm nhường: "Của cho không bằng cách cho".'
    ],
    donts: [
      'Không khoe khoang làm từ thiện để trục lợi hình ảnh cá nhân.'
    ],
    proverb: 'Lá lành đùm lá rách, lá rách đùm lá rách hơn.',
    quiz: {
      question: 'Câu tục ngữ nào sau đây thể hiện sâu sắc nhất tinh thần đoàn kết, giúp đỡ lẫn nhau của người Việt?',
      options: ['Nước chảy đá mòn', 'Lá lành đùm lá rách', 'Có công mài sắt có ngày nên kim', 'Đi một ngày đàng học một sàng khôn'],
      answerIndex: 1,
      explanation: 'Lá lành đùm lá rách ca ngợi tình yêu thương đồng bào, san sẻ giúp đỡ nhau trong gian khó.'
    }
  }
];
