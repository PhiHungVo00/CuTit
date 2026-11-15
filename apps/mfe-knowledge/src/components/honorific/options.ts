import type { RelationCategory } from '@vietlearning/content';

export type AgeStep = 0 | 1 | 2 | 3;
export type ContextStep = 0 | 1 | 2;
export type Gender = 'male' | 'female';
export type PartnerGender = Gender | 'neutral';
export type Theme = 'dark' | 'light';

export const AGE_STEPS: { step: AgeStep; title: string; desc: string }[] = [
  { step: 0, title: 'Bề trên', desc: 'Bậc cha chú, cao niên (+15 ~ 60 tuổi)' },
  { step: 1, title: 'Lớn hơn', desc: 'Anh/chị tiền bối (+3 ~ 8 tuổi)' },
  { step: 2, title: 'Ngang hàng', desc: 'Đồng niên, bạn bè (±2 tuổi)' },
  { step: 3, title: 'Nhỏ hơn', desc: 'Em út, hậu bối (-3 ~ 20 tuổi)' }
];

export const CONTEXT_STEPS: { step: ContextStep; title: string; desc: string }[] = [
  { step: 0, title: 'Trang trọng', desc: 'Đình làng, việc họ, lễ hội, nghi lễ' },
  { step: 1, title: 'Lịch sự', desc: 'Phố phường, công sở, trường lớp' },
  { step: 2, title: 'Thân mật', desc: 'Láng giềng, gia đình sum họp, tri kỷ' }
];

export const RELATIONS: { id: RelationCategory; label: string; icon: string }[] = [
  { id: 'kin', label: 'Gia tộc & họ hàng', icon: '🏡' },
  { id: 'social', label: 'Xã hội & đời sống', icon: '🤝' },
  { id: 'traditional', label: 'Sân đình & tín ngưỡng', icon: '🏛️' },
  { id: 'teacher_student', label: 'Thầy trò', icon: '📚' },
  { id: 'work', label: 'Công việc & đoàn thể', icon: '💼' }
];

export const USER_GENDERS: { id: Gender; label: string }[] = [
  { id: 'male', label: '👨 Nam' },
  { id: 'female', label: '👩 Nữ' }
];

export const PARTNER_GENDERS: { id: PartnerGender; label: string }[] = [
  { id: 'male', label: '👨 Nam' },
  { id: 'female', label: '👩 Nữ' },
  { id: 'neutral', label: '👥 Chung' }
];

export const SPEEDS = [0.8, 1.0, 1.2] as const;
