// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';

afterEach(cleanup);

function Boom(): never {
  const e = new TypeError('hỏng');
  e.stack = 'TypeError: hỏng\n    at Boom (https://x.test/assets/a.js:1:2)';
  throw e;
}
function Where() {
  const loc = useLocation();
  return (
    <p data-testid="where">
      {loc.pathname}
      {loc.search}|{JSON.stringify(loc.state)}
    </p>
  );
}

describe('ScreenErrorBoundary: nút Báo lỗi', () => {
  it('màn hỏng => có nút "Báo lỗi" mở /gop-y?loai=loi kèm tên lỗi + dòng đầu stack qua state', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/tien-do']}>
        <ScreenErrorBoundary resetKey="/tien-do">
          <Boom />
        </ScreenErrorBoundary>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Báo lỗi|Report a bug/ }));
    const text = screen.getByTestId('where').textContent!;
    expect(text).toContain('/gop-y?loai=loi');
    const state = JSON.parse(text.split('|')[1]!);
    expect(state.error.name).toBe('TypeError');
    expect(state.error.stack).toContain('at Boom');
  });
});
