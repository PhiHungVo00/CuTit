import test from 'node:test';
import assert from 'node:assert/strict';
import { StaircaseAdaptiveEngine } from '../dist/index.js';

const mockQuestions = [
  { id: 'q1', tier: 1, difficultyScore: 1.0, category: 'honorific', question: 'Q1', options: ['A', 'B'], correctIndex: 1, explanation: 'E1' },
  { id: 'q2', tier: 1, difficultyScore: 1.2, category: 'phonetics', question: 'Q2', options: ['A', 'B'], correctIndex: 0, explanation: 'E2' },
  { id: 'q3', tier: 2, difficultyScore: 1.8, category: 'dialogue', question: 'Q3', options: ['A', 'B'], correctIndex: 1, explanation: 'E3' },
  { id: 'q4', tier: 2, difficultyScore: 2.2, category: 'cuisine', question: 'Q4', options: ['A', 'B'], correctIndex: 0, explanation: 'E4' },
  { id: 'q5', tier: 3, difficultyScore: 2.7, category: 'dialect', question: 'Q5', options: ['A', 'B'], correctIndex: 1, explanation: 'E5' },
  { id: 'q6', tier: 3, difficultyScore: 3.1, category: 'custom', question: 'Q6', options: ['A', 'B'], correctIndex: 1, explanation: 'E6' },
  { id: 'q7', tier: 4, difficultyScore: 3.6, category: 'syntax', question: 'Q7', options: ['A', 'B'], correctIndex: 0, explanation: 'E7' },
  { id: 'q8', tier: 4, difficultyScore: 4.0, category: 'proverb', question: 'Q8', options: ['A', 'B'], correctIndex: 1, explanation: 'E8' }
];

test('A5 Staircase: Initial step recommends question near initial difficulty 1.5', () => {
  const step0 = StaircaseAdaptiveEngine.processStep([], mockQuestions);
  assert.equal(step0.finished, false);
  assert.equal(step0.currentStep, 1);
  assert.equal(step0.totalSteps, 8);
  assert.ok(step0.nextQuestion);
  // Nearest to 1.5 is q2 (1.2) or q3 (1.8)
  assert.ok(['q2', 'q3', 'q1'].includes(step0.nextQuestion.id));
});

test('A5 Staircase: Correct answers step difficulty up', () => {
  const history = [
    { questionId: 'q2', correct: true, difficulty: 1.2 }
  ];
  const step1 = StaircaseAdaptiveEngine.processStep(history, mockQuestions);
  assert.equal(step1.finished, false);
  assert.equal(step1.currentStep, 2);
  assert.ok(step1.nextQuestion);
  assert.notEqual(step1.nextQuestion.id, 'q2');
});

test('A5 Staircase: Converges after 8 questions to CEFR Level', () => {
  const allCorrect = mockQuestions.map(q => ({
    questionId: q.id,
    correct: true,
    difficulty: q.difficultyScore
  }));

  const res = StaircaseAdaptiveEngine.computeFinalPlacement(allCorrect);
  assert.equal(res.finished, true);
  assert.equal(res.cefrCode, 'B2');
  assert.equal(res.assignedLevel, 4);
  assert.equal(res.scorePercent, 100);

  // All incorrect answers
  const allWrong = mockQuestions.map(q => ({
    questionId: q.id,
    correct: false,
    difficulty: q.difficultyScore
  }));

  const resWrong = StaircaseAdaptiveEngine.computeFinalPlacement(allWrong);
  assert.equal(resWrong.finished, true);
  assert.equal(resWrong.cefrCode, 'A1');
  assert.equal(resWrong.assignedLevel, 1);
  assert.equal(resWrong.scorePercent, 0);
});
