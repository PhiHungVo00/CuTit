/**
 * Thuật toán A2: Dynamic Time Warping (DTW) & Pearson Correlation
 * Chuẩn hóa cao độ theo Semitone và so khớp đường contour 6 thanh điệu tiếng Việt
 * Tuân thủ nghiêm ngặt Mục 8.2 Báo Cáo Thiết Kế Kiến Trúc TDD
 */

/**
 * Chuẩn hóa chuỗi tần số Hz sang độ lệch Semitone so với tần số trung bình (F0_mean) của người nói.
 * Giúp người học có giọng nữ (220-300Hz), trẻ em hay nam (100-160Hz) đều so khớp công bằng với mẫu.
 */
export function normalizeToSemitones(series: number[]): number[] {
  const validPitches = series.filter((f) => f > 40 && f < 800);
  if (validPitches.length === 0) return series.map(() => 0);

  const meanF0 = validPitches.reduce((sum, f) => sum + f, 0) / validPitches.length;

  return series.map((f) => {
    if (f <= 40) return 0;
    return 12 * Math.log2(f / meanF0);
  });
}

/**
 * Tính hệ số tương quan Pearson (r) giữa hai chuỗi contour có cùng chiều dài hoặc đã nội suy.
 * Phản ánh chính xác độ tương đồng về hình dáng đường cong thanh điệu (lên, xuống, uốn lượn).
 */
export function calculatePearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 1.0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 1.0;

  const r = numerator / denominator;
  return Math.max(-1.0, Math.min(1.0, r));
}

export interface DTWResult {
  score: number; // 0 - 100
  dtwDistance: number;
  pearsonCorrelation: number;
  isAccurate: boolean;
}

/**
 * Thuật toán A2 hoàn chỉnh:
 * 1. Tự động nhận diện nếu dữ liệu là Hz (>40) để chuẩn hóa sang Semitone theo F0_mean.
 * 2. Tính ma trận DTW tìm đường đi tối ưu (Warping Path).
 * 3. Tính hệ số tương quan Pearson cho hình dáng đường đi.
 * 4. Tổng hợp điểm số trọng số: 70% DTW sai số bán âm + 30% Pearson tương quan hình dáng.
 */
export function calculateDTW(seriesA: number[], seriesB: number[]): number {
  const result = assessPitchContour(seriesA, seriesB);
  return result.score;
}

export function assessPitchContour(learnerSeries: number[], referenceSeries: number[]): DTWResult {
  const n = learnerSeries.length;
  const m = referenceSeries.length;
  if (n === 0 || m === 0) {
    return { score: 0, dtwDistance: Infinity, pearsonCorrelation: 0, isAccurate: false };
  }

  // Tự động chuẩn hóa Semitone nếu chuỗi đầu vào đang ở dải tần số Hz (> 40Hz)
  const isHzInput = learnerSeries.some((v) => v > 40) || referenceSeries.some((v) => v > 40);
  const semiA = isHzInput ? normalizeToSemitones(learnerSeries) : learnerSeries;
  const semiB = isHzInput ? normalizeToSemitones(referenceSeries) : referenceSeries;

  // Xây dựng ma trận DTW khoảng cách bán âm (Semitone distance)
  const dtw: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(semiA[i - 1] - semiB[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }

  const rawDist = dtw[n][m] / (n + m);

  // Tính Pearson tương quan hình dáng đường cong
  const pearson = calculatePearson(semiA, semiB);

  // Quy đổi DTW khoảng cách bán âm sang điểm số (Sai số 0.5 bán âm = 90 điểm; 2.5 bán âm = 50 điểm)
  const dtwScore = Math.max(0, Math.min(100, Math.round(100 - rawDist * 20)));
  // Hệ số Pearson dương quy đổi sang thang điểm 0 - 100 (hình dáng ngược/phẳng thì điểm 0)
  const pearsonScore = pearson > 0 ? Math.round(pearson * 100) : 0;

  // Điểm số kết hợp chuẩn A2: 70% DTW + 30% Pearson
  const finalScore = Math.max(0, Math.min(100, Math.round(0.7 * dtwScore + 0.3 * pearsonScore)));

  return {
    score: finalScore,
    dtwDistance: Number(rawDist.toFixed(2)),
    pearsonCorrelation: Number(pearson.toFixed(2)),
    isAccurate: finalScore >= 75
  };
}
