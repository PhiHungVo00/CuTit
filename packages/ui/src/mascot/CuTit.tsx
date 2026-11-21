import './cutit.css';
import { defineMessages } from '@vietlearning/state';

export type CuTitMood = 'chao' | 'khen' | 'an-mung' | 'dong-vien' | 'suy-nghi' | 'nghe' | 'noi' | 'nhac-hoc' | 'buon' | 'ngu' | 'chan-dung';

export interface CuTitProps {
  mood: CuTitMood;
  /** Cạnh khung vuông, px (mặc định 96) */
  size?: number;
  /** Bật chuyển động theo trạng thái (mặc định true); luôn tắt khi giảm chuyển động */
  animate?: boolean;
  alt?: string;
}

// Mỗi ảnh là một asset riêng (Vite tách tệp, tải khi ảnh được vẽ) => không vào gói đầu
const SRC: Record<CuTitMood, string> = {
  chao: new URL('../../assets/cutit/cutit-chao.webp', import.meta.url).href,
  khen: new URL('../../assets/cutit/cutit-khen.webp', import.meta.url).href,
  'an-mung': new URL('../../assets/cutit/cutit-an-mung.webp', import.meta.url).href,
  'dong-vien': new URL('../../assets/cutit/cutit-dong-vien.webp', import.meta.url).href,
  'suy-nghi': new URL('../../assets/cutit/cutit-suy-nghi.webp', import.meta.url).href,
  nghe: new URL('../../assets/cutit/cutit-nghe.webp', import.meta.url).href,
  noi: new URL('../../assets/cutit/cutit-noi.webp', import.meta.url).href,
  'nhac-hoc': new URL('../../assets/cutit/cutit-nhac-hoc.webp', import.meta.url).href,
  buon: new URL('../../assets/cutit/cutit-buon.webp', import.meta.url).href,
  ngu: new URL('../../assets/cutit/cutit-ngu.webp', import.meta.url).href,
  'chan-dung': new URL('../../assets/cutit/cutit-chan-dung.webp', import.meta.url).href
};

/** Trạng thái có chuyển động → tên lớp (khai trong cutit.css) */
const MOTION: Partial<Record<CuTitMood, string>> = {
  khen: 'ct-cutit--nhun',
  'an-mung': 'ct-cutit--nay',
  'dong-vien': 'ct-cutit--lac',
  ngu: 'ct-cutit--tho',
  'suy-nghi': 'ct-cutit--nghieng'
};

const messages = defineMessages(
  {
    chao: 'Bé Cu Tít đang chào bạn',
    khen: 'Bé Cu Tít đang khen bạn',
    'an-mung': 'Bé Cu Tít đang ăn mừng',
    'dong-vien': 'Bé Cu Tít đang động viên bạn',
    'suy-nghi': 'Bé Cu Tít đang suy nghĩ',
    nghe: 'Bé Cu Tít đang lắng nghe',
    noi: 'Bé Cu Tít đang nói',
    'nhac-hoc': 'Bé Cu Tít nhắc bạn học bài',
    buon: 'Bé Cu Tít đang buồn',
    ngu: 'Bé Cu Tít đang ngủ',
    'chan-dung': 'Bé Cu Tít'
  },
  {
    chao: 'Bé Cu Tít is greeting you',
    khen: 'Bé Cu Tít is praising you',
    'an-mung': 'Bé Cu Tít is celebrating',
    'dong-vien': 'Bé Cu Tít is cheering you on',
    'suy-nghi': 'Bé Cu Tít is thinking',
    nghe: 'Bé Cu Tít is listening',
    noi: 'Bé Cu Tít is talking',
    'nhac-hoc': 'Bé Cu Tít is reminding you to study',
    buon: 'Bé Cu Tít is sad',
    ngu: 'Bé Cu Tít is sleeping',
    'chan-dung': 'Bé Cu Tít'
  }
);

/** Nhân vật Bé Cu Tít theo trạng thái. Đổi `mood` chỉ đổi `src` của cùng một thẻ img (không remount). */
export function CuTit({ mood, size = 96, animate = true, alt }: CuTitProps) {
  const t = messages.useT();
  const motion = animate ? MOTION[mood] : undefined;
  return (
    <span className={`ct-cutit${motion ? ` ct-cutit--anim ${motion}` : ''}`} style={{ width: size, height: size }}>
      <img src={SRC[mood]} alt={alt ?? t(mood)} width={size} height={size} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}
