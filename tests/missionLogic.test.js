import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  isCorrectGuess,
  isPartialGuess,
  getGuessOutcome,
  getNoScale,
  getNoReaction,
  getHangmanWordState,
  getSecurityStatus,
  MISSION_ANSWER,
} from '../lib/missionLogic.js';

test('normalizeText collapses spacing and case', () => {
  assert.equal(normalizeText('  harry   potter   escape  room  '), 'HARRY POTTER ESCAPE ROOM');
});

test('correct answer is accepted', () => {
  assert.equal(isCorrectGuess('HARRY POTTER ESCAPE ROOM'), true);
  assert.equal(isCorrectGuess(' harry potter escape room '), true);
});

test('incomplete answer is flagged', () => {
  assert.equal(isPartialGuess('Harry Potter'), true);
  assert.equal(isPartialGuess('Hogwarts'), true);
  assert.equal(isPartialGuess('Harry Potter Room'), true);
  assert.equal(isPartialGuess(MISSION_ANSWER), false);
});

test('guess evaluation distinguishes correct, partial, and incorrect answers', () => {
  assert.equal(getGuessOutcome('HARRY POTTER ESCAPE ROOM'), 'correct');
  assert.equal(getGuessOutcome('Harry Potter'), 'partial');
  assert.equal(getGuessOutcome('The Moon'), 'incorrect');
});

test('no button scaling matches expected progression', () => {
  assert.equal(getNoScale(0), 1);
  assert.equal(getNoScale(1), 1.12);
  assert.equal(getNoScale(2), 1.25);
  assert.equal(getNoScale(3), 1.4);
  assert.equal(getNoScale(4), 1.6);
  assert.equal(getNoScale(5), 1.85);
});

test('no button reactions are tracked', () => {
  assert.equal(getNoReaction(0), 'TARGET LOST');
  assert.equal(getNoReaction(1), 'TARGET LOST');
  assert.equal(getNoReaction(2), 'DECLINE BUTTON HAS EVADED CAPTURE');
  assert.equal(getNoReaction(4), 'Agent Lama is disappointed. 😔');
  assert.equal(getNoReaction(5), 'Are you sure about that? 👀');
});

test('hangman word state reveals letters and spaces correctly', () => {
  const words = getHangmanWordState(MISSION_ANSWER, ['H','A','R','Y']);
  assert.deepEqual(words, ['H A R R Y', '_ _ _ _ _ R', '_ _ _ A _ _', 'R _ _ _']);
});

test('security status map stays readable', () => {
  assert.equal(getSecurityStatus(6), 'STABLE');
  assert.equal(getSecurityStatus(3), 'INVESTIGATION COMPROMISED');
  assert.equal(getSecurityStatus(0), 'COMPROMISED');
});
