/**
 * Chữ của trang giới thiệu (vi + en), chèn vào HTML lúc build. Không dùng thư viện i18n.
 * Hai bản phải có CÙNG khóa (test/messages.test.ts kiểm). Nội dung học tiếng Việt (câu ví dụ) giữ nguyên tiếng Việt ở cả hai bản.
 * Giọng thân thiện như app. Người dùng xem lại chữ khi duyệt ảnh chụp (Task 4).
 */
export type Lang = 'vi' | 'en';

export type Messages = {
  brand: string;
  meta: { title: string; description: string; apkTitle: string; apkDescription: string; ogAlt: string };
  nav: { login: string; home: string; langLabel: string; skip: string };
  hero: { title: string; sub: string; music: string; musicOn: string; art: string };
  cta: { web: string; apk: string; apkSoon: string };
  suggest: { text: string; link: string; close: string };
  ba: {
    title: string;
    sentence: string;
    hint: string;
    bac: string;
    trung: string;
    nam: string;
    error: string;
    honorific: string;
    toGrandpa: string;
    toSister: string;
    toYounger: string;
  };
  feat: {
    heading: string;
    path: { title: string; body: string; alt: string };
    chat: { title: string; body: string; alt: string };
    culture: { title: string; body: string; alt: string };
  };
  faq: { heading: string; items: { q: string; a: string }[] };
  end: { title: string };
  footer: { privacy: string; deleteAccount: string; apkGuide: string; feedback: string; copy: string };
  apk: {
    title: string;
    intro: string;
    version: string;
    size: string;
    sha: string;
    minAndroid: string;
    download: string;
    soon: string;
    soonNote: string;
    notAndroid: string;
    notAndroidCta: string;
    stepsTitle: string;
    steps: string[];
    back: string;
  };
};

const vi: Messages = {
  brand: 'Bé Cu Tít',
  meta: {
    title: 'Bé Cu Tít: học tiếng Việt như người Việt nói',
    description: 'Bài học ngắn mỗi ngày, giọng đọc ba miền, xưng hô đúng chuẩn và một người bạn AI luôn sẵn lòng trò chuyện. Bắt đầu miễn phí trên web.',
    apkTitle: 'Tải Bé Cu Tít cho Android (APK)',
    apkDescription: 'Hướng dẫn tải và cài bản APK của Bé Cu Tít trên Android. Dùng iPhone hoặc máy tính? Hãy dùng bản web.',
    ogAlt: 'Bé Cu Tít đội nón lá vẫy chào giữa làng quê Việt Nam'
  },
  nav: { login: 'Đăng nhập', home: 'Bé Cu Tít, về trang chủ', langLabel: 'Ngôn ngữ', skip: 'Bỏ qua, tới nội dung chính' },
  hero: {
    title: 'Học tiếng Việt như người Việt nói, cùng Bé Cu Tít',
    sub: 'Bài học ngắn mỗi ngày, giọng đọc ba miền, xưng hô đúng chuẩn, và một người bạn AI luôn sẵn lòng trò chuyện.',
    music: '🎵 Nghe làng quê',
    musicOn: '⏸ Tắt tiếng làng quê',
    art: 'Làng quê Việt Nam: lũy tre, đồng lúa, trâu và mái đình'
  },
  cta: { web: 'Bắt đầu miễn phí trên web', apk: 'Tải APK cho Android', apkSoon: 'Tải APK cho Android (Sắp có)' },
  suggest: { text: 'Bạn muốn xem trang bằng tiếng Anh?', link: 'View in English', close: 'Ẩn gợi ý' },
  ba: {
    title: 'Một câu, ba miền',
    sentence: 'Chào bạn, bạn ăn cơm chưa?',
    hint: 'Bấm để nghe người Bắc, Trung, Nam nói cùng một câu.',
    bac: 'Bắc',
    trung: 'Trung',
    nam: 'Nam',
    error: 'Không phát được âm thanh lúc này. Bạn thử lại sau nhé.',
    honorific: 'Cùng một câu, nói với ai thì xưng hô khác nhau:',
    toGrandpa: 'Nói với ông: "Ông ăn cơm chưa ạ?"',
    toSister: 'với chị: "Chị ăn cơm chưa?"',
    toYounger: 'với em: "Em ăn cơm chưa?"'
  },
  feat: {
    heading: 'Có gì trong Bé Cu Tít?',
    path: { title: 'Lộ trình từng bước nhỏ', body: 'Mỗi ngày vài phút, ôn đúng lúc sắp quên.', alt: 'Màn Lộ trình bài học trong app' },
    chat: { title: 'Trò chuyện và gọi với Cu Tít', body: 'Luyện nói như với một người bạn, được sửa nhẹ nhàng.', alt: 'Màn trò chuyện với Cu Tít trong app' },
    culture: { title: 'Xưng hô và văn hóa', body: 'Biết gọi ông, bà, anh, chị cho đúng, và hiểu vì sao.', alt: 'Màn Xưng hô trong app' }
  },
  faq: {
    heading: 'Hỏi đáp',
    items: [
      { q: 'Có tốn tiền không?', a: 'Bạn bắt đầu học miễn phí. Sau này có thể có gói nâng cao, và chúng tôi sẽ nói rõ trước.' },
      { q: 'Có app iPhone không?', a: 'Chưa có. Bạn dùng bản web trên Safari, cũng học được đầy đủ.' },
      { q: 'Cài APK thế nào?', a: 'Chỉ cần ba bước, có hình minh họa. Xem trang hướng dẫn cài APK.' },
      { q: 'Dữ liệu của tôi đi đâu?', a: 'Bạn xem chi tiết ở trang Quyền riêng tư. Bạn cũng có thể xóa tài khoản bất cứ lúc nào.' },
      { q: 'Học được khi không có mạng không?', a: 'Phần lớn bài học đã tải sẵn vẫn mở được. Trò chuyện với Cu Tít cần có mạng.' }
    ]
  },
  end: { title: 'Sẵn sàng nói tiếng Việt?' },
  footer: { privacy: 'Quyền riêng tư', deleteAccount: 'Xóa tài khoản', apkGuide: 'Hướng dẫn cài APK', feedback: 'Góp ý', copy: 'Bé Cu Tít' },
  apk: {
    title: 'Tải Bé Cu Tít cho Android',
    intro: 'Cài trực tiếp bản APK nếu bạn dùng điện thoại Android.',
    version: 'Phiên bản',
    size: 'Cỡ tệp',
    sha: 'SHA-256 (để kiểm tệp tải về đúng)',
    minAndroid: 'Yêu cầu Android',
    download: 'Tải APK',
    soon: 'Sắp có',
    soonNote: 'Bản APK chính thức chưa sẵn sàng. Trong lúc chờ, bạn học trên web nhé.',
    notAndroid: 'Bạn đang dùng iPhone hoặc máy tính. APK chỉ cài được trên Android, nên hãy dùng bản web.',
    notAndroidCta: 'Mở bản web',
    stepsTitle: 'Cài đặt trong ba bước',
    steps: [
      'Tải tệp APK về điện thoại, rồi mở tệp vừa tải.',
      'Nếu máy hỏi, bật "Cho phép cài ứng dụng từ nguồn này" cho trình duyệt hoặc ứng dụng Tệp.',
      'Bấm Cài đặt, rồi mở Bé Cu Tít.'
    ],
    back: 'Về trang chủ'
  }
};

const en: Messages = {
  brand: 'Bé Cu Tít',
  meta: {
    title: 'Bé Cu Tít: learn Vietnamese the way it is really spoken',
    description: 'Short daily lessons, three regional accents, the right way to address people, and an AI friend who loves to chat. Start free on the web.',
    apkTitle: 'Get Bé Cu Tít for Android (APK)',
    apkDescription: 'How to download and install the Bé Cu Tít APK on Android. On iPhone or a computer? Use the web version.',
    ogAlt: 'Cu Tít in a conical hat waving hello in a Vietnamese village'
  },
  nav: { login: 'Log in', home: 'Bé Cu Tít, back to home', langLabel: 'Language', skip: 'Skip to main content' },
  hero: {
    title: "Learn Vietnamese the way it's really spoken, with Cu Tít",
    sub: 'Short daily lessons, three regional accents, the right way to address people, and an AI friend who is always happy to chat.',
    music: '🎵 Hear the village',
    musicOn: '⏸ Stop village sounds',
    art: 'A Vietnamese village: bamboo, rice fields, a water buffalo and a communal house roof'
  },
  cta: { web: 'Start free on the web', apk: 'Get the Android APK', apkSoon: 'Get the Android APK (coming soon)' },
  suggest: { text: 'Prefer this page in English?', link: 'View in English', close: 'Dismiss' },
  ba: {
    title: 'One sentence, three accents',
    sentence: 'Chào bạn, bạn ăn cơm chưa?',
    hint: 'Tap to hear the same sentence in Northern, Central and Southern Vietnamese.',
    bac: 'North',
    trung: 'Central',
    nam: 'South',
    error: "Couldn't play the audio right now. Please try again later.",
    honorific: 'Who you talk to changes how you address them:',
    toGrandpa: 'To a grandfather: "Ông ăn cơm chưa ạ?"',
    toSister: 'to an older sister: "Chị ăn cơm chưa?"',
    toYounger: 'to a younger person: "Em ăn cơm chưa?"'
  },
  feat: {
    heading: "What's inside Bé Cu Tít?",
    path: { title: 'A path of small steps', body: 'A few minutes a day, with reviews right before you forget.', alt: 'The lesson path screen in the app' },
    chat: { title: 'Chat and call with Cu Tít', body: 'Practise speaking like with a friend, with gentle corrections.', alt: 'The chat with Cu Tít screen in the app' },
    culture: { title: 'Pronouns and culture', body: 'Learn how to address grandpa, grandma, brother and sister, and why.', alt: 'The pronouns screen in the app' }
  },
  faq: {
    heading: 'FAQ',
    items: [
      { q: 'Does it cost money?', a: 'You can start for free. An advanced plan may come later, and we will say so clearly beforehand.' },
      { q: 'Is there an iPhone app?', a: 'Not yet. Use the web version in Safari; you can learn everything there.' },
      { q: 'How do I install the APK?', a: 'Just three steps, with pictures. See the APK install guide.' },
      { q: 'Where does my data go?', a: 'See the Privacy page for details. You can also delete your account at any time.' },
      { q: 'Can I learn offline?', a: 'Most downloaded lessons still open without internet. Chatting with Cu Tít needs a connection.' }
    ]
  },
  end: { title: 'Ready to speak Vietnamese?' },
  footer: { privacy: 'Privacy', deleteAccount: 'Delete account', apkGuide: 'APK install guide', feedback: 'Feedback', copy: 'Bé Cu Tít' },
  apk: {
    title: 'Get Bé Cu Tít for Android',
    intro: 'Install the APK directly if you use an Android phone.',
    version: 'Version',
    size: 'File size',
    sha: 'SHA-256 (to check your download)',
    minAndroid: 'Requires Android',
    download: 'Download APK',
    soon: 'Coming soon',
    soonNote: 'The official APK is not ready yet. In the meantime, learn on the web.',
    notAndroid: 'You are on an iPhone or a computer. An APK only installs on Android, so please use the web version.',
    notAndroidCta: 'Open the web version',
    stepsTitle: 'Install in three steps',
    steps: [
      'Download the APK file to your phone, then open the file.',
      'If asked, allow installing apps from this source for your browser or Files app.',
      'Tap Install, then open Bé Cu Tít.'
    ],
    back: 'Back to home'
  }
};

export const messages: Record<Lang, Messages> = { vi, en };
