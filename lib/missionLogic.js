export const MISSION_ANSWER = 'HARRY POTTER ESCAPE ROOM';
export const HINTS = [
  'The answer is something you will recognise.',
  'You have probably encountered the subject before.',
  'There may be more than one person involved.',
  'The mission may require you to think.',
  'Time may become relevant.',
  'The answer contains more than one word.',
  'You may have seen something related to this on a screen.',
  'The operation involves a location.',
  'You may want to remember things you already know.',
  'Agent Lama recommends investigating further.'
];

export function normalizeText(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toUpperCase();
}

export function createMissionSessionId(cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.getRandomValues) {
    throw new Error('Secure random generation is unavailable in this browser.');
  }

  if (cryptoProvider.randomUUID) return cryptoProvider.randomUUID();

  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isMissionSessionCompleted(missionState) {
  return Boolean(
    missionState?.completed
    || missionState?.completedAt
    || missionState?.defs?.finalCompletedAt
    || ['success', 'report'].includes(missionState?.scene)
  );
}

export function shouldResumeMissionSession(missionState, navigationType) {
  return navigationType === 'reload'
    && Boolean(missionState?.missionId)
    && !isMissionSessionCompleted(missionState);
}

export function isCorrectGuess(value = '') {
  return normalizeText(value) === normalizeText(MISSION_ANSWER);
}

export function isPartialGuess(value = '') {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  const words = normalized.split(' ');
  const answerWords = normalizeText(MISSION_ANSWER).split(' ');
  const isExactAnswer = normalized === normalizeText(MISSION_ANSWER);
  const partialMatches = answerWords.filter((word) => words.includes(word));

  if (isExactAnswer) return false;
  if (words.length === 1) return true;
  if (partialMatches.length > 0) return true;
  return words.length < answerWords.length && words.some((word) => answerWords.includes(word));
}

export function getGuessOutcome(value = '') {
  if (isCorrectGuess(value)) return 'correct';
  if (isPartialGuess(value)) return 'partial';
  return 'incorrect';
}

export function getNoScale(count = 0) {
  const scaleMap = {
    0: 1,
    1: 1.12,
    2: 1.25,
    3: 1.4,
    4: 1.6,
    5: 1.85,
  };
  return scaleMap[Math.min(count, 5)] ?? 1.85;
}

export function getNoReaction(count = 0) {
  const reactionMap = {
    1: 'TARGET LOST',
    2: 'DECLINE BUTTON HAS EVADED CAPTURE',
    3: "Agent Prism, you're making this unnecessarily difficult.",
    4: 'Agent Lama is disappointed. 😔',
    5: 'Are you sure about that? 👀',
  };

  if (count <= 0) return 'TARGET LOST';
  if (count >= 6) return 'DECLINE BUTTON: COMPROMISED.';
  return reactionMap[count] || 'TARGET LOST';
}

export function createHangmanState() {
  return {
    phrase: MISSION_ANSWER,
    revealedLetters: [],
    selectedLetters: [],
    incorrectLetters: [],
    pendingIncorrectLetter: null,
    lives: 6,
    maxLives: 6,
    saveCount: 0,
    status: 'active',
    startedAt: new Date().toISOString(),
  };
}

export function getSecurityStatus(lives) {
  const statusMap = {
    6: 'STABLE',
    5: 'MINOR SECURITY BREACH',
    4: 'SECURITY SYSTEMS ALERT',
    3: 'INVESTIGATION COMPROMISED',
    2: 'CRITICAL SECURITY WARNING',
    1: 'AGENT SECURITY CRITICAL',
    0: 'COMPROMISED',
  };
  return statusMap[Math.max(0, lives)] || 'STABLE';
}

export function getHangmanWordState(phrase = MISSION_ANSWER, revealedLetters = []) {
  return phrase.split(' ').map((word) => {
    const letters = word.split('');
    return letters.map((char) => (revealedLetters.includes(char) ? char : '_')).join(' ');
  });
}

export function revealLettersForGuess(phrase = MISSION_ANSWER, revealedLetters = [], guessLetter = '') {
  const trimmed = String(guessLetter || '').toUpperCase();
  if (!trimmed) return revealedLetters;
  const unique = new Set(revealedLetters);
  for (const char of phrase.toUpperCase()) {
    if (char === trimmed) unique.add(char);
  }
  return [...unique];
}

export function getHangmanProgress(revealedLetters, phrase = MISSION_ANSWER) {
  const uniqueTargetLetters = [...new Set(phrase.toUpperCase().replace(/\s/g, ''))];
  const uncovered = uniqueTargetLetters.filter((letter) => revealedLetters.includes(letter));
  return Math.round((uncovered.length / uniqueTargetLetters.length) * 100);
}

export function getDirectAnswerStatus(answer = '') {
  return isCorrectGuess(answer) ? 'success' : 'failed';
}
