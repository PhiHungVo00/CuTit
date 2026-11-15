import { defineMessages } from '@vietlearning/state';

/** Chuỗi giao diện M2/M6. Âm tiết, từ phương ngữ là nội dung học, không dịch. */
export const { useT, t } = defineMessages(
  {
    // M2
    toneTitle: 'Luyện 6 thanh điệu',
    toneIntro: 'Chọn một thanh, nghe mẫu rồi bấm nút micro và đọc to âm tiết.',
    pickTone: 'Chọn thanh',
    example: 'Ví dụ: {meaning}.',
    playSample: '🔈 Nghe mẫu',
    chartLabel: 'Biểu đồ cao độ {tone}',
    chartVsYou: ', so với giọng của bạn',
    stopRec: 'Dừng ghi âm',
    startRec: 'Bắt đầu ghi âm',
    'status.idle': 'Bấm để ghi âm, đọc to một lần',
    'status.starting': 'Đang mở micro…',
    'status.recording': 'Đang nghe… (tự dừng sau {s} giây, hoặc bấm để dừng)',
    'status.analyzing': 'Đang phân tích cao độ…',
    'status.again': 'Bấm để thử lại',
    openSettings: '⚙️ Mở Cài đặt của app',
    'err.permission-denied': 'App chưa được phép dùng micro. Bật quyền Micro cho Bé Cu Tít trong Cài đặt › Ứng dụng › Bé Cu Tít › Quyền.',
    'err.no-microphone': 'Không tìm thấy micro trên thiết bị.',
    'err.unsupported': 'Thiết bị này không hỗ trợ thu âm trong app.',
    'err.failed': 'Không thu âm được. Vui lòng thử lại.',
    'err.no-voice': 'Chưa nghe rõ giọng. Hãy nói to hơn, gần micro hơn, kéo dài âm tiết khoảng nửa giây.',
    'err.too-short': 'Bản ghi quá ngắn. Giữ nút lâu hơn một chút khi nói.',
    'verdict.good': 'Rất tốt!',
    'verdict.ok': 'Gần đúng rồi',
    'verdict.bad': 'Chưa đúng thanh',
    matchesTarget: 'Cao độ của bạn khớp nhất với {tone}.',
    soundsLike: 'Nghe giống {tone} (“{syllable}”) hơn. Mẹo: {tip}.',
    voiceStats: 'Giọng của bạn ~{hz} Hz · phân tích {ms} ms',
    legendSample: 'Mẫu',
    legendYou: 'Giọng của bạn',
    yAxis: 'Trục dọc: nửa cung (semitone) so với giọng thường của bạn',

    // M6
    dialectTitle: 'Phương ngữ 3 miền',
    dialectIntro: 'Cùng một vật, mỗi miền gọi một kiểu. Chạm vào từ để nghe; cột đậm là phương ngữ bạn đang học (đổi trong Tùy chỉnh).',
    oneVoice: 'Máy đọc bằng một giọng chung. Giọng theo từng miền cần TTS máy chủ (chưa bật).',
    search: 'Tìm từ',
    searchPlaceholder: 'Tìm: ngô, heo, mô…',
    onlyDifferent: 'Chỉ hiện từ khác nhau ở cả 3 miền',
    count: '{n} từ',
    unreviewed: 'chờ duyệt',
    'region.north': 'Bắc',
    'region.central': 'Trung',
    'region.south': 'Nam',
    listenTo: 'Nghe “{word}” (miền {region})',
    saved: '✓ Đã lưu để ôn',
    save: '＋ Lưu để ôn tập'
  },
  {
    toneTitle: 'Practise the 6 tones',
    toneIntro: 'Pick a tone, listen to the sample, then tap the mic and say the syllable aloud.',
    pickTone: 'Choose a tone',
    example: 'Example: {meaning}.',
    playSample: '🔈 Play sample',
    chartLabel: 'Pitch chart for the {tone}',
    chartVsYou: ', compared with your voice',
    stopRec: 'Stop recording',
    startRec: 'Start recording',
    'status.idle': 'Tap to record, say it once',
    'status.starting': 'Opening the microphone…',
    'status.recording': 'Listening… (stops after {s} seconds, or tap to stop)',
    'status.analyzing': 'Analysing your pitch…',
    'status.again': 'Tap to try again',
    openSettings: '⚙️ Open app settings',
    'err.permission-denied': 'The app isn’t allowed to use the microphone. Turn on Microphone for Bé Cu Tít in Settings › Apps › Bé Cu Tít › Permissions.',
    'err.no-microphone': 'No microphone found on this device.',
    'err.unsupported': 'This device can’t record audio in the app.',
    'err.failed': 'Couldn’t record. Please try again.',
    'err.no-voice': 'Couldn’t hear your voice clearly. Speak louder, closer to the mic, and hold the syllable for about half a second.',
    'err.too-short': 'The recording was too short. Hold on a little longer while you speak.',
    'verdict.good': 'Excellent!',
    'verdict.ok': 'Almost there',
    'verdict.bad': 'Not the right tone yet',
    matchesTarget: 'Your pitch matches the {tone} best.',
    soundsLike: 'It sounds more like the {tone} (“{syllable}”). Tip: {tip}.',
    voiceStats: 'Your voice ~{hz} Hz · analysed in {ms} ms',
    legendSample: 'Sample',
    legendYou: 'Your voice',
    yAxis: 'Vertical axis: semitones relative to your normal voice',

    dialectTitle: 'Regional dialects',
    dialectIntro: 'The same thing has different names in each region. Tap a word to hear it; the bold column is the dialect you are learning (change it in Settings).',
    oneVoice: 'The device reads with one general voice. Regional voices need server text-to-speech (not enabled).',
    search: 'Search words',
    searchPlaceholder: 'Search: corn, ngô, heo…',
    onlyDifferent: 'Only words that differ in all 3 regions',
    count: '{n} words',
    unreviewed: 'unreviewed',
    'region.north': 'North',
    'region.central': 'Central',
    'region.south': 'South',
    listenTo: 'Listen to “{word}” ({region})',
    saved: '✓ Saved for review',
    save: '＋ Save for review'
  }
);

/** Phần nghĩa tiếng Anh trong ngoặc của mục phương ngữ, vd. "Bắp ngô (Corn)" => "Corn" */
export function meaningFor(meaning: string, lang: 'vi' | 'en'): string {
  if (lang === 'vi') return meaning;
  const m = /\(([^()]+)\)\s*$/.exec(meaning);
  return m ? m[1] : meaning;
}
