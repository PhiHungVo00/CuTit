import { defineMessages } from '@vietlearning/state';

/** Chuỗi giao diện của Shell (nằm ở bundle đầu: giữ ngắn). Từ điển của từng màn hình nằm trong MFE đó. */
export const { useT, t } = defineMessages(
  {
    appTitle: 'Học Tiếng Việt Cùng Bé Cu Tít',
    homeLead: 'Mỗi ngày một bài ngắn: bấm “Học tiếp” để bắt đầu.',
    learn: 'Học',
    tabPractice: 'Luyện tập',
    tabFriends: 'Bạn bè',
    tabProfile: 'Hồ sơ',
    friendsSoon: 'Học cùng bạn bè vui hơn! Màn kết bạn sẽ có ở đây.',
    pathLoading: 'Đang tải lộ trình…',
    homeLevel: 'Trình độ {level} · ',
    onboardTitle: 'Lần đầu học cùng Cu Tít?',
    onboardBody: 'Làm quen 1 phút và xếp lớp để bài học vừa sức bạn.',
    open: 'Mở',
    soon: 'Sắp có',
    loading: 'Đang mở màn hình…',
    offline: 'Đang ngoại tuyến · Nội dung đã tải vẫn dùng được',
    mainNav: 'Điều hướng chính',
    chunkFailed: 'Không tải được màn hình. Kiểm tra kết nối mạng rồi thử lại.',
    screenError: 'Màn hình này gặp lỗi.',
    retry: 'Thử lại',
    langSwitch: 'English',
    langSwitchLabel: 'Switch the app to English',
  },
  {
    appTitle: 'Learn Vietnamese with Cu Tít',
    homeLead: 'One short lesson a day: tap “Continue” to start.',
    learn: 'Learn',
    tabPractice: 'Practice',
    tabFriends: 'Friends',
    tabProfile: 'Profile',
    friendsSoon: 'Learning is more fun with friends! Adding friends will show up here.',
    pathLoading: 'Loading your path…',
    homeLevel: 'Level {level} · ',
    onboardTitle: 'New to Cu Tít?',
    onboardBody: 'Take a 1-minute intro and placement test so lessons match your level.',
    open: 'Open',
    soon: 'Soon',
    loading: 'Opening…',
    offline: 'Offline · Downloaded content still works',
    mainNav: 'Main navigation',
    chunkFailed: 'Could not load this screen. Check your connection and try again.',
    screenError: 'Something went wrong on this screen.',
    retry: 'Try again',
    langSwitch: 'Tiếng Việt',
    langSwitchLabel: 'Chuyển giao diện sang tiếng Việt',
  }
);

export type ShellKey = Parameters<ReturnType<typeof useT>>[0];
