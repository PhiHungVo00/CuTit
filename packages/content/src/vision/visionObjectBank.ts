export interface VisionObjectItem {
  id: string;
  name: string;
  ipa: string;
  tone: string;
  category: string;
  icon: string;
  english: string;
  cultureNote: string;
  honorificContext: string;
  bambooSampleSentence: string;
  audioPrompt: string;
  sampleImageUrl?: string;
}

export const VISION_OBJECT_BANK_8: VisionObjectItem[] = [
  {
    id: 'non_la',
    name: 'Nón Lá',
    ipa: '/nɔn˧˥ laː˧˥/',
    tone: 'Thanh Sắc - Thanh Sắc',
    category: 'Vật Dụng Dân Gian',
    icon: '👒',
    english: 'Conical Leaf Hat',
    cultureNote: 'Biểu tượng gắn liền với hình ảnh người phụ nữ và người nông dân Việt Nam, che nắng che mưa trên đồng lúa.',
    honorificContext: 'Khi biếu nón lá cho bà hoặc mẹ, nên xưng: "Dạ thưa Mẹ, con mua biếu Mẹ chiếc nón lá đội che nắng ạ".',
    bambooSampleSentence: 'Bé Cu Tít đang đội nón lá ra đồng bắt cá.',
    audioPrompt: 'Chiếc nón lá truyền thống'
  },
  {
    id: 'bat_com',
    name: 'Bát Gốm Bát Tràng',
    ipa: '/ɓaːt˧˥ ɣom˧˥/',
    tone: 'Thanh Sắc - Thanh Sắc',
    category: 'Đồ Thủ Công',
    icon: '🥣',
    english: 'Bat Trang Ceramic Bowl',
    cultureNote: 'Sản phẩm từ làng gốm Bát Tràng hơn 500 năm tuổi, tượng trưng cho sự ấm no và mâm cơm sum họp gia đình.',
    honorificContext: 'Khi so đũa dâng bát cơm cho người lớn, phải đưa bằng hai tay kèm câu: "Dạ con mời Bác xơi cơm ạ".',
    bambooSampleSentence: 'Bà ngoại đang so đũa và bới cơm vào bát gốm.',
    audioPrompt: 'Bát cơm gốm Bát Tràng'
  },
  {
    id: 'trai_xoai',
    name: 'Trái Xoài Cát Hòa Lộc',
    ipa: '/tɕaːj˧˥ swaːj˨˩/',
    tone: 'Thanh Sắc - Thanh Huyền',
    category: 'Đặc Sản Trái Cây',
    icon: '🥭',
    english: 'Hoa Loc Mango',
    cultureNote: 'Đặc sản nổi tiếng của miền Tây Nam Bộ, quả vàng ươm, thịt dày, ngọt thanh, thường có trong mâm ngũ quả ngày Tết.',
    honorificContext: 'Ở miền Nam dùng từ "Trái xoài", miền Bắc dùng "Quả xoài". Xưng hô: "Dạ Dì Ba cân cho con hai ký xoài nhen".',
    bambooSampleSentence: 'Dì Ba đang lựa những trái xoài cát chín vàng thơm phức.',
    audioPrompt: 'Trái xoài cát Hòa Lộc'
  },
  {
    id: 'am_tra',
    name: 'Ấm Trà Sen Tây Hồ',
    ipa: '/ʔəm˧˥ tɕaː˨˩/',
    tone: 'Thanh Sắc - Thanh Huyền',
    category: 'Ẩm Thực Trà Đạo',
    icon: '🫖',
    english: 'Lotus Tea Pot',
    cultureNote: '"Khách đến nhà không trà thì bánh". Thưởng trà sen là nét văn hóa thanh nhã của người Tràng An đất Thăng Long.',
    honorificContext: 'Rót trà mời bề trên bằng hai tay, xưng: "Dạ cháu kính mời Cụ dùng chén trà sen ấm ạ".',
    bambooSampleSentence: 'Ông nội đang ngồi thưởng thức ấm trà sen thơm ngát.',
    audioPrompt: 'Ấm trà sen Tây Hồ ngát hương'
  },
  {
    id: 'ao_dai',
    name: 'Áo Dài Truyền Thống',
    ipa: '/ʔaːw˧˥ zaːj˨˩/',
    tone: 'Thanh Sắc - Thanh Huyền',
    category: 'Trang Phục Dân Tộc',
    icon: '👘',
    english: 'Traditional Ao Dai',
    cultureNote: 'Quốc phục tôn vinh nét đẹp kín đáo mà thướt tha của người phụ nữ Việt Nam trong các dịp lễ tết và đám cưới.',
    honorificContext: 'Khi khen ngợi bề trên: "Dạ thưa Cô, hôm nay Cô mặc áo dài đẹp và trang nhã quá ạ".',
    bambooSampleSentence: 'Cô giáo đang mặc chiếc áo dài duyên dáng đứng trên bục giảng.',
    audioPrompt: 'Tà áo dài truyền thống thướt tha'
  },
  {
    id: 'cay_tre',
    name: 'Cây Tre Làng Quê',
    ipa: '/kəj˧˧ tɕɛ˧˧/',
    tone: 'Thanh Ngang - Thanh Ngang',
    category: 'Biểu Tượng Dân Tộc',
    icon: '🎋',
    english: 'Bamboo Tree',
    cultureNote: 'Biểu tượng cho khí phách kiên cường, dẻo dai và tinh thần đùm bọc gắn kết của dân tộc Việt Nam ("Tre già măng mọc").',
    honorificContext: 'Tre trăm đốt là nguồn gốc của thuật toán ghép câu Đốt tre A8 trong ứng dụng Bé Cu Tít.',
    bambooSampleSentence: 'Lũy tre xanh đang nghiêng mình che bóng mát đầu làng.',
    audioPrompt: 'Cây tre xanh làng quê dẻo dai'
  },
  {
    id: 'com_tam',
    name: 'Cơm Tấm Sườn Bì Chả',
    ipa: '/kəːm˧˧ təm˧˥/',
    tone: 'Thanh Ngang - Thanh Sắc',
    category: 'Ẩm Thực Đường Phố',
    icon: '🍛',
    english: 'Broken Rice with Grilled Pork',
    cultureNote: 'Món ăn biểu tượng của đất Sài Gòn, bắt nguồn từ hạt gạo gãy tấm của người bình dân, nay thành di sản ẩm thực nức tiếng.',
    honorificContext: 'Khi gọi món ở quán bình dân miền Nam: "Dạ cho con một dĩa cơm tấm sườn nướng thêm chén nước mắm nhen cô".',
    bambooSampleSentence: 'Anh tài xế đang ghé quán thưởng thức dĩa cơm tấm sườn thơm lừng.',
    audioPrompt: 'Dĩa cơm tấm sườn bì chả thơm lừng'
  },
  {
    id: 'xich_lo',
    name: 'Chiếc Xích Lô Phố Cổ',
    ipa: '/sit˧˥ lo˧˧/',
    tone: 'Thanh Sắc - Thanh Ngang',
    category: 'Phương Tiện Dân Gian',
    icon: '🚲',
    english: 'Pedicab (Cyclo)',
    cultureNote: 'Phương tiện giao thông hoài niệm gắn liền với các con phố Hà Nội và Huế, đưa du khách dạo quanh ngắm cảnh êm đềm.',
    honorificContext: 'Khi hỏi bác lái xe xích lô: "Dạ thưa Bác, chở cháu một vòng quanh hồ Gươm hết bao nhiêu ạ?".',
    bambooSampleSentence: 'Bác xích lô đang thong thả chở du khách dạo quanh phố cổ.',
    audioPrompt: 'Chiếc xe xích lô phố cổ trầm mặc'
  }
];
