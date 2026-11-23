import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { learnerStore } from '@vietlearning/state';
import { HonorificMatrixScreen } from './HonorificMatrixScreen';
import { CultureGuideScreen } from './culture/CultureGuideScreen';

afterEach(() => {
  cleanup();
  learnerStore.getState().reset();
});

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe('Task 12 — mfe-knowledge dùng thành phần chung', () => {
  it('không còn emoji làm icon/nút trong mã nguồn (trừ khung giả lập dev)', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    const offenders = walk(join(__dirname, '..'))
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.|MobileSimulatorFrame/.test(f))
      .filter((f) => emoji.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(/.*src[\\/]/, ''));
    expect(offenders).toEqual([]);
  });

  it('Xưng hô: không còn công tắc sáng/tối (giao diện chỉ đổi ở Cài đặt)', () => {
    render(<HonorificMatrixScreen />);
    expect(screen.queryByRole('radiogroup', { name: /Giao diện|Theme/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /Gỗ mộc|Tre trúc|Dark wood|Bamboo/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('Xưng hô: Bé Cu Tít mách nước hiện bằng ảnh nhân vật', () => {
    render(<HonorificMatrixScreen />);
    expect(screen.getAllByRole('img', { name: /Bé Cu Tít/ }).length).toBeGreaterThan(0);
  });

  it('Văn hóa: tìm không ra thẻ ⇒ trạng thái rỗng có Cu Tít', () => {
    render(<CultureGuideScreen />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzzqqqq' } });
    expect(screen.getByRole('img', { name: /Bé Cu Tít/ })).toBeTruthy();
  });
});
