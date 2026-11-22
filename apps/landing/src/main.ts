/**
 * Phần JS nhỏ của trang giới thiệu (không khung giao diện, không cookie, không gọi Gateway):
 *  - nhớ lựa chọn VI/EN (localStorage bọc try/catch), gợi ý "View in English" (không tự chuyển trang)
 *  - nút ▶ Bắc/Trung/Nam và "Nghe làng quê": chỉ phát khi bấm; lỗi tải thì báo nhẹ, không treo
 *  - trang /tai-apk: người dùng không phải Android thì hiện gợi ý dùng bản web
 */
import { setLang, shouldSuggestEnglish, type Lang } from './lang';
import './styles/landing.css';

const pageLang = (document.documentElement.lang === 'en' ? 'en' : 'vi') as Lang;

/** Chọn định dạng trình duyệt phát được: Opus/OGG trước, MP3 dự phòng */
function audioUrl(name: string): string {
  const a = document.createElement('audio');
  const ogg = a.canPlayType('audio/ogg; codecs="opus"') !== '';
  return `/audio/${name}.${ogg ? 'ogg' : 'mp3'}`;
}

const music = document.querySelector<HTMLElement>('[data-music]');
let current: { audio: HTMLAudioElement; button: HTMLElement } | null = null;

function setState(button: HTMLElement, state: 'idle' | 'playing' | 'error'): void {
  button.dataset.state = state;
}

function stopCurrent(): void {
  if (!current) return;
  current.audio.pause();
  setState(current.button, 'idle');
  if (current.button === music) setMusic(false);
  current = null;
}

function showError(button: HTMLElement): void {
  setState(button, 'error');
  const status = document.querySelector<HTMLElement>('[data-play-status]');
  if (status) status.textContent = button.dataset.error ?? '';
  if (current?.button === button) current = null;
  if (button === music) setMusic(false);
}

/** Phát một tệp âm thanh theo yêu cầu của người dùng. Mọi lỗi (404, mạng, bị chặn) đều thành trạng thái "error" */
function play(button: HTMLElement, name: string, loop = false): void {
  stopCurrent();
  const status = document.querySelector<HTMLElement>('[data-play-status]');
  if (status) status.textContent = '';
  const audio = new Audio();
  audio.loop = loop;
  audio.preload = 'auto';
  current = { audio, button };
  setState(button, 'playing');
  audio.addEventListener('error', () => showError(button), { once: true });
  audio.addEventListener('ended', () => {
    if (current?.audio === audio) {
      setState(button, 'idle');
      current = null;
    }
  });
  audio.src = audioUrl(name);
  audio.play().catch(() => showError(button));
}

for (const button of document.querySelectorAll<HTMLElement>('[data-play]')) {
  button.addEventListener('click', () => {
    if (button.dataset.state === 'playing') return stopCurrent();
    play(button, `ba-mien-${button.dataset.play}`);
  });
}

function setMusic(on: boolean): void {
  if (!music) return;
  music.setAttribute('aria-pressed', String(on));
  music.textContent = (on ? music.dataset.onLabel : music.dataset.offLabel) ?? '';
}
music?.addEventListener('click', () => {
  if (music.getAttribute('aria-pressed') === 'true') {
    stopCurrent();
    return setMusic(false);
  }
  play(music, 'sang-lang', true);
  setMusic(true);
});

// --- VI/EN: nhớ lựa chọn; liên kết tự đưa sang trang kia (hoạt động cả khi không có JS)
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]')) {
  link.addEventListener('click', () => setLang(link.dataset.langSwitch as Lang));
}

// --- Gợi ý tiếng Anh (chỉ gợi ý, không chuyển trang)
const suggest = document.querySelector<HTMLElement>('[data-suggest-en]');
if (suggest && shouldSuggestEnglish(pageLang, navigator.language || 'vi')) suggest.hidden = false;
suggest?.querySelector('[data-suggest-close]')?.addEventListener('click', () => {
  suggest.hidden = true;
  setLang('vi'); // đã bỏ qua gợi ý => nhớ để không hỏi lại
});
suggest?.querySelector('a')?.addEventListener('click', () => setLang('en'));

// --- /tai-apk: không phải Android thì nói rõ nên dùng bản web
const notAndroid = document.querySelector<HTMLElement>('[data-apk=not-android]');
if (notAndroid && !/Android/i.test(navigator.userAgent)) notAndroid.hidden = false;
