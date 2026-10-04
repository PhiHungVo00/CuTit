/**
 * Thuật toán A6 & GoF Interpreter Pattern (21)
 * Diễn giải ngữ cảnh (Tuổi, Giới tính, Quan hệ, Mức độ trang trọng sân đình/xã hội)
 * thành cặp đại từ xưng hô tiếng Việt chuẩn xác (20 cặp quan hệ điển hình).
 */

export type RelationCategory = 'kin' | 'social' | 'teacher_student' | 'stranger' | 'work' | 'civic' | 'traditional';

export type FormalityLevel = 'formal' | 'polite' | 'intimate';

export interface ContextExpression {
  speakerAge: number;
  listenerAge: number;
  relation: RelationCategory;
  listenerGender?: 'male' | 'female' | 'neutral';
  formality?: FormalityLevel;
  speakerGender?: 'male' | 'female';
  pairId?: string;
}

export interface HonorificInterpretationResult {
  speaker: string;
  listener: string;
  politeParticle: string;
  explanation: string;
  sampleSentence: string;
  wisdomTip: string;
  pairId: string;
  category: RelationCategory;
}

export interface HonorificPairItem {
  id: string;
  relation: RelationCategory;
  category: string;
  relationName: string;
  speakerAge: number;
  listenerAge: number;
  speaker: string;
  listener: string;
  politeParticle: string;
  ageRelationText: string;
  contextLevelText: string;
  example: string;
  explanation: string;
  wisdom: string;
  listenerGender?: 'male' | 'female' | 'neutral';
  speakerGender?: 'male' | 'female';
}

export const HONORIFIC_PAIRS_20: HonorificPairItem[] = [
  {
    id: 'h1',
    relation: 'kin',
    category: 'traditional',
    relationName: 'Sân đình - Bậc thượng thọ',
    speakerAge: 20,
    listenerAge: 80,
    speaker: 'cháu',
    listener: 'cụ',
    politeParticle: 'Dạ thưa... ạ',
    ageRelationText: 'Bề trên (Cao niên >70 tuổi)',
    contextLevelText: 'Trang trọng đình làng',
    example: 'Dạ thưa Cụ, cháu xin phép dâng chén trà sen kính mời Cụ xơi nước ạ!',
    explanation: "Theo tục trọng lão chốn đình làng Bắc Bộ, với các cụ bô lão từ 70 tuổi trở lên, người trẻ luôn xưng 'cháu' (hoặc 'con') và gọi 'Cụ', mở đầu bằng 'Dạ thưa' và kết thúc bằng 'ạ'.",
    wisdom: 'Kính lão đắc thọ! Chốn đình làng tôn ti trật tự, tiếng chào cung kính trước bậc cao niên thể hiện nếp nhà gia phong.'
  },
  {
    id: 'h2',
    relation: 'kin',
    category: 'kin',
    relationName: 'Gia tộc - Ông Bà',
    speakerAge: 15,
    listenerAge: 68,
    speaker: 'cháu',
    listener: 'ông/bà',
    politeParticle: 'Dạ... ạ',
    ageRelationText: 'Bề trên (Bậc ông bà)',
    contextLevelText: 'Thân mật gia đình',
    example: 'Dạ thưa Ông Bà, cháu mới đi học về, cháu kính chúc Ông Bà dồi dào sức khỏe ạ!',
    explanation: "Trong gia tộc họ hàng, con cháu xưng 'cháu' gọi 'ông/bà', luôn giữ thái độ cung kính, lễ phép.",
    wisdom: 'Uống nước nhớ nguồn! Lời chào ông bà mỗi sớm mai là nét đẹp hiếu đễ ngàn đời của người Việt.'
  },
  {
    id: 'h3',
    relation: 'kin',
    category: 'kin',
    relationName: 'Họ tộc & Xã hội - Bác',
    speakerAge: 22,
    listenerAge: 55,
    speaker: 'cháu',
    listener: 'bác',
    politeParticle: 'Dạ... ạ',
    ageRelationText: 'Bề trên (Lớn hơn cha mẹ)',
    contextLevelText: 'Lịch sự trang trọng',
    example: 'Cháu chào Bác ạ! Bác sang chơi xơi nước với bố cháu nhé ạ!',
    explanation: "Trong văn hóa Bắc Bộ, anh/chị của cha mẹ (cả nam lẫn nữ) đều gọi là 'Bác'. Ngoài xã hội, người trạc tuổi hoặc lớn hơn bố mẹ mình cũng được tôn xưng là 'Bác'.",
    wisdom: "Gọi 'Bác' xưng 'Cháu' vừa bày tỏ lòng kính trọng bề trên, vừa tạo sự ấm áp, gần gũi như người một nhà."
  },
  {
    id: 'h4',
    relation: 'kin',
    category: 'kin',
    relationName: 'Họ tộc - Chú',
    speakerAge: 20,
    listenerAge: 45,
    listenerGender: 'male',
    speaker: 'cháu',
    listener: 'chú',
    politeParticle: 'Dạ... ạ',
    ageRelationText: 'Bề trên (Em trai của cha)',
    contextLevelText: 'Thân mật ngõ xóm',
    example: 'Cháu chào Chú ạ, hôm nay Chú ra đình làng xem hội rước kiệu có vui không ạ?',
    explanation: "Em trai của cha gọi là 'Chú'. Ngoài xã hội, nam giới trung niên nhỏ hơn cha mình cũng được gọi thân mật là 'Chú'.",
    wisdom: 'Sẩy cha còn chú! Chú bác trong họ luôn là điểm tựa chỉ bảo đường ăn nết ở cho con cháu.'
  },
  {
    id: 'h5',
    relation: 'kin',
    category: 'kin',
    relationName: 'Họ tộc - Cô / Dì',
    speakerAge: 20,
    listenerAge: 43,
    listenerGender: 'female',
    speaker: 'cháu',
    listener: 'cô/dì',
    politeParticle: 'Dạ... ạ',
    ageRelationText: 'Bề trên (Em gái của cha/mẹ)',
    contextLevelText: 'Thân mật gia đình',
    example: 'Dạ cháu chào Cô ạ, Cô mới đi chợ làng về có mua bánh đúc lạc không Cô?',
    explanation: "'Cô' là em gái của cha, 'Dì' là em gái của mẹ. Khi xưng hô xưng 'cháu', gọi 'cô' hoặc 'dì' đi kèm ngữ điệu ngọt ngào, hiền hậu.",
    wisdom: 'Máu chảy ruột mềm! Xưng hô ngọt ngào với cô dì làm thắm đượm tình thân gia quyến.'
  },
  {
    id: 'h6',
    relation: 'kin',
    category: 'kin',
    relationName: 'Gia đình - Cha Mẹ',
    speakerAge: 18,
    listenerAge: 48,
    speaker: 'con',
    listener: 'bố/mẹ',
    politeParticle: 'Dạ thưa... ạ',
    ageRelationText: 'Bề trên sinh thành',
    contextLevelText: 'Ruột thịt gia đình',
    example: 'Con thưa Bố Mẹ, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!',
    explanation: "Con cái đối với cha mẹ xưng 'con', gọi 'bố/mẹ' (hoặc 'ba/má' ở miền Nam, 'thầy/u' ở đồng bằng Bắc Bộ xưa).",
    wisdom: 'Công cha như núi Thái Sơn, nghĩa mẹ như nước trong nguồn chảy ra. Luôn thưa gửi khi đi đến nơi về đến chốn.'
  },
  {
    id: 'h7',
    relation: 'kin',
    category: 'kin',
    relationName: 'Bề trên với Hậu bối',
    speakerAge: 60,
    listenerAge: 12,
    speaker: 'bác',
    listener: 'cháu',
    politeParticle: 'nhé / nha cháu',
    ageRelationText: 'Nhỏ hơn nhiều tuổi',
    contextLevelText: 'Thân mật ngõ xóm',
    example: 'Bác chào cháu nhé, cháu ngoan lắm, lại đây bác cho quả thị thơm của vườn đình!',
    explanation: "Người lớn tuổi khi trò chuyện với trẻ nhỏ xưng danh xưng thế hệ của mình ('bác', 'ông', 'chú') và gọi 'cháu' ân cần.",
    wisdom: 'Yêu trẻ, trẻ đến nhà! Lời xưng hô hiền hậu của bậc cao niên gieo mầm lễ giáo cho con trẻ.'
  },
  {
    id: 'h8',
    relation: 'teacher_student',
    category: 'teacher_student',
    relationName: 'Đạo nghĩa - Học trò kính Thầy',
    speakerAge: 16,
    listenerAge: 40,
    speaker: 'em',
    listener: 'thầy/cô',
    politeParticle: 'Thưa Thầy/Cô... ạ',
    ageRelationText: 'Bề trên tri thức',
    contextLevelText: 'Trang trọng giảng đường',
    example: 'Em kính chào Thầy ạ, thưa Thầy bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!',
    explanation: "Trong quan hệ sư đồ, người học xưng 'em' (hoặc 'con'), gọi 'thầy/cô' kèm từ 'kính thưa' và kết thúc bằng 'ạ'.",
    wisdom: 'Tôn sư trọng đạo! Một chữ là thầy, nửa chữ cũng là thầy; cách xưng hô đo lường cái tâm của người học trò.'
  },
  {
    id: 'h9',
    relation: 'teacher_student',
    category: 'teacher_student',
    relationName: 'Đạo nghĩa - Thầy bảo ban Trò',
    speakerAge: 40,
    listenerAge: 16,
    speaker: 'thầy/cô',
    listener: 'em',
    politeParticle: 'nhé / các em nhé',
    ageRelationText: 'Nhỏ tuổi hơn (Học sinh)',
    contextLevelText: 'Sư phạm mực thước',
    example: 'Thầy khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!',
    explanation: "Thầy cô giáo xưng 'thầy/cô' và gọi 'em' hoặc 'các em', giọng điệu vừa chuẩn mực vừa bao dung, khích lệ.",
    wisdom: 'Lời thầy như gió mùa xuân, nhẹ nhàng mà thấm sâu vào từng nét nhân cách người học.'
  },
  {
    id: 'h10',
    relation: 'social',
    category: 'social',
    relationName: 'Xã hội - Em kính Anh',
    speakerAge: 20,
    listenerAge: 26,
    listenerGender: 'male',
    speaker: 'em',
    listener: 'anh',
    politeParticle: 'ạ / nhé anh',
    ageRelationText: 'Lớn hơn (3 - 8 tuổi)',
    contextLevelText: 'Lịch sự xã giao',
    example: 'Em chào anh, anh cho em hỏi thăm đường vào sân đình làng mình với ạ!',
    explanation: "Giao tiếp với nam giới lớn hơn từ 3-8 tuổi, người nói xưng 'em' và gọi 'anh' để thể hiện sự lễ độ, khiêm nhường.",
    wisdom: "Lời nói chẳng mất tiền mua, lựa lời mà nói cho vừa lòng nhau. Xưng 'em' gọi 'anh' luôn mở ra thiện cảm."
  },
  {
    id: 'h11',
    relation: 'social',
    category: 'social',
    relationName: 'Xã hội - Em kính Chị',
    speakerAge: 20,
    listenerAge: 25,
    listenerGender: 'female',
    speaker: 'em',
    listener: 'chị',
    politeParticle: 'ạ / nhé chị',
    ageRelationText: 'Lớn hơn (3 - 8 tuổi)',
    contextLevelText: 'Lịch sự thân thiện',
    example: 'Chị ơi, em chào chị! Chị cho em gửi lời hỏi thăm sức khỏe gia đình mình nhé ạ!',
    explanation: "Với nữ giới lớn tuổi hơn mình trong phạm vi thế hệ anh chị em, người Việt xưng 'em' gọi 'chị'.",
    wisdom: "Kính trên nhường dưới, xưng 'chị' ngọt ngào giúp xua tan mọi khoảng cách xa lạ ban đầu."
  },
  {
    id: 'h12',
    relation: 'social',
    category: 'social',
    relationName: 'Xã hội - Anh nói với Em',
    speakerAge: 28,
    listenerAge: 21,
    speakerGender: 'male',
    speaker: 'anh',
    listener: 'em',
    politeParticle: 'nhé / nha em',
    ageRelationText: 'Nhỏ hơn (3 - 8 tuổi)',
    contextLevelText: 'Lịch sự thân thiện',
    example: 'Anh chào em, em cứ ngồi nghỉ chân uống bát nước chè xanh rồi ta cùng làm việc nhé!',
    explanation: "Người nam lớn tuổi hơn xưng 'anh', gọi 'em', thể hiện phong thái đĩnh đạc, chở che và tôn trọng đối phương.",
    wisdom: 'Làm anh khó đấy, phải đâu chuyện đùa. Lời ăn tiếng nói của người anh cần đĩnh đạc và chân tình.'
  },
  {
    id: 'h13',
    relation: 'social',
    category: 'social',
    relationName: 'Xã hội - Chị nói với Em',
    speakerAge: 27,
    listenerAge: 20,
    speakerGender: 'female',
    speaker: 'chị',
    listener: 'em',
    politeParticle: 'nhé / nha em',
    ageRelationText: 'Nhỏ hơn (3 - 8 tuổi)',
    contextLevelText: 'Ấm áp thân tình',
    example: 'Chị chào em nhé! Chiều nay chị em mình cùng ra đình làng xem múa lân nghen!',
    explanation: "Người nữ lớn tuổi hơn xưng 'chị', gọi 'em', mang lại cảm giác thân thiện, sẻ chia như chị em một nhà.",
    wisdom: 'Chị ngã em nâng! Lời nhắn nhủ nhẹ nhàng của người chị luôn tạo niềm tin cậy ấm áp.'
  },
  {
    id: 'h14',
    relation: 'social',
    category: 'social',
    relationName: 'Đồng niên - Bạn bè Lịch sự',
    speakerAge: 22,
    listenerAge: 22,
    speaker: 'mình',
    listener: 'bạn',
    politeParticle: 'nhé / nha bạn',
    ageRelationText: 'Ngang hàng (Đồng lứa)',
    contextLevelText: 'Lịch sự xã giao',
    example: 'Chào bạn, mình rất vui được làm quen với bạn tại ngày hội làng hôm nay nhé!',
    explanation: "Cặp xưng hô 'mình - bạn' là chuẩn mực trung tính, lịch sự khi hai người trạc tuổi nhau mới gặp lần đầu.",
    wisdom: "Tứ hải giai huynh đệ! Xưng 'mình - bạn' thanh lịch, giữ đúng mực thước văn minh hiện đại."
  },
  {
    id: 'h15',
    relation: 'social',
    category: 'social',
    relationName: 'Bạn bè - Tri kỷ Ngõ xóm',
    speakerAge: 20,
    listenerAge: 20,
    speaker: 'tớ',
    listener: 'cậu',
    politeParticle: 'nhé / nhé cậu / nha',
    ageRelationText: 'Ngang hàng thân thiết',
    contextLevelText: 'Thân mật ngõ xóm',
    example: 'Cậu ơi, chiều mát ra sân đình đá bóng và thả diều với tớ không nào?',
    explanation: "'Tớ - cậu' là cặp đại từ đặc trưng của bạn bè đồng trang lứa thân thiết ở miền Bắc, mang âm hưởng hồn nhiên tuổi học trò.",
    wisdom: "Bạn bè chí cốt cùng làng cùng xóm, gọi 'tớ - cậu' vừa vô tư vừa gắn bó keo sơn."
  },
  {
    id: 'h16',
    relation: 'work',
    category: 'civic',
    relationName: 'Công sở - Nhã nhặn Chuẩn mực',
    speakerAge: 30,
    listenerAge: 45,
    speaker: 'tôi',
    listener: 'anh/chị/bác',
    politeParticle: 'ạ / xin phép... ạ',
    ageRelationText: 'Lớn hơn hoặc ngang hàng',
    contextLevelText: 'Lịch sự công sở',
    example: 'Tôi xin phép được gửi biên bản họp đình làng đến anh để anh rà soát giúp ạ.',
    explanation: "Trong môi trường công việc hoặc hành chính, xưng 'tôi' kết hợp gọi đối phương là 'anh/chị/bác' tạo phong thái chuyên nghiệp, giữ khoảng cách tôn trọng.",
    wisdom: "Việc công minh bạch, xưng hô rõ ràng. 'Tôi' tự chủ mà vẫn cung kính đối phương."
  },
  {
    id: 'h17',
    relation: 'civic',
    category: 'traditional',
    relationName: 'Đình làng - Diễn văn Cộng đồng',
    speakerAge: 35,
    listenerAge: 50,
    speaker: 'tôi',
    listener: 'quý vị / các cụ',
    politeParticle: 'Kính thưa... ạ',
    ageRelationText: 'Nhiều độ tuổi',
    contextLevelText: 'Trang trọng đình làng',
    example: 'Kính thưa quý vị quan viên hai họ và bà con chòm xóm, tôi xin phép được khai mạc hội làng!',
    explanation: "Khi phát biểu trước đình làng hoặc cộng đồng, người nói xưng 'tôi' và kính gọi 'quý vị', 'các cụ bô lão', 'bà con chòm xóm'.",
    wisdom: 'Lời nói chốn ba quân, câu chào nơi sân đình! Nghi thức phát biểu cần đĩnh đạc, trang nghiêm và tề chỉnh.'
  },
  {
    id: 'h18',
    relation: 'traditional',
    category: 'traditional',
    relationName: 'Thiền môn - Kính bái Sư phụ',
    speakerAge: 25,
    listenerAge: 60,
    speaker: 'con',
    listener: 'thầy / sư thầy',
    politeParticle: 'A di đà Phật / Bạch Thầy',
    ageRelationText: 'Bậc xuất gia tôn quý',
    contextLevelText: 'Trang nghiêm cổ tự',
    example: 'A di đà Phật, bạch Thầy cho con xin phép được cúng dường hoa quả thanh tịnh lên Tam Bảo ạ!',
    explanation: "Chốn cửa Phật hoặc tín ngưỡng dân gian, phật tử xưng 'con', kính gọi quý thầy là 'Thầy' hoặc 'Sư thầy' cùng câu niệm Phật.",
    wisdom: 'Tâm tĩnh thì trí sáng. Đến chốn tôn nghiêm, từng lời thưa gửi phải khiêm cung lắng đọng tâm từ.'
  },
  {
    id: 'h19',
    relation: 'kin',
    category: 'kin',
    relationName: 'Họ tộc - Thím / Mợ',
    speakerAge: 21,
    listenerAge: 42,
    listenerGender: 'female',
    speaker: 'cháu',
    listener: 'thím/mợ',
    politeParticle: 'Dạ... ạ',
    ageRelationText: 'Bề trên (Vợ của chú/cậu)',
    contextLevelText: 'Thân mật họ hàng',
    example: 'Dạ cháu chào Thím ạ, Thím đã chuẩn bị nếp hương gói bánh chưng ăn Tết chưa ạ?',
    explanation: "'Thím' là vợ của chú (em trai bố); 'Mợ' là vợ của cậu (em trai mẹ). Con cháu luôn xưng 'cháu' lễ độ.",
    wisdom: 'Dâu là con, rể là khách. Tôn kính người dâu người thím là giữ trọn nền nếp gia môn sum vầy.'
  },
  {
    id: 'h20',
    relation: 'civic',
    category: 'civic',
    relationName: 'Đoàn thể - Ban Trị sự Làng',
    speakerAge: 32,
    listenerAge: 38,
    speaker: 'tôi',
    listener: 'đồng chí',
    politeParticle: 'thưa / báo cáo',
    ageRelationText: 'Đồng sự tổ chức',
    contextLevelText: 'Trang trọng đoàn thể',
    example: 'Báo cáo đồng chí, công tác tu bổ vì kèo mái đình và sân gạch cổ đã hoàn tất chu đáo.',
    explanation: "Trong công tác đoàn thể, hội đồng làng xã hoặc các tổ chức chính quy, danh xưng 'đồng chí' mang tính bình đẳng và tinh thần trách nhiệm chung.",
    wisdom: 'Chung một ngọn cờ, đồng lòng góp sức vì lợi ích chung của quê hương bản quán.'
  }
];

export class HonorificInterpreter {
  /**
   * Diễn giải ngữ cảnh thành kết quả xưng hô chuẩn xác
   */
  public interpret(ctx: ContextExpression): HonorificInterpretationResult {
    // 0. Nếu có yêu cầu trực tiếp pairId cụ thể từ Drawer hoặc kịch bản
    if (ctx.pairId) {
      const explicit = this.getPairById(ctx.pairId);
      if (explicit) {
        return this.formatPairResult(explicit, ctx);
      }
    }

    const ageDiff = ctx.listenerAge - ctx.speakerAge;
    const formality = ctx.formality || 'polite';

    // 1. Thầy trò (teacher_student)
    if (ctx.relation === 'teacher_student') {
      if (ctx.speakerAge < ctx.listenerAge) {
        let listenerTitle = 'thầy/cô';
        let particle = 'Thưa Thầy/Cô... ạ';
        let sentence = 'Em kính chào Thầy Cô ạ, thưa Thầy Cô bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';

        if (ctx.listenerGender === 'female') {
          listenerTitle = 'cô';
          particle = 'Thưa Cô... ạ';
          sentence = 'Em kính chào Cô ạ, thưa Cô bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';
        } else if (ctx.listenerGender === 'male') {
          listenerTitle = 'thầy';
          particle = 'Thưa Thầy... ạ';
          sentence = 'Em kính chào Thầy ạ, thưa Thầy bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';
        }

        return {
          speaker: 'em',
          listener: listenerTitle,
          politeParticle: particle,
          explanation: 'Quan hệ sư đồ: người học xưng em, kính gọi thầy cô giáo kèm trợ từ thưa gửi.',
          sampleSentence: sentence,
          wisdomTip: 'Tôn sư trọng đạo! Một chữ là thầy, nửa chữ cũng là thầy; cách xưng hô đo lường nếp học người xưa.',
          pairId: 'h8',
          category: 'teacher_student'
        };
      } else {
        let speakerTitle = 'thầy/cô';
        let sentence = 'Thầy cô khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';

        if (ctx.speakerGender === 'female') {
          speakerTitle = 'cô';
          sentence = 'Cô khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';
        } else if (ctx.speakerGender === 'male') {
          speakerTitle = 'thầy';
          sentence = 'Thầy khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';
        }

        return {
          speaker: speakerTitle,
          listener: 'em',
          politeParticle: 'nhé / các em nhé',
          explanation: 'Thầy cô bảo ban học trò: xưng thầy/cô, gọi em.',
          sampleSentence: sentence,
          wisdomTip: 'Lời thầy nhẹ nhàng ấm áp gieo niềm say mê kiến thức vào lòng người học.',
          pairId: 'h9',
          category: 'teacher_student'
        };
      }
    }

    // 2. Tôn giáo thiền môn cổ tự (traditional - intimate/spiritual)
    if (ctx.relation === 'traditional' && formality === 'intimate') {
      return {
        speaker: 'con',
        listener: 'thầy / sư thầy',
        politeParticle: 'A di đà Phật / Bạch Thầy',
        explanation: 'Chốn cửa Phật hoặc tín ngưỡng dân gian, phật tử xưng con, kính gọi quý thầy là Sư thầy.',
        sampleSentence: 'A di đà Phật, bạch Thầy cho con xin phép được cúng dường hoa quả thanh tịnh lên Tam Bảo ạ!',
        wisdomTip: 'Tâm tĩnh thì trí sáng. Đến chốn tôn nghiêm, từng lời thưa gửi phải khiêm cung lắng đọng tâm từ.',
        pairId: 'h18',
        category: 'traditional'
      };
    }

    // 3. Nghi lễ đình làng / Diễn văn cộng đồng
    if (ctx.relation === 'traditional' || (ctx.relation === 'civic' && formality === 'formal' && ctx.listenerAge >= 50)) {
      if (ctx.listenerAge >= 70) {
        return {
          speaker: 'cháu',
          listener: 'cụ',
          politeParticle: 'Dạ thưa Cụ... ạ',
          explanation: 'Tôn ti sân đình: đối với bậc thượng thọ cao niên, xưng cháu/con và kính cẩn gọi Cụ.',
          sampleSentence: 'Dạ thưa Cụ, cháu xin phép dâng chén trà sen kính mời Cụ xơi nước ạ!',
          wisdomTip: 'Kính lão đắc thọ! Chốn đình làng tôn ti trật tự, tiếng chào cung kính trước bậc cao niên thể hiện nếp nhà gia phong.',
          pairId: 'h1',
          category: 'traditional'
        };
      }
      return {
        speaker: 'tôi',
        listener: 'quý vị / các cụ',
        politeParticle: 'Kính thưa... ạ',
        explanation: 'Diễn văn sân đình: xưng tôi và kính chào quý vị quan viên, bô lão.',
        sampleSentence: 'Kính thưa quý vị quan viên hai họ và bà con chòm xóm, tôi xin phép được khai mạc hội làng!',
        wisdomTip: 'Lời nói chốn ba quân, câu chào nơi sân đình! Nghi thức phát biểu cần đĩnh đạc, trang nghiêm và tề chỉnh.',
        pairId: 'h17',
        category: 'traditional'
      };
    }

    // 4. Công việc / Đoàn thể
    if (ctx.relation === 'work' || ctx.relation === 'civic') {
      if (formality === 'formal' || ctx.relation === 'civic') {
        return {
          speaker: 'tôi',
          listener: 'đồng chí',
          politeParticle: 'thưa / báo cáo',
          explanation: 'Công việc đoàn thể chính quy: xưng tôi, gọi đồng chí.',
          sampleSentence: 'Báo cáo đồng chí, công tác tu bổ vì kèo mái đình và sân gạch cổ đã hoàn tất chu đáo.',
          wisdomTip: 'Chung một ngọn cờ, đồng lòng góp sức vì lợi ích chung của cộng đồng.',
          pairId: 'h20',
          category: 'civic'
        };
      }

      let listenerTitle = 'anh/chị/bác';
      if (ctx.listenerGender === 'female') listenerTitle = 'chị';
      else if (ctx.listenerGender === 'male') listenerTitle = 'anh';

      return {
        speaker: 'tôi',
        listener: listenerTitle,
        politeParticle: 'ạ / xin phép... ạ',
        explanation: 'Công sở lịch thiệp: xưng tôi, gọi anh/chị/bác.',
        sampleSentence: `Tôi xin phép được gửi biên bản họp đình làng đến ${listenerTitle} để ${listenerTitle} rà soát giúp ạ.`,
        wisdomTip: "Việc công minh bạch, xưng hô rõ ràng. 'Tôi' tự chủ mà vẫn cung kính đối phương.",
        pairId: 'h16',
        category: 'work'
      };
    }

    // 5. Gia đình & Họ tộc (kin)
    if (ctx.relation === 'kin') {
      // 5.1 Bậc thượng thọ (cụ)
      if (ctx.listenerAge >= 75) {
        return {
          speaker: 'cháu',
          listener: 'cụ',
          politeParticle: 'Dạ thưa Cụ... ạ',
          explanation: 'Bậc cụ thượng thọ: xưng cháu/con, gọi Cụ.',
          sampleSentence: 'Dạ thưa Cụ, cháu xin phép dâng chén trà sen kính mời Cụ xơi nước ạ!',
          wisdomTip: 'Kính già, già để tuổi cho! Lời xưng hô lễ độ gìn giữ nếp nhà phúc đức.',
          pairId: 'h1',
          category: 'kin'
        };
      }

      // 5.2 Bậc ông bà (ageDiff >= 40 hoặc listenerAge >= 65)
      if (ageDiff >= 40 || ctx.listenerAge >= 65) {
        let listenerTitle = 'ông/bà';
        let sample = 'Dạ thưa Ông Bà, cháu mới đi học về, cháu kính chúc Ông Bà dồi dào sức khỏe ạ!';
        if (ctx.listenerGender === 'female') {
          listenerTitle = 'bà';
          sample = 'Dạ thưa Bà, cháu mới đi học về, cháu kính chúc Bà dồi dào sức khỏe ạ!';
        } else if (ctx.listenerGender === 'male') {
          listenerTitle = 'ông';
          sample = 'Dạ thưa Ông, cháu mới đi học về, cháu kính chúc Ông dồi dào sức khỏe ạ!';
        }

        return {
          speaker: 'cháu',
          listener: listenerTitle,
          politeParticle: 'Dạ... ạ',
          explanation: 'Bậc ông bà: con cháu xưng cháu, gọi ông hoặc bà tôn kính.',
          sampleSentence: sample,
          wisdomTip: 'Uống nước nhớ nguồn! Lời chào ông bà mỗi sớm mai là nét đẹp hiếu đễ ngàn đời.',
          pairId: 'h2',
          category: 'kin'
        };
      }

      // 5.3 Bậc cha mẹ (formality === 'intimate' trong độ tuổi chênh lệch cha mẹ)
      if (formality === 'intimate' && ageDiff >= 20 && ageDiff < 40) {
        let listenerTitle = 'bố/mẹ';
        let sample = 'Con thưa Bố Mẹ, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
        if (ctx.listenerGender === 'female') {
          listenerTitle = 'mẹ';
          sample = 'Con thưa Mẹ, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
        } else if (ctx.listenerGender === 'male') {
          listenerTitle = 'bố';
          sample = 'Con thưa Bố, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
        }

        return {
          speaker: 'con',
          listener: listenerTitle,
          politeParticle: 'Dạ thưa... ạ',
          explanation: 'Con cái đối với cha mẹ xưng con, kính gọi bố mẹ.',
          sampleSentence: sample,
          wisdomTip: 'Công cha như núi Thái Sơn, nghĩa mẹ như nước trong nguồn chảy ra. Luôn thưa gửi khi đi đến nơi về đến chốn.',
          pairId: 'h6',
          category: 'kin'
        };
      }

      // 5.4 Hàng cô chú bác họ hàng (12 <= ageDiff < 40)
      if (ageDiff >= 12) {
        if (ctx.listenerGender === 'female') {
          // Kiểm tra xem là Thím/Mợ hay Cô/Dì
          return {
            speaker: 'cháu',
            listener: 'cô/dì',
            politeParticle: 'Dạ... ạ',
            explanation: 'Bề trên hàng cô/dì hoặc bác gái: xưng cháu, gọi cô hoặc dì ngọt ngào hiền hậu.',
            sampleSentence: 'Dạ cháu chào Cô ạ, Cô mới đi chợ làng về có mua bánh đúc lạc không Cô?',
            wisdomTip: 'Máu chảy ruột mềm! Xưng hô ngọt ngào với cô dì làm thắm đượm tình thân gia quyến.',
            pairId: 'h5',
            category: 'kin'
          };
        } else if (ctx.listenerGender === 'male') {
          if (ageDiff >= 25) {
            return {
              speaker: 'cháu',
              listener: 'bác',
              politeParticle: 'Dạ... ạ',
              explanation: 'Anh của cha mẹ hoặc người trạc tuổi cha mẹ: xưng cháu, kính gọi Bác.',
              sampleSentence: 'Cháu chào Bác ạ! Bác sang chơi xơi nước với bố cháu nhé ạ!',
              wisdomTip: "Gọi 'Bác' xưng 'Cháu' vừa bày tỏ lòng kính trọng bề trên, vừa tạo sự ấm áp như người một nhà.",
              pairId: 'h3',
              category: 'kin'
            };
          }
          return {
            speaker: 'cháu',
            listener: 'chú',
            politeParticle: 'Dạ... ạ',
            explanation: 'Em trai của cha gọi là Chú: xưng cháu, gọi chú thân mật.',
            sampleSentence: 'Cháu chào Chú ạ, hôm nay Chú ra đình làng xem hội rước kiệu có vui không ạ?',
            wisdomTip: 'Sẩy cha còn chú! Chú bác trong họ luôn là điểm tựa chỉ bảo đường ăn nết ở cho con cháu.',
            pairId: 'h4',
            category: 'kin'
          };
        } else {
          return {
            speaker: 'cháu',
            listener: 'bác/chú',
            politeParticle: 'Dạ... ạ',
            explanation: 'Bề trên hàng chú bác trong họ: con cháu xưng cháu, gọi bác/chú.',
            sampleSentence: 'Cháu chào Bác ạ! Bác sang chơi xơi nước với gia đình cháu nhé ạ!',
            wisdomTip: 'Kính trên nhường dưới, tiếng thưa dạ mở lối cho mọi mối thâm tình.',
            pairId: 'h3',
            category: 'kin'
          };
        }
      }

      // 5.5 Người lớn tuổi nói với thế hệ con cháu (ageDiff <= -12)
      if (ageDiff <= -12) {
        let speakerTitle = 'bác';
        let sample = 'Bác chào cháu nhé, cháu ngoan lắm, lại đây bác cho quả thị thơm của vườn đình!';

        if (ctx.speakerGender === 'female') {
          speakerTitle = ageDiff <= -35 ? 'bà' : 'cô';
          sample = `${speakerTitle.charAt(0).toUpperCase() + speakerTitle.slice(1)} chào cháu nhé, cháu ngoan lắm, lại đây ${speakerTitle} cho quả thị thơm của vườn đình!`;
        } else if (ctx.speakerGender === 'male') {
          speakerTitle = ageDiff <= -35 ? 'ông' : (ageDiff <= -25 ? 'bác' : 'chú');
          sample = `${speakerTitle.charAt(0).toUpperCase() + speakerTitle.slice(1)} chào cháu nhé, cháu ngoan lắm, lại đây ${speakerTitle} cho quả thị thơm của vườn đình!`;
        }

        return {
          speaker: speakerTitle,
          listener: 'cháu',
          politeParticle: 'nhé / nha cháu',
          explanation: 'Bề trên với con cháu: xưng danh xưng thế hệ mình, gọi cháu ân cần.',
          sampleSentence: sample,
          wisdomTip: 'Yêu trẻ, trẻ đến nhà! Lời xưng hô hiền hậu của bậc cao niên gieo mầm lễ giáo cho con trẻ.',
          pairId: 'h7',
          category: 'kin'
        };
      }

      // 5.6 Anh chị em trong họ (thế hệ ngang hàng gần tuổi)
      if (ageDiff > 0) {
        const title = ctx.listenerGender === 'female' ? 'chị' : 'anh';
        return {
          speaker: 'em',
          listener: title,
          politeParticle: `ạ / nhé ${title}`,
          explanation: `Anh chị em trong họ: nhỏ tuổi hơn xưng em, gọi ${title}.`,
          sampleSentence: `Em chào ${title}, ${title} cho em hỏi thăm đường vào sân đình làng mình với ạ!`,
          wisdomTip: 'Anh em như thể tay chân, rách lành đùm bọc dở hay đỡ đần.',
          pairId: ctx.listenerGender === 'female' ? 'h11' : 'h10',
          category: 'kin'
        };
      } else {
        const title = ctx.speakerGender === 'female' ? 'chị' : 'anh';
        const titleCap = title.charAt(0).toUpperCase() + title.slice(1);
        return {
          speaker: title,
          listener: 'em',
          politeParticle: 'nhé / nha em',
          explanation: `Anh chị em trong họ: lớn tuổi hơn xưng ${title}, gọi em.`,
          sampleSentence: `${titleCap} chào em, em cứ ngồi nghỉ chân uống bát nước chè xanh nhé!`,
          wisdomTip: 'Làm anh khó đấy, phải đâu chuyện đùa. Lời ăn tiếng nói của người anh cần đĩnh đạc và chân tình.',
          pairId: ctx.speakerGender === 'female' ? 'h13' : 'h12',
          category: 'kin'
        };
      }
    }

    // 6. Xã hội & Người lạ (social / stranger)
    if (ageDiff >= 20) {
      return {
        speaker: 'cháu',
        listener: 'bác',
        politeParticle: 'Dạ... ạ',
        explanation: "Đối với người trạc tuổi cha mẹ mình: xưng 'cháu', gọi 'bác' bày tỏ lòng tôn kính.",
        sampleSentence: 'Cháu chào Bác ạ! Bác sang chơi xơi nước với bố cháu nhé ạ!',
        wisdomTip: "Gọi 'Bác' xưng 'Cháu' vừa bày tỏ lòng kính trọng bề trên, vừa tạo sự ấm áp như người một nhà.",
        pairId: 'h3',
        category: 'social'
      };
    }

    if (ageDiff > 2) {
      const listenerTitle = ctx.listenerGender === 'female' ? 'chị' : 'anh';
      return {
        speaker: 'em',
        listener: listenerTitle,
        politeParticle: `ạ / nhé ${listenerTitle}`,
        explanation: `Đối phương lớn hơn vài tuổi: xưng 'em', gọi '${listenerTitle}'.`,
        sampleSentence: `Em chào ${listenerTitle}, ${listenerTitle} cho em hỏi thăm đường vào sân đình làng mình với ạ!`,
        wisdomTip: "Lời nói chẳng mất tiền mua, lựa lời mà nói cho vừa lòng nhau. Xưng 'em' gọi 'anh/chị' luôn mở ra thiện cảm.",
        pairId: ctx.listenerGender === 'female' ? 'h11' : 'h10',
        category: 'social'
      };
    }

    if (ageDiff < -2) {
      const speakerTitle = ctx.speakerGender === 'female' ? 'chị' : 'anh';
      const speakerCap = speakerTitle.charAt(0).toUpperCase() + speakerTitle.slice(1);
      return {
        speaker: speakerTitle,
        listener: 'em',
        politeParticle: 'nhé / nha em',
        explanation: `Đối phương nhỏ tuổi hơn: xưng '${speakerTitle}', gọi 'em'.`,
        sampleSentence: `${speakerCap} chào em, em cứ ngồi nghỉ chân uống bát nước chè xanh nhé!`,
        wisdomTip: 'Kính trên nhường dưới, xưng hô ân cần tạo dựng sự tin cậy trong giao tiếp.',
        pairId: ctx.speakerGender === 'female' ? 'h13' : 'h12',
        category: 'social'
      };
    }

    // Ngang hàng (ageDiff between -2 and 2)
    if (formality === 'intimate') {
      return {
        speaker: 'tớ',
        listener: 'cậu',
        politeParticle: 'nhé / nhé cậu / nha',
        explanation: 'Bạn bè đồng niên thân thiết ngõ xóm: xưng tớ, gọi cậu.',
        sampleSentence: 'Cậu ơi, chiều mát ra sân đình đá bóng và thả diều với tớ không nào?',
        wisdomTip: "Bạn bè chí cốt cùng làng cùng xóm, gọi 'tớ - cậu' vừa vô tư vừa gắn bó keo sơn.",
        pairId: 'h15',
        category: 'social'
      };
    }

    return {
      speaker: 'mình',
      listener: 'bạn',
      politeParticle: 'nhé / nha bạn',
      explanation: 'Bạn bè đồng trang lứa lịch thiệp xã giao: xưng mình, gọi bạn.',
      sampleSentence: 'Chào bạn, mình rất vui được làm quen với bạn tại ngày hội làng hôm nay nhé!',
      wisdomTip: "Tứ hải giai huynh đệ! Xưng 'mình - bạn' thanh lịch, giữ đúng mực thước văn minh hiện đại.",
      pairId: 'h14',
      category: 'social'
    };
  }

  /**
   * Định dạng kết quả từ cặp quan hệ tường minh
   */
  private formatPairResult(pair: HonorificPairItem, ctx: ContextExpression): HonorificInterpretationResult {
    let speaker = pair.speaker;
    let listener = pair.listener;
    let sampleSentence = pair.example;

    // Tinh chỉnh đại từ nếu có giới tính cụ thể
    if (pair.id === 'h2') {
      if (ctx.listenerGender === 'female') {
        listener = 'bà';
        sampleSentence = 'Dạ thưa Bà, cháu mới đi học về, cháu kính chúc Bà dồi dào sức khỏe ạ!';
      } else if (ctx.listenerGender === 'male') {
        listener = 'ông';
        sampleSentence = 'Dạ thưa Ông, cháu mới đi học về, cháu kính chúc Ông dồi dào sức khỏe ạ!';
      }
    } else if (pair.id === 'h6') {
      if (ctx.listenerGender === 'female') {
        listener = 'mẹ';
        sampleSentence = 'Con thưa Mẹ, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
      } else if (ctx.listenerGender === 'male') {
        listener = 'bố';
        sampleSentence = 'Con thưa Bố, con xin phép được chuẩn bị mâm cơm chiều gia đình ạ!';
      }
    } else if (pair.id === 'h8') {
      if (ctx.listenerGender === 'female') {
        listener = 'cô';
        sampleSentence = 'Em kính chào Cô ạ, thưa Cô bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';
      } else if (ctx.listenerGender === 'male') {
        listener = 'thầy';
        sampleSentence = 'Em kính chào Thầy ạ, thưa Thầy bài giảng về phong tục làng xã hôm nay rất sâu sắc ạ!';
      }
    } else if (pair.id === 'h9') {
      if (ctx.speakerGender === 'female') {
        speaker = 'cô';
        sampleSentence = 'Cô khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';
      } else if (ctx.speakerGender === 'male') {
        speaker = 'thầy';
        sampleSentence = 'Thầy khen em hôm nay đã có tinh thần tìm hiểu sâu về di sản văn hóa dân tộc nhé!';
      }
    } else if (pair.id === 'h19') {
      if (ctx.listenerGender === 'female') {
        listener = 'thím';
        sampleSentence = 'Dạ cháu chào Thím ạ, Thím đã chuẩn bị nếp hương gói bánh chưng ăn Tết chưa ạ?';
      }
    }

    return {
      speaker,
      listener,
      politeParticle: pair.politeParticle,
      explanation: pair.explanation,
      sampleSentence,
      wisdomTip: pair.wisdom,
      pairId: pair.id,
      category: pair.relation
    };
  }

  /**
   * Lấy danh sách toàn bộ 20 cặp quan hệ mẫu
   */
  public getAllPairs(): HonorificPairItem[] {
    return HONORIFIC_PAIRS_20;
  }

  /**
   * Tìm cặp theo Id
   */
  public getPairById(id: string): HonorificPairItem | undefined {
    return HONORIFIC_PAIRS_20.find(p => p.id === id);
  }
}
