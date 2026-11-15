import { useCallback, useMemo, useRef, useState } from 'react';
import { checkSentenceOrder, type OrderCheckResult, type SentenceItem } from '@vietlearning/contracts/a8';
import type { SentenceBank } from '@vietlearning/content';
import { learnerStore } from '@vietlearning/state';
import { SentenceOriginator, type SentenceMemento } from './SentenceBuilderMemento';

/** Xáo trộn xác định (theo seed) và bảo đảm KHÔNG trùng một thứ tự đúng nào (tránh "đề cho sẵn đáp án") */
export function shuffledIndices(item: Pick<SentenceBank, 'tokens' | 'accepted'>, seed: number): number[] {
  const n = item.tokens.length;
  let s = seed || 1;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (!item.accepted.some((acc) => acc.every((v, i) => v === a[i]))) return a;
  }
  return [...Array(n).keys()].reverse();
}

/**
 * Logic một câu ghép: chọn token theo thứ tự, hoàn tác bằng GoF Memento, chấm bằng A8.
 * Tách khỏi giao diện để test riêng.
 */
export function useSentenceBuilder(item: SentenceBank, seed: number) {
  const pool = useMemo(() => shuffledIndices(item, seed), [item, seed]);
  const [placed, setPlacedState] = useState<number[]>([]);
  const [result, setResultState] = useState<OrderCheckResult | null>(null);
  // Ref giữ giá trị MỚI NHẤT: chạm nhanh nhiều từ trước khi React render lại không làm mất từ nào
  const placedRef = useRef<number[]>([]);
  const resultRef = useRef<OrderCheckResult | null>(null);
  const originator = useRef(new SentenceOriginator());
  const history = useRef<SentenceMemento[]>([]);

  const setPlaced = (next: number[]) => {
    placedRef.current = next;
    setPlacedState(next);
  };
  const setResult = (r: OrderCheckResult | null) => {
    resultRef.current = r;
    setResultState(r);
  };

  const commit = useCallback((next: number[]) => {
    originator.current.setTokens(placedRef.current.map(String));
    history.current.push(originator.current.save());
    setPlaced(next);
    setResult(null);
  }, []);

  const place = (tokenIndex: number) => {
    if (placedRef.current.includes(tokenIndex) || resultRef.current?.valid) return;
    commit([...placedRef.current, tokenIndex]);
  };

  const remove = (position: number) => {
    if (resultRef.current?.valid) return;
    commit(placedRef.current.filter((_, i) => i !== position));
  };

  const undo = () => {
    const m = history.current.pop();
    if (!m) return;
    originator.current.restore(m);
    setPlaced(originator.current.getTokens().map(Number));
    setResult(null);
  };

  const check = (): OrderCheckResult => {
    const r = checkSentenceOrder(
      item as unknown as SentenceItem,
      placedRef.current.map((i) => item.tokens[i].text),
      learnerStore.getState().preferences.uiLanguage
    );
    setResult(r);
    return r;
  };

  return {
    pool,
    placed,
    result,
    complete: placed.length === item.tokens.length,
    canUndo: history.current.length > 0,
    place,
    remove,
    undo,
    check
  };
}
