export interface RoleplayChoice {
  id: string;
  text: string;
  englishMeaning: string;
  honorificScore: number; // 0 - 100 (A6)
  naturalScore: number;   // 0 - 100 (A7)
  syntaxScore: number;    // 0 - 100 (A8)
  feedback: string;
  npcResponse: string;
  nextStepId?: string;
  isCompleted?: boolean;
}

export interface RoleplayStep {
  id: string;
  npcPrompt: string;
  npcAudioPrompt?: string;
  hint: string;
  objective: string;
  choices: RoleplayChoice[];
}

export interface RoleplayScenarioItem {
  id: string;
  title: string;
  subtitle: string;
  location: string;
  dialect: 'north' | 'central' | 'south';
  themeColor: string;
  npcName: string;
  npcRole: string;
  npcAvatar: string;
  culturalBadge: string;
  description: string;
  targetTasks: string[];
  steps: RoleplayStep[];
}

export const ROLEPLAY_SCENARIOS_4: RoleplayScenarioItem[] = [
  {
    id: 'market_ben_tre',
    title: 'Trả Giá Trái Cây Miệt Vườn',
    subtitle: 'Chợ Nổi Cái Bè / Chợ Quê Bến Tre',
    location: 'Bến Tre, Miền Tây Nam Bộ',
    dialect: 'south',
    themeColor: '#10b981',
    npcName: 'Bà Ba Trái Cây',
    npcRole: 'Tiểu thương miền Tây hào sảng, chất phác',
    npcAvatar: '🧺',
    culturalBadge: 'Hào Sảng Miệt Vườn 🥭',
    description: 'Thực hành xưng hô "Con - Dì Ba", dùng từ ngữ Nam Bộ (nhiêu, bọc, ngon bá phát) và trả giá khéo léo mà không làm mất lòng.',
    targetTasks: [
      'Chào hỏi lễ phép bằng "Dạ thưa Dì Ba"',
      'Hỏi giá bằng từ phương ngữ Nam Bộ ("Nhiêu một ký")',
      'Mặc cả lịch thiệp và chốt mua 2 ký chôm chôm'
    ],
    steps: [
      {
        id: 'step_1',
        npcPrompt: 'Hê lô con! Lại lựa trái cây đi con ơi, bữa nay dì mới bẻ được mớ chôm chôm nhãn ngọt ngay bon nè!',
        npcAudioPrompt: 'Hê lô con, lại lựa trái cây đi con ơi, bữa nay dì mới bẻ được mớ chôm chôm nhãn ngọt ngay bon nè',
        hint: 'Chào người lớn tuổi bán hàng bằng từ "Dạ" và xưng "Con - Dì".',
        objective: 'Mở lời chào hỏi chuẩn mực',
        choices: [
          {
            id: 'c1_1',
            text: 'Dạ con chào Dì Ba! Chôm chôm bữa nay nhìn tươi quá dì ha!',
            englishMeaning: 'Hello Aunt Ba! The rambutan looks very fresh today!',
            honorificScore: 98,
            naturalScore: 95,
            syntaxScore: 95,
            feedback: 'Rất mực chuẩn chỉnh! Có từ "Dạ", xưng "Dì - Con" và dùng trợ từ Nam Bộ "ha".',
            npcResponse: 'Đúng rồi con! Cây nhà lá vườn dì hái hồi sớm mai đó, ngọt lịm như đường phèn luôn!',
            nextStepId: 'step_2'
          },
          {
            id: 'c1_2',
            text: 'Bà ơi, bán cho tôi ít chôm chôm xem nào.',
            englishMeaning: 'Old lady, sell me some rambutan let me see.',
            honorificScore: 45,
            naturalScore: 40,
            syntaxScore: 80,
            feedback: 'Xưng "Tôi - Bà" ở chợ miền Tây nghe rất xa cách và thiếu sự thân tình lễ phép.',
            npcResponse: 'Ủa cậu em từ đâu tới mà ăn nói kiểu lạ hoắc vậy nè? Thôi coi đi rồi dì tính giá cho.',
            nextStepId: 'step_2'
          },
          {
            id: 'c1_3',
            text: 'Dạ, chôm chôm này bao nhiêu tiền một cân vậy ạ?',
            englishMeaning: 'Excuse me, how much is one kilogram of rambutan?',
            honorificScore: 90,
            naturalScore: 65,
            syntaxScore: 90,
            feedback: 'Lễ phép tốt nhưng dùng từ "cân" là từ ngữ miền Bắc, ở miền Nam nên dùng từ "ký".',
            npcResponse: 'Dì bán theo ký nha con ơi! Bốn chục ngàn một ký, ăn thử trái đi dì bóc cho nè!',
            nextStepId: 'step_2'
          }
        ]
      },
      {
        id: 'step_2',
        npcPrompt: 'Nè ăn thử đi con! Thấy ngọt hông? Bốn chục ngàn một ký, con lấy mấy ký dì cân cho nghen?',
        npcAudioPrompt: 'Nè ăn thử đi con, thấy ngọt hông, bốn chục ngàn một ký, con lấy mấy ký dì cân cho nghen',
        hint: 'Khen ngon và khéo léo mặc cả giảm 5-10 ngàn nếu mua nhiều.',
        objective: 'Thương lượng giá cả khéo léo',
        choices: [
          {
            id: 'c2_1',
            text: 'Dạ ngọt thiệt đó dì! Dì bớt cho con ba mươi lăm ngàn một ký, con lấy hai ký nhen dì Ba?',
            englishMeaning: 'It is truly sweet Aunt! Can you discount to 35k/kg, I will take 2kg please?',
            honorificScore: 95,
            naturalScore: 98,
            syntaxScore: 95,
            feedback: 'Tuyệt đỉnh! Dùng từ "thiệt", "nhen" đúng phong vị miền Tây, mặc cả rất có duyên.',
            npcResponse: 'Trời đất ơi khéo miệng ghê chưa! Thôi được rồi, mở hàng cho con dì bớt luôn đó!',
            nextStepId: 'step_3'
          },
          {
            id: 'c2_2',
            text: 'Đắt quá bà ơi, chỗ khác bán có hai mươi ngàn thôi à!',
            englishMeaning: 'Too expensive! Other places only sell for 20k!',
            honorificScore: 35,
            naturalScore: 30,
            syntaxScore: 70,
            feedback: 'Cách chê gay gắt dễ làm phật lòng người bán hàng miền quê.',
            npcResponse: 'Đâu có đâu con, chôm chôm nhãn loại một mà so với hàng dạt ngoài chợ đầu mối sao được!',
            nextStepId: 'step_3'
          },
          {
            id: 'c2_3',
            text: 'Dạ con thấy cũng ngon, dì có giảm giá chút xíu không ạ?',
            englishMeaning: 'I think it is delicious too, could you discount a little bit?',
            honorificScore: 85,
            naturalScore: 75,
            syntaxScore: 90,
            feedback: 'Câu nói lịch sự, nhưng sẽ duyên hơn nếu nêu rõ số lượng dự định mua.',
            npcResponse: 'Lấy hai ký đi rồi dì bớt cho năm ngàn một ký làm quen nha!',
            nextStepId: 'step_3'
          }
        ]
      },
      {
        id: 'step_3',
        npcPrompt: 'Rồi, dì cân dư cho con luôn nè, hai ký đúng boong bảy chục ngàn. Con gửi tiền mặt hay chuyển khoản nè?',
        npcAudioPrompt: 'Rồi dì cân dư cho con luôn nè, hai ký đúng boong bảy chục ngàn, con gửi tiền mặt hay chuyển khoản nè',
        hint: 'Cảm ơn và đưa tiền bằng hai tay kèm kính ngữ "Dạ con gửi dì tiền ạ".',
        objective: 'Hoàn tất giao dịch lễ phép',
        choices: [
          {
            id: 'c3_1',
            text: 'Dạ con gửi dì tiền mặt ạ. Con cảm ơn Dì Ba nhiều nghen, chúc dì đắt hàng!',
            englishMeaning: 'I send you cash Auntie. Thank you very much Aunt Ba, wish you good sales!',
            honorificScore: 100,
            naturalScore: 98,
            syntaxScore: 100,
            feedback: 'Hoàn hảo tuyệt đối! Đầy đủ kính ngữ đầu cuối và lời chúc đắt hàng ấm lòng.',
            npcResponse: 'Cảm ơn con nhiều nha! Mai mốt có thèm trái cây nhớ ghé sạp Dì Ba ủng hộ tiếp nghen con!',
            isCompleted: true
          },
          {
            id: 'c3_2',
            text: 'Đây tiền đây, lấy đi.',
            englishMeaning: 'Here is the money, take it.',
            honorificScore: 20,
            naturalScore: 20,
            syntaxScore: 60,
            feedback: 'Nói cộc lốc, không có từ xưng hô tôn kính với bậc trưởng bối.',
            npcResponse: 'Dạ... cảm ơn cậu...',
            isCompleted: true
          },
          {
            id: 'c3_3',
            text: 'Dạ con gửi dì bảy mươi ngàn. Chôm chôm ngon con sẽ quay lại ạ.',
            englishMeaning: 'I send you 70k. If rambutan is good I will come back.',
            honorificScore: 90,
            naturalScore: 85,
            syntaxScore: 92,
            feedback: 'Rất tốt và lịch thiệp.',
            npcResponse: 'Cảm ơn con, đi đường bình an nha con!',
            isCompleted: true
          }
        ]
      }
    ]
  },
  {
    id: 'hanoi_pho_shop',
    title: 'Gọi Món Ở Quán Phở Phố Cổ',
    subtitle: 'Quán Phở Gia Truyền Bát Đàn / Hàng Đồng',
    location: 'Hoàn Kiếm, Hà Nội',
    dialect: 'north',
    themeColor: '#e56c5e',
    npcName: 'Bác Chủ Quán Phở',
    npcRole: 'Chủ quán phở lâu năm, yêu cầu nếp gọi món chuẩn chỉ',
    npcAvatar: '🍜',
    culturalBadge: 'Hương Vị Phố Cổ 🥢',
    description: 'Thực hành gọi phở truyền thống (tái, nạm, gầu, nước béo, quẩy), xưng hô "Cháu - Bác" chuẩn lễ nghi đất Tràng An.',
    targetTasks: [
      'Chào hỏi xưng hô "Dạ thưa Bác"',
      'Gọi một bát phở cụ thể (Ví dụ: phở bò tái lăn nhiều hành)',
      'Hỏi gọi thêm quẩy giòn và trà đá'
    ],
    steps: [
      {
        id: 'step_1',
        npcPrompt: 'Mời cháu vào trong nhà ngồi! Hôm nay cháu dùng phở tái, chín, nạm hay sốt vang nào?',
        npcAudioPrompt: 'Mời cháu vào trong nhà ngồi, hôm nay cháu dùng phở tái, chín, nạm hay sốt vang nào',
        hint: 'Chào bác chủ quán và gọi món với từ thưa gửi "Dạ".',
        objective: 'Chào hỏi và chọn món phở chính',
        choices: [
          {
            id: 'c1_1',
            text: 'Dạ thưa Bác, cho cháu một bát phở bò tái chín, nhiều hành tây và ít nước béo ạ!',
            englishMeaning: 'Yes Uncle, please give me one bowl of half-done & well-done beef pho, extra onions and less fat broth please!',
            honorificScore: 100,
            naturalScore: 96,
            syntaxScore: 98,
            feedback: 'Chuẩn mực văn hóa người Hà Nội! Đủ dạ thưa, xưng hô Bác - Cháu và cách gọi phở sành ăn.',
            npcResponse: 'Được rồi cháu! Bát tái chín nhiều hành ít béo có ngay đây.',
            nextStepId: 'step_2'
          },
          {
            id: 'c1_2',
            text: 'Cho một bát phở bò nhanh lên nhé.',
            englishMeaning: 'Give me a beef pho fast please.',
            honorificScore: 30,
            naturalScore: 35,
            syntaxScore: 70,
            feedback: 'Ra lệnh cho người lớn tuổi ở quán phố cổ là điều kiêng kỵ trong giao tiếp.',
            npcResponse: 'Cháu cứ bình tĩnh, phở trần nóng từng bát một chứ không làm ẩu được đâu.',
            nextStepId: 'step_2'
          },
          {
            id: 'c1_3',
            text: 'Dạ bác ơi, ở đây có phở gà không ạ?',
            englishMeaning: 'Excuse me uncle, do you have chicken pho here?',
            honorificScore: 85,
            naturalScore: 70,
            syntaxScore: 90,
            feedback: 'Lễ phép tốt, nhưng đây là quán phở bò gia truyền chuyên nghiệp.',
            npcResponse: 'Nhà bác chỉ chuyên phở bò thôi cháu ạ! Thử bát tái nạm đảm bảo mê liền.',
            nextStepId: 'step_2'
          }
        ]
      },
      {
        id: 'step_2',
        npcPrompt: 'Phở của cháu đây, nước dùng đang sôi bốc khói nhé. Cháu có ăn thêm quẩy giòn hay uống trà đá không?',
        npcAudioPrompt: 'Phở của cháu đây, nước dùng đang sôi bốc khói nhé, cháu có ăn thêm quẩy giòn hay uống trà đá không',
        hint: 'Gọi thêm đĩa quẩy và cốc trà đá thanh mát kèm kính ngữ.',
        objective: 'Gọi đồ ăn kèm và thức uống',
        choices: [
          {
            id: 'c2_1',
            text: 'Dạ bác cho cháu xin thêm một đĩa quẩy giòn với một cốc trà đá nữa ạ!',
            englishMeaning: 'Yes Uncle, please give me a plate of crispy fried dough sticks and an iced tea please!',
            honorificScore: 98,
            naturalScore: 96,
            syntaxScore: 95,
            feedback: 'Cách gọi món cực kỳ tự nhiên và lịch thiệp với từ "cho cháu xin thêm".',
            npcResponse: 'Có ngay cháu ơi, quẩy mới rán giòn tan nhé!',
            isCompleted: true
          },
          {
            id: 'c2_2',
            text: 'Không cần đâu, mang ớt với chanh ra đây.',
            englishMeaning: 'No need, bring chili and lime here.',
            honorificScore: 30,
            naturalScore: 30,
            syntaxScore: 70,
            feedback: 'Lời nói thiếu kính từ và ớt chanh vốn đã có sẵn trên bàn.',
            npcResponse: 'Chanh ớt ở ngay trong khay gia vị trước mặt cháu đấy.',
            isCompleted: true
          },
          {
            id: 'c2_3',
            text: 'Dạ cháu chỉ xin thêm cốc nước lọc thôi ạ, cháu cảm ơn bác!',
            englishMeaning: 'Yes I only ask for a glass of water please, thank you uncle!',
            honorificScore: 92,
            naturalScore: 88,
            syntaxScore: 92,
            feedback: 'Lễ phép, ngắn gọn và nhã nhặn.',
            npcResponse: 'Ừ, nước lọc ở bình bên cạnh, để bác rót cho cháu cốc nhé.',
            isCompleted: true
          }
        ]
      }
    ]
  },
  {
    id: 'taxi_directions',
    title: 'Bắt Taxi & Chỉ Đường Ngõ Xóm',
    subtitle: 'Chuyến xe trên đường phố tấp nập',
    location: 'Quận 1, TP. Hồ Chí Minh',
    dialect: 'south',
    themeColor: '#0284c7',
    npcName: 'Anh Tài Xế Công Nghệ',
    npcRole: 'Tài xế xe hơi vui tính, nhiệt tình chỉ đường',
    npcAvatar: '🚕',
    culturalBadge: 'Bác Tài Năng Động 🛣️',
    description: 'Thực hành xưng hô ngang hàng/lớn hơn nhẹ "Em - Anh tài", chỉ hướng quẹo trái/quẹo phải và hỏi cước phí.',
    targetTasks: [
      'Xác nhận điểm đến bằng cách xưng hô "Anh tài / Anh ơi"',
      'Chỉ đường rẽ: "Tới ngã tư phía trước anh quẹo phải giùm em"',
      'Cảm ơn và thanh toán tiền xe'
    ],
    steps: [
      {
        id: 'step_1',
        npcPrompt: 'Chào bạn! Bạn có phải là người đặt chuyến xe đi về hướng Nhà thờ Đức Bà không ạ?',
        npcAudioPrompt: 'Chào bạn, bạn có phải là người đặt chuyến xe đi về hướng Nhà thờ Đức Bà không ạ',
        hint: 'Xác nhận đúng chuyến xe và xưng hô thân mật lịch sự.',
        objective: 'Lên xe và xác nhận lộ trình',
        choices: [
          {
            id: 'c1_1',
            text: 'Dạ đúng rồi anh ơi! Phiền anh chở em qua đường Đồng Khởi trước nghen.',
            englishMeaning: 'Yes that is right brother! Please drive me past Dong Khoi street first please.',
            honorificScore: 95,
            naturalScore: 98,
            syntaxScore: 95,
            feedback: 'Rất tự nhiên và ấm áp! Dùng "Dạ đúng rồi anh ơi", "nghen".',
            npcResponse: 'Ok em luôn, thắt dây an toàn vô rồi mình xuất phát nhé!',
            nextStepId: 'step_2'
          },
          {
            id: 'c1_2',
            text: 'Phải, đi lẹ lên trễ giờ rồi đó tài xế!',
            englishMeaning: 'Right, drive fast we are late driver!',
            honorificScore: 35,
            naturalScore: 30,
            syntaxScore: 70,
            feedback: 'Giục giã cộc cằn tạo cảm giác không tôn trọng đối phương.',
            npcResponse: 'Dạ em sẽ cố gắng đi nhanh nhưng giờ cao điểm hơi kẹt xe nha anh.',
            nextStepId: 'step_2'
          },
          {
            id: 'c1_3',
            text: 'Dạ vâng, đúng chuyến của tôi rồi anh.',
            englishMeaning: 'Yes, it is my ride brother.',
            honorificScore: 80,
            naturalScore: 75,
            syntaxScore: 85,
            feedback: 'Xưng "Tôi - Anh" hơi trịnh trọng so với bối cảnh đi xe công nghệ.',
            npcResponse: 'Dạ mời anh lên xe ạ.',
            nextStepId: 'step_2'
          }
        ]
      },
      {
        id: 'step_2',
        npcPrompt: 'Tới gần đường Đồng Khởi rồi nè em, giờ mình quẹo vô ngõ nào để thả em xuống thuận tiện nhất ta?',
        npcAudioPrompt: 'Tới gần đường Đồng Khởi rồi nè em, giờ mình quẹo vô ngõ nào để thả em xuống thuận tiện nhất ta',
        hint: 'Chỉ hướng quẹo và điểm dừng đỗ thuận tiện.',
        objective: 'Hướng dẫn dừng đỗ xe an toàn',
        choices: [
          {
            id: 'c2_1',
            text: 'Dạ tới ngã tư phía trước anh quẹo phải, rồi cho em xuống ngay trước tiệm sách nhen anh!',
            englishMeaning: 'At the intersection ahead please turn right, then let me off right in front of the bookstore brother!',
            honorificScore: 98,
            naturalScore: 98,
            syntaxScore: 96,
            feedback: 'Chỉ đường rõ ràng, dùng từ "quẹo phải", "nhen anh" chuẩn Nam Bộ.',
            npcResponse: 'Dạ ok em, xe tấp lề ngay trước tiệm sách liền đây!',
            isCompleted: true
          },
          {
            id: 'c2_2',
            text: 'Dừng lại ở đây đi.',
            englishMeaning: 'Stop here.',
            honorificScore: 30,
            naturalScore: 30,
            syntaxScore: 60,
            feedback: 'Cần báo trước điểm dừng để tài xế kịp xi-nhan tấp lề an toàn.',
            npcResponse: 'Ở đây cấm dừng đỗ, em để anh lách lên tí nhé.',
            isCompleted: true
          },
          {
            id: 'c2_3',
            text: 'Dạ anh rẽ phải ở ngã tư rồi dừng lại giúp em với ạ.',
            englishMeaning: 'Please turn right at the intersection and stop for me please.',
            honorificScore: 90,
            naturalScore: 85,
            syntaxScore: 90,
            feedback: 'Rất lịch thiệp và chuẩn xác.',
            npcResponse: 'Dạ vâng em chuẩn bị đồ đạc sẵn nha.',
            isCompleted: true
          }
        ]
      }
    ]
  },
  {
    id: 'tet_family_gathering',
    title: 'Mâm Cỗ & Thưa Gửi Họ Hàng Ngày Tết',
    subtitle: 'Nghi thức chúc Tết gia tiên và họ hàng',
    location: 'Nam Định / Bắc Bộ',
    dialect: 'north',
    themeColor: '#f59e0b',
    npcName: 'Ông Nội',
    npcRole: 'Trưởng tộc tôn kính, coi trọng gia phong lễ nghĩa',
    npcAvatar: '👴',
    culturalBadge: 'Gia Phong Lễ Nghĩa 🧧',
    description: 'Thực hành chúc Tết mừng thọ Ông Nội, khoanh tay thưa gửi đúng tôn ti trật tự.',
    targetTasks: [
      'Khoanh tay cúi đầu và thưa gửi "Dạ cháu kính chào Ông Nội"',
      'Nói lời chúc mừng thọ sức khỏe dồi dào, phúc như đông hải',
      'Đón nhận phong bao lì xì bằng hai tay'
    ],
    steps: [
      {
        id: 'step_1',
        npcPrompt: 'Cháu ngoan của ông đã về đấy à! Cả năm đi làm đi học xa xôi, năm mới có khỏe không cháu?',
        npcAudioPrompt: 'Cháu ngoan của ông đã về đấy à, cả năm đi làm đi học xa xôi, năm mới có khỏe không cháu',
        hint: 'Khoanh tay cúi đầu chào Ông Nội với kính ngữ cao nhất (A6: Cặp H1 Cháu - Cụ/Ông).',
        objective: 'Thưa gửi đầu xuân với bậc cao niên',
        choices: [
          {
            id: 'c1_1',
            text: 'Dạ thưa Ông Nội, năm mới cháu kính chúc Ông sống lâu trăm tuổi, dồi dào sức khỏe, vạn sự như ý ạ!',
            englishMeaning: 'Dear Grandpa, for the new year I respectfully wish you live to 100 years, abundant health and all wishes fulfilled!',
            honorificScore: 100,
            naturalScore: 98,
            syntaxScore: 100,
            feedback: 'Tuyệt mỹ! Kính ngữ chuẩn mực tuyệt đối với từ "kính chúc", "dạ thưa", "ạ".',
            npcResponse: 'Tốt lắm cháu ngoan! Lời chúc của cháu làm ông vui cửa vui nhà quá.',
            nextStepId: 'step_2'
          },
          {
            id: 'c1_2',
            text: 'Chào ông, năm mới chúc ông nhiều tiền nhé!',
            englishMeaning: 'Hello grandpa, happy new year wish you lots of money!',
            honorificScore: 35,
            naturalScore: 30,
            syntaxScore: 60,
            feedback: 'Không nên chúc người già "nhiều tiền", mà nên chúc sức khỏe và trường thọ.',
            npcResponse: 'Ở tuổi ông thì sức khỏe và con cháu sum vầy mới là quý nhất cháu ơi.',
            nextStepId: 'step_2'
          },
          {
            id: 'c1_3',
            text: 'Dạ con chào ông, chúc ông năm mới bình an ạ.',
            englishMeaning: 'Yes I greet grandpa, wish grandpa a peaceful new year.',
            honorificScore: 85,
            naturalScore: 80,
            syntaxScore: 88,
            feedback: 'Người miền Bắc xưng "Cháu - Ông", xưng "Con - Ông" là thói quen của người miền Nam.',
            npcResponse: 'Ừ, ông cảm ơn cháu nhé, vào nhà ngồi uống chén trà ấm.',
            nextStepId: 'step_2'
          }
        ]
      },
      {
        id: 'step_2',
        npcPrompt: 'Đầu xuân năm mới, ông có phong bao lì xì đỏ chúc cháu học hành tấn tới, vạn sự hanh thông nè!',
        npcAudioPrompt: 'Đầu xuân năm mới ông có phong bao lì xì đỏ chúc cháu học hành tấn tới vạn sự hanh thông nè',
        hint: 'Nhận lì xì bằng cả hai tay và nói lời cảm ơn lễ phép.',
        objective: 'Nghi thức đón nhận lộc đầu năm',
        choices: [
          {
            id: 'c2_1',
            text: 'Dạ cháu xin ông ạ! Cháu cảm ơn Ông Nội nhiều, cháu sẽ cố gắng học thật giỏi ạ!',
            englishMeaning: 'I respectfully receive it from Grandpa! Thank you very much Grandpa, I will try my best to study well!',
            honorificScore: 100,
            naturalScore: 98,
            syntaxScore: 98,
            feedback: 'Văn hóa chuẩn mực: Nói "Cháu xin ông ạ", nhận bằng 2 tay và hứa chăm ngoan.',
            npcResponse: 'Ngoan lắm! Mau vào mâm ăn cỗ cùng cả nhà đi cháu!',
            isCompleted: true
          },
          {
            id: 'c2_2',
            text: 'Cảm ơn ông nha, để cháu mở xem được bao nhiêu tiền.',
            englishMeaning: 'Thanks grandpa, let me open to see how much money is inside.',
            honorificScore: 25,
            naturalScore: 20,
            syntaxScore: 60,
            feedback: 'Mở lì xì ngay trước mặt người tặng là điều cấm kỵ trong văn hóa Việt Nam (M10 Culture Card).',
            npcResponse: 'Kìa cháu, lộc đầu năm mang ý nghĩa may mắn, không nên vội bóc trước mặt người lớn thế.',
            isCompleted: true
          },
          {
            id: 'c2_3',
            text: 'Dạ cháu cảm ơn ông nhiều ạ.',
            englishMeaning: 'Yes thank you very much grandpa.',
            honorificScore: 88,
            naturalScore: 85,
            syntaxScore: 90,
            feedback: 'Lễ độ và chuẩn mực.',
            npcResponse: 'Ừ cháu cất cẩn thận lấy may cả năm nhé.',
            isCompleted: true
          }
        ]
      }
    ]
  }
];
