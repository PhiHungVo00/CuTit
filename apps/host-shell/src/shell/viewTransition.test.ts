import { describe, expect, it, vi } from 'vitest';
import { navigateWithTransition, type TransitionEnv } from './viewTransition';

const makeEnv = (over: Partial<TransitionEnv> = {}): TransitionEnv & { log: string[] } => {
  const log: string[] = [];
  return {
    log,
    reducedMotion: () => false,
    startViewTransition: undefined,
    flush: (fn) => fn(),
    fade: () => void log.push('fade'),
    ...over
  };
};

describe('navigateWithTransition', () => {
  it('không có startViewTransition ⇒ navigate đúng 1 lần + fade dự phòng', async () => {
    const env = makeEnv();
    const navigate = vi.fn();
    await navigateWithTransition(navigate, '/ho-so', undefined, env);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/ho-so');
    expect(env.log).toEqual(['fade']);
  });

  it('có startViewTransition ⇒ load() xong TRƯỚC khi transition chạy callback', async () => {
    const order: string[] = [];
    const env = makeEnv({
      startViewTransition: (cb) => {
        order.push('transition');
        cb();
        return { finished: Promise.resolve() };
      }
    });
    const navigate = vi.fn(() => void order.push('navigate'));
    const load = () => new Promise<void>((r) => setTimeout(() => (order.push('loaded'), r()), 5));
    await navigateWithTransition(navigate, '/ban-be', load, env);
    expect(order).toEqual(['loaded', 'transition', 'navigate']);
    expect(env.log).toEqual([]); // đã có transition thật, không thêm fade
  });

  it('giảm chuyển động ⇒ điều hướng thẳng, không transition, không fade', async () => {
    const start = vi.fn();
    const env = makeEnv({ reducedMotion: () => true, startViewTransition: start });
    const navigate = vi.fn();
    await navigateWithTransition(navigate, '/', undefined, env);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(env.log).toEqual([]);
  });

  it('load() lỗi (mạng) vẫn điều hướng để màn hiện khung lỗi/chờ', async () => {
    const env = makeEnv();
    const navigate = vi.fn();
    await navigateWithTransition(navigate, '/phat-am', () => Promise.reject(new Error('mạng')), env);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
