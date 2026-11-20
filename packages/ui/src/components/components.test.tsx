import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { Button } from './Button.js';
import { Toggle } from './Toggle.js';
import { Icon } from '../icons/Icon.js';
import { ICON_NAMES } from '../icons/paths.js';

// Các thành phần là hàm thuần (không hook) nên gọi trực tiếp và đọc props của phần tử trả về.
const props = (el: unknown) => (el as ReactElement<Record<string, unknown>>).props;

describe('Toggle', () => {
  it('có role=switch và aria-checked theo trạng thái', () => {
    const p = props(Toggle({ checked: true, onChange: () => {}, label: 'Âm' }));
    expect(p.role).toBe('switch');
    expect(p['aria-checked']).toBe(true);
    expect(p['aria-label']).toBe('Âm');
  });
  it('bấm đảo trạng thái', () => {
    let got: boolean | undefined;
    const p = props(Toggle({ checked: false, onChange: (v: boolean) => (got = v), label: 'x' }));
    (p.onClick as () => void)();
    expect(got).toBe(true);
  });
});

describe('Button', () => {
  it('busy ⇒ aria-busy=true và disabled', () => {
    const p = props(Button({ busy: true, children: 'Lưu' }));
    expect(p['aria-busy']).toBe(true);
    expect(p.disabled).toBe(true);
  });
  it('không busy ⇒ không disabled', () => {
    const p = props(Button({ children: 'Lưu' }));
    expect(p.disabled).toBeFalsy();
  });
});

describe('Icon', () => {
  it('không title ⇒ aria-hidden=true', () => {
    expect(props(Icon({ name: 'hoc' }))['aria-hidden']).toBe(true);
  });
  it('có title ⇒ role=img, không aria-hidden', () => {
    const p = props(Icon({ name: 'hoc', title: 'Học' }));
    expect(p.role).toBe('img');
    expect(p['aria-hidden']).toBeUndefined();
  });
  it('đủ 20 tên icon theo giao diện', () => {
    expect(ICON_NAMES).toHaveLength(20);
  });
});
