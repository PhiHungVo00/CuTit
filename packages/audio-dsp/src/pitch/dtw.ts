/**
 * Thuật toán A2: Dynamic Time Warping (DTW) & Pearson Correlation
 * So khớp đường cong cao độ của người học với đường contour mẫu chuẩn
 */
export function calculateDTW(seriesA: number[], seriesB: number[]): number {
  const n = seriesA.length;
  const m = seriesB.length;
  if (n === 0 || m === 0) return 0;

  const dtw: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(seriesA[i - 1] - seriesB[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }

  const rawDist = dtw[n][m] / (n + m);
  // Quy đổi về thang điểm 0 - 100
  return Math.max(0, Math.min(100, Math.round(100 - rawDist * 8)));
}
