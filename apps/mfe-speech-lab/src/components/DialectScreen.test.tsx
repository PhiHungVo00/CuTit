import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { learnerStore } from '@vietlearning/state';
import { DialectScreen } from './DialectScreen';

vi.mock('@vietlearning/native', () => ({ getDeviceSpeech: () => ({ speak: vi.fn(async () => undefined) }) }));

beforeEach(() => {
  learnerStore.getState().reset();
  learnerStore.getState().setPreferences({ uiLanguage: 'vi' });
});
afterEach(cleanup);

describe('M6 DialectScreen', () => {
  it('tìm không dấu lọc đúng mục; lưu để ôn tạo thẻ SRS (A7 → A4)', () => {
    render(<DialectScreen />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'thom' } });
    expect(screen.getByText('1 từ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Lưu để ôn tập/ }));
    expect(learnerStore.getState().srs['dialect:d3']).toBeTruthy();
  });
});
