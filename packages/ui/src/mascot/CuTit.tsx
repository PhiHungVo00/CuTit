import './cutit.css';
import { useEffect, useState } from 'react';
import { defineMessages } from '@vietlearning/state';

export type CuTitMood = 'chao' | 'khen' | 'an-mung' | 'dong-vien' | 'suy-nghi' | 'nghe' | 'noi' | 'nhac-hoc' | 'buon' | 'ngu' | 'chan-dung';

export interface CuTitProps {
  mood: CuTitMood;
  /** Cạnh khung vuông, px (mặc định 96) */
  size?: number;
  /** Bật chuyển động theo trạng thái (mặc định true); luôn tắt khi giảm chuyển động */
  animate?: boolean;
  alt?: string;
  /** Tư thế có thể đổi sang kế tiếp: tải trước ảnh để lúc đổi không bị trễ */
  preload?: readonly CuTitMood[];
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

/** Thời gian mờ → rõ khi đổi tư thế (khớp transition trong cutit.css), ms */
const FADE_MS = 120;

/**
 * Nhân vật Bé Cu Tít theo trạng thái. Đổi `mood` giữ nguyên thẻ img chính (không remount) nhưng không nháy:
 * ảnh cũ ở lại bên dưới, ảnh mới mờ → rõ trong 120ms ngay khi tải xong (chưa giải mã thì chưa lộ ra).
 */
export function CuTit({ mood, size = 96, animate = true, alt, preload }: CuTitProps) {
  const t = messages.useT();
  // Ảnh lỗi (vd. ngoại tuyến mà chưa precache): bỏ thẻ img để trình duyệt không vẽ alt xuống dòng từng chữ.
  // Lưu theo src nên đổi mood sẽ thử tải ảnh mới.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = SRC[mood];
  /** ảnh đã hiện đầy đủ gần nhất (khác `src` khi đang chuyển tư thế) */
  const [shown, setShown] = useState(src);
  /** ảnh `src` đã tải xong, được phép hiện dần */
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  const fading = shown !== src;
  const ready = readySrc === src;

  useEffect(() => {
    if (!fading || !ready) return;
    const id = setTimeout(() => setShown(src), FADE_MS + 20);
    return () => clearTimeout(id);
  }, [fading, ready, src]);

  const preloadKey = preload?.join(',') ?? '';
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    for (const m of preloadKey ? (preloadKey.split(',') as CuTitMood[]) : []) {
      const img = new Image();
      img.src = SRC[m];
    }
  }, [preloadKey]);

  const motion = animate && !failed ? MOTION[mood] : undefined;
  return (
    <span
      className={`ct-cutit${motion ? ` ct-cutit--anim ${motion}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden={failed ? true : undefined}
    >
      {!failed && (
        <img
          src={src}
          alt={alt ?? t(mood)}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={fading ? `ct-cutit__in${ready ? ' is-ready' : ''}` : undefined}
          onLoad={() => setReadySrc(src)}
          onError={() => setFailedSrc(src)}
        />
      )}
      {!failed && fading && failedSrc !== shown && <img src={shown} alt="" aria-hidden="true" className="ct-cutit__out" draggable={false} />}
    </span>
  );
}
