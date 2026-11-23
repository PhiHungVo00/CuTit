import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChoiceGroup } from './ChoiceGroup';

afterEach(cleanup);

const options = [
  { id: 'a', label: 'Một' },
  { id: 'b', label: 'Hai' },
  { id: 'c', label: 'Ba' }
] as const;

describe('ChoiceGroup', () => {
  it('là radiogroup có nhãn, đúng một lựa chọn aria-checked và chỉ nó nhận Tab', () => {
    render(<ChoiceGroup label="Chọn số" value="b" options={options} onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'Chọn số' });
    const radios = screen.getAllByRole('radio');
    expect(group).toBeTruthy();
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('phím mũi tên chuyển lựa chọn (vòng tròn), bấm chuột chọn trực tiếp', () => {
    const onChange = vi.fn();
    render(<ChoiceGroup label="Chọn số" value="c" options={options} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    fireEvent.click(screen.getByRole('radio', { name: 'Một' }));
    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  it('hiển thị gợi ý bên dưới nhóm', () => {
    render(<ChoiceGroup label="L" value="a" options={options} onChange={() => {}} hint="Gợi ý nhỏ" />);
    expect(screen.getByText('Gợi ý nhỏ')).toBeTruthy();
  });
});
