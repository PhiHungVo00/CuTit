import { getAudioEnv, getAudioSettings, onAudioConfigured } from './config.js';
import { isAudioBusy, onAudioBusyChange } from './focus.js';
import { AUDIO_BASE, unlockSfx } from './sfx.js';
import type { MusicChoice, MusicTrack } from './types.js';

const FADE_MS = 300;
const FADE_STEP_MS = 50;
const RESUME_DELAY_MS = 1000;

/** Sáng 5–11h, chiều 12–17h, tối/đêm còn lại (khớp trackForHour của 01-nen-tang/packages/state; shared không được import state). */
function trackForHour(hour: number): MusicTrack {
  if (hour >= 5 && hour < 12) return 'sang-lang';
  if (hour >= 12 && hour < 18) return 'chieu-dong';
  return 'trau-ve';
}

const urlFor = (choice: MusicChoice): string => `${AUDIO_BASE}/nhac/${choice === 'rotate' ? trackForHour(new Date().getHours()) : choice}.ogg`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

let audio: HTMLAudioElement | null = null;
/** Người dùng/app muốn nhạc phát (đã start, chưa stop). */
let wanted = false;
/** Đã gọi play() mà chưa pause: nhạc đang (sắp) vang. */
let active = false;
/** play() bị trình duyệt từ chối: KHÔNG thử lại cho tới unlockAudio(). */
let blocked = false;
/** App khác giành audio focus: dừng tới unlockAudio(). */
let focusLost = false;
let trackOverride: MusicChoice | null = null;
let volumeOverride: number | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let offFocus: (() => void) | null = null;

const volume = (): number => volumeOverride ?? clamp01(getAudioSettings().musicVolume);
const track = (): MusicChoice => trackOverride ?? getAudioSettings().musicTrack;
const hidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function clearTimers(): void {
  if (fadeTimer) clearInterval(fadeTimer);
  if (resumeTimer) clearTimeout(resumeTimer);
  fadeTimer = resumeTimer = null;
}

function tryPlay(): void {
  if (!audio || !wanted || active || blocked || focusLost || hidden() || isAudioBusy()) return;
  const a = audio;
  // Chế độ xoay vòng: đổi bài nếu đã qua mốc giờ (12h, 18h, 5h) kể từ lần chọn trước, kể cả khi quay lại từ nền
  const want = urlFor(track());
  if (!a.src.endsWith(want)) a.src = want;
  a.volume = volume();
  active = true;
  Promise.resolve(a.play())
    .then(() => {
      if (!active) a.pause(); // bị dừng trong lúc play() đang chờ
    })
    .catch(() => {
      // NotAllowedError (chưa có cử chỉ) hoặc nguồn lỗi: im lặng, đợi unlockAudio()
      active = false;
      blocked = true;
    });
}

function pauseNow(): void {
  active = false;
  audio?.pause();
}

/** Tắt NGAY khi có hoạt động âm thanh (thu âm bắt đầu ghi lập tức, nhạc đang hạ dần vẫn lọt vào bản thu). */
function fadeOutAndPause(): void {
  if (!audio || !active) return;
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
  audio.volume = 0;
  pauseNow();
}

/** (Giữ cho dừng thường) Hạ dần về 0 trong FADE_MS rồi pause. */
export function fadeOutSoftly(): void {
  if (!audio || !active || fadeTimer) return;
  const a = audio;
  const from = a.volume;
  const steps = FADE_MS / FADE_STEP_MS;
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    a.volume = clamp01(from * (1 - i / steps));
    if (i >= steps) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      a.volume = 0;
      pauseNow();
    }
  }, FADE_STEP_MS);
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(urlFor(track()));
    audio.loop = true;
  }
  return audio;
}

function begin(): void {
  if (!wanted) return;
  const a = ensureAudio();
  a.src = urlFor(track());
  tryPlay();
}

export const music = {
  start(): void {
    if (!getAudioSettings().music || wanted) return;
    wanted = true;
    const silent = getAudioEnv().isSilent;
    if (!silent) return begin();
    // máy đang im lặng ⇒ không bắt đầu; lỗi hỏi trạng thái ⇒ coi như không im lặng
    void silent()
      .catch(() => false)
      .then((s) => (s ? (wanted = false) : begin()));
  },
  stop(): void {
    wanted = false;
    clearTimers();
    pauseNow();
  },
  setTrack(t: MusicChoice): void {
    trackOverride = t;
    if (!audio) return;
    const was = active;
    audio.src = urlFor(t);
    if (was) {
      active = false;
      tryPlay();
    }
  },
  setVolume(v: number): void {
    volumeOverride = clamp01(v);
    if (audio && !fadeTimer) audio.volume = volumeOverride;
  }
};

/** Gọi ở cử chỉ đầu tiên của người dùng (và mỗi lần mở lại app): mở khóa loa, cho phép nhạc phát. */
export function unlockAudio(): void {
  unlockSfx();
  blocked = false;
  focusLost = false;
  if (getAudioSettings().music && !wanted) music.start();
  else tryPlay();
}

onAudioBusyChange((busy) => {
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = null;
  if (busy) fadeOutAndPause();
  else resumeTimer = setTimeout(tryPlay, RESUME_DELAY_MS);
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (hidden()) {
      clearTimers();
      pauseNow();
    } else if (!isAudioBusy()) tryPlay();
  });
}

// Mỗi lần cấu hình lại = phiên mới: bỏ trạng thái cũ, đăng ký lại onFocusLost của môi trường mới.
onAudioConfigured(() => {
  clearTimers();
  audio?.pause();
  audio = null;
  wanted = active = blocked = focusLost = false;
  trackOverride = volumeOverride = null;
  offFocus?.();
  offFocus = getAudioEnv().onFocusLost?.(() => {
    focusLost = true;
    music.stop();
  }) ?? null;
});
