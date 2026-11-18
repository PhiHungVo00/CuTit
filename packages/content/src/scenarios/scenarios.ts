/**
 * Kịch bản nhập vai M7. NGUỒN DUY NHẤT: src/data/scenarios.json (dùng chung client và Gateway).
 * targetDialect "all" = dùng phương ngữ người học chọn.
 */
import scenarioData from '../data/scenarios.json' with { type: 'json' };

export interface RoleplayScenario {
  id: string;
  title: string;
  titleEn: string;
  location: string;
  locationEn: string;
  targetDialect: 'all' | 'north' | 'central' | 'south';
  tasks: string[];
  /** cùng thứ tự với tasks (Gateway chấm theo chỉ số) */
  tasksEn: string[];
  /** GĐ3: kịch bản khép lại unit này của lộ trình (vd. "u1") */
  unit?: string;
  /** false = bản nháp chờ người bản ngữ duyệt (kịch bản M7 cũ không có trường này) */
  reviewed?: boolean;
}

export const ROLEPLAY_SCENARIOS: readonly RoleplayScenario[] = scenarioData as RoleplayScenario[];

/** Kịch bản nhập vai khép lại một unit của lộ trình */
export function scenarioForUnit(unitId: string): RoleplayScenario | undefined {
  return ROLEPLAY_SCENARIOS.find((s) => s.unit === unitId);
}
