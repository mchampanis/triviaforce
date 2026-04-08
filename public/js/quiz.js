// TriviaForce quiz page logic

let currentQuiz = null;
let currentUser = null;
let pollTimer = null;
const dirtyInputs = new Set(); // tracks inputs modified but not yet saved

// ---- Initialization ----

async function init() {
  const auth = await checkAuth();
  if (!auth.identified) {
    if (auth.needsPassphrase) {
      showPassphraseModal();
    } else {
      showIdentifyModal();
    }
    return;
  }

  currentUser = { id: auth.userId, displayName: auth.displayName };

  // Check if viewing a specific quiz (from archive link)
  const params = new URLSearchParams(window.location.search);
  const quizId = params.get('quiz');
  if (quizId) {
    await loadSpecificQuiz(parseInt(quizId));
  } else {
    await loadQuiz();
  }
  startPolling();
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (currentQuiz) {
      refreshAnswers();
      refreshConsensus();
    }
  }, 10000);
}

// ---- Modals ----

function showPassphraseModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Enter Passphrase</h2>
      <div class="error-msg" id="passphraseError" style="display:none;"></div>
      <input type="password" id="passphraseInput" placeholder="Shared passphrase" autofocus>
      <button id="passphraseSubmit">Enter</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('passphraseInput');
  const submit = document.getElementById('passphraseSubmit');
  const error = document.getElementById('passphraseError');

  async function doSubmit() {
    try {
      await apiFetch('/api/auth/passphrase', {
        method: 'POST',
        body: JSON.stringify({ passphrase: input.value })
      });
      overlay.remove();
      init();
    } catch (e) {
      error.textContent = e.message;
      error.style.display = 'block';
    }
  }

  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(); });
}

function showIdentifyModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>What's your name?</h2>
      <div class="error-msg" id="identifyError" style="display:none;"></div>
      <input type="text" id="displayNameInput" placeholder="Display name" autofocus>
      <button id="identifySubmit">Join</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('displayNameInput');
  const submit = document.getElementById('identifySubmit');
  const error = document.getElementById('identifyError');

  async function doSubmit() {
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Please enter a name';
      error.style.display = 'block';
      return;
    }
    try {
      const data = await apiFetch('/api/auth/identify', {
        method: 'POST',
        body: JSON.stringify({ displayName: name, fingerprint: getFingerprint() })
      });
      currentUser = { id: data.userId, displayName: data.displayName };
      overlay.remove();
      await loadQuiz();
      startPolling();
    } catch (e) {
      error.textContent = e.message;
      error.style.display = 'block';
    }
  }

  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSubmit(); });
}

// ---- Quiz Loading ----

async function loadQuiz() {
  try {
    const data = await apiFetch('/api/quiz/current');
    if (!data.quiz) {
      document.getElementById('noQuiz').style.display = 'block';
      document.getElementById('mainContent').style.display = 'none';
      document.getElementById('lockedBanner').style.display = 'none';
      setupAdmin(null);
      return;
    }
    currentQuiz = data.quiz;
    renderQuiz();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadSpecificQuiz(id) {
  try {
    const data = await apiFetch(`/api/quiz/${id}`);
    currentQuiz = data.quiz;
    renderQuiz();
  } catch (e) {
    showToast(e.message, 'error');
    document.getElementById('noQuiz').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('lockedBanner').style.display = 'none';
  }
}

function renderQuiz() {
  document.getElementById('noQuiz').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';

  // Locked banner and save button
  const banner = document.getElementById('lockedBanner');
  const saveBtn = document.getElementById('saveAllBtn');
  if (currentQuiz.locked) {
    banner.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'none';
  } else {
    banner.style.display = 'none';
    if (saveBtn) saveBtn.style.display = '';
  }

  // Quiz title
  document.getElementById('quizTitleDisplay').textContent = currentQuiz.title;

  // Question image
  const qImg = document.getElementById('questionImage');
  if (currentQuiz.question_image) {
    qImg.src = `/uploads/${currentQuiz.id}/${currentQuiz.question_image}`;
    qImg.style.display = 'block';
    qImg.onclick = () => qImg.classList.toggle('zoomed');
  }

  // Answer image (hidden by default, revealed by button)
  const aSection = document.getElementById('answerImageSection');
  const aImg = document.getElementById('answerImage');
  const aToggle = document.getElementById('answerImageToggle');
  if (currentQuiz.answer_image) {
    aImg.src = `/uploads/${currentQuiz.id}/${currentQuiz.answer_image}`;
    aSection.style.display = 'none';
    aToggle.style.display = 'block';
    aToggle.onclick = () => {
      if (aSection.style.display === 'none') {
        aSection.style.display = 'block';
        aToggle.textContent = 'Hide Answers';
      } else {
        aSection.style.display = 'none';
        aToggle.textContent = 'Show Answers';
      }
    };
    aImg.onclick = () => aImg.classList.toggle('zoomed');
  } else {
    aSection.style.display = 'none';
    aToggle.style.display = 'none';
  }

  // Mobile image toggle
  const mobileToggle = document.getElementById('mobileImageToggle');
  if (window.innerWidth <= 768) {
    mobileToggle.style.display = 'block';
    mobileToggle.onclick = () => {
      document.getElementById('imagePane').classList.toggle('collapsed');
    };
  }

  // Build answer grid structure
  buildAnswerGrid();

  // Load data (this populates columns and cells)
  refreshAnswers();
  refreshConsensus();

  // Admin controls
  setupAdmin(currentQuiz);
}


function buildAnswerGrid() {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';
  mobileSliderInitialized = false;

  // Build the table structure; cells will be populated by renderAnswers
  const table = document.createElement('table');
  table.className = 'answer-grid';
  table.id = 'answerGrid';

  // Header row: Q# | participants... | Consensus
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th class="col-q">Q#</th>';
  // Participant columns are built dynamically in renderAnswers
  headerRow.innerHTML += '<th id="participant-headers" style="display:none;"></th>';
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body: 20 question rows
  const tbody = document.createElement('tbody');
  tbody.id = 'gridBody';
  for (let q = 1; q <= 20; q++) {
    const row = document.createElement('tr');
    row.id = `row-${q}`;
    row.innerHTML = `<td class="col-q">${q}</td>`;
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  container.appendChild(table);
}

// ---- Answers ----

let knownParticipants = []; // ordered list of participant user IDs
let knownParticipantNames = {}; // user ID -> display name

function getCurrentParticipantMap() {
  return knownParticipantNames;
}

async function refreshAnswers() {
  if (!currentQuiz) return;
  // Skip re-render if user has unsaved edits
  if (dirtyInputs.size > 0) {
    return;
  }
  // Skip re-render if the user is interacting with an input or the
  // confidence dropdown inside the grid -- rebuilding the table would
  // yank focus and close the open select on both desktop and mobile.
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')
      && active.closest('#answerGrid')) {
    return;
  }
  try {
    const data = await apiFetch(`/api/answers/quiz/${currentQuiz.id}`);
    renderAnswerGrid(data.answers);
  } catch (e) {
    // Silently fail on poll errors
  }
}

function renderAnswerGrid(answers) {
  // Save current user's in-progress input values before rebuilding
  const savedInputs = {};
  for (let q = 1; q <= 20; q++) {
    const input = document.getElementById(`input-${q}`);
    const conf = document.getElementById(`confidence-${q}`);
    if (input) {
      savedInputs[q] = {
        text: input.value,
        confidence: conf ? conf.value : 'certain',
        preserve: input.matches(':focus') || (conf && conf.matches(':focus')) || dirtyInputs.has(q)
      };
    }
  }

  // Collect all participants from answers + current user
  const participantMap = {};
  if (currentUser) {
    participantMap[currentUser.id] = currentUser.displayName;
  }
  for (let q = 1; q <= 20; q++) {
    (answers[q] || []).forEach(a => {
      participantMap[a.user_id] = a.display_name;
    });
  }

  // Stable ordering: current user first, then others alphabetically
  const otherIds = Object.keys(participantMap)
    .map(Number)
    .filter(id => !currentUser || id !== currentUser.id)
    .sort((a, b) => participantMap[a].localeCompare(participantMap[b]));
  const participantIds = currentUser ? [currentUser.id, ...otherIds] : otherIds;
  knownParticipants = participantIds;
  knownParticipantNames = participantMap;

  // Rebuild table header
  const table = document.getElementById('answerGrid');
  const thead = table.querySelector('thead tr');
  thead.innerHTML = '<th class="col-q">#</th>';
  participantIds.forEach((uid, i) => {
    const th = document.createElement('th');
    th.className = 'col-participant';
    const isMe = currentUser && uid === currentUser.id;
    if (isMe) th.classList.add('col-me');
    if (i % 2 === 1) th.classList.add('col-even');
    th.textContent = participantMap[uid] + (isMe ? ' (you)' : '');
    thead.appendChild(th);
  });
  const consensusTh = document.createElement('th');
  consensusTh.className = 'col-consensus';
  consensusTh.textContent = 'Consensus';
  thead.appendChild(consensusTh);

  // Rebuild each row
  for (let q = 1; q <= 20; q++) {
    const row = document.getElementById(`row-${q}`);
    // Keep only the Q# cell
    row.innerHTML = `<td class="col-q">${q}</td>`;

    // Index answers by user_id for this question
    const byUser = {};
    (answers[q] || []).forEach(a => { byUser[a.user_id] = a; });

    // Participant cells
    participantIds.forEach((uid, i) => {
      const td = document.createElement('td');
      td.className = 'col-participant';
      if (i % 2 === 1) td.classList.add('col-even');
      const a = byUser[uid];
      const isMe = currentUser && uid === currentUser.id;

      if (isMe && !currentQuiz.locked) {
        // Editable cell for current user
        // If user has the input focused, keep their in-progress value
        const saved = savedInputs[q];
        const useValue = saved && saved.preserve ? saved.text : (a ? a.text : '');
        const useConf = saved && saved.preserve ? saved.confidence : (a ? a.confidence : 'certain');
        td.classList.add('col-me');
        td.innerHTML = `
          <div class="cell-input">
            <input id="input-${q}" value="${escapeHtml(useValue)}"
              placeholder="..." oninput="dirtyInputs.add(${q})" onchange="submitAnswer(${q})"
              onblur="this.scrollLeft=0; this.setSelectionRange(0,0)">
            <select class="confidence-select conf-${useConf}" id="confidence-${q}" onchange="updateConfStyle(this); this.blur(); submitAnswer(${q})" title="How confident are you?">
              <option value="guess" ${useConf === 'guess' ? 'selected' : ''}>guess</option>
              <option value="maybe" ${useConf === 'maybe' ? 'selected' : ''}>maybe</option>
              <option value="certain" ${useConf === 'certain' ? 'selected' : ''}>certain</option>
            </select>
          </div>
        `;
      } else if (a) {
        // Read-only cell with answer, confidence badge, and vote controls
        const voteHtml = !isMe && !currentQuiz.locked ? `
          <div class="vote-controls">
            <button class="vote-btn ${a.userVote === 1 ? 'active-up' : ''}"
              onclick="vote(${a.id}, 1)" title="Agree">&#9650;</button>
            <span class="vote-score">${a.vote_score > 0 ? '+' : ''}${a.vote_score}</span>
            <button class="vote-btn ${a.userVote === -1 ? 'active-down' : ''}"
              onclick="vote(${a.id}, -1)" title="Disagree">&#9660;</button>
          </div>
        ` : (a.vote_score !== 0 ? `<span class="vote-score">${a.vote_score > 0 ? '+' : ''}${a.vote_score}</span>` : '');

        td.innerHTML = `
          <div class="cell-answer">
            <span class="cell-text" title="${escapeHtml(a.text)}">${escapeHtml(a.text)}</span>
            <span class="confidence-badge confidence-${a.confidence}" title="${a.confidence}">${a.confidence[0]}</span>
            ${voteHtml}
          </div>
        `;
      } else {
        td.innerHTML = '<span class="cell-empty">-</span>';
      }

      row.appendChild(td);
    });

    // Consensus cell
    const consensusTd = document.createElement('td');
    consensusTd.className = 'col-consensus';
    consensusTd.id = `consensus-cell-${q}`;
    consensusTd.innerHTML = `
      <div class="consensus-cell" id="consensus-row-${q}">
        <input class="consensus-input" id="consensus-input-${q}" placeholder="..."
          onchange="updateConsensus(${q}, this.value)" ${currentQuiz.locked ? 'disabled' : ''}>
        <div class="mark-buttons" id="mark-buttons-${q}" style="display:none;">
          <button class="mark-btn" id="mark-correct-${q}" onclick="markAnswer(${q}, true)">&#10003;</button>
          <button class="mark-btn" id="mark-incorrect-${q}" onclick="markAnswer(${q}, false)">&#10007;</button>
        </div>
      </div>
    `;
    row.appendChild(consensusTd);
  }

  // Update participants bar
  if (currentQuiz) {
    currentQuiz.participants = participantIds.map(id => ({
      id, display_name: participantMap[id]
    }));
  }

  // Mobile slider: show/hide columns
  if (isMobile()) {
    initMobileSlider(participantIds, participantMap);
  }
}

let mobileSliderIndex = 0;
let mobileSliderInitialized = false;

function isMobile() {
  return window.innerWidth <= 768;
}

function initMobileSlider(participantIds, participantMap) {
  const slider = document.getElementById('mobileSlider');
  if (!slider || participantIds.length === 0) return;
  slider.style.display = 'flex';

  // Slider has one slot per participant plus a final "Consensus" slot.
  const totalSlots = participantIds.length + 1;

  // Clamp index to valid range (participants may have changed between polls)
  if (mobileSliderIndex >= totalSlots) {
    mobileSliderIndex = 0;
  }

  // Only reset to 0 and bind handlers on first call
  if (!mobileSliderInitialized) {
    mobileSliderIndex = 0;
    mobileSliderInitialized = true;

    document.getElementById('sliderLeft').onclick = () => {
      const total = knownParticipants.length + 1;
      mobileSliderIndex = (mobileSliderIndex - 1 + total) % total;
      updateMobileSlider(knownParticipants, getCurrentParticipantMap());
    };
    document.getElementById('sliderRight').onclick = () => {
      const total = knownParticipants.length + 1;
      mobileSliderIndex = (mobileSliderIndex + 1) % total;
      updateMobileSlider(knownParticipants, getCurrentParticipantMap());
    };
  }

  updateMobileSlider(participantIds, participantMap);
}

function updateMobileSlider(participantIds, participantMap) {
  const totalSlots = participantIds.length + 1;
  const isConsensusSlot = mobileSliderIndex === participantIds.length;

  const label = document.getElementById('sliderLabel');
  if (isConsensusSlot) {
    label.textContent = `Consensus (${totalSlots}/${totalSlots})`;
  } else {
    label.textContent = `${participantMap[participantIds[mobileSliderIndex]]} (${mobileSliderIndex + 1}/${totalSlots})`;
  }

  // Show one column at a time: a participant column, or the consensus column
  // when on the final slot. Everything else is hidden.
  const table = document.getElementById('answerGrid');
  if (!table) return;

  const allRows = table.querySelectorAll('tr');
  allRows.forEach(row => {
    const pCells = row.querySelectorAll('.col-participant');
    pCells.forEach((cell, i) => {
      cell.style.display = (!isConsensusSlot && i === mobileSliderIndex) ? '' : 'none';
    });
    const cCell = row.querySelector('.col-consensus');
    if (cCell) cCell.style.display = isConsensusSlot ? '' : 'none';
  });
}

async function saveAllAnswers() {
  if (!currentQuiz || currentQuiz.locked) return;
  let saved = 0;
  for (let q = 1; q <= 20; q++) {
    const input = document.getElementById(`input-${q}`);
    const conf = document.getElementById(`confidence-${q}`);
    if (!input) continue;
    const text = input.value.trim();
    try {
      await apiFetch(`/api/answers/quiz/${currentQuiz.id}`, {
        method: 'POST',
        body: JSON.stringify({
          questionNumber: q,
          text: text,
          confidence: conf ? conf.value : 'certain'
        })
      });
      if (text) saved++;
    } catch (e) {
      // continue saving others
    }
  }
  dirtyInputs.clear();
  showToast(`Saved ${saved} answer${saved !== 1 ? 's' : ''}`, 'success');
  refreshAnswers();
  refreshConsensus();
}

async function submitAnswer(q) {
  const input = document.getElementById(`input-${q}`);
  const conf = document.getElementById(`confidence-${q}`);
  const text = input.value.trim();

  try {
    await apiFetch(`/api/answers/quiz/${currentQuiz.id}`, {
      method: 'POST',
      body: JSON.stringify({
        questionNumber: q,
        text: text,
        confidence: conf.value
      })
    });
    dirtyInputs.delete(q);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function vote(answerId, direction) {
  try {
    await apiFetch(`/api/votes/${answerId}`, {
      method: 'POST',
      body: JSON.stringify({ direction })
    });
    refreshAnswers();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ---- Consensus ----

async function refreshConsensus() {
  if (!currentQuiz) return;
  try {
    const data = await apiFetch(`/api/consensus/quiz/${currentQuiz.id}`);
    renderConsensus(data.consensus);
  } catch (e) {
    // Silently fail on poll
  }
}

function renderConsensus(consensus) {
  let correctCount = 0;
  let markedCount = 0;

  for (let q = 1; q <= 20; q++) {
    const c = consensus[q];
    const input = document.getElementById(`consensus-input-${q}`);
    const row = document.getElementById(`consensus-row-${q}`);
    const markButtons = document.getElementById(`mark-buttons-${q}`);

    if (input && !input.matches(':focus')) {
      input.value = c.answerText || '';
    }

    // Show mark buttons if answer image is uploaded
    if (currentQuiz.answer_image && markButtons) {
      markButtons.style.display = 'flex';
    }

    // Update marking state on both the inner div and parent td
    const cell = document.getElementById(`consensus-cell-${q}`);
    row.classList.remove('correct', 'incorrect');
    if (cell) cell.classList.remove('correct', 'incorrect');
    const correctBtn = document.getElementById(`mark-correct-${q}`);
    const incorrectBtn = document.getElementById(`mark-incorrect-${q}`);
    if (correctBtn) correctBtn.classList.remove('correct-active');
    if (incorrectBtn) incorrectBtn.classList.remove('incorrect-active');

    if (c.isCorrect === 1 || c.isCorrect === true) {
      row.classList.add('correct');
      if (cell) cell.classList.add('correct');
      if (correctBtn) correctBtn.classList.add('correct-active');
      correctCount++;
      markedCount++;
    } else if (c.isCorrect === 0 || c.isCorrect === false) {
      row.classList.add('incorrect');
      if (cell) cell.classList.add('incorrect');
      if (incorrectBtn) incorrectBtn.classList.add('incorrect-active');
      markedCount++;
    }
  }

  // Update score bar
  const scoreBar = document.getElementById('scoreBar');
  const scoreValue = document.getElementById('scoreValue');
  if (markedCount > 0) {
    scoreBar.style.display = 'flex';
    scoreValue.textContent = `${correctCount}/20`;
  } else {
    scoreBar.style.display = 'none';
  }
}

async function updateConsensus(q, text) {
  try {
    await apiFetch(`/api/consensus/quiz/${currentQuiz.id}/${q}`, {
      method: 'PUT',
      body: JSON.stringify({ answerText: (text || '').trim() })
    });
    refreshConsensus();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function markAnswer(q, isCorrect) {
  // First, ensure consensus exists (save current input value)
  const input = document.getElementById(`consensus-input-${q}`);
  if (input && input.value.trim()) {
    await updateConsensus(q, input.value);
  }

  try {
    // Toggle: if already marked this way, clear it
    const row = document.getElementById(`consensus-row-${q}`);
    const alreadyCorrect = row.classList.contains('correct');
    const alreadyIncorrect = row.classList.contains('incorrect');

    let newValue = isCorrect;
    if ((isCorrect && alreadyCorrect) || (!isCorrect && alreadyIncorrect)) {
      newValue = null;
    }

    await apiFetch(`/api/consensus/quiz/${currentQuiz.id}/${q}/mark`, {
      method: 'PUT',
      body: JSON.stringify({ isCorrect: newValue })
    });
    refreshConsensus();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ---- Admin ----

function getDefaultQuizTitle() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);

  // ISO 8601 week number: week 1 contains the year's first Thursday
  const jan1 = new Date(monday.getFullYear(), 0, 1);
  const firstThursday = new Date(jan1);
  firstThursday.setDate(jan1.getDate() + ((4 - jan1.getDay() + 7) % 7));
  const yearStart = new Date(firstThursday);
  yearStart.setDate(firstThursday.getDate() - 3); // Back to Monday of that week
  const weekNum = Math.ceil(((monday - yearStart) / 86400000 + 1) / 7);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${monday.getDate()} ${months[monday.getMonth()]} ${monday.getFullYear()}`;
  return `Week ${weekNum}, ${dateStr}`;
}

async function setupAdmin(quiz) {
  const panel = document.getElementById('adminPanel');
  const toggle = document.getElementById('adminToggle');
  const controls = document.getElementById('adminQuizControls');

  toggle.onclick = () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };

  if (quiz) {
    controls.style.display = 'block';
    if (quiz.locked) {
      document.getElementById('lockQuizBtn').style.display = 'none';
      document.getElementById('unlockQuizBtn').style.display = 'inline-block';
    } else {
      document.getElementById('lockQuizBtn').style.display = 'inline-block';
      document.getElementById('unlockQuizBtn').style.display = 'none';
    }
  } else {
    controls.style.display = 'none';
  }

  // Auto-fill quiz title
  document.getElementById('quizTitle').value = getDefaultQuizTitle();

  document.getElementById('createQuizBtn').onclick = createQuiz;
  document.getElementById('uploadAnswersBtn').onclick = uploadAnswerImage;
  document.getElementById('lockQuizBtn').onclick = lockQuiz;
  document.getElementById('unlockQuizBtn').onclick = unlockQuiz;
}

async function createQuiz() {
  const password = document.getElementById('adminPassword').value;
  const title = document.getElementById('quizTitle').value.trim();
  const fileInput = document.getElementById('questionImageInput');

  if (!title) return showToast('Title required', 'error');
  if (!fileInput.files[0]) return showToast('Question image required', 'error');
  if (!password) return showToast('Admin password required', 'error');

  const form = new FormData();
  form.append('title', title);
  form.append('questionImage', fileInput.files[0]);

  try {
    await apiFetch('/api/admin/quiz', {
      method: 'POST',
      headers: { 'X-Admin-Key': password },
      body: form
    });
    showToast('Quiz created!', 'success');
    await loadQuiz();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function uploadAnswerImage() {
  const password = document.getElementById('adminPassword').value;
  const fileInput = document.getElementById('answerImageInput');

  if (!fileInput.files[0]) return showToast('Select an answer image', 'error');
  if (!password) return showToast('Admin password required', 'error');

  const form = new FormData();
  form.append('answerImage', fileInput.files[0]);

  try {
    await apiFetch(`/api/admin/quiz/${currentQuiz.id}/answers-image`, {
      method: 'POST',
      headers: { 'X-Admin-Key': password },
      body: form
    });
    showToast('Answer image uploaded!', 'success');
    await loadQuiz();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function lockQuiz() {
  const password = document.getElementById('adminPassword').value;
  if (!password) return showToast('Admin password required', 'error');

  try {
    const data = await apiFetch(`/api/admin/quiz/${currentQuiz.id}/lock`, {
      method: 'POST',
      headers: { 'X-Admin-Key': password }
    });
    showToast(`Quiz locked! Score: ${data.score}/20`, 'success');
    await loadQuiz();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function unlockQuiz() {
  const password = document.getElementById('adminPassword').value;
  if (!password) return showToast('Admin password required', 'error');

  try {
    await apiFetch(`/api/admin/quiz/${currentQuiz.id}/unlock`, {
      method: 'POST',
      headers: { 'X-Admin-Key': password }
    });
    showToast('Quiz unlocked', 'success');
    await loadQuiz();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function updateConfStyle(el) {
  el.classList.remove('conf-guess', 'conf-maybe', 'conf-certain');
  el.classList.add('conf-' + el.value);
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
