import test from 'node:test';
import assert from 'node:assert';
import { calculateDTW, assessPitchContour, calculatePearson } from '../dist/index.js';

test('A2 DTW - Identical contour produces near-perfect score', () => {
  const reference = [140, 130, 120, 115, 122, 135, 150, 168];
  const learnerSame = [140, 130, 120, 115, 122, 135, 150, 168];

  const score = calculateDTW(learnerSame, reference);
  assert.ok(score >= 95, `Expected score >= 95, got ${score}`);
});

test('A2 DTW - Female voice shifted by +90Hz with same contour shape scores high (>80)', () => {
  // Mẫu tham chiếu giọng nam (~130Hz mean)
  const maleReference = [140, 130, 120, 115, 122, 135, 150, 168];
  // Giọng nữ phát âm thanh hỏi đúng điệu nhưng ở dải ~230Hz (+90Hz)
  const femaleLearner = maleReference.map((hz) => hz * 1.65); // Tần số giọng nữ cao hơn ~1.65 lần

  const assessment = assessPitchContour(femaleLearner, maleReference);
  assert.ok(assessment.score >= 85, `Expected score >= 85 for female learner, got ${assessment.score}`);
  assert.ok(assessment.isAccurate, 'Expected tone to be classified as accurate');
  assert.ok(assessment.pearsonCorrelation >= 0.95, `Expected Pearson >= 0.95, got ${assessment.pearsonCorrelation}`);
});

test('A2 DTW - Flat tone vs dip-and-rise tone has low score (<65)', () => {
  const reference = [140, 130, 120, 115, 122, 135, 150, 168]; // Thanh hỏi
  const flatLearner = [135, 135, 135, 136, 135, 135, 136, 135]; // Thanh ngang (bằng phẳng)

  const score = calculateDTW(flatLearner, reference);
  assert.ok(score < 70, `Expected score < 70 for flat tone, got ${score}`);
});
