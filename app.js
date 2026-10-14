const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const KEY = 'kaypee-listing-v3';
const OLD_KEY = 'kaypee-listing-demo-v2';
const fresh = { read: [], quiz: {}, quizAnswers: {}, selectedLesson: 'day-1', notes: [], chat: [], sop: null, eod: {}, checkpoint: null, lastPlace: null, lastVisit: null };
let state;
let content;
let workbook;
let filter = 'all';
let aiReady = false;
let busy = false;
let chatReturnFocus = null;
let dialogReturnFocus = null;
let zoomReturnFocus = null;
let zoomFactor = 1;
let cloudState = false;
let stateRevision = 0;
let syncTimer = null;
let syncActive = false;
let syncPending = false;
let syncError = null;
let searchTimer = null;
let searchController = null;
let searchRevision = 0;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) return { ...fresh, ...saved, read: Array.isArray(saved.read) ? saved.read : [], chat: Array.isArray(saved.chat) ? saved.chat : [], notes: Array.isArray(saved.notes) ? saved.notes : [] };
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    if (old) return { ...fresh, chat: Array.isArray(old.chat) ? old.chat : [] };
  } catch { /* Stale local data should not stop the app. */ }
  return { ...fresh };
}
state = loadState();
let previousVisit = state.lastVisit;
state.lastVisit = new Date().toISOString();
function syncStatus(message) {
  const element = document.getElementById('sync-status');
  if (element) { element.hidden = !cloudState; element.textContent = message; }
}
function save() {
  if (!cloudState) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Browser storage may be unavailable. */ } return; }
  syncPending = true;
  syncError = null;
  syncStatus('Saving to your account…');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushCloudState, 250);
}
async function flushCloudState() {
  clearTimeout(syncTimer);
  if (!cloudState) return true;
  if (syncActive) {
    while (syncActive) await new Promise((resolve) => setTimeout(resolve, 50));
    return syncPending ? flushCloudState() : !syncError;
  }
  if (!syncPending) return !syncError;
  syncActive = true;
  while (syncPending && cloudState) {
    syncPending = false;
    const snapshot = JSON.stringify(state);
    try {
      const response = await fetch('/api/user-state', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: JSON.parse(snapshot), revision: stateRevision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your activity.');
      stateRevision = result.revision;
      syncError = null;
      if (JSON.stringify(state) !== snapshot) syncPending = true;
      syncStatus(syncPending ? 'Saving to your account…' : 'Saved to your account');
    } catch (error) {
      syncPending = false;
      syncError = error.message || 'Could not save your activity.';
      syncStatus(error.message || 'Could not save your activity.');
    }
  }
  syncActive = false;
  return !syncError;
}
function renderAll() {
  if (!content) return;
  renderHome(); renderLearning(); renderKnowledge(); renderSop(); renderChat();
}
async function activateGoogleState() {
  const response = await fetch('/api/user-state', { credentials: 'same-origin' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not load your activity.');
  clearTimeout(syncTimer);
  cloudState = true;
  syncPending = false;
  stateRevision = result.revision;
  state = result.state ? { ...fresh, ...result.state } : { ...fresh };
  previousVisit = state.lastVisit;
  state.lastVisit = new Date().toISOString();
  syncStatus('Saved to your account');
  renderAll();
  if (content) await checkAI();
}
function activateDemoState() {
  clearTimeout(syncTimer);
  cloudState = false;
  syncPending = false;
  state = loadState();
  previousVisit = state.lastVisit;
  state.lastVisit = new Date().toISOString();
  save();
  syncStatus('');
  renderAll();
}
save();
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const normalize = (value) => String(value ?? '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
function profileFirstName() {
  try {
    const setup = JSON.parse(localStorage.getItem('kaypee-onboarding-v1') || '{}');
    return setup.complete ? String(setup.name || 'there').trim().split(/\s+/)[0] : 'Alex';
  } catch { return 'Alex'; }
}
const doc = (id) => content.docs.find((item) => item.id === id);
const lesson = (id) => content.learning.find((item) => item.id === id);
const readDone = (id) => state.read.includes(id);
const lessonDone = (item) => item.docIds.every(readDone) && state.quiz[item.id] === true;
const doneCount = () => content.learning.filter(lessonDone).length;
const nextLesson = () => content.learning.find((item) => !lessonDone(item)) || content.learning.at(-1);
const unlocked = (index) => index === 0 || lessonDone(content.learning[index - 1]);
const pageCopy = {
  home: ['Hey Alex, welcome.', 'Pick up where you left off.'],
  learn: ['My learning path', 'Five days of foundations, at your pace.'],
  knowledge: ['Knowledge hub', 'Find the source before making the next move.'],
  tasks: ['SOP Navigator', 'Turn a task into a draft action plan.']
};

function showView(name, remember = true) {
  if (!pageCopy[name]) return;
  $$('.view').forEach((view) => { view.hidden = view.id !== name; view.classList.toggle('is-active', view.id === name); });
  $$('.nav-item').forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#page-title').textContent = name === 'home' ? `Hey ${profileFirstName()}, welcome.` : pageCopy[name][0];
  $('#page-subtitle').textContent = pageCopy[name][1];
  if (remember && name === 'learn') { state.lastPlace = { view: 'learn', lessonId: state.selectedLesson }; save(); }
  if (remember && name === 'tasks' && state.sop) { state.lastPlace = { view: 'tasks', step: state.lastPlace?.view === 'tasks' ? state.lastPlace.step : 0 }; save(); }
  if (name === 'home') renderHome();
  if (name === 'learn') renderLearning();
  if (name === 'knowledge') renderKnowledge();
  if (name === 'tasks') renderSop();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function continueWork() {
  const place = state.lastPlace;
  if (place?.view === 'tasks' && state.sop) {
    showView('tasks');
    const steps = content.sopTemplates[state.sop.type].steps;
    const firstOpen = steps.findIndex((_, index) => !state.sop.done[index]);
    const index = place.step >= 0 && !state.sop.done[place.step] ? place.step : Math.max(0, firstOpen);
    const target = document.querySelector(`[data-sop-blocker="${index}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
    return;
  }
  if (doneCount() === content.learning.length) return showView('tasks');
  const savedLesson = lesson(place?.lessonId);
  const target = savedLesson && !lessonDone(savedLesson) && unlocked(content.learning.findIndex((item) => item.id === place.lessonId)) ? place.lessonId : nextLesson().id;
  state.selectedLesson = target;
  showView('learn');
}

function renderHome() {
  const done = doneCount();
  const pct = Math.round(done / content.learning.length * 100);
  $('#home-progress-label').textContent = `${done} of 5 days complete`;
  $('#home-progress').setAttribute('aria-valuenow', String(done));
  $('#home-progress-fill').style.width = `${pct}%`;
  $('#growth-caption').textContent = `${pct}% of the five-day learning path completed.`;
  $('#growth-tip').textContent = done === 0 ? 'Keypee tip: open the journey slide first.' : done === 5 ? 'Keypee tip: use a task plan to apply what you learned.' : 'Keypee tip: check the source whenever a term is unclear.';
  const returning = previousVisit && new Date(previousVisit).toDateString() !== new Date().toDateString();
  const target = nextLesson();
  const taskResume = state.lastPlace?.view === 'tasks' && state.sop;
  const taskSteps = taskResume ? content.sopTemplates[state.sop.type].steps : [];
  const taskIndex = taskResume ? (state.lastPlace.step >= 0 && !state.sop.done[state.lastPlace.step] ? state.lastPlace.step : Math.max(0, taskSteps.findIndex((_, index) => !state.sop.done[index]))) : 0;
  if (taskResume) {
    $('#hero-kicker').textContent = 'YOUR TASK IS WAITING ✦';
    $('#home-heading').innerHTML = 'Pick up your plan.<br><em>One step at a time.</em>';
    $('#hero-description').textContent = `Next in ${state.sop.name}: ${taskSteps[taskIndex]?.[0] || 'prepare manager review'}.`;
  } else if (done === 5) {
    $('#hero-kicker').textContent = 'FOUNDATIONS COMPLETE ✦';
    $('#home-heading').innerHTML = `Nice work, ${esc(profileFirstName())}.<br><em>Put it into practice.</em>`;
    $('#hero-description').textContent = 'Your five learning days are complete. Use a task plan and review real decisions with your manager.';
  } else if (returning) {
    $('#hero-kicker').textContent = 'WELCOME BACK ✦';
    $('#home-heading').innerHTML = 'Pick up the thread.<br><em>Keep your momentum.</em>';
    $('#hero-description').textContent = `Day ${Number(target.number)} is ready. Continue from your last learning or task step.`;
  } else if (done) {
    $('#hero-kicker').textContent = `DAY ${Number(target.number)} IS READY ✦`;
    $('#home-heading').innerHTML = 'One step clearer.<br><em>Keep going.</em>';
    $('#hero-description').textContent = target.summary;
  }
  const place = taskResume ? `Resume task: ${state.sop.name}` : `Day ${Number(target.number)}: ${target.title}`;
  const description = taskResume ? taskSteps[taskIndex]?.[3] : done === 5 ? 'Learning complete · try a task workflow' : target.summary;
  $('#next-lesson').innerHTML = `<div class="next-lesson-row"><span class="next-number" aria-hidden="true">${taskResume ? '↗' : done === 5 ? '✓' : esc(target.number)}</span><div><strong>${esc(place)}</strong><p>${esc(description)}</p></div><button class="text-button" id="resume-step">Continue →</button></div>`;
}

function renderLearning() {
  const done = doneCount();
  $('#learn-count').textContent = `${done} / 5 days`;
  $('#learn-progress').setAttribute('aria-valuenow', String(done));
  $('#learn-progress-fill').style.width = `${Math.round(done / 5 * 100)}%`;
  const selectedIndex = content.learning.findIndex((item) => item.id === state.selectedLesson);
  if (selectedIndex < 0 || !unlocked(selectedIndex)) state.selectedLesson = nextLesson().id;
  $('#lesson-list').innerHTML = content.learning.map((item, index) => {
    const complete = lessonDone(item);
    const locked = !unlocked(index);
    const selected = state.selectedLesson === item.id;
    const checkin = state.eod[item.id];
    const completeStatus = checkin?.bookedAt ? 'COMPLETED · BOOKING MARKED BY YOU' : checkin?.savedAt ? 'COMPLETED · CHECK-IN PREPARED' : 'COMPLETED';
    return `<button class="lesson-item ${complete ? 'is-complete' : ''} ${selected ? 'is-selected' : ''}" data-lesson="${esc(item.id)}" ${locked ? 'disabled' : ''} aria-pressed="${selected}"><span class="lesson-number">${complete ? '✓' : esc(item.number)}</span><span><strong>Day ${Number(item.number)} · ${esc(item.title)}</strong><small>${esc(item.summary)}</small><span class="lesson-status">${complete ? completeStatus : locked ? 'LOCKED · FINISH PREVIOUS DAY' : esc(item.duration) + ' · READY'}</span></span></button>`;
  }).join('');
  renderLessonDetail();
}

function renderLessonDetail() {
  const item = lesson(state.selectedLesson);
  if (!item) return;
  const correct = state.quiz[item.id] === true;
  const didRead = item.docIds.every(readDone);
  const answer = state.quizAnswers[item.id];
  const resources = item.docIds.map((id) => {
    const source = doc(id);
    return `<div class="source-row"><span class="source-symbol" aria-hidden="true">▤</span><span class="source-copy"><strong>${esc(source.title)}</strong><small>${esc(source.sourceRef)}</small></span><span class="source-actions"><button class="tiny-button" data-doc="${esc(id)}">Open source</button><button class="tiny-button ${readDone(id) ? 'is-done' : ''}" data-mark-read="${esc(id)}" aria-pressed="${readDone(id)}">${readDone(id) ? '✓ Read' : 'Mark read'}</button></span></div>`;
  }).join('');
  const options = item.check.options.map((option, index) => `<button class="quiz-option ${answer === index ? 'is-selected' : ''} ${correct && index === item.check.answer ? 'is-correct' : ''}" data-answer="${index}" ${!didRead || correct ? 'disabled' : ''}>${esc(option)}</button>`).join('');
  const feedback = correct ? `<p class="quiz-feedback good">✓ ${esc(item.check.explanation)}</p>` : answer !== undefined ? '<p class="quiz-feedback try-again">Not quite. Revisit the source and try again.</p>' : '';
  $('#lesson-detail').innerHTML = `<span class="mini-label">DAY ${esc(item.number)} · ${esc(item.duration)}</span><h3>${esc(item.title)}</h3><p class="lead">${esc(item.summary)}</p><div class="lesson-block"><h4>Read the checked source</h4>${resources}</div><div class="lesson-block"><div class="check-card"><strong>Quick understanding check</strong><p>${esc(item.check.question)}</p><div class="option-list">${options}</div>${feedback}<small>${didRead ? '' : 'Mark the source read to unlock this check.'}</small></div></div><div class="lesson-tip"><p>${lessonDone(item) ? 'Day complete. Prepare a recap and manager check-in below.' : 'Read the source and answer the check to complete this day.'}</p></div>`;
  const eod = $('#eod-panel');
  eod.hidden = !lessonDone(item);
  if (!eod.hidden) {
    const saved = state.eod[item.id] || {};
    const form = $('#eod-form');
    const sources = item.docIds.map(doc).filter(Boolean);
    $('#eod-summary').innerHTML = `<strong>Day ${esc(item.number)} source recap</strong><p>${esc(item.summary)}</p><ul>${sources.flatMap((source) => source.sections.map((section) => `<li><b>${esc(section.heading)}:</b> ${esc(section.body)}</li>`)).join('')}</ul><small>From ${sources.map((source) => esc(source.sourceRef)).join('; ')} · review against the source before sharing</small>`;
    form.elements.learned.value = saved.learned || sources.flatMap((source) => source.sections.map((section) => `${section.heading}: ${section.body}`)).join('\n');
    form.elements.blocker.value = saved.blocker || '';
    form.elements.review.value = saved.review || '';
    form.elements.when.value = saved.when || '';
    $('#eod-manage').hidden = !saved.savedAt;
    for (const id of ['open-calendar', 'copy-agenda', 'mark-booked']) $(`#${id}`).disabled = false;
    $('#eod-status').textContent = saved.bookedAt ? `Marked booked by you · ${new Date(saved.bookedAt).toLocaleString()} · manager confirmation not verified` : saved.openedAt ? 'Google Calendar draft opened · booking not verified' : 'Agenda saved · booking not started';
    $('#mark-booked').hidden = Boolean(saved.bookedAt);
    $('#recap-form').hidden = !saved.bookedAt;
    const recapForm = $('#recap-form');
    recapForm.elements.recap.value = saved.recap || '';
    recapForm.elements.next.value = saved.next || '';
  }
  renderCheckinHistory();
}

function renderCheckinHistory() {
  const entries = content.learning.filter((item) => state.eod[item.id]?.savedAt);
  $('#checkin-history-list').innerHTML = entries.length ? entries.map((item) => {
    const saved = state.eod[item.id];
    const status = saved.recapAt ? 'Recap saved' : saved.bookedAt ? 'Marked booked by you' : saved.openedAt ? 'Calendar draft opened' : 'Agenda prepared';
    const when = saved.when ? new Date(saved.when).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Time not set';
    return `<div class="checkin-entry"><div><strong>Day ${Number(item.number)} · ${esc(item.title)}</strong><small>${esc(when)} · ${status} · manager confirmation not verified</small>${saved.recap ? `<p>Recap: ${esc(saved.recap)}</p>` : ''}</div><button class="tiny-button" type="button" data-checkin-day="${esc(item.id)}">Manage →</button></div>`;
  }).join('') : '<p class="empty-checkins">Complete a day and prepare its check-in to see it here.</p>';
}

function dayAgenda(item, saved) {
  const sources = item.docIds.map(doc).filter(Boolean);
  return `Keypee · Day ${item.number}: ${item.title}\n\nSources reviewed:\n${sources.map((source) => `• ${source.title} (${source.sourceRef})`).join('\n')}\n\nLearning recap:\n${saved.learned || 'Not written yet'}\n\nQuick check: ${state.quiz[item.id] ? 'completed' : 'pending'}\nBlocker or open question: ${saved.blocker || 'None recorded'}\nManager review requested: ${saved.review || 'Not specified'}\n\nAgenda:\n1. Review learning and practical examples\n2. Clarify blockers and questions\n3. Validate understanding and agree next step`;
}

function calendarDraftUrl(item, saved) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(saved.when || '')) return null;
  const start = new Date(saved.when);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const stamp = (date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: `Keypee · Day ${item.number} manager check-in`, dates: `${stamp(start)}/${stamp(end)}`, details: dayAgenda(item, saved), ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh' });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const imageTopic = (image) => {
  const row = Number(image.anchor.match(/\d+/)?.[0] || 0);
  return row < 24 ? 'Listing journey and status' : row < 55 ? 'Item, SKU and merchant' : row < 97 ? 'Stock' : 'Advanced stock and category';
};
function matching(value, q) { return !q || normalize(value).includes(normalize(q)) || normalize(value).replace(/[^a-z0-9]/g, '').includes(normalize(q).replace(/[^a-z0-9]/g, '')); }
function matchingDocs(q) {
  return content.docs.filter((item) => matching(`${item.title} ${item.summary} ${item.tags.join(' ')} ${item.sections.map((part) => part.body).join(' ')}`, q));
}
function relevantNotes(q) {
  return state.notes.filter((note) => matching(`${note.title} ${note.text}`, q)).slice(0, 3);
}
function renderKnowledge() {
  const q = $('#knowledge-search').value.trim();
  $$('.filter').forEach((button) => { const active = button.dataset.filter === filter; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
  const checked = filter === 'all' || filter === 'checked' ? matchingDocs(q) : [];
  const notes = filter === 'all' || filter === 'notes' ? relevantNotes(q) : [];
  const cells = filter === 'all' || filter === 'workbook' ? workbook.cells.filter((cell) => cell.text && matching(`${cell.cell} ${cell.text}`, q)).slice(0, q ? 18 : 5) : [];
  const images = filter === 'all' || filter === 'workbook' ? workbook.images.filter((image) => matching(`${image.anchor} ${imageTopic(image)} ${image.ocr.join(' ')}`, q)).slice(0, q ? 12 : 5) : [];
  const cards = [];
  checked.forEach((item) => cards.push(`<article class="resource-card"><span class="resource-type">${esc(item.type)}</span><strong>${esc(item.title)}</strong><p>${esc(item.summary)}</p><small>${esc(item.sourceRef)}</small><div class="card-actions"><button class="tiny-button" data-doc="${esc(item.id)}">Open source</button><button class="tiny-button" data-ask-source="${esc(item.id)}" ${aiReady ? '' : 'disabled'}>Ask</button></div></article>`));
  notes.forEach((note) => cards.push(`<article class="resource-card"><span class="resource-type">Your local note</span><strong>${esc(note.title)}</strong><p>${esc(note.text.slice(0, 160))}</p><div class="card-actions"><button class="tiny-button" data-note-open="${esc(note.id)}">Open</button><button class="tiny-button" data-note-edit="${esc(note.id)}">Edit</button><button class="tiny-button" data-note-delete="${esc(note.id)}">Delete</button></div></article>`));
  cells.forEach((cell) => cards.push(`<article class="resource-card"><span class="resource-type">Workbook cell · original</span><strong>${esc(cell.id)}</strong><p>${esc(cell.text.slice(0, 180))}</p><div class="card-actions"><button class="tiny-button" data-cell="${esc(cell.id)}">View cell</button></div></article>`));
  images.forEach((image) => {
    const matchIndex = q ? image.ocr.findIndex((line) => matching(line, q)) : -1;
    const preview = matchIndex >= 0 ? image.ocr.slice(Math.max(0, matchIndex - 1), matchIndex + 2).join(' ') : image.ocr.slice(0, 3).join(' ');
    cards.push(`<article class="resource-card"><span class="resource-type">Workbook slide · view only</span><strong>${esc(imageTopic(image))}</strong><p>${esc(image.id)} · anchored at ${esc(image.anchor)}. OCR preview: ${esc(preview.slice(0, 160))}</p><div class="card-actions"><button class="tiny-button" data-image="${esc(image.id)}">View slide</button></div></article>`);
  });
  $('#result-count').textContent = q ? `${cards.length} related results` : 'Browse checked excerpts and original workbook material';
  $('#knowledge-results').innerHTML = cards.length ? `<div class="resource-grid">${cards.join('')}</div>` : '<div class="empty-state">No matching source yet. Try a shorter term or add a note.</div>';
  $('#topic-list').innerHTML = ['journey', 'status', 'category', 'merchant', 'stock'].map((topic) => `<button class="topic-button" data-topic="${topic}">${topic}</button>`).join('');
}

function scheduleKnowledgeAnswer(delay = 650) {
  clearTimeout(searchTimer);
  searchController?.abort();
  const revision = ++searchRevision;
  const query = $('#knowledge-search').value.trim();
  const answer = $('#knowledge-answer');
  if (!query) { answer.hidden = true; answer.replaceChildren(); return; }
  answer.hidden = false;
  if (!aiReady) { answer.innerHTML = '<p>AI is unavailable right now. You can still inspect the matching sources below.</p>'; return; }
  answer.innerHTML = '<p>Finding related sources…</p>';
  searchTimer = setTimeout(() => answerKnowledgeSearch(query, revision), delay);
}

async function answerKnowledgeSearch(query, revision) {
  const answer = $('#knowledge-answer');
  const docs = filter === 'all' || filter === 'checked' ? matchingDocs(query).slice(0, 4) : [];
  const notes = filter === 'all' || filter === 'notes' ? relevantNotes(query).map((note) => ({ id: note.id, title: note.title, text: note.text })) : [];
  const rawOnly = !docs.length && !notes.length;
  const controller = new AbortController();
  searchController = controller;
  answer.innerHTML = `<span class="mini-label">KEYPEE SUMMARY · DEEPSEEK</span><p>${rawOnly ? 'Checking what can be answered from verified material…' : 'Reading matching checked sources…'}</p>`;
  try {
    const response = await fetch('/api/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ question: `Answer this knowledge search: ${query}. Summarise only the supplied matching sources. If none are supplied, say no checked source supports an answer yet. State what is still unknown.`, sourceIds: docs.map((item) => item.id), localNotes: notes, sourceScope: 'search' })
    });
    const result = await response.json();
    if (revision !== searchRevision) return;
    if (!response.ok) throw new Error(result.error || 'Keypee could not answer.');
    answer.innerHTML = `<span class="mini-label">KEYPEE SUMMARY · DEEPSEEK</span>${rawOnly ? '<p class="small-disclaimer">No matching checked excerpt or note. Workbook originals below are for inspection only.</p>' : ''}<p class="source-text">${esc(result.answer)}</p>${result.sources?.length ? `<div class="answer-sources">${result.sources.map((source, index) => `<button class="tiny-button" data-doc="${esc(source.id)}">[${index + 1}] ${esc(source.title)} · ${esc(source.sourceRef)}</button>`).join('')}</div>` : '<p class="small-disclaimer">No source cited for this answer.</p>'}`;
  } catch (error) {
    if (controller.signal.aborted || revision !== searchRevision) return;
    answer.innerHTML = `<p class="error-text">${esc(error.message)}</p><button class="tiny-button" id="retry-hub">Try again</button>`;
  } finally {
    if (searchController === controller) searchController = null;
  }
}

function openSource(title, body) {
  dialogReturnFocus = document.activeElement;
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = body;
  $('#doc-dialog').showModal();
  $('[data-close-dialog="doc-dialog"]').focus();
}
function openDoc(id) {
  const item = doc(id);
  if (!item) return openSource('Earlier demo source', '<div class="doc-warning">This source belonged to an earlier demo version and is no longer in the current workbook library.</div>');
  openSource(item.title, `<div class="doc-warning">${esc(content.demoLabel)}</div><div class="doc-meta"><span>${esc(item.type)}</span><span>${esc(item.sourceRef)}</span><span>${esc(item.updated)}</span></div>${item.sections.map((section) => `<section><h3>${esc(section.heading)}</h3><p>${esc(section.body)}</p></section>`).join('')}${item.imagePath ? `<button class="source-zoom" type="button" data-zoom-src="${esc(item.imagePath)}" data-zoom-title="${esc(item.title)}" aria-label="Zoom original slide for ${esc(item.title)}"><img class="source-image" src="${esc(item.imagePath)}" alt="Original workbook slide for ${esc(item.title)}"><span>Click image to zoom ↗</span></button>` : ''}<div class="source-dialog-actions"><button class="button button-dark" type="button" data-ask-material="${esc(id)}">Ask Keypee about this source ↗</button><small>Keypee will use this checked excerpt and cite it if the answer relies on it.</small></div>`);
}
function openCell(id) {
  const cell = workbook.cells.find((item) => item.id === id);
  if (!cell) return;
  openSource(cell.id, `<div class="doc-warning">Original workbook cell · not checked for AI use. Verify date and approval status with the owner.</div><p class="source-text">${esc(cell.text)}</p>${cell.link ? `<p><a href="${esc(cell.link)}" target="_blank" rel="noopener noreferrer">Open linked source ↗</a></p>` : ''}`);
}
function openImage(id) {
  const image = workbook.images.find((item) => item.id === id);
  if (!image) return;
  openSource(image.id, `<div class="doc-warning">Original workbook slide anchored at ${esc(image.anchor)}. OCR may have errors; compare with the slide. Image text is not sent to AI unless captured in a checked excerpt.</div><button class="source-zoom" type="button" data-zoom-src="${esc(image.path)}" data-zoom-title="${esc(image.id)}" aria-label="Zoom original workbook slide ${esc(image.id)}"><img class="source-image" src="${esc(image.path)}" alt="Original workbook slide anchored at ${esc(image.anchor)}"><span>Click image to zoom ↗</span></button>`);
}
function openZoom(src, title) {
  if (!src.startsWith('/assets/workbook/')) return;
  zoomReturnFocus = document.activeElement;
  zoomFactor = 1;
  $('#zoom-image').src = src;
  $('#zoom-image').alt = `Enlarged ${title}`;
  $('#image-title').textContent = title;
  $('#zoom-level').textContent = '100%';
  $('#zoom-image').style.width = '100%';
  $('#image-dialog').showModal();
  $('#zoom-in').focus();
}
function changeZoom(delta) {
  zoomFactor = Math.max(1, Math.min(3, zoomFactor + delta));
  $('#zoom-image').style.width = `${Math.round(zoomFactor * 100)}%`;
  $('#zoom-level').textContent = `${Math.round(zoomFactor * 100)}%`;
}
function openNote(id) {
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;
  openSource(note.title, `<div class="doc-warning">Your browser note · not verified company guidance.</div><p class="source-text">${esc(note.text)}</p>${note.link ? `<p><a href="${esc(note.link)}" target="_blank" rel="noopener noreferrer">Open note link ↗</a></p>` : ''}`);
}
function editNote(id = '') {
  const note = state.notes.find((item) => item.id === id);
  dialogReturnFocus = document.activeElement;
  const form = $('#note-form');
  form.elements.id.value = note?.id || '';
  form.elements.title.value = note?.title || '';
  form.elements.text.value = note?.text || '';
  form.elements.link.value = note?.link || '';
  $('#note-dialog').showModal();
  form.elements.title.focus();
}

function renderSop() {
  const plan = state.sop;
  $('#sop-plan').hidden = !plan;
  if (!plan) return;
  $('#sop-name').value = plan.name;
  $('#sop-type').value = plan.type;
  const template = content.sopTemplates[plan.type];
  if (!template) return;
  const done = template.steps.filter((_, index) => plan.done?.[index]).length;
  $('#sop-plan-title').textContent = plan.name;
  $('#sop-progress-label').textContent = `${done} of ${template.steps.length} steps`;
  $('#sop-progress-fill').style.width = `${Math.round(done / template.steps.length * 100)}%`;
  $('#sop-steps').innerHTML = template.steps.map(([title, owner, output, description], index) => `<article class="sop-step ${plan.done?.[index] ? 'is-done' : ''}"><span class="step-number" aria-hidden="true">${plan.done?.[index] ? '✓' : index + 1}</span><div><h4>${esc(title)}</h4><p>${esc(description)}</p><div class="step-meta"><span><b>Owner:</b> ${esc(owner)}</span><span><b>Output:</b> ${esc(output)}</span></div><label class="step-check"><input type="checkbox" data-sop-step="${index}" ${plan.done?.[index] ? 'checked' : ''}> Mark done</label><label class="blocker-label">Blocker or note<textarea data-sop-blocker="${index}" rows="2" placeholder="Optional note">${esc(plan.blockers?.[index] || '')}</textarea></label></div></article>`).join('');
  $('#checkpoint-status').textContent = state.checkpoint?.planName === plan.name ? `Review draft saved locally · ${new Date(state.checkpoint.savedAt).toLocaleString()} · not booked or confirmed` : 'No review booked or confirmed.';
}

function openChat() {
  chatReturnFocus = document.activeElement;
  $('#mini-panel').hidden = false;
  $('#mini-trigger').setAttribute('aria-expanded', 'true');
  renderChat();
  $('#chat-question').focus();
}
function closeChat() {
  $('#mini-panel').hidden = true;
  $('#mini-trigger').setAttribute('aria-expanded', 'false');
  (chatReturnFocus?.isConnected ? chatReturnFocus : $('#mini-trigger')).focus();
}
function renderChat() {
  const legacy = state.chat.filter((message) => message.v3 !== true);
  const current = state.chat.filter((message) => message.v3 === true);
  const messages = current.length ? current : [{ role: 'assistant', content: `Hi ${profileFirstName()}. Ask me about the workbook, your learning path or a task. If I do not have a reliable source, I'll say so.` }];
  const renderMessage = (message) => {
    const role = message.role === 'user' ? 'user' : message.role === 'error' ? 'error' : 'assistant';
    const sources = Array.isArray(message.sources) ? message.sources.map((source, index) => `<button data-doc="${esc(source.id)}" data-note-open="${source.id?.startsWith('note-') ? esc(source.id) : ''}" aria-label="Open source ${index + 1}: ${esc(source.title)}">[${index + 1}] ${esc(source.title)}</button>`).join('') : '';
    return `<div class="chat-bubble ${role}">${esc(message.content)}${sources ? `<div class="chat-sources">${sources}</div>` : ''}${message.nextAction ? `<span class="chat-next">Next: ${esc(message.nextAction)}</span>` : ''}</div>`;
  };
  $('#chat-messages').innerHTML = `${legacy.length ? `<details class="legacy-chat"><summary>Earlier demo chat · ${legacy.length} messages</summary><p>Earlier answers may mention features removed from Keypee v2.</p>${legacy.map(renderMessage).join('')}</details>` : ''}${messages.map(renderMessage).join('')}`;
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
}
async function checkAI() {
  let needsSignIn = false;
  try {
    const response = await fetch('/api/health');
    const health = await response.json();
    needsSignIn = Boolean(health.authRequiredForAI && !cloudState);
    aiReady = Boolean(health.aiConfigured && !needsSignIn);
  }
  catch { aiReady = false; }
  $('#ai-pill').textContent = aiReady ? 'DeepSeek ready' : needsSignIn ? 'Google sign-in needed' : 'AI setup needed';
  $('#ai-pill').className = `ai-pill ${aiReady ? 'is-ready' : 'is-offline'}`;
  $('#chat-question').disabled = !aiReady;
  $('#chat-send').disabled = !aiReady;
  $('#chat-status').textContent = aiReady ? 'Answers may cite checked workbook excerpts or your local notes.' : needsSignIn ? 'Sign in with Google to chat on the Cloudflare demo.' : 'Ask the Keypee admin to configure DeepSeek.';
  renderKnowledge();
  if ($('#knowledge-search').value.trim()) scheduleKnowledgeAnswer();
}
function relatedNotePayload(question) {
  const tokens = normalize(question).match(/[a-z0-9]{4,}/g) || [];
  return state.notes.filter((note) => tokens.some((token) => normalize(`${note.title} ${note.text}`).includes(token))).slice(0, 3).map((note) => ({ id: note.id, title: note.title, text: note.text }));
}
async function sendQuestion(question, sourceIds = [], inHub = false) {
  if (!aiReady || busy || !question.trim()) return;
  const history = state.chat.filter((item) => item.v3 === true && (item.role === 'user' || (item.role === 'assistant' && item.usedAI))).slice(-12).map(({ role, content }) => ({ role, content }));
  state.chat.push({ role: 'user', content: question, v3: true });
  busy = true;
  $('#chat-send').disabled = true;
  $('#chat-status').textContent = 'Keypee is thinking…';
  if (inHub) { $('#knowledge-answer').hidden = false; $('#knowledge-answer').innerHTML = '<p>Keypee is reading the related excerpts…</p>'; }
  renderChat();
  try {
    const response = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, history, sourceIds, localNotes: relatedNotePayload(question) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Keypee could not answer.');
    state.chat.push({ role: 'assistant', content: result.answer, sources: result.sources || [], nextAction: result.nextAction || '', usedAI: true, v3: true });
    $('#chat-status').textContent = result.sources?.length ? 'Open a numbered source to verify the answer.' : 'AI answered without a workbook citation.';
    if (inHub) {
      $('#knowledge-answer').innerHTML = `<span class="mini-label">KEYPEE SUMMARY · DEEPSEEK</span><p class="source-text">${esc(result.answer)}</p>${result.sources?.length ? `<div class="answer-sources">${result.sources.map((source, index) => `<button class="tiny-button" data-doc="${esc(source.id)}" data-note-open="${source.id.startsWith('note-') ? esc(source.id) : ''}">[${index + 1}] ${esc(source.title)} · ${esc(source.sourceRef)}</button>`).join('')}</div>` : '<p class="small-disclaimer">No checked source was cited. Confirm any company-specific detail before using it.</p>'}<div class="followups"><span>Ask a follow-up:</span><button class="tiny-button" data-followup="What should I verify with the current owner?">What should I verify?</button><button class="tiny-button" data-followup="Explain that more simply.">Explain more simply</button></div>`;
    }
  } catch (error) {
    state.chat.push({ role: 'error', content: error.message, v3: true });
    $('#chat-status').textContent = error.message;
    if (inHub) $('#knowledge-answer').innerHTML = `<p class="error-text">${esc(error.message)}</p><button class="tiny-button" id="retry-hub">Try again</button>`;
  } finally {
    busy = false;
    $('#chat-send').disabled = !aiReady;
    save();
    renderChat();
  }
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  dialog.close();
  const target = id === 'image-dialog' ? zoomReturnFocus : dialogReturnFocus;
  if (target?.isConnected) target.focus();
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.zoomSrc) return openZoom(button.dataset.zoomSrc, button.dataset.zoomTitle || 'Original workbook slide');
  if (button.id === 'zoom-in') return changeZoom(0.5);
  if (button.id === 'zoom-out') return changeZoom(-0.5);
  if (button.dataset.askMaterial) {
    const source = doc(button.dataset.askMaterial);
    if (!source) return;
    closeDialog('doc-dialog');
    openChat();
    return sendQuestion(`Explain the key points in the source "${source.title}" and what I should verify next.`, [source.id]);
  }
  if (button.dataset.view) return showView(button.dataset.view);
  if (button.id === 'reset-demo') {
    dialogReturnFocus = button;
    $('#reset-dialog').showModal();
    $('#reset-confirm').focus();
    return;
  }
  if (button.id === 'reset-confirm') {
    state = { ...fresh, chat: state.chat.filter((message) => message.v3 !== true), lastVisit: new Date().toISOString() };
    save();
    void flushCloudState().then((saved) => {
      if (saved) location.reload();
      else $('#reset-title').textContent = 'Reset could not be saved. Try again.';
    });
    return;
  }
  if (button.matches('#home-continue,#resume-step')) return continueWork();
  if (button.dataset.openChat !== undefined || button.id === 'mini-trigger') return openChat();
  if (button.id === 'mini-close') return closeChat();
  if (button.dataset.closeDialog) return closeDialog(button.dataset.closeDialog);
  if (button.dataset.lesson) { state.selectedLesson = button.dataset.lesson; state.lastPlace = { view: 'learn', lessonId: state.selectedLesson }; save(); return renderLearning(); }
  if (button.dataset.checkinDay) { state.selectedLesson = button.dataset.checkinDay; save(); renderLearning(); $('#eod-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (button.dataset.markRead) { if (!readDone(button.dataset.markRead)) state.read.push(button.dataset.markRead); save(); renderLearning(); renderHome(); return; }
  if (button.dataset.answer !== undefined) {
    const item = lesson(state.selectedLesson);
    state.quizAnswers[item.id] = Number(button.dataset.answer);
    state.quiz[item.id] = Number(button.dataset.answer) === item.check.answer;
    save(); renderLearning(); renderHome(); return;
  }
  if (button.dataset.filter) { filter = button.dataset.filter; renderKnowledge(); return scheduleKnowledgeAnswer(); }
  if (button.dataset.topic) { $('#knowledge-search').value = button.dataset.topic; renderKnowledge(); return scheduleKnowledgeAnswer(0); }
  if (button.dataset.doc) { if (button.dataset.doc.startsWith('note-')) return openNote(button.dataset.doc); return openDoc(button.dataset.doc); }
  if (button.dataset.cell) return openCell(button.dataset.cell);
  if (button.dataset.image) return openImage(button.dataset.image);
  if (button.dataset.noteOpen) return openNote(button.dataset.noteOpen);
  if (button.dataset.noteEdit) return editNote(button.dataset.noteEdit);
  if (button.dataset.noteDelete) { state.notes = state.notes.filter((note) => note.id !== button.dataset.noteDelete); save(); return renderKnowledge(); }
  if (button.id === 'add-knowledge') return editNote();
  if (button.dataset.askSource) {
    const source = doc(button.dataset.askSource);
    return sendQuestion(`Summarise the key points from ${source.title} and what I should verify next.`, [source.id], true);
  }
  if (button.id === 'retry-hub') return scheduleKnowledgeAnswer(0);
  if (button.dataset.followup) { openChat(); $('#chat-question').value = button.dataset.followup; $('#chat-question').focus(); return; }
  if (button.id === 'open-calendar') {
    const item = lesson(state.selectedLesson);
    const saved = state.eod[item?.id];
    const url = item && saved && calendarDraftUrl(item, saved);
    if (!url) { $('#eod-status').textContent = 'Add a valid proposed date and time, then prepare the check-in again.'; return; }
    const calendarWindow = window.open(url, '_blank');
    if (!calendarWindow) { $('#eod-status').textContent = 'Calendar was blocked by your browser. Allow pop-ups and try again.'; return; }
    calendarWindow.opener = null;
    saved.openedAt = new Date().toISOString();
    save(); renderLearning();
    return;
  }
  if (button.id === 'copy-agenda') {
    const item = lesson(state.selectedLesson);
    const saved = state.eod[item?.id];
    if (!item || !saved) return;
    navigator.clipboard.writeText(dayAgenda(item, saved)).then(() => { $('#eod-status').textContent = 'Agenda copied · booking not verified'; }).catch(() => { $('#eod-status').textContent = 'Could not copy agenda. Try again.'; });
    return;
  }
  if (button.id === 'mark-booked') {
    const saved = state.eod[state.selectedLesson];
    if (!saved?.openedAt) { $('#eod-status').textContent = 'Open the Calendar draft first, then mark it booked after saving the event there.'; return; }
    saved.bookedAt = new Date().toISOString();
    save(); renderLearning();
    return;
  }
  if (button.id === 'open-checkpoint') {
    dialogReturnFocus = button;
    const form = $('#checkpoint-form');
    const saved = state.checkpoint?.planName === state.sop.name ? state.checkpoint : {};
    form.elements.summary.value = saved.summary || `${state.sop.name}: ${content.sopTemplates[state.sop.type].label} action plan`;
    form.elements.blocker.value = saved.blocker || Object.values(state.sop.blockers || {}).filter(Boolean).join('; ');
    form.elements.review.value = saved.review || '';
    form.elements.when.value = saved.when || '';
    $('#checkpoint-dialog').showModal();
    form.elements.review.focus();
  }
});
document.addEventListener('change', (event) => {
  if (event.target.dataset.sopStep !== undefined && state.sop) {
    const step = event.target.dataset.sopStep;
    state.sop.done[step] = event.target.checked;
    state.lastPlace = { view: 'tasks', step: Number(step) };
    save(); renderSop(); document.querySelector(`[data-sop-step="${step}"]`)?.focus();
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'knowledge-search') { renderKnowledge(); scheduleKnowledgeAnswer(); }
  if (event.target.dataset.sopBlocker !== undefined && state.sop) { state.sop.blockers[event.target.dataset.sopBlocker] = event.target.value; state.lastPlace = { view: 'tasks', step: Number(event.target.dataset.sopBlocker) }; save(); }
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#mini-panel').hidden) closeChat(); });
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); const question = $('#chat-question').value.trim(); if (!question) return; $('#chat-question').value = ''; sendQuestion(question); });
$('#note-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value || `note-${crypto.randomUUID()}`;
  const note = { id, title: form.elements.title.value.trim(), text: form.elements.text.value.trim(), link: form.elements.link.value.trim() };
  if (!note.title || !note.text) return;
  state.notes = [...state.notes.filter((item) => item.id !== id), note];
  save(); closeDialog('note-dialog'); renderKnowledge();
});
$('#sop-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#sop-name').value.trim();
  const type = $('#sop-type').value;
  if (!name || !content.sopTemplates[type]) return;
  state.sop = { name, type, done: {}, blockers: {}, createdAt: new Date().toISOString() };
  state.lastPlace = { view: 'tasks', step: 0 };
  state.checkpoint = null;
  save(); renderSop();
  $('#sop-plan').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#eod-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const prior = state.eod[state.selectedLesson] || {};
  const when = form.elements.when.value;
  const changed = when !== prior.when;
  state.eod[state.selectedLesson] = { ...prior, learned: form.elements.learned.value.trim(), blocker: form.elements.blocker.value.trim(), review: form.elements.review.value.trim(), when, savedAt: new Date().toISOString(), openedAt: changed ? null : prior.openedAt || null, bookedAt: changed ? null : prior.bookedAt || null };
  save(); renderLearning();
});
$('#eod-form').addEventListener('input', (event) => {
  const saved = state.eod[state.selectedLesson];
  if (!saved?.savedAt) return;
  const form = event.currentTarget;
  const dirty = ['learned', 'blocker', 'review', 'when'].some((name) => form.elements[name].value.trim() !== (saved[name] || ''));
  for (const id of ['open-calendar', 'copy-agenda', 'mark-booked']) $(`#${id}`).disabled = dirty;
  if (dirty) $('#eod-status').textContent = 'Unsaved changes · prepare the check-in again before opening Calendar.';
  else renderLessonDetail();
});
$('#recap-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const saved = state.eod[state.selectedLesson];
  if (!saved?.bookedAt) return;
  saved.recap = form.elements.recap.value.trim();
  saved.next = form.elements.next.value.trim();
  saved.recapAt = new Date().toISOString();
  save(); renderLearning();
});
$('#checkpoint-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  state.checkpoint = { planName: state.sop.name, summary: form.elements.summary.value.trim(), blocker: form.elements.blocker.value.trim(), review: form.elements.review.value.trim(), when: form.elements.when.value, savedAt: new Date().toISOString() };
  save(); closeDialog('checkpoint-dialog'); renderSop();
});
for (const dialog of $$('dialog')) dialog.addEventListener('close', () => {
  const target = dialog.id === 'image-dialog' ? zoomReturnFocus : dialogReturnFocus;
  if (target?.isConnected) target.focus();
});

async function init() {
  try {
    [content, workbook] = await Promise.all([
      fetch('/content.json').then((response) => response.json()),
      fetch('/workbook-sources.json').then((response) => response.json())
    ]);
    renderAll();
    $('#suggested-prompts').innerHTML = ['What can you do?', 'What does normal item status mean?', 'How is available stock calculated?'].map((prompt) => `<button class="tiny-button" data-prompt="${esc(prompt)}">${esc(prompt)}</button>`).join('');
    $('#suggested-prompts').addEventListener('click', (event) => {
      const prompt = event.target.closest('[data-prompt]')?.dataset.prompt;
      if (prompt) { $('#chat-question').value = prompt; $('#chat-question').focus(); }
    });
    await checkAI();
  } catch (error) {
    $('#page-subtitle').textContent = 'Keypee could not load its content. Reload the page to try again.';
    console.error('Keypee init failed:', error);
  }
}
init();
