import type { IconName } from '@vietlearning/ui';

/** Thứ tự nhóm trong mục lục Cài đặt (đồng thời là id trong URL /cai-dat/:nhom) */
export const SETTINGS_GROUPS = ['giao-dien', 'ngon-ngu', 'hoc', 'am-thanh', 'chuyen-dong', 'quyen-rieng-tu', 'tai-khoan'] as const;
export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number];

export const GROUP_ICON: Record<SettingsGroupId, IconName> = {
  'giao-dien': 'mat-troi',
  'ngon-ngu': 'ngon-ngu',
  hoc: 'hoc',
  'am-thanh': 'loa',
  'chuyen-dong': 'chuyen-dong',
  'quyen-rieng-tu': 'khoa',
  'tai-khoan': 'ho-so'
};
