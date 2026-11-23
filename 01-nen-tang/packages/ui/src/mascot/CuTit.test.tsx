// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { CuTit } from './CuTit.js';

afterEach(() => {
  cleanup();
  learnerStore.setState((s) => ({ preferences: { ...s.preferences, uiLanguage: 'vi' } }));
});

describe('CuTit', () => {
  it('chọn ảnh theo mood', () => {
    const { container } = render(<CuTit mood="khen" />);
    expect(container.querySelector('img')!.getAttribute('src')).toContain('cutit-khen');
  });

  it('alt mặc định theo ngôn ngữ vi/en', () => {
    const { container, rerender } = render(<CuTit mood="khen" />);
    expect(container.querySelector('img')!.alt).toBe('Bé Cu Tít đang khen bạn');
    learnerStore.setState((s) => ({ preferences: { ...s.preferences, uiLanguage: 'en' } }));
    rerender(<CuTit mood="khen" />);
    expect(container.querySelector('img')!.alt).toBe('Bé Cu Tít is praising you');
  });

  it('alt tùy chỉnh thay mặc định', () => {
    const { container } = render(<CuTit mood="chao" alt="Xin chào" />);
    expect(container.querySelector('img')!.alt).toBe('Xin chào');
  });

  it('animate=false thì không có lớp chuyển động', () => {
    const { container } = render(<CuTit mood="an-mung" animate={false} />);
    expect(container.firstElementChild!.className).not.toMatch(/ct-cutit--anim/);
    const on = render(<CuTit mood="an-mung" />);
    expect(on.container.firstElementChild!.className).toMatch(/ct-cutit--anim/);
  });

  it('mood không có chuyển động (chao) thì không gắn lớp chuyển động', () => {
    const { container } = render(<CuTit mood="chao" />);
    expect(container.firstElementChild!.className).not.toMatch(/ct-cutit--anim/);
  });

  it('đổi mood đổi src, không remount khung và ảnh', () => {
    const { container, rerender } = render(<CuTit mood="chao" />);
    const frame = container.firstElementChild;
    const img = container.querySelector('img');
    rerender(<CuTit mood="buon" />);
    expect(container.firstElementChild).toBe(frame);
    expect(container.querySelector('img')).toBe(img);
    expect(img!.getAttribute('src')).toContain('cutit-buon');
  });

  it('nạp lười, giải mã bất đồng bộ, khai width/height theo size', () => {
    const { container } = render(<CuTit mood="ngu" size={64} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.getAttribute('width')).toBe('64');
    expect(img.getAttribute('height')).toBe('64');
  });

  it('size mặc định 96', () => {
    const { container } = render(<CuTit mood="noi" />);
    expect(container.querySelector('img')!.getAttribute('width')).toBe('96');
  });
});

describe('CuTit — CSS đi kèm component (P0-1)', () => {
  it('khung không bị co lại trong flex (flex-shrink 0)', () => {
    const { container } = render(<CuTit mood="chao" />);
    expect(getComputedStyle(container.firstElementChild!).flexShrink).toBe('0');
  });

  it('có luật giảm chuyển động tắt animation (OS và công tắc của app)', () => {
    render(<CuTit mood="khen" />);
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).toMatch(/data-reduced-motion/);
    expect(css).toMatch(/ct-nhun/);
  });

  it('cả hai luật giảm chuyển động đều ghi animation: none cho lớp chuyển động', () => {
    render(<CuTit mood="khen" />);
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join(' ');
    // jsdom không tính animation-name nên kiểm trực tiếp luật CSS đã nạp
    expect(css).toMatch(/prefers-reduced-motion[^{]*\{\s*\.ct-cutit--anim\s*\{\s*animation:\s*none/);
    expect(css).toMatch(/data-reduced-motion=['"]true['"]\]\s*\.ct-cutit--anim\s*\{\s*animation:\s*none/);
  });
});

describe('CuTit — ảnh lỗi (ngoại tuyến, P0-3)', () => {
  it('ảnh không tải được thì bỏ thẻ img (không hiện alt xuống dòng), khung giữ nguyên kích thước', () => {
    const { container } = render(<CuTit mood="khen" size={64} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('64px');
    expect(frame.getAttribute('aria-hidden')).toBe('true');
  });

  it('đổi mood sau lỗi thì thử tải lại ảnh mới', () => {
    const { container, rerender } = render(<CuTit mood="khen" />);
    fireEvent.error(container.querySelector('img')!);
    rerender(<CuTit mood="buon" />);
    expect(container.querySelector('img')!.getAttribute('src')).toContain('cutit-buon');
  });
});

describe('CuTit — chuyển tư thế mượt (P1-7)', () => {
  const imgs = (c: HTMLElement) => [...c.querySelectorAll('img')] as HTMLImageElement[];

  it('lần vẽ đầu chỉ có một ảnh', () => {
    const { container } = render(<CuTit mood="chao" />);
    expect(imgs(container).length).toBe(1);
  });

  it('đổi tư thế: ảnh mới (ẩn tới khi tải xong) nằm trên, ảnh cũ giữ bên dưới, chỉ ảnh mới có alt', () => {
    const { container, rerender } = render(<CuTit mood="chao" />);
    rerender(<CuTit mood="buon" />);
    const [next, old] = imgs(container);
    expect(next.getAttribute('src')).toContain('cutit-buon');
    expect(next.className).toContain('ct-cutit__in');
    expect(next.className).not.toContain('is-ready');
    expect(old.getAttribute('src')).toContain('cutit-chao');
    expect(old.getAttribute('alt')).toBe('');
    expect(old.getAttribute('aria-hidden')).toBe('true');
    expect(next.alt).toBe('Bé Cu Tít đang buồn');
  });

  it('ảnh mới tải xong thì hiện dần (is-ready), hết 120ms thì bỏ ảnh cũ', () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(<CuTit mood="chao" />);
      rerender(<CuTit mood="buon" />);
      fireEvent.load(imgs(container)[0]);
      expect(imgs(container)[0].className).toContain('is-ready');
      act(() => void vi.advanceTimersByTime(200));
      expect(imgs(container).length).toBe(1);
      expect(imgs(container)[0].getAttribute('src')).toContain('cutit-buon');
      expect(imgs(container)[0].className).not.toContain('ct-cutit__in');
    } finally {
      vi.useRealTimers();
    }
  });

  it('đổi lại tư thế cũ giữa chừng thì về một ảnh', () => {
    const { container, rerender } = render(<CuTit mood="chao" />);
    rerender(<CuTit mood="buon" />);
    rerender(<CuTit mood="chao" />);
    expect(imgs(container).length).toBe(1);
    expect(imgs(container)[0].getAttribute('src')).toContain('cutit-chao');
  });

  it('prop preload tải trước ảnh của tư thế kế (một Image mỗi tư thế)', () => {
    const made: string[] = [];
    const Orig = globalThis.Image;
    globalThis.Image = class {
      set src(v: string) {
        made.push(v);
      }
    } as unknown as typeof Image;
    try {
      render(<CuTit mood="chan-dung" preload={['suy-nghi']} />);
      expect(made.length).toBe(1);
      expect(made[0]).toContain('cutit-suy-nghi');
    } finally {
      globalThis.Image = Orig;
    }
  });
});
