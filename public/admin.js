import { supabase } from './supabase-client.js';

const ADMIN_CODE = 'lama-ops';
const STORAGE_KEY = 'agent-prism-mission-state-v1';

const loginPanel = document.getElementById('admin-login-panel');
const adminContent = document.getElementById('admin-content');
const codeInput = document.getElementById('admin-code');
const missionStatus = document.getElementById('mission-status');
const acceptancePanel = document.getElementById('acceptance-panel');
const guessingPanel = document.getElementById('guessing-panel');
const hangmanPanel = document.getElementById('hangman-panel');
const finalAnswerPanel = document.getElementById('final-answer-panel');
const reportPanel = document.getElementById('report-panel');
const eventStream = document.getElementById('event-stream');

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function renderAdmin() {
  const state = readState();
  const hangman = state.defs?.hangman || { lives: 0, maxLives: 6, selectedLetters: [], wrongLetters: [], saveCount: 0 };
  const guesses = state.defs?.guesses || [];
  const hintsUnlocked = state.defs?.hintsUnlocked || [];

  missionStatus.innerHTML = `
    <div>Active: ${state.missionAccepted ? 'YES' : 'NO'}</div>
    <div>Scene: ${state.scene}</div>
    <div>Started at: ${state.createdAt || '—'}</div>
    <div>Last activity: ${state.updatedAt || '—'}</div>
  `;

  acceptancePanel.innerHTML = `
    <div>Accepted: ${state.missionAccepted ? 'YES' : 'NO'}</div>
    <div>NO count: ${state.noCount || 0}</div>
  `;

  guessingPanel.innerHTML = `
    <div>Guesses: ${guesses.length}</div>
    <div>History: ${guesses.map((g) => `${g.guessNumber}:${g.correct ? 'OK' : 'BAD'}:${g.guessText}`).join(' | ') || 'None'}</div>
    <div>Hints used: ${hintsUnlocked.length} / 10</div>
    <div>Kiss protocol accepted: ${state.defs?.kissProtocolAccepted ? 'YES' : 'NO'}</div>
  `;

  hangmanPanel.innerHTML = `
    <div>Current lives: ${hangman.lives} / ${hangman.maxLives}</div>
    <div>Selected letters: ${(hangman.selectedLetters || []).join(', ') || 'None'}</div>
    <div>Correct letters: ${(hangman.revealedLetters || []).join(', ') || 'None'}</div>
    <div>Incorrect letters: ${(hangman.incorrectLetters || []).join(', ') || 'None'}</div>
    <div>Saves used: ${hangman.saveCount || 0}</div>
    <div>Current revealed phrase: ${hangman.revealedLetters ? hangman.revealedLetters.join(' ') : '—'}</div>
  `;

  finalAnswerPanel.innerHTML = `
    <div>Answer submitted: ${state.defs?.finalAnswer ? 'YES' : 'NO'}</div>
    <div>Attempts: ${guesses.length}</div>
    <div>Correct answer: ${state.defs?.finalAnswer || '—'}</div>
    <div>Completion time: ${state.defs?.finalCompletedAt || '—'}</div>
  `;

  reportPanel.innerHTML = `
    <div>Generated: ${state.defs?.reportGenerated ? 'YES' : 'NO'}</div>
    <div>Shared: ${state.defs?.reportShared ? 'YES' : 'NO'}</div>
    <div>Timestamp: ${state.defs?.reportGeneratedAt || '—'}</div>
  `;

  eventStream.innerHTML = (state.eventLog || []).slice(0, 60).map((event) => `
    <div>${new Date(event.time).toLocaleTimeString()} — ${event.type}</div>
  `).join('');
}

function setAuthenticated(boolean) {
  if (boolean) {
    adminContent.classList.remove('hidden');
    loginPanel.classList.add('hidden');
    renderAdmin();
  } else {
    adminContent.classList.add('hidden');
    loginPanel.classList.remove('hidden');
  }
}

document.getElementById('admin-login').addEventListener('click', () => {
  const code = codeInput.value.trim();
  if (code === ADMIN_CODE) {
    sessionStorage.setItem('lama-auth', 'granted');
    setAuthenticated(true);
  } else {
    alert('Authentication failed.');
  }
});

document.getElementById('reset-test-mission').addEventListener('click', () => {
  if (!confirm('Reset the test mission? This is a development-only action.')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderAdmin();
  alert('Mission reset.');
});

if (sessionStorage.getItem('lama-auth') === 'granted') {
  setAuthenticated(true);
} else {
  setAuthenticated(false);
}

window.addEventListener('storage', renderAdmin);
window.addEventListener('mission-state-updated', renderAdmin);
