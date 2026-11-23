/** Chỉ khen "Rất tốt" khi thanh gần nhất đúng là thanh mục tiêu (tránh vừa khen vừa nói "giống thanh khác") */
export function verdict(score: number, matchesTarget: boolean): 'good' | 'ok' | 'bad' {
  if (score >= 75 && matchesTarget) return 'good';
  if (score >= 55) return 'ok';
  return 'bad';
}
