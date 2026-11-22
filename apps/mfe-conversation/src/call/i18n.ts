import { defineMessages } from '@vietlearning/state';

/**
 * Chuỗi giao diện riêng của màn gọi (Task 7). Tệp riêng để không đụng `../i18n.ts` (phiên chat đang sửa).
 * Lời Cu Tít nói luôn là tiếng Việt (nội dung học), không dịch.
 */
export const { useT, t } = defineMessages(
  {
    statusListening: 'Cu Tít đang nghe…',
    statusThinking: 'Cu Tít đang nghĩ…',
    statusSpeaking: 'Cu Tít đang nói…',
    statusWatching: 'Cu Tít đang xem…',
    videoStart: 'Gọi video',
    videoIntro: 'Cu Tít sẽ xem camera của bạn mỗi khi bạn nói xong một câu. Ảnh chỉ gửi kèm câu nói đó, không quay phim.',
    videoPreview: 'Hình camera của bạn',
    cameraOff: 'Tắt camera',
    cameraDenied: 'Chưa cho phép dùng camera, nên mình chuyển sang gọi thường. Cuộc gọi vẫn tiếp tục nhé.',
    cameraStopped: 'Bạn đã tắt camera, cuộc gọi tiếp tục như gọi thường.',
    cameraFailed: 'Không mở được camera, nên mình chuyển sang gọi thường. Cuộc gọi vẫn tiếp tục nhé.',
    turnRule: 'Mỗi câu nói = 1 lượt',
    turnRuleVideo: 'Mỗi câu nói = 1 lượt (kèm 1 ảnh)',
    turnsRemaining: 'Còn {n} lượt hôm nay'
  },
  {
    statusListening: 'Cu Tít is listening…',
    statusThinking: 'Cu Tít is thinking…',
    statusSpeaking: 'Cu Tít is talking…',
    statusWatching: 'Cu Tít is looking…',
    videoStart: 'Video call',
    videoIntro: 'Cu Tít looks through your camera each time you finish a sentence. One photo is sent with that sentence only — nothing is recorded.',
    videoPreview: 'Your camera view',
    cameraOff: 'Turn camera off',
    cameraDenied: 'Camera permission isn’t allowed, so this is now a normal call. The call keeps going.',
    cameraStopped: 'You turned the camera off — the call goes on as a normal call.',
    cameraFailed: 'The camera couldn’t start, so this is now a normal call. The call keeps going.',
    turnRule: 'Each sentence you say = 1 turn',
    turnRuleVideo: 'Each sentence you say = 1 turn (with 1 photo)',
    turnsRemaining: '{n} turns left today'
  }
);
