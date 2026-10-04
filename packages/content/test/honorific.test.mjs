import test from 'node:test';
import assert from 'node:assert/strict';
import { HonorificInterpreter, HONORIFIC_PAIRS_20 } from '../dist/index.js';

test('A6 Honorific Matrix: Exactly 20 pairs exist with complete metadata', () => {
  assert.equal(HONORIFIC_PAIRS_20.length, 20);
  for (const pair of HONORIFIC_PAIRS_20) {
    assert.ok(pair.id, 'Pair must have an id');
    assert.ok(pair.speaker, 'Pair must have speaker');
    assert.ok(pair.listener, 'Pair must have listener');
    assert.ok(pair.politeParticle, 'Pair must have politeParticle');
    assert.ok(pair.example, 'Pair must have example');
    assert.ok(pair.explanation, 'Pair must have explanation');
    assert.ok(pair.wisdom, 'Pair must have wisdom tip');
  }
});

test('A6 HonorificInterpreter: Sân đình & Traditional respect for elders (>70yo)', () => {
  const interpreter = new HonorificInterpreter();
  const res = interpreter.interpret({
    speakerAge: 20,
    listenerAge: 80,
    relation: 'traditional',
    formality: 'formal'
  });

  assert.equal(res.speaker, 'cháu');
  assert.equal(res.listener, 'cụ');
  assert.equal(res.pairId, 'h1');
  assert.ok(res.sampleSentence.includes('Cụ'));
});

test('A6 HonorificInterpreter: Teacher-Student relation in both directions', () => {
  const interpreter = new HonorificInterpreter();
  
  // Student to Teacher
  const studentRes = interpreter.interpret({
    speakerAge: 16,
    listenerAge: 40,
    relation: 'teacher_student',
    formality: 'formal'
  });
  assert.equal(studentRes.speaker, 'em');
  assert.equal(studentRes.listener, 'thầy/cô');
  assert.equal(studentRes.pairId, 'h8');

  // Teacher to Student
  const teacherRes = interpreter.interpret({
    speakerAge: 40,
    listenerAge: 16,
    relation: 'teacher_student',
    formality: 'polite'
  });
  assert.equal(teacherRes.speaker, 'thầy/cô');
  assert.equal(teacherRes.listener, 'em');
  assert.equal(teacherRes.pairId, 'h9');
});

test('A6 HonorificInterpreter: Kin relation gender sensitivity (Chú vs Cô vs Bác)', () => {
  const interpreter = new HonorificInterpreter();

  // Male uncle
  const maleUncle = interpreter.interpret({
    speakerAge: 20,
    listenerAge: 42,
    relation: 'kin',
    listenerGender: 'male'
  });
  assert.equal(maleUncle.speaker, 'cháu');
  assert.ok(maleUncle.listener.includes('chú') || maleUncle.listener.includes('bác'));

  // Female aunt
  const femaleAunt = interpreter.interpret({
    speakerAge: 20,
    listenerAge: 42,
    relation: 'kin',
    listenerGender: 'female'
  });
  assert.equal(femaleAunt.speaker, 'cháu');
  assert.ok(femaleAunt.listener.includes('cô') || femaleAunt.listener.includes('dì') || femaleAunt.listener.includes('bác'));
});

test('A6 HonorificInterpreter: Peer friendships (Lịch sự vs Thân mật)', () => {
  const interpreter = new HonorificInterpreter();

  // Polite peer (mình - bạn)
  const politePeer = interpreter.interpret({
    speakerAge: 22,
    listenerAge: 22,
    relation: 'social',
    formality: 'polite'
  });
  assert.equal(politePeer.speaker, 'mình');
  assert.equal(politePeer.listener, 'bạn');
  assert.equal(politePeer.pairId, 'h14');

  // Intimate peer (tớ - cậu)
  const intimatePeer = interpreter.interpret({
    speakerAge: 20,
    listenerAge: 20,
    relation: 'social',
    formality: 'intimate'
  });
  assert.equal(intimatePeer.speaker, 'tớ');
  assert.equal(intimatePeer.listener, 'cậu');
  assert.equal(intimatePeer.pairId, 'h15');
});

test('A6 HonorificInterpreter: Civic / Community speech in communal house', () => {
  const interpreter = new HonorificInterpreter();
  const civicRes = interpreter.interpret({
    speakerAge: 35,
    listenerAge: 50,
    relation: 'civic',
    formality: 'formal'
  });
  assert.equal(civicRes.speaker, 'tôi');
  assert.equal(civicRes.pairId, 'h17');
  assert.ok(civicRes.sampleSentence.includes('quý vị') || civicRes.sampleSentence.includes('hội làng'));
});

test('A6 HonorificInterpreter: Kin relation elder vs younger brother/sister', () => {
  const interpreter = new HonorificInterpreter();

  // Younger sibling talking to older brother
  const toOlderBro = interpreter.interpret({
    speakerAge: 18,
    listenerAge: 24,
    relation: 'kin',
    listenerGender: 'male'
  });
  assert.equal(toOlderBro.speaker, 'em');
  assert.equal(toOlderBro.listener, 'anh');
  assert.equal(toOlderBro.pairId, 'h10');

  // Older brother talking to younger sibling
  const fromOlderBro = interpreter.interpret({
    speakerAge: 24,
    listenerAge: 18,
    relation: 'kin',
    speakerGender: 'male'
  });
  assert.equal(fromOlderBro.speaker, 'anh');
  assert.equal(fromOlderBro.listener, 'em');
  assert.equal(fromOlderBro.pairId, 'h12');

  // Older sister talking to younger sibling
  const fromOlderSis = interpreter.interpret({
    speakerAge: 24,
    listenerAge: 18,
    relation: 'kin',
    speakerGender: 'female'
  });
  assert.equal(fromOlderSis.speaker, 'chị');
  assert.equal(fromOlderSis.listener, 'em');
  assert.equal(fromOlderSis.pairId, 'h13');
});

test('A6 HonorificInterpreter: Teacher-student gender-specific address (Thầy vs Cô)', () => {
  const interpreter = new HonorificInterpreter();

  // Student to Male Teacher
  const toMaleTeacher = interpreter.interpret({
    speakerAge: 16,
    listenerAge: 40,
    relation: 'teacher_student',
    listenerGender: 'male'
  });
  assert.equal(toMaleTeacher.listener, 'thầy');
  assert.ok(toMaleTeacher.sampleSentence.includes('Thầy'));

  // Student to Female Teacher
  const toFemaleTeacher = interpreter.interpret({
    speakerAge: 16,
    listenerAge: 40,
    relation: 'teacher_student',
    listenerGender: 'female'
  });
  assert.equal(toFemaleTeacher.listener, 'cô');
  assert.ok(toFemaleTeacher.sampleSentence.includes('Cô'));

  // Female Teacher to Student
  const femaleTeacherSpeaks = interpreter.interpret({
    speakerAge: 40,
    listenerAge: 16,
    relation: 'teacher_student',
    speakerGender: 'female'
  });
  assert.equal(femaleTeacherSpeaks.speaker, 'cô');
});

test('A6 HonorificInterpreter: Grandparent gender distinction (Ông vs Bà)', () => {
  const interpreter = new HonorificInterpreter();

  const toGrandpa = interpreter.interpret({
    speakerAge: 20,
    listenerAge: 68,
    relation: 'kin',
    listenerGender: 'male'
  });
  assert.equal(toGrandpa.listener, 'ông');
  assert.equal(toGrandpa.pairId, 'h2');

  const toGrandma = interpreter.interpret({
    speakerAge: 20,
    listenerAge: 68,
    relation: 'kin',
    listenerGender: 'female'
  });
  assert.equal(toGrandma.listener, 'bà');
  assert.equal(toGrandma.pairId, 'h2');
});

test('A6 HonorificInterpreter: Workplace civility (h16) vs Civic formal assembly (h20)', () => {
  const interpreter = new HonorificInterpreter();

  const workplace = interpreter.interpret({
    speakerAge: 30,
    listenerAge: 45,
    relation: 'work',
    formality: 'polite',
    listenerGender: 'male'
  });
  assert.equal(workplace.pairId, 'h16');
  assert.equal(workplace.speaker, 'tôi');
  assert.equal(workplace.listener, 'anh');

  const civic = interpreter.interpret({
    speakerAge: 32,
    listenerAge: 38,
    relation: 'civic',
    formality: 'formal'
  });
  assert.equal(civic.pairId, 'h20');
  assert.equal(civic.listener, 'đồng chí');
});

test('A6 HonorificInterpreter: Spiritual / Buddhist tradition (h18) and Parent-child (h6)', () => {
  const interpreter = new HonorificInterpreter();

  const buddhist = interpreter.interpret({
    speakerAge: 25,
    listenerAge: 60,
    relation: 'traditional',
    formality: 'intimate'
  });
  assert.equal(buddhist.pairId, 'h18');
  assert.equal(buddhist.speaker, 'con');
  assert.ok(buddhist.sampleSentence.includes('Tam Bảo') || buddhist.sampleSentence.includes('Bạch Thầy'));

  const parentChild = interpreter.interpret({
    speakerAge: 20,
    listenerAge: 48,
    relation: 'kin',
    formality: 'intimate',
    listenerGender: 'female'
  });
  assert.equal(parentChild.pairId, 'h6');
  assert.equal(parentChild.speaker, 'con');
  assert.equal(parentChild.listener, 'mẹ');
});

test('A6 HonorificInterpreter: Direct pairId resolution from Drawer', () => {
  const interpreter = new HonorificInterpreter();
  const res = interpreter.interpret({
    speakerAge: 20,
    listenerAge: 20,
    relation: 'social',
    pairId: 'h19',
    listenerGender: 'female'
  });
  assert.equal(res.pairId, 'h19');
  assert.equal(res.listener, 'thím');
});

