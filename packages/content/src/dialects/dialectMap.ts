/**
 * Thuật toán A7: Bảng Ánh xạ Từ vựng Phương ngữ Bắc - Trung - Nam
 * Cung cấp từ đồng nghĩa, ngữ cảnh sử dụng và mẫu phát âm đặc trưng 3 miền.
 */

export interface DialectEntry {
  id: string;
  category: 'food' | 'household' | 'kinship' | 'action' | 'nature';
  categoryLabel: string;
  standard: string;
  north: string;
  central: string;
  south: string;
  northIpa?: string;
  southIpa?: string;
  meaning: string;
  icon: string;
  culturalNote?: string;
  sampleNorth?: string;
  sampleCentral?: string;
  sampleSouth?: string;
}

export const DIALECT_DICTIONARY: DialectEntry[] = [
  {
    id: 'd1',
    category: 'household',
    categoryLabel: 'Đồ Gia Dụng',
    standard: 'bát',
    north: 'bát',
    central: 'đọi / bát',
    south: 'chén',
    northIpa: '/ɓaːt̚˧˥/',
    southIpa: '/cɛn˧˥/',
    meaning: 'Đồ dùng đựng cơm hoặc canh trong bữa ăn',
    icon: 'rice_bowl',
    culturalNote: 'Ở miền Bắc gọi là "cái bát", vào miền Nam nhớ gọi là "cái chén" nhé! Còn ở miền Bắc "chén" là chén nhỏ uống trà.',
    sampleNorth: 'Bác ơi, cho cháu xin thêm một cái bát sạch!',
    sampleCentral: 'Mệ ơi, cho con xin cái đọi múc canh!',
    sampleSouth: 'Cô ơi, lấy giùm con thêm cái chén không nghen!'
  },
  {
    id: 'd2',
    category: 'food',
    categoryLabel: 'Ẩm Thực',
    standard: 'ngô',
    north: 'ngô',
    central: 'bắp',
    south: 'bắp',
    northIpa: '/ŋo˧˧/',
    southIpa: '/ɓap̚˧˥/',
    meaning: 'Hạt dẻo, luộc hoặc nướng mỡ hành (Corn)',
    icon: 'grain',
    culturalNote: 'Người miền Bắc thích bắp ngô luộc nóng hổi mùa đông, miền Nam có món bắp xào tôm bơ mỡ hành thơm nức.',
    sampleNorth: 'Cho một bắp ngô nếp nướng thơm phức nào!',
    sampleCentral: 'Bán cho tui trái bắp luộc thơm ngọt nghen!',
    sampleSouth: 'Cho một hộp bắp xào bơ mỡ hành thơm lừng chú ơi!'
  },
  {
    id: 'd3',
    category: 'food',
    categoryLabel: 'Ẩm Thực',
    standard: 'dứa',
    north: 'dứa',
    central: 'khóm',
    south: 'thơm / khóm',
    northIpa: '/zɨə˧˥/',
    southIpa: '/tʰəːm˧˧/',
    meaning: 'Trái cây nhiệt đới ngọt thanh, mắt gai (Pineapple)',
    icon: 'nutrition',
    culturalNote: 'Ở miền Nam, "trái thơm" thường to và ngọt hơn, còn "khóm" quả nhỏ, mắt sâu và hơi chua nhẹ.',
    sampleNorth: 'Gọt cho em quả dứa ngọt ăn giải khát nhé!',
    sampleCentral: 'Gọt cho o trái khóm nấu canh chua cá lóc!',
    sampleSouth: 'Lấy cho chị trái thơm chín vàng mọng nước đi em!'
  },
  {
    id: 'd4',
    category: 'household',
    categoryLabel: 'Đồ Gia Dụng',
    standard: 'thìa',
    north: 'thìa',
    central: 'muỗng / thìa',
    south: 'muỗng',
    northIpa: '/tʰiə˨˩/',
    southIpa: '/muəŋ˦ˀ˥/',
    meaning: 'Dụng cụ múc canh, xúc thức ăn (Spoon)',
    icon: 'restaurant',
    culturalNote: 'Miền Bắc dùng "thìa súp", miền Nam quen gọi "cái muỗng cà phê, muỗng canh".',
    sampleNorth: 'Chị ơi, mang cho em cái thìa nhỏ múc súp.',
    sampleCentral: 'Cho con xin thêm cái muỗng ăn cơm mệ ơi.',
    sampleSouth: 'Lấy giùm con hai cái muỗng với đôi đũa nghen dì!'
  },
  {
    id: 'd5',
    category: 'household',
    categoryLabel: 'Đồ Gia Dụng',
    standard: 'tất',
    north: 'tất / đôi tất',
    central: 'vớ',
    south: 'vớ / đôi vớ',
    northIpa: '/tat̚˧˥/',
    southIpa: '/vəː˧˥/',
    meaning: 'Đồ dệt kim giữ ấm cho bàn chân (Socks)',
    icon: 'footprint',
    culturalNote: 'Mùa đông Hà Nội đi "tất len", còn mùa mưa Sài Gòn đi "đôi vớ chống trượt".',
    sampleNorth: 'Trời rét thế này nhớ xỏ đôi tất ấm vào con nhé!',
    sampleCentral: 'Trời lạnh nhớ mang đôi vớ kẻo lạnh chân hí.',
    sampleSouth: 'Sáng nay mưa lạnh nhớ mang vớ vô chân nha con.'
  },
  {
    id: 'd6',
    category: 'food',
    categoryLabel: 'Ẩm Thực',
    standard: 'lạc',
    north: 'lạc',
    central: 'đậu phụng',
    south: 'đậu phộng',
    northIpa: '/laːk̚˨˩/',
    southIpa: '/ɗəu˨˩ fəwŋ͡m˨˩/',
    meaning: 'Hạt có vỏ giòn, rang muối hoặc làm kẹo (Peanut)',
    icon: 'egg',
    culturalNote: 'Miền Bắc gọi kẹo lạc, miền Trung gọi kẹo cu đơ đậu phụng, miền Nam gọi kẹo thèo lèo đậu phộng.',
    sampleNorth: 'Uống chén trà tươi nhâm nhi chút lạc rang giòn.',
    sampleCentral: 'Ăn miếng bánh đa xúc đậu phụng bùi thơm quá.',
    sampleSouth: 'Bỏ thêm đậu phộng rang giòn lên đĩa gỏi tôm thịt nghen.'
  },
  {
    id: 'd7',
    category: 'kinship',
    categoryLabel: 'Xưng Hô',
    standard: 'bố',
    north: 'bố / thầy',
    central: 'bố / ba',
    south: 'ba / tía',
    northIpa: '/ɓo˧˥/',
    southIpa: '/ɓaː˧˧ / tiə˧˥/',
    meaning: 'Người cha ruột thịt trong gia đình',
    icon: 'family_restroom',
    culturalNote: 'Dân dã miền Tây Nam Bộ hay gọi là "Tía", người Hà Nội xưa tôn kính gọi "Bố" hoặc "Thầy".',
    sampleNorth: 'Bố đi làm về có mệt không ạ?',
    sampleCentral: 'Ba ơi, trưa nay ba có về nhà dùng cơm không?',
    sampleSouth: 'Tía ơi, chiều nay con phụ tía tưới giàn mướp nha!'
  },
  {
    id: 'd8',
    category: 'kinship',
    categoryLabel: 'Xưng Hô',
    standard: 'mẹ',
    north: 'mẹ / u / bu',
    central: 'mẹ / mạ',
    south: 'má / mẹ',
    northIpa: '/mɛ˨˩/',
    southIpa: '/maː˧˥/',
    meaning: 'Người mẹ ruột thịt trong gia đình',
    icon: 'pregnant_woman',
    culturalNote: 'Tiếng gọi "Má" thân thương của người miền Nam, tiếng "Mạ" ngọt bùi của xứ Huế, tiếng "Mẹ" ấm áp của miền Bắc.',
    sampleNorth: 'Mẹ ơi, hôm nay mẹ nấu món gì thế ạ?',
    sampleCentral: 'Mạ ơi, mạ đi chợ về có mua chè sen cho con không?',
    sampleSouth: 'Má ơi, con đi học mới dìa nè má!'
  },
  {
    id: 'd9',
    category: 'household',
    categoryLabel: 'Đồ Gia Dụng',
    standard: 'ô',
    north: 'ô',
    central: 'dù',
    south: 'dù',
    northIpa: '/o˧˧/',
    southIpa: '/zu˨˩/',
    meaning: 'Đồ dùng che nắng, che mưa cầm tay (Umbrella)',
    icon: 'umbrella',
    culturalNote: 'Người Hà Nội đi dưới mưa xuân che "chiếc ô che đầu", người Sài Gòn che "cây dù" tránh cơn mưa rào bất chợt.',
    sampleNorth: 'Trời sắp đổ mưa rào rồi, nhớ đem theo cái ô nhé!',
    sampleCentral: 'Mang theo cây dù kẻo trúng mưa cố đô ướt áo.',
    sampleSouth: 'Trời chuyển mưa rồi kìa, cầm theo cây dù che nghen anh!'
  },
  {
    id: 'd10',
    category: 'action',
    categoryLabel: 'Hành Động',
    standard: 'về',
    north: 'về',
    central: 'về / vô',
    south: 'dìa / về',
    northIpa: '/ve˨˩/',
    southIpa: '/jiə˨˩/',
    meaning: 'Trở lại nơi chốn quen thuộc, mái ấm nhà mình',
    icon: 'home',
    culturalNote: 'Âm "v" trong phương ngữ Nam Bộ thường chuyển hóa thành "d", biến "về" thành "dìa" nghe mộc mạc và chân chất.',
    sampleNorth: 'Hôm nay tan sở sớm, tôi về nhà với gia đình.',
    sampleCentral: 'Tan buổi làm rồi, con xin phép đi về nhà trước ạ.',
    sampleSouth: 'Dạ con thưa tía má, bữa nay con mới dìa tới nơi nè!'
  },
  {
    id: 'd11',
    category: 'action',
    categoryLabel: 'Hành Động',
    standard: 'ngã',
    north: 'ngã',
    central: 'ngã / trật',
    south: 'té',
    northIpa: '/ŋaː˦ˀ˥/',
    southIpa: '/tɛ˧˥/',
    meaning: 'Mất thăng bằng ngã xuống đất (Fall down)',
    icon: 'personal_injury',
    culturalNote: 'Ở miền Bắc gọi là "ngã xe, ngã đau", người miền Nam quen gọi là "té xe, té cái ạch".',
    sampleNorth: 'Đi đứng cẩn thận kẻo ngã đau đấy bé ơi!',
    sampleCentral: 'Đi coi chừng trơn trượt té ngã nghe con.',
    sampleSouth: 'Chạy chầm chậm thôi nhỏ ơi, coi chừng té u đầu đó nghen!'
  },
  {
    id: 'd12',
    category: 'action',
    categoryLabel: 'Hành Động',
    standard: 'gầy',
    north: 'gầy',
    central: 'gầy / còm',
    south: 'ốm',
    northIpa: '/ɣəj˨˩/',
    southIpa: '/om˧˥/',
    meaning: 'Thiếu cân nặng, dáng người thanh mảnh (Thin)',
    icon: 'accessibility_new',
    culturalNote: 'Miền Bắc dùng "ốm" nghĩa là bị bệnh, "gầy" là mảnh khảnh. Trong khi miền Nam "ốm" lại là gầy (trái nghĩa với mập)!',
    sampleNorth: 'Dạo này thức khuya ôn thi nên trông gầy hẳn đi.',
    sampleCentral: 'Ăn uống bồi bổ thêm nghe, dạo ni trông gầy quá đó.',
    sampleSouth: 'Sao đợt này ốm nhom vậy mậy, ráng ăn nhiều vô cho mập nghen!'
  }
];

export class DialectMapper {
  public getAllEntries(): DialectEntry[] {
    return DIALECT_DICTIONARY;
  }

  public getByCategory(category: string): DialectEntry[] {
    if (category === 'all') return DIALECT_DICTIONARY;
    return DIALECT_DICTIONARY.filter(item => item.category === category);
  }

  public search(query: string): DialectEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return DIALECT_DICTIONARY;

    const normalizeVN = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd');

    const qNorm = normalizeVN(q);

    return DIALECT_DICTIONARY.filter(item => {
      return (
        item.standard.toLowerCase().includes(q) ||
        item.north.toLowerCase().includes(q) ||
        item.central.toLowerCase().includes(q) ||
        item.south.toLowerCase().includes(q) ||
        item.meaning.toLowerCase().includes(q) ||
        normalizeVN(item.standard).includes(qNorm) ||
        normalizeVN(item.north).includes(qNorm) ||
        normalizeVN(item.south).includes(qNorm)
      );
    });
  }

  public getWordByRegion(entry: DialectEntry, region: 'north' | 'central' | 'south'): string {
    switch (region) {
      case 'north':
        return entry.north;
      case 'central':
        return entry.central;
      case 'south':
        return entry.south;
      default:
        return entry.standard;
    }
  }

  public getSampleByRegion(entry: DialectEntry, region: 'north' | 'central' | 'south'): string {
    switch (region) {
      case 'north':
        return entry.sampleNorth || entry.meaning;
      case 'central':
        return entry.sampleCentral || entry.meaning;
      case 'south':
        return entry.sampleSouth || entry.meaning;
      default:
        return entry.meaning;
    }
  }
}
