// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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
