import { useCallback, useMemo, useState } from 'react';
import {
  HonorificInterpreter,
  type FormalityLevel,
  type HonorificPairItem,
  type RelationCategory
} from '@vietlearning/content';
import type { AgeStep, ContextStep, Gender, PartnerGender } from './options';

/** Một interpreter dùng chung (không có state), không cần tạo lại mỗi lần render. */
const interpreter = new HonorificInterpreter();

const FORMALITY: Record<ContextStep, FormalityLevel> = { 0: 'formal', 1: 'polite', 2: 'intimate' };

function agesFor(step: AgeStep, relation: RelationCategory): { user: number; partner: number } {
  switch (step) {
    case 0:
      return { user: 20, partner: relation === 'traditional' ? 75 : 55 };
    case 1:
      return { user: 20, partner: 26 };
    case 2:
      return { user: 22, partner: 22 };
    case 3:
      return { user: 28, partner: 16 };
  }
}

function ageStepFromPair(pair: HonorificPairItem): AgeStep {
  const diff = pair.listenerAge - pair.speakerAge;
  if (diff > 10) return 0;
  if (diff > 2) return 1;
  if (diff >= -2) return 2;
  return 3;
}

function contextStepFromPair(pair: HonorificPairItem): ContextStep {
  const t = pair.contextLevelText;
  if (t.includes('đình') || t.includes('Trang trọng')) return 0;
  if (t.includes('Thân mật') || t.includes('Ruột thịt')) return 2;
  return 1;
}

/**
 * Toàn bộ state + logic của bàn điều khiển xưng hô (Thuật toán A6), tách khỏi giao diện
 * để các component chỉ lo hiển thị và có thể test logic riêng.
 */
export function useHonorificPlayground() {
  const [ageStep, setAgeStepRaw] = useState<AgeStep>(0);
  const [contextStep, setContextStepRaw] = useState<ContextStep>(0);
  const [relation, setRelationRaw] = useState<RelationCategory>('kin');
  const [userGender, setUserGenderRaw] = useState<Gender>('male');
  const [partnerGender, setPartnerGenderRaw] = useState<PartnerGender>('male');
  const [isReversed, setIsReversedRaw] = useState(false);
  const [explicitPair, setExplicitPair] = useState<HonorificPairItem | null>(null);

  // Mọi thay đổi thủ công trên bàn điều khiển đều bỏ cặp đã chọn từ Bảng 20 cặp
  const manual = useCallback(<T,>(setter: (v: T) => void) => (v: T) => {
    setExplicitPair(null);
    setter(v);
  }, []);

  const setters = useMemo(
    () => ({
      setAgeStep: manual(setAgeStepRaw),
      setContextStep: manual(setContextStepRaw),
      setRelation: manual(setRelationRaw),
      setUserGender: manual(setUserGenderRaw),
      setPartnerGender: manual(setPartnerGenderRaw),
      toggleReversed: () => {
        setExplicitPair(null);
        setIsReversedRaw((r) => !r);
      }
    }),
    [manual]
  );

  const result = useMemo(() => {
    const { user, partner } = agesFor(ageStep, relation);
    const ctx = isReversed
      ? {
          speakerAge: partner,
          listenerAge: user,
          speakerGender: (partnerGender === 'female' ? 'female' : 'male') as Gender,
          listenerGender: userGender as PartnerGender
        }
      : { speakerAge: user, listenerAge: partner, speakerGender: userGender, listenerGender: partnerGender };

    return interpreter.interpret({
      ...ctx,
      relation: explicitPair?.relation ?? relation,
      formality: FORMALITY[contextStep],
      pairId: explicitPair?.id
    });
  }, [ageStep, contextStep, relation, userGender, partnerGender, isReversed, explicitPair]);

  /** Áp dụng một cặp từ Bảng 20 cặp lên bàn điều khiển. */
  const applyPair = useCallback((pair: HonorificPairItem) => {
    setExplicitPair(pair);
    setRelationRaw(pair.relation);
    setAgeStepRaw(ageStepFromPair(pair));
    setContextStepRaw(contextStepFromPair(pair));
    if (pair.listenerGender) setPartnerGenderRaw(pair.listenerGender);
    if (pair.speakerGender) setUserGenderRaw(pair.speakerGender);
    setIsReversedRaw(false);
  }, []);

  return {
    state: { ageStep, contextStep, relation, userGender, partnerGender, isReversed, explicitPair },
    ...setters,
    applyPair,
    result
  };
}
