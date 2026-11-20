import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS, isFocusRoute, tabOf } from './navMap';

describe('tabOf', () => {
  it.each([
    ['/', 'hoc'],
    ['/xung-ho', 'hoc'],
    ['/van-hoa', 'hoc'],
    ['/phuong-ngu', 'hoc'],
    ['/bai-hoc/u1l1', 'hoc'],
    ['/kiem-tra/u1', 'hoc'],
    ['/phat-am', 'luyen-tap'],
    ['/phong-thanh', 'luyen-tap'],
    ['/luyen-tap', 'luyen-tap'],
    ['/luyen-tap-chung', 'luyen-tap'],
    ['/ghep-cau', 'luyen-tap'],
    ['/on-tap', 'luyen-tap'],
    ['/ban-be', 'ban-be'],
    ['/ho-so', 'ho-so'],
    ['/tien-do', 'ho-so'],
    ['/cai-dat', 'ho-so'],
    ['/cai-dat/am-thanh', 'ho-so'],
    ['/bat-dau', 'ho-so'],
    ['/quyen-rieng-tu', 'ho-so']
  ])('%s ⇒ %s', (p, tab) => expect(tabOf(p)).toBe(tab));

  it('màn Cu Tít và đường lạ không thuộc tab nào', () => {
    expect(tabOf('/hoi-thoai')).toBeNull();
    expect(tabOf('/camera')).toBeNull();
    expect(tabOf('/khong-co')).toBeNull();
  });
  it('bỏ dấu / cuối', () => expect(tabOf('/ban-be/')).toBe('ban-be'));
});

describe('isFocusRoute', () => {
  it.each(['/bai-hoc/u1l1', '/kiem-tra/u1', '/hoi-thoai', '/nhap-vai', '/goi-thoai', '/camera'])('%s là màn tập trung', (p) =>
    expect(isFocusRoute(p)).toBe(true)
  );
  it.each(['/', '/van-hoa', '/xung-ho', '/phat-am', '/ho-so', '/cai-dat/hoc', '/on-tap'])('%s giữ thanh tab', (p) => expect(isFocusRoute(p)).toBe(false));
});

describe('đường cũ', () => {
  it('/tuy-chinh ⇒ /cai-dat; /kham-pha ⇒ /luyen-tap-chung', () => {
    expect(LEGACY_REDIRECTS['/tuy-chinh']).toBe('/cai-dat');
    expect(LEGACY_REDIRECTS['/kham-pha']).toBe('/luyen-tap-chung');
  });
});
