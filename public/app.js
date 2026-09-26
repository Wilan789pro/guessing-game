import { supabase } from './supabase-client.js';
import { MISSION_ANSWER, HINTS, normalizeText, isCorrectGuess, isPartialGuess, getGuessOutcome, getNoScale, getNoReaction, getHangmanWordState, revealLettersForGuess, createHangmanState } from '../lib/missionLogic.js';

const STORAGE_KEY = 'agent-prism-mission-state-v1';
const HIDDEN_HANGMAN_THRESHOLD = 10;
const DEFAULT_STATE = {
  missionId: `mission-${Date.now()}`,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
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
    reportGenerated: false,
    reportShared: false,
    shareAttempted: false,
    shareSucceeded: false,
    lastActivity: new Date().toISOString(),
  },
  eventLog: [],
};

const app = document.getElementById('app');
const soundToggle = document.getElementById('sound-toggle');
const resetTestButton = document.getElementById('reset-test-mission');
const audioEl = document.getElementById('audio-context');

let state = loadState();
let soundOn = localStorage.getItem('agent-prism-sound') !== 'off';
let suppressTyping = false;

const terminalSequence = [
  'ESTABLISHING SECURE CONNECTION...',
  'ENCRYPTED CHANNEL INITIALIZED',
  'CONNECTION STATUS: SECURE',
  'IDENTIFYING RECIPIENT...',
  'AGENT IDENTIFIED: PRISM',
  'TRANSMISSION RELAY READY.'
];

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored) return JSON.parse(JSON.stringify(DEFAULT_STATE));

    const nextState = {
      ...JSON.parse(JSON.stringify(DEFAULT_STATE)),
      ...stored,
      defs: {
        ...JSON.parse(JSON.stringify(DEFAULT_STATE.defs)),
        ...(stored.defs || {}),
        hangman: { ...createHangmanState(), ...(stored.defs?.hangman || {}) },
      },
      noPosition: stored.noPosition || { x: 82, y: 72 },
      eventLog: stored.eventLog || [],
    };

    if (nextState.scene === 'dossier' || nextState.scene === 'boot') {
      nextState.scene = 'guessing';
      nextState.missionAccepted = true;
      nextState.missionAcceptedAt = new Date().toISOString();
      nextState.defs.guessingIntroStarted = false;
    }

    return nextState;
  } catch (error) {
    console.warn('State recovery failed', error);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function persistState() {
  state.updatedAt = new Date().toISOString();
  state.defs.lastActivity = state.updatedAt;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  try {
    window.dispatchEvent(new CustomEvent('mission-state-updated', { detail: state }));
  } catch (error) {
    // no-op
  }
}

function pushEvent(type, payload = {}) {
  state.eventLog = state.eventLog || [];
  const event = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    time: new Date().toISOString(),
    payload,
  };
  state.eventLog.unshift(event);
  if (state.eventLog.length > 150) state.eventLog.length = 150;
  persistState();
  return event;
}

function snapshotHangman() {
  return JSON.parse(JSON.stringify(state.defs.hangman));
}

function recordHangmanEvent(type, payload) {
  const event = pushEvent(type, payload);
  state.defs.hangmanSyncQueue = state.defs.hangmanSyncQueue || [];
  state.defs.hangmanSyncQueue.push({ id: event.id, type, payload, createdAt: event.time });
  persistState();
  void flushHangmanSyncQueue();
}

let hangmanSyncInProgress = false;
let hangmanSyncUnavailable = false;

async function ensureHangmanRemoteMission() {
  if (!supabase) return null;

  let { data: authData, error } = await supabase.auth.getSession();
  if (error) throw error;

  if (!authData.session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
    authData = result.data;
  }

  if (state.defs.supabaseMissionId) return state.defs.supabaseMissionId;

  let { data: mission, error: missionError } = await supabase
    .from('missions')
    .insert({
      session_token: state.missionId,
      current_scene: 'hangman',
      mission_accepted: Boolean(state.missionAccepted),
      mission_accepted_at: state.missionAcceptedAt,
    })
    .select('id')
    .single();

  if (missionError?.code === '23505') {
    const existing = await supabase
      .from('missions')
      .select('id')
      .eq('session_token', state.missionId)
      .single();
    mission = existing.data;
    missionError = existing.error;
  }

  if (missionError) throw missionError;
  state.defs.supabaseMissionId = mission.id;
  persistState();
  return mission.id;
}

async function flushHangmanSyncQueue() {
  if (!supabase || hangmanSyncUnavailable || hangmanSyncInProgress) return;
  const queue = state.defs.hangmanSyncQueue || [];
  if (!queue.length) return;

  hangmanSyncInProgress = true;
  try {
    const missionId = await ensureHangmanRemoteMission();
    while (state.defs.hangmanSyncQueue?.length) {
      const event = state.defs.hangmanSyncQueue[0];
      const hangman = state.defs.hangman;
      const payload = event.payload || {};
      const after = payload.stateAfter || hangman;
      const stateRow = {
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
      };
      const { error: stateError } = await supabase.from('hangman_state').upsert(stateRow, { onConflict: 'mission_id' });
      if (stateError) throw stateError;

      const letterEvent = {
        mission_id: missionId,
        event_type: event.type,
        selected_letter: payload.selectedLetter || payload.incorrectLetter || null,
        correct: typeof payload.correct === 'boolean' ? payload.correct : null,
        lives_before: payload.stateBefore?.lives ?? payload.livesBefore ?? after.lives,
        lives_after: payload.stateAfter?.lives ?? payload.livesAfter ?? after.lives,
        revealed_state: after.revealedLetters || [],
        idempotency_key: event.id,
      };
      const { error: hangmanEventError } = await supabase.from('hangman_events').insert(letterEvent);
      if (hangmanEventError && hangmanEventError.code !== '23505') throw hangmanEventError;

      const { error: missionEventError } = await supabase.from('mission_events').insert({
        mission_id: missionId,
        event_type: event.type,
        event_data: { ...payload, recorded_at: event.createdAt },
        idempotency_key: event.id,
      });
      if (missionEventError && missionEventError.code !== '23505') throw missionEventError;

      state.defs.hangmanSyncQueue.shift();
      persistState();
    }
  } catch (error) {
    if (error.status === 422 || error.statusCode === 422) hangmanSyncUnavailable = true;
    console.warn('Hangman sync deferred; progress remains saved locally.');
  } finally {
    hangmanSyncInProgress = false;
  }
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
    app.innerHTML = renderSuccessScene();
    bindSuccessActions();
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
        state.scene = 'success';
        state.defs.finalAnswer = normalized;
        state.defs.finalCompletedAt = new Date().toISOString();
        pushEvent('destination_revealed', { answer: normalized, source: 'direct_answer' });
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

      pushEvent('guess_submitted', { guessText: rawValue, normalizedGuess: normalized, guessNumber, correct: isCorrect, stage: state.scene });

      if (isCorrect) {
        state.defs.finalAnswer = normalized;
        state.scene = 'success';
        state.defs.finalCompletedAt = new Date().toISOString();
        pushEvent('destination_revealed', { answer: normalized, missionId: state.missionId });
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
        state.defs.completionSource = 'hangman';
        state.scene = 'success';
        state.defs.finalAnswer = normalizeText(MISSION_ANSWER);
        state.defs.finalCompletedAt = new Date().toISOString();
        pushEvent('destination_revealed', { answer: MISSION_ANSWER, source: 'hangman', missionId: state.missionId });
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
  const finalAnswer = state.defs.finalAnswer || MISSION_ANSWER;
  const discoveredThroughHangman = state.defs.completionSource === 'hangman';
  return `
    <section class="screen dossier" aria-label="Mission success">
      <div class="title-block">
        <h2>DESTINATION CONFIRMED</h2>
      </div>

      <div class="big-reveal">HARRY POTTER ESCAPE ROOM</div>

      <div class="final-transmission">
        ${discoveredThroughHangman ? `
          <p class="paragraph">Agent Prism... you found it.</p>
          <p class="paragraph">The classified destination is yours to uncover.</p>
          <p class="paragraph">Your next mission is to escape.</p>
          <p class="paragraph">Agent Lama is very impressed. And very glad he gets to share this adventure with you. ❤️</p>
        ` : `
          <p class="paragraph">Agent Prism has successfully breached the classified information.</p>
          <p class="paragraph">Agent Lama is impressed. ❤️</p>
          <p class="paragraph">You figured it out.</p>
          <p class="paragraph">MISSION OBJECTIVE COMPLETE.</p>
          <p class="paragraph">Well done, Agent Prism. ❤️</p>
          <p class="paragraph">Now you officially know where we're going.</p>
          <p class="paragraph">So there's only one thing left...</p>
          <p class="paragraph">You can come to the event.</p>
        `}
      </div>

      <div class="timeline" aria-label="Mission summary" style="margin-top: 16px;">
        <div class="timeline-item"><span class="timeline-time">SATURDAY</span><span>03 OCTOBER 2026</span></div>
        <div class="timeline-item"><span class="timeline-time">08:30 AM</span><span>Agent Lama will pick you up.</span></div>
        <div class="timeline-item"><span class="timeline-time">DEVELOPERS FESTIVAL</span><span>Lunch + adventure</span></div>
        <div class="timeline-item"><span class="timeline-time">ACTIVITY</span><span>HARRY POTTER ESCAPE ROOM</span></div>
      </div>

      <div class="final-transmission" style="margin-top: 16px;">
        <p class="paragraph">Come prepared.</p>
        <p class="paragraph">Smart casual.</p>
        <p class="paragraph">Comfortable footwear.</p>
        <p class="paragraph">You will understand later. ❤️</p>
      </div>

      <div class="actions" style="margin-top: 16px; justify-content: center;">
        <button class="primary-button" type="button" data-action="show-report">GENERATE MISSION REPORT</button>
      </div>

      <div class="notice-box" style="margin-top: 16px;">
        <strong>FINAL ANSWER:</strong> ${finalAnswer}
      </div>
    </section>
  `;
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

if (new URLSearchParams(window.location.search).get('test') === '1') {
  resetTestButton.classList.remove('hidden');
  resetTestButton.addEventListener('click', () => {
    if (!window.confirm('Reset this browser\'s test mission and restart?')) return;
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });
}

syncSound();

render();
void flushHangmanSyncQueue();

window.addEventListener('storage', () => {
  state = loadState();
  render();
});

window.addEventListener('mission-state-updated', () => {
  if (document.visibilityState === 'visible') {
    render();
  }
});

if (navigator.userAgent.includes('Mobile')) {
  document.body.classList.add('mobile');
}
