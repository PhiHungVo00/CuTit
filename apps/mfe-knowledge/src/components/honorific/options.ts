import type { RelationCategory } from '@vietlearning/content';

export type AgeStep = 0 | 1 | 2 | 3;
export type ContextStep = 0 | 1 | 2;
export type Gender = 'male' | 'female';
export type PartnerGender = Gender | 'neutral';
export type Theme = 'dark' | 'light';

/** Nhãn/mô tả các lựa chọn nằm trong từ điển (src/i18n.ts): age.N, context.N, relation.*, gender.* */
export const AGE_STEPS: AgeStep[] = [0, 1, 2, 3];
export const CONTEXT_STEPS: ContextStep[] = [0, 1, 2];

export const RELATIONS: { id: RelationCategory; icon: string }[] = [
  { id: 'kin', icon: '🏡' },
  { id: 'social', icon: '🤝' },
  { id: 'traditional', icon: '🏛️' },
  { id: 'teacher_student', icon: '📚' },
  { id: 'work', icon: '💼' }
];

export const USER_GENDERS: Gender[] = ['male', 'female'];
export const PARTNER_GENDERS: PartnerGender[] = ['male', 'female', 'neutral'];

export const SPEEDS = [0.8, 1.0, 1.2] as const;
