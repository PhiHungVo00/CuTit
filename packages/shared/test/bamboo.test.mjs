import test from 'node:test';
import assert from 'node:assert/strict';
import { BambooTreeSyntaxChecker, calculateSM2, DrillFactory } from '../dist/index.js';

test('A8 BambooTree: Correct canonical sentence passes with valid=true', () => {
  const template = {
    id: 's1',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Dạ, em chào cô Ba ạ.',
    grammarNote: 'Dạ đứng đầu câu và ạ đứng cuối câu biểu thị sự lễ phép.',
    tokens: [
      { id: 't1', text: 'Dạ,', role: 'honorific_start' },
      { id: 't2', text: 'em', role: 'subject' },
      { id: 't3', text: 'chào', role: 'verb' },
      { id: 't4', text: 'cô Ba', role: 'object' },
      { id: 't5', text: 'ạ.', role: 'honorific_end' }
    ]
  };

  const userTokens = ['Dạ,', 'em', 'chào', 'cô Ba', 'ạ.'];
  const res = BambooTreeSyntaxChecker.checkOrder(userTokens, template);

  assert.equal(res.valid, true);
  assert.equal(res.misplacedIndices.length, 0);
  assert.equal(res.errors.length, 0);
  assert.equal(res.reconstructedSentence, 'Dạ, em chào cô Ba ạ.');
});

test('A8 BambooTree: Misplaced tokens detected with misplacedIndices', () => {
  const template = {
    id: 's1',
    topic: 'Chào hỏi',
    level: 1,
    canonicalSentence: 'Dạ, em chào cô Ba ạ.',
    grammarNote: 'Dạ đứng đầu câu và ạ đứng cuối câu biểu thị sự lễ phép.',
    tokens: [
      { id: 't1', text: 'Dạ,', role: 'honorific_start' },
      { id: 't2', text: 'em', role: 'subject' },
      { id: 't3', text: 'chào', role: 'verb' },
      { id: 't4', text: 'cô Ba', role: 'object' },
      { id: 't5', text: 'ạ.', role: 'honorific_end' }
    ]
  };

  // User places 'chào' before 'em'
  const userTokens = ['Dạ,', 'chào', 'em', 'cô Ba', 'ạ.'];
  const res = BambooTreeSyntaxChecker.checkOrder(userTokens, template);

  assert.equal(res.valid, false);
  assert.ok(res.misplacedIndices.includes(1));
  assert.ok(res.misplacedIndices.includes(2));
  assert.ok(res.errors.length > 0);
});

test('A8 BambooTree: Heuristic rules detect honorific particles in wrong position', () => {
  // 'Dạ' placed at the end of sentence
  const userTokens = ['em', 'chào', 'cô Ba', 'dạ'];
  const res = BambooTreeSyntaxChecker.checkOrder(userTokens);

  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('Dạ') || e.includes('dạ')));
});

test('A4 SRS: SuperMemo-2 calculates correct intervals and ease factors', () => {
  // calculateSM2(currentEase, currentInterval, currentRepetitions, quality)
  const r1 = calculateSM2(250, 1, 0, 5);
  assert.equal(r1.repetitions, 1);
  assert.equal(r1.intervalDays, 1);
  assert.ok(r1.ease >= 250);

  // Perfect score on second repetition
  const r2 = calculateSM2(r1.ease, r1.intervalDays, r1.repetitions, 5);
  assert.equal(r2.repetitions, 2);
  assert.equal(r2.intervalDays, 6);

  // Poor score (quality 1) resets repetitions to 0 and interval to 1
  const r3 = calculateSM2(r2.ease, r2.intervalDays, r2.repetitions, 1);
  assert.equal(r3.repetitions, 0);
  assert.equal(r3.intervalDays, 1);
});

test('GoF Factory Method (2): DrillFactory creates corresponding DrillItem objects', () => {
  const quiz = DrillFactory.createDrill('quiz', { id: 'q1', question: 'Ăn trông nồi?' });
  assert.equal(quiz.type, 'quiz');
  assert.ok(quiz.renderPrompt().includes('Trắc nghiệm'));

  const fill = DrillFactory.createDrill('fill', { id: 'f1', sentence: 'Dạ, em ___ cô.' });
  assert.equal(fill.type, 'fill');
  assert.ok(fill.renderPrompt().includes('Điền từ'));
});
