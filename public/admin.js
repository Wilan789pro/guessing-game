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
const sessionHistory = document.getElementById('session-history');

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

  void renderRemoteSessionHistory();
}

function renderLocalSessionHistory(message = 'Remote session history is unavailable.') {
  sessionHistory.replaceChildren();
  let sessionIds = [];
  try {
    sessionIds = JSON.parse(localStorage.getItem('agent-prism-mission-state-v1:session-index') || '[]');
  } catch (error) {
    sessionHistory.textContent = message;
    return;
  }

  const sessions = sessionIds.slice().reverse().map((id, index) => {
    try {
      return { id, state: JSON.parse(localStorage.getItem(`agent-prism-mission-state-v1:session:${id}`) || 'null'), number: sessionIds.length - index };
    } catch (error) {
      return null;
    }
  }).filter((session) => session?.state);

  if (message) {
    const status = document.createElement('p');
    status.textContent = message;
    sessionHistory.append(status);
  }
  if (!sessions.length) {
    sessionHistory.textContent = message || 'No mission sessions recorded in this browser.';
    return;
  }

  for (const session of sessions) {
    const details = document.createElement('details');
    details.className = 'session-history__item';
    const summary = document.createElement('summary');
    const status = session.state.defs?.finalCompletedAt ? 'COMPLETED' : session.state.scene === 'boot' ? 'ACTIVE' : 'IN PROGRESS';
    summary.textContent = `SESSION ${session.number} [${session.id.slice(0, 8)}] | ${new Date(session.state.createdAt).toLocaleString()} | ${status} | ${session.state.scene}`;
    details.append(summary);

    const events = document.createElement('ol');
    events.className = 'session-history__events';
    for (const event of (session.state.eventLog || []).slice().reverse()) {
      const item = document.createElement('li');
      const payload = event.payload || {};
      const detail = payload.guessText ? `: ${payload.guessText}` : payload.selectedLetter ? `: ${payload.selectedLetter}` : '';
      item.textContent = `${new Date(event.time).toLocaleTimeString()} — ${event.type}${detail}`;
      events.append(item);
    }
    if (!events.children.length) {
      const item = document.createElement('li');
      item.textContent = 'No events recorded.';
      events.append(item);
    }
    details.append(events);
    sessionHistory.append(details);
  }
}

async function renderRemoteSessionHistory() {
  sessionHistory.replaceChildren();
  if (!supabase) {
    renderLocalSessionHistory();
    return;
  }

  const { data: missions, error: missionError } = await supabase
    .from('missions')
    .select('id, created_at, updated_at, status, current_scene, completed_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (missionError) {
    renderLocalSessionHistory('Remote session history could not be loaded; showing sessions saved in this browser.');
    return;
  }

  if (!missions?.length) {
    renderLocalSessionHistory('No remote mission sessions recorded yet; showing sessions saved in this browser.');
    return;
  }

  const missionIds = missions.map((mission) => mission.id);
  const { data: events, error: eventError } = await supabase
    .from('mission_events')
    .select('mission_id, event_type, event_data, created_at')
    .in('mission_id', missionIds)
    .order('created_at', { ascending: true });

  if (eventError) {
    renderLocalSessionHistory('Remote events could not be loaded; showing sessions saved in this browser.');
    return;
  }

  const eventsByMission = new Map();
  for (const event of events || []) {
    const missionEvents = eventsByMission.get(event.mission_id) || [];
    missionEvents.push(event);
    eventsByMission.set(event.mission_id, missionEvents);
  }

  for (const [index, mission] of missions.entries()) {
    const details = document.createElement('details');
    details.className = 'session-history__item';
    const summary = document.createElement('summary');
    summary.textContent = `SESSION ${missions.length - index} [${mission.id.slice(0, 8)}] | ${new Date(mission.created_at).toLocaleString()} | ${mission.status.toUpperCase()} | ${mission.current_scene}`;
    details.append(summary);

    const eventList = document.createElement('ol');
    eventList.className = 'session-history__events';
    for (const event of eventsByMission.get(mission.id) || []) {
      const item = document.createElement('li');
      const payload = event.event_data || {};
      const detail = payload.guessText ? `: ${payload.guessText}` : payload.selectedLetter ? `: ${payload.selectedLetter}` : '';
      item.textContent = `${new Date(event.created_at).toLocaleTimeString()} — ${event.event_type}${detail}`;
      eventList.append(item);
    }
    if (!eventList.children.length) {
      const item = document.createElement('li');
      item.textContent = 'No events recorded.';
      eventList.append(item);
    }
    details.append(eventList);
    sessionHistory.append(details);
  }
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
