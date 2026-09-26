import { supabase } from './supabase-client.js';
import { MISSION_ANSWER, HINTS, normalizeText, isCorrectGuess, isPartialGuess, getGuessOutcome, getNoScale, getNoReaction, getHangmanWordState, revealLettersForGuess, createHangmanState, createMissionSessionId, isMissionSessionCompleted, shouldResumeMissionSession } from './lib/missionLogic.js';

const STORAGE_KEY = 'agent-prism-mission-state-v1';
const SESSION_POINTER_KEY = 'agent-prism-active-session-v1';
const SESSION_STATE_PREFIX = `${STORAGE_KEY}:session:`;
const SESSION_INDEX_KEY = `${STORAGE_KEY}:session-index`;
const HIDDEN_HANGMAN_THRESHOLD = 10;
let sessionToArchiveAtStartup = null;

function createDefaultState(missionId) {
  const now = new Date().toISOString();
  return {
    missionId,
    createdAt: now,
    updatedAt: now,
    scene: 'boot',
    missionAccepted: true,
    missionAcceptedAt: null,
    noCount: 0,
    noPosition: { x: 82, y: 72 },
    noButtonHidden: false,
    yesScale: 1,
    reaction: '',
    defs: {
      directAnswerProtocolRequested: false,
      directAnswerCost: 100,
      kissProtocolAccepted: false,
      kissProtocolAcceptedAt: null,
      guessingIntroStarted: false,
      hintsUnlocked: [],
      hints: [],
      guesses: [],
      guessNumber: 0,
      hangman: createHangmanState(),
      finalAnswer: null,
      finalCompletedAt: null,
      completionSource: null,
      completionEventId: null,
      successSequenceComplete: false,
      reportGenerated: false,
      reportShared: false,
      shareAttempted: false,
      shareSucceeded: false,
      lastActivity: now,
      missionEventSyncQueue: [],
      hangmanSyncQueue: [],
      successSyncQueue: [],
      supabaseMissionId: null,
      syncUnavailable: false,
    },
    eventLog: [],
  };
}

const app = document.getElementById('app');
const soundToggle = document.getElementById('sound-toggle');
const resetTestButton = document.getElementById('reset-test-mission');
const audioEl = document.getElementById('audio-context');

let state = initializeSessionState();
let soundOn = localStorage.getItem('agent-prism-sound') !== 'off';
let suppressTyping = false;
let successSequenceRunning = false;
let bootSequenceRunning = false;

const terminalSequence = [
  'ESTABLISHING SECURE CONNECTION...',
  'ENCRYPTED CHANNEL INITIALIZED',
  'CONNECTION STATUS: SECURE',
  'IDENTIFYING RECIPIENT...',
  'AGENT IDENTIFIED: PRISM',
  'TRANSMISSION RELAY READY.'
];

function mergeStoredState(stored, missionId) {
  const defaults = createDefaultState(missionId);
  const nextState = {
    ...defaults,
    ...stored,
    missionId,
    defs: {
      ...defaults.defs,
      ...(stored.defs || {}),
      hangman: { ...createHangmanState(), ...(stored.defs?.hangman || {}) },
      missionEventSyncQueue: stored.defs?.missionEventSyncQueue || [],
      hangmanSyncQueue: stored.defs?.hangmanSyncQueue || [],
      successSyncQueue: stored.defs?.successSyncQueue || [],
      syncUnavailable: false,
    },
    noPosition: stored.noPosition || { x: 82, y: 72 },
    eventLog: stored.eventLog || [],
  };

  return nextState;
}

function initializeSessionState() {
  try {
    const activeSessionId = sessionStorage.getItem(SESSION_POINTER_KEY);
    const stored = activeSessionId
      ? JSON.parse(localStorage.getItem(`${SESSION_STATE_PREFIX}${activeSessionId}`) || 'null')
      : null;
    const navigationType = performance.getEntriesByType('navigation')[0]?.type || 'navigate';

    if (stored && shouldResumeMissionSession(stored, navigationType)) {
      return mergeStoredState(stored, activeSessionId);
    }

    if (stored && !shouldResumeMissionSession(stored, navigationType) && !isMissionSessionCompleted(stored)) {
      sessionToArchiveAtStartup = mergeStoredState(stored, activeSessionId);
    }

    return createNewSessionState();
  } catch (error) {
    console.warn('Session state recovery failed; starting a new investigation.');
    return createNewSessionState();
  }
}

function createNewSessionState() {
  const missionId = createMissionSessionId();
  const nextState = createDefaultState(missionId);
  nextState.defs.needsMissionStartedEvent = true;
  sessionStorage.setItem(SESSION_POINTER_KEY, missionId);
  rememberSessionId(missionId);
  persistState(nextState);
  return nextState;
}

function prepareNewSessionState() {
  const missionId = createMissionSessionId();
  const nextState = createDefaultState(missionId);
  sessionStorage.setItem(SESSION_POINTER_KEY, missionId);
  rememberSessionId(missionId);
  return nextState;
}

function rememberSessionId(missionId) {
  try {
    const ids = JSON.parse(localStorage.getItem(SESSION_INDEX_KEY) || '[]');
    if (!ids.includes(missionId)) {
      ids.push(missionId);
      localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(ids));
    }
  } catch (error) {
    localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify([missionId]));
  }
}

function persistState(targetState = state) {
  targetState.updatedAt = new Date().toISOString();
  targetState.defs.lastActivity = targetState.updatedAt;
  localStorage.setItem(`${SESSION_STATE_PREFIX}${targetState.missionId}`, JSON.stringify(targetState));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(targetState));
  try {
    window.dispatchEvent(new CustomEvent('mission-state-updated', { detail: targetState }));
  } catch (error) {
    // no-op
  }
}

function pushEvent(type, payload = {}, targetState = state) {
  targetState.eventLog = targetState.eventLog || [];
  const event = {
    id: createMissionSessionId(),
    type,
    time: new Date().toISOString(),
    payload,
  };
  targetState.eventLog.unshift(event);
  if (targetState.eventLog.length > 150) targetState.eventLog.length = 150;
  targetState.defs.missionEventSyncQueue = targetState.defs.missionEventSyncQueue || [];
  targetState.defs.missionEventSyncQueue.push({ id: event.id, type, payload, createdAt: event.time });
  persistState(targetState);
  void flushMissionEventQueue(targetState);
  return event;
}

function snapshotHangman(missionState = state) {
  return JSON.parse(JSON.stringify(missionState.defs.hangman));
}

function recordHangmanEvent(type, payload, missionState = state) {
  const event = pushEvent(type, payload, missionState);
  missionState.defs.hangmanSyncQueue = missionState.defs.hangmanSyncQueue || [];
  missionState.defs.hangmanSyncQueue.push({ id: event.id, type, payload, createdAt: event.time });
  persistState(missionState);
  void flushHangmanSyncQueue(missionState);
}

const syncInProgress = new Set();

async function ensureHangmanRemoteMission(missionState = state) {
  if (!supabase) return null;

  let { data: authData, error } = await supabase.auth.getSession();
  if (error) throw error;

  if (!authData.session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
    authData = result.data;
  }

  if (missionState.defs.supabaseMissionId) return missionState.defs.supabaseMissionId;

  let { data: mission, error: missionError } = await supabase
    .from('missions')
    .insert({
      id: missionState.missionId,
      session_token: missionState.missionId,
      current_scene: missionState.scene,
      status: 'open',
      mission_accepted: Boolean(missionState.missionAccepted),
      mission_accepted_at: missionState.missionAcceptedAt,
    })
    .select('id')
    .single();

  if (missionError?.code === '23505') {
    const existing = await supabase
      .from('missions')
      .select('id')
      .eq('id', missionState.missionId)
      .single();
    mission = existing.data;
    missionError = existing.error;
  }

  if (missionError) throw missionError;
  missionState.defs.supabaseMissionId = mission.id;
  persistState(missionState);
  return mission.id;
}

async function flushMissionEventQueue(missionState = state) {
  if (!supabase || missionState.defs.syncUnavailable || syncInProgress.has(missionState.missionId)) return;
  const queue = missionState.defs.missionEventSyncQueue || [];
  if (!queue.length) return;

  syncInProgress.add(missionState.missionId);
  try {
    const missionId = await ensureHangmanRemoteMission(missionState);
    while (missionState.defs.missionEventSyncQueue?.length) {
      const event = missionState.defs.missionEventSyncQueue[0];
      const eventPayload = event.payload || {};
      const { error } = await supabase.from('mission_events').insert({
        mission_id: missionId,
        event_type: event.type,
        event_data: { ...eventPayload, recorded_at: event.createdAt },
        idempotency_key: event.id,
      });
      if (error && error.code !== '23505') throw error;

      if (event.type === 'guess_submitted') {
        const { error: guessError } = await supabase.from('guesses').insert({
          mission_id: missionId,
          guess_text: eventPayload.guessText || eventPayload.answer || '',
          normalized_guess: eventPayload.normalizedGuess || eventPayload.normalizedAnswer || '',
          guess_number: eventPayload.guessNumber || (missionState.defs.guesses || []).length,
          correct: Boolean(eventPayload.correct),
        });
        if (guessError && guessError.code !== '23505') throw guessError;
      }

      if (event.type === 'mission_archived' || event.type === 'destination_revealed') {
        const completed = event.type === 'destination_revealed';
        const { error: missionError } = await supabase.from('missions').update({
          status: completed ? 'completed' : 'archived',
          completed,
          completed_at: completed ? missionState.defs.finalCompletedAt : null,
          final_answer: completed ? MISSION_ANSWER : null,
        }).eq('id', missionId);
        if (missionError) throw missionError;
      }

      missionState.defs.missionEventSyncQueue.shift();
      persistState(missionState);
    }
  } catch (error) {
    missionState.defs.syncUnavailable = true;
    persistState(missionState);
    console.warn('Mission events queued locally until a secure Supabase session is available.');
  } finally {
    syncInProgress.delete(missionState.missionId);
    retryPendingSessionQueues(missionState);
  }
}

async function flushHangmanSyncQueue(missionState = state) {
  if (!supabase || missionState.defs.syncUnavailable || syncInProgress.has(missionState.missionId)) return;
  if (!(missionState.defs.hangmanSyncQueue || []).length) return;

  syncInProgress.add(missionState.missionId);
  try {
    const missionId = await ensureHangmanRemoteMission(missionState);
    while (missionState.defs.hangmanSyncQueue?.length) {
      const event = missionState.defs.hangmanSyncQueue[0];
      const payload = event.payload || {};
      const after = payload.stateAfter || missionState.defs.hangman;
      const { error: stateError } = await supabase.from('hangman_state').upsert({
        mission_id: missionId,
        phrase: after.phrase,
        revealed_letters: after.revealedLetters || [],
        selected_letters: after.selectedLetters || [],
        incorrect_letters: after.incorrectLetters || [],
        pending_incorrect_letter: after.pendingIncorrectLetter || null,
        lives: after.lives,
        max_lives: after.maxLives,
        save_count: after.saveCount || 0,
        status: after.status || 'active',
      }, { onConflict: 'mission_id' });
      if (stateError) throw stateError;

      const { error } = await supabase.from('hangman_events').insert({
        mission_id: missionId,
        event_type: event.type,
        selected_letter: payload.selectedLetter || payload.incorrectLetter || null,
        correct: typeof payload.correct === 'boolean' ? payload.correct : null,
        lives_before: payload.stateBefore?.lives ?? payload.livesBefore ?? after.lives,
        lives_after: payload.stateAfter?.lives ?? payload.livesAfter ?? after.lives,
        revealed_state: after.revealedLetters || [],
        idempotency_key: event.id,
      });
      if (error && error.code !== '23505') throw error;

      missionState.defs.hangmanSyncQueue.shift();
      persistState(missionState);
    }
  } catch (error) {
    missionState.defs.syncUnavailable = true;
    persistState(missionState);
    console.warn('Hangman sync queued locally until a secure Supabase session is available.');
  } finally {
    syncInProgress.delete(missionState.missionId);
    retryPendingSessionQueues(missionState);
  }
}

function retryPendingSessionQueues(missionState) {
  if (missionState.defs.syncUnavailable) return;
  if (missionState.defs.missionEventSyncQueue?.length) {
    window.setTimeout(() => void flushMissionEventQueue(missionState), 0);
  }
  if (missionState.defs.hangmanSyncQueue?.length) {
    window.setTimeout(() => void flushHangmanSyncQueue(missionState), 0);
  }
  if (missionState.defs.successSyncQueue?.length) {
    window.setTimeout(() => void flushSuccessSyncQueue(missionState), 0);
  }
}

function retryStoredSessionQueues(forceRetry = false) {
  let ids = [];
  try {
    ids = JSON.parse(localStorage.getItem(SESSION_INDEX_KEY) || '[]');
  } catch (error) {
    return;
  }

  for (const missionId of ids) {
    try {
      const stored = JSON.parse(localStorage.getItem(`${SESSION_STATE_PREFIX}${missionId}`) || 'null');
      if (!stored) continue;
      if (stored.defs?.syncUnavailable && !forceRetry && missionId !== state.missionId) continue;
      const missionState = missionId === state.missionId ? state : mergeStoredState(stored, missionId);
      missionState.defs.syncUnavailable = false;
      void flushMissionEventQueue(missionState);
      void flushHangmanSyncQueue(missionState);
      void flushSuccessSyncQueue(missionState);
    } catch (error) {
      console.warn('An archived session remains queued locally.');
    }
  }
}

function queueMissionCompletion(source, successfulGuess = null, successfulGuessEvent = null) {
  state.scene = 'success';
  state.defs.successSequenceInitializing = true;
  state.defs.completionSource = source;
  state.defs.finalAnswer = normalizeText(MISSION_ANSWER);
  state.defs.finalCompletedAt = state.defs.finalCompletedAt || new Date().toISOString();
  state.defs.successSyncQueue = state.defs.successSyncQueue || [];

  if (successfulGuess) {
    state.defs.successSyncQueue.push({
      id: successfulGuessEvent?.id || `${state.missionId}-successful-guess-${successfulGuess.guessNumber}`,
      type: 'successful_guess',
      createdAt: successfulGuessEvent?.time || new Date().toISOString(),
      payload: { ...successfulGuess, source },
    });
  }

  if (!state.defs.completionEventId) {
    const completionEvent = pushEvent('destination_revealed', {
      answer: MISSION_ANSWER,
      source,
      missionId: state.missionId,
      completedAt: state.defs.finalCompletedAt,
    });
    state.defs.completionEventId = completionEvent.id;
    state.defs.successSyncQueue.push({
      id: completionEvent.id,
      type: 'destination_revealed',
      createdAt: completionEvent.time,
      payload: {
        answer: MISSION_ANSWER,
        source,
        completedAt: state.defs.finalCompletedAt,
      },
    });
  }

  persistState();
  state.defs.successSequenceInitializing = false;
  void flushSuccessSyncQueue();
}

async function flushSuccessSyncQueue(missionState = state) {
  if (!supabase || missionState.defs.syncUnavailable || syncInProgress.has(missionState.missionId) || !(missionState.defs.successSyncQueue || []).length) return;

  syncInProgress.add(missionState.missionId);
  try {
    const missionId = await ensureHangmanRemoteMission(missionState);
    while (missionState.defs.successSyncQueue?.length) {
      const item = missionState.defs.successSyncQueue[0];

      if (item.type === 'successful_guess') {
        const guess = item.payload;
        const { error: guessError } = await supabase.from('guesses').insert({
          mission_id: missionId,
          guess_text: guess.guessText,
          normalized_guess: guess.normalizedGuess,
          guess_number: guess.guessNumber,
          correct: true,
        });
        if (guessError && guessError.code !== '23505') throw guessError;
      } else {
        const { error: completionError } = await supabase
          .from('missions')
          .update({
            current_scene: 'success',
            status: 'completed',
            completed: true,
            completed_at: missionState.defs.finalCompletedAt,
            final_answer: MISSION_ANSWER,
          })
          .eq('id', missionId);
        if (completionError) throw completionError;
      }

      const { error: eventError } = await supabase.from('mission_events').insert({
        mission_id: missionId,
        event_type: item.type === 'successful_guess' ? 'guess_submitted' : 'destination_revealed',
        event_data: { ...item.payload, recorded_at: item.createdAt, idempotency_key: item.id },
        idempotency_key: item.id,
      });
      if (eventError && eventError.code !== '23505') throw eventError;

      missionState.defs.successSyncQueue.shift();
      persistState(missionState);
    }
  } catch (error) {
    missionState.defs.syncUnavailable = true;
    persistState(missionState);
    console.warn('Mission completion sync deferred; progress remains saved locally.');
  } finally {
    syncInProgress.delete(missionState.missionId);
    retryPendingSessionQueues(missionState);
  }
}

function startNewMission(reason, previousState = state) {
  const previousSessionId = previousState?.missionId || null;
  const archived = previousState && !previousState.defs?.finalCompletedAt;
  const nextState = prepareNewSessionState();

  if (archived) {
    pushEvent('mission_archived', {
      reason,
      archivedAt: new Date().toISOString(),
      nextSessionId: nextState.missionId,
    }, previousState);
  }

  state = nextState;
  persistState(state);
  pushEvent('mission_started', {
    startedAt: state.createdAt,
    source: reason,
    previousSessionId,
  }, state);
  render();
  return state;
}

function setScene(scene) {
  state.scene = scene;
  persistState();
}

function beginHangmanTransition(phase) {
  const currentScreen = app.querySelector('.screen');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (currentScreen) {
    currentScreen.classList.add('screen--transition-out');
    currentScreen.setAttribute('aria-busy', 'true');
    currentScreen.querySelectorAll('button, input').forEach((control) => {
      control.disabled = true;
    });
  }

  const activateProtocol = () => {
    state.defs.hangman = createHangmanState();
    state.scene = 'protocolTransition';
    pushEvent('hangman_started', { phase });
    render();
  };

  window.setTimeout(activateProtocol, reducedMotion ? 20 : 280);
}

function getMissionState() {
  const mission = JSON.parse(JSON.stringify(state));
  return mission;
}

function render() {
  const mission = getMissionState();
  const scene = mission.scene;

  if (scene === 'boot') {
    if (bootSequenceRunning) return;
    bootSequenceRunning = true;
    app.innerHTML = renderBootScene();
    typeBootSequence();
    return;
  }

  if (scene === 'files') {
    app.innerHTML = renderFilesScene();
    bindFilesActions();
    return;
  }

  if (scene === 'guessing') {
    if (!state.defs.guessingIntroStarted) {
      app.innerHTML = renderGuessingIntro();
      bindGuessingIntroActions();
      return;
    }

    app.innerHTML = renderGuessingScene();
    bindGuessingActions();
    return;
  }

  if (scene === 'kissProtocol') {
    app.innerHTML = renderKissProtocol();
    bindKissProtocolAction();
    return;
  }

  if (scene === 'hints') {
    app.innerHTML = renderHintScene();
    bindHintActions();
    return;
  }

  if (scene === 'protocolTransition') {
    renderProtocolTransition();
    return;
  }

  if (scene === 'hangman') {
    app.innerHTML = renderHangmanScene();
    bindHangmanActions();
    return;
  }

  if (scene === 'success') {
    if (successSequenceRunning || state.defs.successSequenceInitializing) return;
    renderSuccessScene();
    return;
  }

  if (scene === 'report') {
    app.innerHTML = renderReportScene();
    bindReportActions();
    return;
  }

  state.scene = 'guessing';
  state.missionAccepted = true;
  state.missionAcceptedAt = new Date().toISOString();
  state.defs.guessingIntroStarted = false;
  app.innerHTML = renderGuessingIntro();
  bindGuessingIntroActions();
}

function renderBootScene() {
  return `
    <section class="screen terminal screen--active" aria-label="Secure connection screen">
      <div id="terminal-output" class="typing-text"></div>
    </section>
  `;
}

function typeBootSequence() {
  const output = document.getElementById('terminal-output');
  const fragment = [];
  let index = 0;

  function next() {
    if (index >= terminalSequence.length) {
      setTimeout(() => {
        bootSequenceRunning = false;
        state.scene = 'guessing';
        state.missionAccepted = true;
        state.missionAcceptedAt = new Date().toISOString();
        state.defs.guessingIntroStarted = false;
        persistState();
        render();
      }, 700);
      return;
    }

    const line = terminalSequence[index];
    fragment.push(`<span class="terminal-line">${line}</span>`);
    output.innerHTML = fragment.join('');
    index += 1;
    setTimeout(next, 450);
  }

  next();
}

function renderFilesScene() {
  return `
    <section class="screen dossier" aria-label="Mission files">
      <div class="title-block">
        <h2>MISSION FILES</h2>
      </div>

      <div class="file-grid">
        <article class="file-card">
          <h3>FILE 01 — EXTRACTION</h3>
          <p class="paragraph"><strong>DATE:</strong> 03/10/2026<br><strong>PICKUP:</strong> 08:30 AM<br><strong>LOCATION:</strong> AGENT PRISM'S RESIDENCE<br><strong>TRANSPORT:</strong> AGENT LAMA</p>
          <p class="paragraph">Agent Lama will arrive at your residence at 08:30 AM.<br><br>Be ready.</p>
        </article>

        <article class="file-card">
          <h3>FILE 02 — DRESS CODE</h3>
          <p class="paragraph">SMART CASUAL<br><br>COMFORTABLE FOOTWEAR</p>
          <p class="paragraph">You will understand later.</p>
        </article>

        <article class="file-card">
          <h3>FILE 03 — FIRST OBJECTIVE</h3>
          <p class="paragraph">DEVELOPERS FESTIVAL</p>
          <p class="paragraph">Attend event<br>Spend morning together<br>Have fun</p>
          <p class="paragraph">THREAT LEVEL: EXTREMELY NERDY</p>
        </article>

        <article class="file-card">
          <h3>FILE 04 — LUNCH</h3>
          <p class="paragraph">CHECKPOINT — LUNCH<br><br>Every successful operation requires a refuelling checkpoint.</p>
          <p class="paragraph">Lunch details will be revealed during the mission.</p>
        </article>

        <article class="file-card">
          <h3>FILE 05 — CLASSIFIED</h3>
          <p class="paragraph"><strong>DESTINATION:</strong> <span class="redacted">███████████████</span><br><strong>ACTIVITY:</strong> <span class="redacted">███████████████</span><br><strong>LOCATION:</strong> <span class="redacted">███████████████</span><br><strong>STATUS:</strong> CLASSIFIED</p>
          <p class="paragraph">AUTHORIZED BY: AGENT LAMA<br>ACCESS LEVEL: INSUFFICIENT</p>
          <p class="paragraph">You will receive clearance when the time is right.</p>
        </article>
      </div>

      <div class="timeline" aria-label="Mission timeline">
        <div class="timeline-item"><span class="timeline-time">08:30 AM</span><span>EXTRACTION</span></div>
        <div class="timeline-item"><span class="timeline-time">MORNING</span><span>DEVELOPERS FESTIVAL</span></div>
        <div class="timeline-item"><span class="timeline-time">LUNCH</span><span>CHECKPOINT</span></div>
        <div class="timeline-item"><span class="timeline-time">LATER</span><span>CLASSIFIED DESTINATION</span></div>
      </div>

      <div class="actions" style="margin-top: 16px;">
        <button class="primary-button" type="button" data-action="guessing">ENTER THE GUESSING GAME</button>
      </div>
    </section>
  `;
}

function bindFilesActions() {
  const button = document.querySelector('[data-action="guessing"]');
  button.addEventListener('click', () => {
    state.scene = 'guessing';
    pushEvent('file_opened', { stage: 'guessing' });
    render();
  });
}

function renderGuessingIntro() {
  return `
    <section class="screen dossier" aria-label="Classified destination access restricted">
      <div class="title-block">
        <h2>CLASSIFIED DESTINATION — ACCESS RESTRICTED</h2>
      </div>

      <div class="final-transmission" style="margin-top: 18px;">
        <p class="paragraph">Agent Prism,</p>
        <p class="paragraph">Your motivation to find out about the secret mission is both impressive and strangely heartwarming.</p>
        <p class="paragraph">Unfortunately, Agent Lama cannot simply hand over classified information.</p>
        <p class="paragraph">It won't be easy to get the answer.</p>
        <p class="paragraph">However...</p>
        <p class="paragraph">A special investigation protocol has been prepared specifically for you.</p>
        <p class="paragraph">A game.</p>
        <p class="paragraph">Use your instincts.<br>Make your guesses.<br>Interrogate the intelligence.<br>And if necessary... acquire additional intelligence.</p>
        <p class="paragraph">The classified destination is waiting to be discovered.</p>
        <p class="paragraph">Good luck, Agent Prism.</p>
        <p class="paragraph">— Agent Lama</p>
      </div>

      <div class="actions" style="margin-top: 20px; justify-content: center;">
        <button class="primary-button" type="button" data-action="begin-investigation">[ BEGIN INVESTIGATION ]</button>
      </div>
    </section>
  `;
}

function bindGuessingIntroActions() {
  const beginButton = document.querySelector('[data-action="begin-investigation"]');
  if (!beginButton) return;

  beginButton.addEventListener('click', () => {
    state.defs.guessingIntroStarted = true;
    pushEvent('guessing_intro_started', { stage: 'begin_investigation', missionId: state.missionId });
    render();
  });
}

function renderGuessingScene() {
  const guesses = state.defs.guesses || [];
  const reaction = state.defs.lastGuessReaction || 'INTERESTING...\nAgent Lama is listening.';
  const hintText = state.defs.lastHintUnlocked || '';
  const helpOpen = Boolean(state.defs.showHowItWorks);

  return `
    <section class="screen dossier" aria-label="Secret destination guessing game">
      <div class="title-block">
        <h2>CLASSIFIED DESTINATION</h2>
      </div>

      <div class="notice-box">
        <strong>Agent Prism, identify the destination.</strong>
      </div>

      <div class="guess-card" style="margin-top: 16px;">
        <label for="guess-input">TYPE YOUR GUESS</label>
        <div class="form-row">
          <input id="guess-input" type="text" placeholder="TYPE YOUR GUESS..." maxlength="100" />
          <button class="primary-button" type="button" data-action="submit-guess">SUBMIT GUESS</button>
        </div>
      </div>

      ${state.defs.directAnswerProtocolRequested ? `
        <div class="notice-box" style="margin-top: 14px;">
          <strong>DIRECT ANSWER REQUEST</strong><br>
          You have chosen to bypass the investigation.<br>
          ACCESS COST:<br>
          💋💋💋 ... 100 KISSES<br>
          Agent Lama respects your confidence.<br>
          He does not respect your economy. 😂
        </div>
        <div class="guess-card" style="margin-top: 12px;">
          <label for="direct-answer-input">ENTER THE DESTINATION</label>
          <div class="form-row">
            <input id="direct-answer-input" type="text" placeholder="HARRY POTTER ESCAPE ROOM" maxlength="100" />
            <button class="secondary-button" type="button" data-action="submit-direct-answer">[ PAY 100 KISSES ]</button>
          </div>
        </div>
      ` : ''}

      <div class="reaction-box" id="guess-reaction" style="margin-top: 10px; white-space: pre-line;">${reaction}</div>

      ${hintText ? `
        <div class="notice-box" style="margin-top: 12px;">
          <strong>INTELLIGENCE UNLOCKED</strong><br>
          ${hintText}<br>
          <span style="opacity: 0.8;">INTELLIGENCE QUALITY: QUESTIONABLE</span>
        </div>
      ` : ''}

      <div class="actions" style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;">
        <button class="secondary-button" type="button" data-action="request-kiss">💋 USE A KISS</button>
        <button class="secondary-button" type="button" data-action="show-how-it-works">[ ? HOW DOES THIS WORK? ]</button>
        <button class="secondary-button" type="button" data-action="request-direct-answer">[ I KNOW THE ANSWER ]</button>
      </div>

      ${helpOpen ? `
        <div class="notice-box" style="margin-top: 16px;">
          <strong>CLASSIFIED GAME PROTOCOL</strong><br><br>
          Your objective is simple:<br>
          Figure out the secret destination.<br><br>
          You may enter guesses whenever you want.<br><br>
          If you need assistance, Agent Lama may provide additional intelligence.<br><br>
          But classified intelligence comes at a cost.<br><br>
          💋 One kiss = one intelligence request.<br><br>
          The kiss is payable to Agent Lama in person. Obviously, the website has no way of verifying this arrangement. ❤️<br><br>
          Some intelligence may be more useful than others.<br><br>
          Trust your instincts.<br>
          Keep guessing.<br>
          And don't give up.<br><br>
          <button class="primary-button" type="button" data-action="close-how-it-works">[ UNDERSTOOD ]</button>
        </div>
      ` : ''}

      <div class="guess-list" style="margin-top: 18px;">
        ${guesses.length ? guesses.slice().reverse().map((guess) => `
          <div class="guess-item">
            <strong>Guess ${guess.guessNumber}:</strong> ${guess.guessText}<br>
            <span>${guess.correct ? 'CORRECT' : 'INTERESTING...'}</span>
          </div>
        `).join('') : '<div class="guess-item">Awaiting your first guess, Agent Prism.</div>'}
      </div>
    </section>
  `;
}

function bindGuessingActions() {
  const submitButton = document.querySelector('[data-action="submit-guess"]');
  const input = document.getElementById('guess-input');
  const kissButton = document.querySelector('[data-action="request-kiss"]');
  const helpButton = document.querySelector('[data-action="show-how-it-works"]');
  const directButton = document.querySelector('[data-action="request-direct-answer"]');
  const submitDirectButton = document.querySelector('[data-action="submit-direct-answer"]');
  const closeHelpButton = document.querySelector('[data-action="close-how-it-works"]');

  if (directButton) {
    directButton.addEventListener('click', () => {
      state.defs.directAnswerProtocolRequested = true;
      pushEvent('direct_answer_requested', { cost: 100, request: true });
      render();
    });
  }

  if (helpButton) {
    helpButton.addEventListener('click', () => {
      state.defs.showHowItWorks = true;
      render();
    });
  }

  if (closeHelpButton) {
    closeHelpButton.addEventListener('click', () => {
      state.defs.showHowItWorks = false;
      render();
    });
  }

  if (submitDirectButton) {
    submitDirectButton.addEventListener('click', () => {
      const directInput = document.getElementById('direct-answer-input');
      const rawValue = (directInput?.value || '').trim();
      if (!rawValue) return;

      const normalized = normalizeText(rawValue);
      const guessOutcome = getGuessOutcome(rawValue);
      const isCorrect = guessOutcome === 'correct';
      const isPartial = guessOutcome === 'partial';
      state.defs.directAnswerProtocolRequested = false;
      pushEvent('direct_answer_submitted', { answer: rawValue, normalizedAnswer: normalized, correct: isCorrect, partial: isPartial, cost: 100 });

      if (isCorrect) {
        const guessNumber = (state.defs.guesses || []).length + 1;
        state.defs.guesses = [...(state.defs.guesses || []), {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          guessNumber,
          guessText: rawValue,
          normalizedGuess: normalized,
          correct: true,
          createdAt: new Date().toISOString(),
          source: 'direct_answer',
        }];
        queueMissionCompletion('direct_answer', {
          guessText: rawValue,
          normalizedGuess: normalized,
          guessNumber,
        });
        render();
        return;
      }

      if (isPartial) {
        state.defs.lastGuessReaction = 'PARTIAL INTELLIGENCE DETECTED.\nYour answer is incomplete.\nThe classified operation requires the full designation.\nContinue the game.';
        render();
        return;
      }

      state.defs.lastGuessReaction = 'That is impressively creative.\nUnfortunately, Agent Lama remains unconvinced. 😂';
      render();
    });
  }

  if (submitButton) {
    submitButton.addEventListener('click', () => {
      const rawValue = input.value.trim();
      if (!rawValue) return;

      const normalized = normalizeText(rawValue);
      const guessNumber = (state.defs.guesses || []).length + 1;
      const guessOutcome = getGuessOutcome(rawValue);
      const isCorrect = guessOutcome === 'correct';
      const isPartial = guessOutcome === 'partial';

      const guessEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        guessNumber,
        guessText: rawValue,
        normalizedGuess: normalized,
        correct: isCorrect,
        createdAt: new Date().toISOString(),
      };

      state.defs.guesses = [...(state.defs.guesses || []), guessEntry];
      state.defs.guessNumber = guessNumber;
      state.defs.lastGuessReaction = isCorrect
        ? 'DESTINATION CONFIRMED\n\nHARRY POTTER ESCAPE ROOM\n\nAgent Prism has successfully breached the classified information.'
        : 'GUESS REJECTED.\nBut I like where your mind is going. ❤️';

      const guessSubmissionEvent = pushEvent('guess_submitted', { guessText: rawValue, normalizedGuess: normalized, guessNumber, correct: isCorrect, stage: state.scene });

      if (isCorrect) {
        queueMissionCompletion('guessing', {
          guessText: rawValue,
          normalizedGuess: normalized,
          guessNumber,
        }, guessSubmissionEvent);
        render();
        return;
      }

      if (isPartial) {
        state.defs.lastGuessReaction = 'INTERESTING...\nAgent Lama is listening.\nNot quite, Agent Prism.\nDon\'t give up on me yet. ❤️';
      }

      input.value = '';
      render();
    });
  }

  if (kissButton) {
    kissButton.addEventListener('click', () => {
      const unlocked = state.defs.hintsUnlocked || [];
      const nextHintNumber = unlocked.length + 1;
      const hiddenThresholdReached = unlocked.length >= HIDDEN_HANGMAN_THRESHOLD;

      if (hiddenThresholdReached) {
        beginHangmanTransition('hidden_threshold_reached');
        return;
      }

      if (nextHintNumber > HINTS.length) {
        return;
      }

      const nextHint = HINTS[nextHintNumber - 1];
      state.defs.hintsUnlocked = [...unlocked, nextHintNumber];
      state.defs.hints.push({ hintNumber: nextHintNumber, unlockedAt: new Date().toISOString() });
      state.defs.lastHintUnlocked = nextHint;
      state.defs.lastGuessReaction = 'KISS CREDIT ACCEPTED ❤️\nAgent Lama has added one kiss to your outstanding balance.\n\nINTELLIGENCE UNLOCKED.';
      pushEvent('hint_unlocked', { hintNumber: nextHintNumber, cost: 'kiss' });
      render();
    });
  }
}

function renderKissProtocol() {
  return `
    <section class="screen dossier" aria-label="Kiss protocol agreement">
      <div class="title-block">
        <h2>CLASSIFIED INTELLIGENCE AGREEMENT</h2>
      </div>

      <p class="paragraph">Each intelligence packet requires one kiss. 💋</p>
      <p class="paragraph">Agent Prism must personally deliver one kiss to Agent Lama before intelligence can be unlocked.</p>
      <p class="paragraph">By proceeding, you confirm that you intend to give Agent Lama the required kiss for each hint.</p>

      <div class="actions" style="margin-top: 16px;">
        <button class="primary-button" type="button" data-action="accept-kiss-protocol">I ACCEPT THE KISS PROTOCOL 💋</button>
      </div>
    </section>
  `;
}

function bindKissProtocolAction() {
  const button = document.querySelector('[data-action="accept-kiss-protocol"]');
  button.addEventListener('click', () => {
    state.defs.kissProtocolAccepted = true;
    state.defs.kissProtocolAcceptedAt = new Date().toISOString();
    pushEvent('kiss_protocol_accepted', { missionId: state.missionId, accepted: true });
    state.scene = 'hints';
    render();
  });
}

function renderHintScene() {
  const unlocked = state.defs.hintsUnlocked || [];
  const available = HINTS.filter((_, index) => !unlocked.includes(index + 1));

  return `
    <section class="screen dossier" aria-label="Classified intelligence hints">
      <div class="title-block">
        <h2>CLASSIFIED INTELLIGENCE</h2>
      </div>

      <div class="notice-box">
        <strong>INTELLIGENCE REQUEST ACCEPTED ❤️</strong><br>
        Agent Lama has been very generous with classified information.
      </div>

      <div class="hint-box">
        ${available.length ? `
          <button class="primary-button" type="button" data-action="unlock-hint">💋 USE A KISS</button>
        ` : `
          <div class="notice-box"><strong>INTELLIGENCE UNLOCKED:</strong> the next investigation protocol is already underway.</div>
          <button class="primary-button" type="button" data-action="start-hangman" style="margin-top: 12px;">INITIALISE NEW PROTOCOL</button>
        `}
      </div>

      <div style="margin-top: 18px;">
        ${unlocked.length ? unlocked.map((num) => `
          <div class="hint-box">
            <strong>INTELLIGENCE ${num}</strong><br>
            ${HINTS[num - 1]}
            <div class="notice-box" style="margin-top: 8px;">INTELLIGENCE QUALITY: QUESTIONABLE</div>
          </div>
        `).join('') : '<div class="notice-box">No intelligence packets unlocked yet.</div>'}
      </div>
    </section>
  `;
}

function bindHintActions() {
  const unlockButton = document.querySelector('[data-action="unlock-hint"]');
  if (unlockButton) {
    unlockButton.addEventListener('click', () => {
      const unlocked = state.defs.hintsUnlocked || [];
      const nextHintNumber = unlocked.length + 1;
      if (nextHintNumber > HINTS.length) {
        return;
      }

      state.defs.hintsUnlocked = [...unlocked, nextHintNumber];
      state.defs.hints.push({ hintNumber: nextHintNumber, unlockedAt: new Date().toISOString() });
      state.defs.lastHintUnlocked = HINTS[nextHintNumber - 1];
      pushEvent('hint_unlocked', { hintNumber: nextHintNumber });

      if (nextHintNumber >= HINTS.length) {
        beginHangmanTransition('transition');
        return;
      }
      render();
    });
  }

  const hangmanButton = document.querySelector('[data-action="start-hangman"]');
  if (hangmanButton) {
    hangmanButton.addEventListener('click', () => {
      beginHangmanTransition('direct');
    });
  }
}

function renderProtocolTransition() {
  app.innerHTML = `
    <section class="protocol-transition" aria-label="New investigation protocol initializing" aria-live="polite" aria-busy="true">
      <div class="protocol-terminal" id="protocol-terminal"></div>
    </section>
  `;

  const terminal = document.getElementById('protocol-terminal');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pause = (duration) => reducedMotion ? Math.min(duration, 120) : duration;
  const sequence = [
    { text: 'INTELLIGENCE REQUEST ACCEPTED ❤️', delay: 550, tone: 'protocol-green' },
    { text: 'PROCESSING CLASSIFIED INFORMATION...', delay: 550 },
    { text: 'CROSS-REFERENCING AVAILABLE INTELLIGENCE...', delay: 550 },
    { text: 'ANALYSING INVESTIGATION DATA...', delay: 550 },
    { text: '...', delay: 500, tone: 'protocol-glitch-line' },
    { text: 'AGENT PRISM.', delay: 500, tone: 'protocol-address' },
    { text: 'Perhaps I\'ve been giving you the wrong kind of clues.', delay: 650, tone: 'protocol-personal' },
    { text: 'Some secrets aren\'t meant to be explained.', delay: 650, tone: 'protocol-personal' },
    { text: 'They\'re meant to be discovered.', delay: 650, tone: 'protocol-personal' },
    { text: 'So... let\'s try something different. ❤️', delay: 450, tone: 'protocol-personal' },
    { text: 'NEW INVESTIGATION PROTOCOL', delay: 250, tone: 'protocol-green protocol-glitch-line' },
    { type: 'initializing', delay: 100 },
    { type: 'progress', delay: 1150 },
    { text: 'PROTOCOL READY', delay: 450, tone: 'protocol-green' },
    { text: 'Trust your instincts, Agent Prism.\nYou\'ve got this. ❤️', delay: 850, tone: 'protocol-personal protocol-final' },
  ];

  function appendLine(text, tone = '') {
    const line = document.createElement('div');
    line.className = `protocol-line ${tone}`.trim();
    line.textContent = text;
    terminal.append(line);
  }

  function advance(index) {
    if (index >= sequence.length) {
      window.setTimeout(() => {
        state.scene = 'hangman';
        persistState();
        render();
      }, pause(350));
      return;
    }

    const step = sequence[index];
    if (step.text) appendLine(step.text, step.tone);
    if (step.type === 'initializing') {
      appendLine('INITIALISING...', 'protocol-muted');
    }
    if (step.type === 'progress') {
      const progress = document.createElement('div');
      progress.className = 'protocol-progress';
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-label', 'Protocol initialization progress');
      progress.innerHTML = '<span></span>';
      terminal.append(progress);
    }

    window.setTimeout(() => advance(index + 1), pause(step.delay));
  }

  advance(0);
}

function renderHangmanScene() {
  const hangman = state.defs.hangman;
  const selected = new Set(hangman.selectedLetters || []);
  const wordLines = getHangmanWordState(hangman.phrase, hangman.revealedLetters || []);
  const keyboardRows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

  return `
    <section class="screen dossier" aria-label="Classified destination letter investigation">
      <div class="title-block">
        <h2>CLASSIFIED INVESTIGATION</h2>
      </div>

      <div class="notice-box protocol-destination-prompt" style="margin-top: 12px;">
        <strong>CLASSIFIED DESTINATION</strong><br>
        SELECT A LETTER TO BEGIN.
      </div>

      <div class="word-grid" style="margin-top: 18px;">
        ${wordLines.map((line) => `<div class="word-line">${line}</div>`).join('')}
      </div>

      <div class="keyboard">
        ${keyboardRows.map((row, rowIndex) => `
          <div class="keyboard-row keyboard-row--${rowIndex + 1}">
            ${Array.from(row).map((letter) => {
              const isSelected = selected.has(letter);
              const isCorrect = (hangman.revealedLetters || []).includes(letter);
              const isWrong = (hangman.incorrectLetters || []).includes(letter);
              const keyState = isCorrect ? 'is-correct' : isWrong ? 'is-wrong' : '';
              const disabled = isSelected || Boolean(hangman.pendingIncorrectLetter);
              const stateLabel = isCorrect ? 'correct' : isWrong ? 'incorrect' : 'available';
              return `<button class="key-button ${keyState}" type="button" data-letter="${letter}" aria-label="${letter}, ${stateLabel}" aria-pressed="${isSelected}" ${disabled ? 'disabled' : ''}>${letter}</button>`;
            }).join('')}
          </div>
        `).join('')}
      </div>

      ${hangman.pendingIncorrectLetter ? `
        <div class="alert-box hangman-save-panel" role="alert" aria-live="assertive">
          <strong>SECURITY BREACH</strong><br>
          That wasn't the letter.<br><br>
          <strong>COST TO CONTINUE</strong><br>
          💋 1 KISS<br><br>
          Agent Lama will be collecting that one later. ❤️
          <div class="hangman-save-actions">
            <button class="primary-button" type="button" data-action="save-hangman">💋 SAVE THE INVESTIGATION</button>
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

function bindHangmanActions() {
  const keyButtons = document.querySelectorAll('[data-letter]');
  keyButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const letter = button.dataset.letter;
      const hangman = state.defs.hangman;
      const selected = new Set(hangman.selectedLetters || []);
      if (selected.has(letter) || hangman.pendingIncorrectLetter) return;

      const stateBefore = snapshotHangman();
      selected.add(letter);
      hangman.selectedLetters = [...selected];
      const nextLetters = revealLettersForGuess(hangman.phrase, hangman.revealedLetters || [], letter);
      const correct = nextLetters.length > (hangman.revealedLetters || []).length;

      if (correct) {
        hangman.revealedLetters = nextLetters;
      } else {
        hangman.incorrectLetters = [...new Set([...(hangman.incorrectLetters || []), letter])];
        hangman.pendingIncorrectLetter = letter;
      }

      const isComplete = correct
        && (hangman.revealedLetters || []).length === new Set(hangman.phrase.toUpperCase().replace(/\s/g, '')).size;
      if (isComplete) hangman.status = 'completed';

      const stateAfter = snapshotHangman();
      const event = {
        missionId: state.missionId,
        type: correct ? 'hangman_letter_correct' : 'hangman_letter_incorrect',
        selectedLetter: letter,
        correct,
        livesBefore: stateBefore.lives,
        livesAfter: stateAfter.lives,
        revealedState: stateAfter.revealedLetters,
        stateBefore,
        stateAfter,
        timestamp: new Date().toISOString(),
      };

      recordHangmanEvent('hangman_letter_selected', event);

      if (!correct) {
        render();
        return;
      }

      if (isComplete) {
        queueMissionCompletion('hangman');
        render();
        return;
      }

      render();
    });
  });

  const saveButton = document.querySelector('[data-action="save-hangman"]');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      const hangman = state.defs.hangman;
      if (!hangman.pendingIncorrectLetter) return;

      const stateBefore = snapshotHangman();
      const incorrectLetter = hangman.pendingIncorrectLetter;
      hangman.pendingIncorrectLetter = null;
      hangman.saveCount = (hangman.saveCount || 0) + 1;
      const stateAfter = snapshotHangman();
      recordHangmanEvent('hangman_save_used', {
        incorrectLetter,
        saveNumber: hangman.saveCount,
        stateBefore,
        stateAfter,
        timestamp: new Date().toISOString(),
        digitalAction: 'kiss_credit_accepted',
      });
      render();
    });
  }
}

function renderSuccessScene() {
  app.innerHTML = `
    <section class="screen success-screen" aria-label="Classified destination revealed" aria-live="polite">
      <div class="success-sequence" id="success-sequence"></div>
    </section>
  `;
  runSuccessSequence();
}

function runSuccessSequence() {
  if (successSequenceRunning) return;
  successSequenceRunning = true;

  const sequence = document.getElementById('success-sequence');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pause = (milliseconds) => reducedMotion ? Math.min(milliseconds, 60) : milliseconds;
  const steps = [
    { html: '<h2 class="success-kicker">DESTINATION CONFIRMED</h2>', delay: 620 },
    { html: '<div class="big-reveal success-answer">HARRY POTTER ESCAPE ROOM</div>', delay: 720 },
    { html: '<div class="success-phase">INVESTIGATION COMPLETE</div>', delay: 480 },
    { html: '<p class="success-personal"><strong>Well done, Agent Prism. ❤️</strong><br>You actually figured it out.</p>', delay: 620 },
    { html: '<p class="success-personal">Agent Lama is impressed.</p>', delay: 560 },
    { html: '<p class="success-personal">Your classified destination has been successfully uncovered.</p>', delay: 650 },
    { html: '<div class="success-phase">WHICH MEANS...</div>', delay: 560 },
    { html: '<div class="success-invitation">YOU CAN COME TO THE EVENT. ❤️</div>', delay: 850 },
    { html: `
      <section class="success-details" aria-label="Confirmed mission details">
        <h3>SATURDAY, 03 OCTOBER 2026</h3>
        <p><strong>08:30 AM</strong><br>Agent Lama will pick you up.</p>
        <p><strong>FIRST OBJECTIVE</strong><br>Developers Festival</p>
        <p><strong>LUNCH CHECKPOINT</strong><br>Details to be revealed during the mission.</p>
        <p><strong>CLASSIFIED DESTINATION</strong><br>Harry Potter Escape Room</p>
        <p><strong>DRESS CODE</strong><br>Smart casual<br>Comfortable footwear<br><em>You will understand later.</em></p>
      </section>
    `, delay: 850 },
    { html: `
      <section class="success-transmission" aria-label="Final transmission">
        <h3>FINAL TRANSMISSION</h3>
        <p><strong>AGENT PRISM</strong></p>
        <p>Your mission has been accepted.</p>
        <p>Agent Lama will be waiting.</p>
        <p>Come prepared.</p>
        <p>Trust the handler.</p>
        <p>And most importantly...</p>
        <p><strong>Have fun. ❤️</strong></p>
        <p>— <strong>Agent Lama</strong></p>
        <p class="success-status">MISSION STATUS: ACTIVE</p>
      </section>
    `, delay: 1350 },
    { html: '<div class="self-destruct">THIS MESSAGE WILL SELF-DESTRUCT IN...</div>', delay: 420 },
    { html: '<div class="self-destruct-count">3</div>', delay: 420 },
    { html: '<div class="self-destruct-count">2</div>', delay: 420 },
    { html: '<div class="self-destruct-count">1</div>', delay: 420 },
    { html: '<div class="self-destruct-error">ERROR</div>', delay: 500 },
    { html: '<p class="self-destruct-joke">Agent Lama clearly didn\'t pay for the self-destruct feature. 😂</p>', delay: 600 },
    { html: '<div class="success-goodbye"><strong>MISSION ACTIVE</strong><br>See you Saturday, Agent Prism. ❤️</div>', delay: 450 },
  ];

  const revealStep = (index) => {
    if (index >= steps.length) {
      const actions = document.createElement('div');
      actions.className = 'actions success-actions';
      actions.innerHTML = '<button class="primary-button" type="button" data-action="show-report">GENERATE MISSION REPORT</button>';
      sequence.append(actions);
      bindSuccessActions();
      successSequenceRunning = false;
      state.defs.successSequenceComplete = true;
      persistState();
      return;
    }

    const step = steps[index];
    const item = document.createElement('div');
    item.className = 'success-reveal';
    item.innerHTML = step.html;
    sequence.append(item);
    window.setTimeout(() => revealStep(index + 1), pause(step.delay));
  };

  if (state.defs.successSequenceComplete) {
    steps.forEach((step) => {
      const item = document.createElement('div');
      item.className = 'success-reveal';
      item.innerHTML = step.html;
      sequence.append(item);
    });
    successSequenceRunning = false;
    const actions = document.createElement('div');
    actions.className = 'actions success-actions';
    actions.innerHTML = '<button class="primary-button" type="button" data-action="show-report">GENERATE MISSION REPORT</button>';
    sequence.append(actions);
    bindSuccessActions();
    return;
  }

  revealStep(0);
}

function bindSuccessActions() {
  const reportButton = document.querySelector('[data-action="show-report"]');
  if (reportButton) {
    reportButton.addEventListener('click', () => {
      state.scene = 'report';
      if (!state.defs.reportGenerated) {
        state.defs.reportGenerated = true;
        pushEvent('report_generated', { missionId: state.missionId, finalAnswer: MISSION_ANSWER });
      }
      render();
    });
  }
}

function renderReportScene() {
  const guessedCount = (state.defs.guesses || []).length;
  const hintsUnlocked = (state.defs.hintsUnlocked || []).length;
  const hangman = state.defs.hangman || createHangmanState();
  const reportText = `CLASSIFIED MISSION REPORT\n\nAGENT: PRISM\nHANDLER: LAMA\nMISSION: 03-10-26\nSTATUS: SUCCESSFUL\n\nNO ATTEMPTS: ${state.noCount}\nGUESSES MADE: ${guessedCount}\nHINTS UNLOCKED: ${hintsUnlocked}\nHANGMAN LETTERS ATTEMPTED: ${(hangman.selectedLetters || []).length}\nHANGMAN SAVES: ${hangman.saveCount || 0}\nFINAL ANSWER: HARRY POTTER ESCAPE ROOM\nCOMPLETED: ${state.defs.finalCompletedAt || new Date().toISOString()}`;

  return `
    <section class="screen dossier" aria-label="Final mission report">
      <div class="title-block">
        <h2>FINAL TRANSMISSION</h2>
      </div>

      <div class="final-transmission">
        <div>AGENT PRISM</div>
        <div>Your mission has been accepted.</div>
        <div>03.10.2026</div>
        <div>08:30 AM</div>
        <div>Agent Lama will be waiting.</div>
        <div>Come prepared.</div>
        <div>Trust the handler.</div>
        <div>And most importantly...</div>
        <div>Have fun. ❤️</div>
        <div>— Agent Lama</div>
      </div>

      <div class="title-block" style="margin-top: 20px;">
        <h3>MISSION STATUS: ACTIVE</h3>
      </div>

      <div class="notice-box" style="margin-top: 16px;">THIS MESSAGE WILL SELF-DESTRUCT IN... 3 2 1</div>
      <div class="notice-box" style="margin-top: 12px;">ERROR</div>
      <div class="paragraph" style="margin-top: 10px;">Agent Lama clearly didn't pay for the self-destruct feature. 😂</div>
      <div class="notice-box" style="margin-top: 10px;">MISSION ACTIVE</div>
      <div class="paragraph">See you Saturday, Agent Prism. ❤️</div>

      <div class="title-block" style="margin-top: 20px;">
        <h3>FINAL DATE SUMMARY</h3>
      </div>

      <div class="timeline" style="margin-top: 12px;">
        <div class="timeline-item"><span class="timeline-time">SATURDAY — OCTOBER 3, 2026</span><span>08:30 AM — Agent Lama picks up Agent Prism</span></div>
        <div class="timeline-item"><span class="timeline-time">MORNING</span><span>Developers Festival</span></div>
        <div class="timeline-item"><span class="timeline-time">LUNCH</span><span>Refuelling checkpoint</span></div>
        <div class="timeline-item"><span class="timeline-time">LATER</span><span>Harry Potter Escape Room 🪄</span></div>
      </div>

      <div class="title-block" style="margin-top: 22px;">
        <h3>CLASSIFIED MISSION REPORT</h3>
      </div>
      <div class="report-box notice-box" style="margin-top: 10px;">${reportText}</div>

      <div class="actions" style="margin-top: 16px;">
        <button class="primary-button share-button" type="button" data-action="share-report">SHARE MISSION REPORT</button>
      </div>
    </section>
  `;
}

function bindReportActions() {
  const shareButton = document.querySelector('[data-action="share-report"]');
  if (shareButton) {
    shareButton.addEventListener('click', async () => {
      const reportText = buildReportText();
      const shareAttempted = true;
      let shareSucceeded = false;

      if (navigator.share) {
        try {
          await navigator.share({ title: 'Agent Prism Mission Report', text: reportText });
          shareSucceeded = true;
        } catch (error) {
          shareSucceeded = false;
        }
      } else {
        await navigator.clipboard.writeText(reportText).catch(() => {});
        shareSucceeded = true;
      }

      state.defs.shareAttempted = shareAttempted;
      state.defs.shareSucceeded = shareSucceeded;
      state.defs.reportShared = shareSucceeded;
      pushEvent('report_shared', { shareSucceeded, attempted: shareAttempted, timestamp: new Date().toISOString() });

      const message = shareSucceeded ? 'Mission report shared successfully.' : 'Share unavailable. Report copied to clipboard.';
      alert(message);
    });
  }
}

function buildReportText() {
  const hangman = state.defs.hangman || createHangmanState();
  return `CLASSIFIED MISSION REPORT\n\nAGENT: PRISM\nHANDLER: LAMA\nMISSION: 03-10-26\nSTATUS: SUCCESSFUL\n\nNO ATTEMPTS: ${state.noCount}\nGUESSES MADE: ${(state.defs.guesses || []).length}\nHINTS UNLOCKED: ${(state.defs.hintsUnlocked || []).length}\nHANGMAN LETTERS ATTEMPTED: ${(hangman.selectedLetters || []).length}\nHANGMAN SAVES: ${hangman.saveCount || 0}\nFINAL ANSWER: HARRY POTTER ESCAPE ROOM\nCOMPLETED: ${state.defs.finalCompletedAt || new Date().toISOString()}`;
}

function syncSound() {
  soundToggle.textContent = `SOUND: ${soundOn ? 'ON' : 'OFF'}`;
  localStorage.setItem('agent-prism-sound', soundOn ? 'on' : 'off');
}

soundToggle.addEventListener('click', () => {
  soundOn = !soundOn;
  syncSound();
});

const resetMissionButton = document.getElementById('reset-mission');
const resetMissionDialog = document.getElementById('reset-mission-dialog');
const confirmResetMissionButton = document.getElementById('confirm-reset-mission');
const cancelResetMissionButton = document.getElementById('cancel-reset-mission');

resetMissionButton.addEventListener('click', () => resetMissionDialog.showModal());
cancelResetMissionButton.addEventListener('click', () => resetMissionDialog.close());
confirmResetMissionButton.addEventListener('click', () => {
  resetMissionDialog.close();
  startNewMission('player_reset');
});

if (new URLSearchParams(window.location.search).get('test') === '1') {
  resetTestButton.classList.remove('hidden');
  resetTestButton.addEventListener('click', () => {
    if (!window.confirm('Reset this browser\'s test mission and restart?')) return;
    startNewMission('test_reset');
  });
}

syncSound();

if (sessionToArchiveAtStartup) {
  pushEvent('mission_archived', {
    reason: 'new_visit_started',
    archivedAt: new Date().toISOString(),
  }, sessionToArchiveAtStartup);
}

if (state.defs.needsMissionStartedEvent) {
  state.defs.needsMissionStartedEvent = false;
  pushEvent('mission_started', {
    startedAt: state.createdAt,
    source: 'new_visit',
    previousSessionId: sessionToArchiveAtStartup?.missionId || null,
  });
}

render();
void flushMissionEventQueue(state);
void flushHangmanSyncQueue();
void flushSuccessSyncQueue();
retryStoredSessionQueues();

window.addEventListener('mission-state-updated', () => {
  if (document.visibilityState === 'visible' && !successSequenceRunning && !state.defs.successSequenceInitializing) {
    render();
  }
});

window.addEventListener('online', () => {
  retryStoredSessionQueues(true);
});

if (navigator.userAgent.includes('Mobile')) {
  document.body.classList.add('mobile');
}
