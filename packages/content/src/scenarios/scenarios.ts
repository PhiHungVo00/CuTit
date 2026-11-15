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
}

export const ROLEPLAY_SCENARIOS: readonly RoleplayScenario[] = scenarioData as RoleplayScenario[];
