const setupKey = 'kaypee-onboarding-v1';
const setupRoot = document.getElementById('onboarding');
const setupContent = document.getElementById('onboarding-content');
const teams = ['Listing', 'Pricing', 'Search', 'Campaign Ops', 'Data', 'Engineering', 'Other'];
const positions = ['Product Manager', 'Engineer', 'Data Analyst', 'Operations Specialist', 'Designer', 'Business Analyst'];
const tools = [
  { id: 'confluence', name: 'Confluence', mark: 'C', recommended: true, purpose: 'PRDs, specs and team pages: what was built and why.' },
  { id: 'jira', name: 'Jira', mark: 'J', recommended: true, purpose: 'Tickets and their history: what is open, blocked or shipped.' },
  { id: 'chat', name: 'Team chat', mark: 'T', recommended: true, purpose: 'Group threads where decisions are discussed.' },
  { id: 'gmail', name: 'Gmail', mark: 'G', recommended: false, purpose: 'Selected threads, such as approvals and partner emails.' },
  { id: 'drive', name: 'Google Drive', mark: 'D', recommended: false, purpose: 'Sheets and slides: metrics, analyses and review decks.' },
  { id: 'calendar', name: 'Google Calendar', mark: 'Ca', recommended: false, purpose: 'Recurring meetings, to learn who works with whom.' }
];
const blankSetup = () => ({ step: 1, complete: false, mode: null, name: 'Linh Nguyen', email: 'linh.nguyen@company.com', team: 'Listing', position: 'Product Manager', goal: 'company', selectedTools: [], gmailFilters: ['project', 'people'] });
let setup;
try { setup = { ...blankSetup(), ...JSON.parse(localStorage.getItem(setupKey) || '{}') }; }
catch { setup = blankSetup(); }
let googleClientId = '';
let googleScriptPromise;
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const persistSetup = () => { try { localStorage.setItem(setupKey, JSON.stringify(setup)); } catch { /* Preview still works without storage. */ } };
const firstName = () => setup.name.trim().split(/\s+/)[0] || 'there';

function setupHeader(step) {
  const labels = ['Sign in', 'Profile', 'Your goal', 'Connect'];
  return `<header class="ob-header"><div class="ob-brand"><img class="brand-mark" src="/assets/keypee-mark.svg" alt=""><span>Keypee<span class="ob-brand-dot">.</span></span></div><ol class="ob-steps" aria-label="Setup progress">${labels.map((label, index) => `<li class="${index + 1 === step ? 'current' : index + 1 < step ? 'done' : ''}" ${index + 1 === step ? 'aria-current="step"' : ''}><span>${label}</span><i aria-hidden="true"></i></li>`).join('')}</ol></header>`;
}

function stepOne() {
  return `<div class="ob-signin"><aside class="ob-promise"><div class="ob-brand"><img class="brand-mark" src="/assets/keypee-mark.svg" alt=""><span>Keypee<span class="ob-brand-dot">.</span></span></div><div><h2>Nobody should start a new role with no map.</h2><ul><li>Get the full context in days, not weeks</li><li>Answers that show their sources</li><li>Your next step, one click away</li></ul></div><small>Internal concept demo · Shopee</small></aside><main class="ob-signin-main"><div class="ob-signin-card"><div class="ob-brand ob-mobile-brand"><img class="brand-mark" src="/assets/keypee-mark.svg" alt=""><span>Keypee<span class="ob-brand-dot">.</span></span></div><span class="ob-kicker">Step 1 of 4 · about 2 minutes</span><h1>Sign in with Google</h1><p>Use your Google account to set up your Keypee profile.</p>${googleClientId ? '<div id="google-button" class="ob-google-slot"></div>' : ''}<p id="google-status" class="ob-status" role="status">${googleClientId ? 'Choose your Google account to continue.' : 'Google sign-in needs a Google OAuth client ID. You can preview the setup below.'}</p>${googleClientId ? '<div class="ob-divider"><span>or</span></div>' : ''}<button type="button" class="ob-button ob-button-secondary ob-full" data-ob-action="demo">Preview with a demo profile</button><div class="ob-note"><strong>Preview mode.</strong> Your sample profile stays in this browser. No company systems are accessed.</div></div></main></div>`;
}

function stepTwo() {
  const verified = setup.mode === 'google';
  return `${setupHeader(2)}<main class="ob-main ob-narrow"><div class="ob-intro"><span class="ob-kicker">Step 2 of 4</span><h1>Hi ${safe(firstName())}, is this you?</h1><p>${verified ? 'We used your Google profile. Check the team and position below.' : 'This is a sample profile for the demo. Fix anything that is wrong.'}</p></div><section class="ob-card ob-profile"><div class="ob-identity"><span class="ob-avatar" aria-hidden="true">${safe(firstName().charAt(0).toUpperCase())}</span><div><strong>${safe(setup.name)}</strong><small>${safe(setup.email)} · ${verified ? 'Google account' : 'Demo profile'}</small></div><span class="ob-badge ${verified ? 'ob-badge-green' : ''}">${verified ? 'Google verified' : 'Demo'}</span></div><fieldset><legend>Team</legend><div class="ob-chips">${teams.map((team) => `<button type="button" class="ob-chip" data-ob-team="${safe(team)}" aria-pressed="${team === setup.team}">${safe(team)}</button>`).join('')}</div></fieldset><label class="ob-field">Position<select id="ob-position">${positions.map((position) => `<option value="${safe(position)}" ${position === setup.position ? 'selected' : ''}>${safe(position)}</option>`).join('')}</select></label><div class="ob-info">We'll tailor your workspace for a <strong>${safe(setup.position)}</strong> in <strong>${safe(setup.team)}</strong>: the learning material, workflows and next steps most relevant to you.</div></section><div class="ob-actions"><button type="button" class="ob-button ob-button-secondary" data-ob-back>Back</button><button type="button" class="ob-button ob-button-primary" data-ob-next>Looks right, continue</button></div></main>`;
}

function stepThree() {
  const options = [
    { title: "I'm new to the company", desc: 'Learn how things work here, from tools to ways of working.', active: true },
    { title: "I'm new to this team", desc: "Get up to speed on the team's work, people and terms." },
    { title: "I'm taking over a project", desc: 'Get the full context the previous owner had.' },
    { title: 'I just need help with a task', desc: 'Find a process, a doc or the right person, fast.' }
  ];
  return `${setupHeader(3)}<main class="ob-main ob-goal"><div class="ob-intro"><span class="ob-kicker">Step 3 of 4</span><h1>What brings you here today?</h1><p>Pick the closest one. We'll put the right things first on your home.</p></div><fieldset class="ob-goals"><legend>Your situation</legend><div class="ob-goal-grid">${options.map((option) => `<button type="button" class="ob-goal-card ${option.active ? 'selected' : ''}" ${option.active ? 'aria-pressed="true"' : 'disabled'}><span class="ob-radio" aria-hidden="true"></span><span><strong>${safe(option.title)}</strong><small>${safe(option.desc)}</small>${option.active ? '' : '<em>Coming soon</em>'}</span></button>`).join('')}</div></fieldset><div class="ob-actions"><button type="button" class="ob-button ob-button-secondary" data-ob-back>Back</button><button type="button" class="ob-button ob-button-primary" data-ob-next>Next: connect your tools</button></div></main>`;
}

function toolCard(tool) {
  const selected = setup.selectedTools.includes(tool.id);
  return `<div class="ob-tool ${selected ? 'selected' : ''}"><span class="ob-tool-mark ob-tool-${tool.id}" aria-hidden="true">${tool.mark}</span><div class="ob-tool-copy"><div><strong>${tool.name}</strong>${tool.recommended ? '<span class="ob-badge">Recommended</span>' : ''}<span class="ob-badge ob-neutral">Demo only</span></div><p>${tool.purpose}</p></div><button type="button" class="ob-button ${selected ? 'ob-button-selected' : 'ob-button-secondary'}" data-ob-tool="${tool.id}" aria-pressed="${selected}">${selected ? 'Selected' : 'Choose'}</button></div>`;
}

function stepFour() {
  const count = setup.selectedTools.length;
  return `${setupHeader(4)}<main class="ob-main ob-connect"><div class="ob-connect-left"><div class="ob-intro"><span class="ob-kicker">Step 4 of 4 · last one</span><h1>Connect the tools where your work lives</h1><p>Choose sources you may want later. This demo records preferences only; it does not request access or read your data.</p></div><div class="ob-count"><div><strong>${count} of ${tools.length} tools selected for demo</strong><div class="ob-meter"><span style="width:${Math.round(count / tools.length * 100)}%"></span></div></div><button type="button" class="ob-button ob-button-tint" data-ob-recommended>Choose all recommended</button></div><section class="ob-tool-list" aria-label="Tools">${tools.map(toolCard).join('')}</section>${setup.selectedTools.includes('gmail') ? `<section class="ob-card ob-gmail"><h2>Choose which Gmail to include</h2><p>Demo filters only. No emails are read.</p><label><input type="checkbox" data-ob-filter="project" ${setup.gmailFilters.includes('project') ? 'checked' : ''}> Threads mentioning “Price Label Revamp”</label><label><input type="checkbox" data-ob-filter="people" ${setup.gmailFilters.includes('people') ? 'checked' : ''}> Emails from Hoa, Tuan and Minh</label><label><input type="checkbox" data-ob-filter="pricing" ${setup.gmailFilters.includes('pricing') ? 'checked' : ''}> Everything with the label “Pricing”</label></section>` : ''}<div class="ob-actions"><button type="button" class="ob-button ob-button-secondary" data-ob-back>Back</button><div><button type="button" class="ob-button ob-button-text" data-ob-finish>Skip for now</button><button type="button" class="ob-button ob-button-primary" data-ob-finish>Build my workspace</button></div></div></div><aside class="ob-connect-side"><section class="ob-side-green"><h2>How your data is handled</h2><p><strong>Demo only.</strong> Selecting tools here saves a browser preference. It does not grant Keypee access.</p><p><strong>Google sign-in.</strong> If configured, it verifies your identity only. Gmail, Drive and Calendar require separate consent before they can be read.</p><p><strong>Your call.</strong> You can revisit this setup from the app sidebar.</p></section><section class="ob-card"><h2>What each source adds</h2><p><strong>Docs</strong> explain what was built.</p><p><strong>Tickets</strong> show what's in progress and what broke.</p><p><strong>Chats and email</strong> hold the why behind decisions.</p><p><strong>Calendar</strong> shows recurring meetings and collaborators.</p></section></aside></main>`;
}

function renderSetup() {
  document.body.classList.remove('onboarding-loading');
  const open = !setup.complete;
  document.body.classList.toggle('onboarding-open', open);
  setupRoot.hidden = !open;
  if (!open) { setupContent.innerHTML = ''; updateAppProfile(); return; }
  setupContent.innerHTML = [stepOne, stepTwo, stepThree, stepFour][setup.step - 1]();
  if (setup.step === 1 && googleClientId) renderGoogleButton();
  setupContent.querySelector('h1')?.focus?.();
}

function updateAppProfile() {
  if (!setup.complete) return;
  const name = firstName();
  const persona = document.getElementById('persona-name');
  const role = document.getElementById('persona-role');
  const avatar = document.querySelector('.persona-avatar');
  if (persona) persona.textContent = setup.name;
  if (role) role.textContent = `${setup.position} · ${setup.team}`;
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  const title = document.getElementById('page-title');
  if (title?.textContent.startsWith('Hey ')) title.textContent = `Hey ${name}, welcome.`;
  const page = document.querySelector('.view.is-active');
  if (page?.id === 'home' && title) title.textContent = `Hey ${name}, welcome.`;
}

function goSetup(step) {
  setup.step = step;
  setup.complete = false;
  persistSetup();
  renderSetup();
  window.scrollTo(0, 0);
}

function finishSetup() {
  setup.complete = true;
  setup.step = 4;
  persistSetup();
  renderSetup();
  if (typeof renderHome === 'function' && typeof content !== 'undefined' && content) renderHome();
  if (typeof renderChat === 'function') renderChat();
  document.getElementById('home-continue')?.focus();
}

function loadGoogleScript() {
  if (!googleScriptPromise) googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Google sign-in could not load.'));
    document.head.append(script);
  });
  return googleScriptPromise;
}

async function renderGoogleButton() {
  const status = document.getElementById('google-status');
  try {
    await loadGoogleScript();
    if (!document.getElementById('google-button') || setup.step !== 1) return;
    google.accounts.id.initialize({ client_id: googleClientId, callback: onGoogleCredential, ux_mode: 'popup' });
    google.accounts.id.renderButton(document.getElementById('google-button'), { theme: 'outline', size: 'large', text: 'signin_with', width: 340 });
  } catch { if (status) status.textContent = 'Google sign-in could not load. Try again later or preview the setup.'; }
}

async function onGoogleCredential(response) {
  const status = document.getElementById('google-status');
  if (status) status.textContent = 'Verifying your Google account…';
  try {
    const result = await fetch('/api/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ credential: response.credential }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'Google sign-in failed.');
    setup.mode = 'google';
    setup.name = data.profile.name;
    setup.email = data.profile.email;
    await activateGoogleState();
    goSetup(2);
  } catch (error) { if (status) status.textContent = error.message; }
}

setupRoot.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.obAction === 'demo') { activateDemoState(); setup.mode = 'demo'; setup.name = 'Linh Nguyen'; setup.email = 'linh.nguyen@company.com'; return goSetup(2); }
  if (button.hasAttribute('data-ob-back')) return goSetup(Math.max(1, setup.step - 1));
  if (button.hasAttribute('data-ob-next')) return goSetup(Math.min(4, setup.step + 1));
  if (button.hasAttribute('data-ob-finish')) return finishSetup();
  if (button.dataset.obTeam) { setup.team = button.dataset.obTeam; persistSetup(); return renderSetup(); }
  if (button.dataset.obTool) { const id = button.dataset.obTool; setup.selectedTools = setup.selectedTools.includes(id) ? setup.selectedTools.filter((item) => item !== id) : [...setup.selectedTools, id]; persistSetup(); return renderSetup(); }
  if (button.hasAttribute('data-ob-recommended')) { setup.selectedTools = [...new Set([...setup.selectedTools, ...tools.filter((tool) => tool.recommended).map((tool) => tool.id)])]; persistSetup(); return renderSetup(); }
});
setupRoot.addEventListener('change', (event) => {
  if (event.target.id === 'ob-position') { setup.position = event.target.value; persistSetup(); renderSetup(); }
  if (event.target.dataset.obFilter) { const id = event.target.dataset.obFilter; setup.gmailFilters = event.target.checked ? [...new Set([...setup.gmailFilters, id])] : setup.gmailFilters.filter((item) => item !== id); persistSetup(); }
});
document.getElementById('edit-setup').addEventListener('click', () => goSetup(setup.mode === 'google' ? 2 : 1));
document.getElementById('edit-setup-mobile').addEventListener('click', () => goSetup(setup.mode === 'google' ? 2 : 1));
document.querySelectorAll('[data-sign-out]').forEach((button) => button.addEventListener('click', async () => {
  const buttons = [...document.querySelectorAll('[data-sign-out]')];
  buttons.forEach((item) => { item.disabled = true; item.textContent = 'Signing out…'; });
  try {
    if (setup.mode === 'google') {
      if (!(await flushCloudState())) throw new Error('Your latest activity was not saved. Try signing out again after sync recovers.');
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Sign-out failed. Please try again.');
      if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    }
    localStorage.removeItem(setupKey);
    location.reload();
  } catch (error) {
    const status = document.getElementById('sync-status');
    if (status) { status.hidden = false; status.textContent = error.message; }
    buttons.forEach((item) => { item.disabled = false; item.textContent = 'Sign out'; });
  }
}));

async function initSetup() {
  try {
    const config = await fetch('/api/auth/config').then((response) => response.json());
    googleClientId = config.googleClientId || '';
    if (setup.mode === 'google') {
      const session = await fetch('/api/auth/session', { credentials: 'same-origin' }).then((response) => response.json());
      if (!session.authenticated || session.profile.email !== setup.email) { setup = blankSetup(); persistSetup(); }
      else await activateGoogleState();
    }
  } catch { if (setup.mode === 'google') { setup = blankSetup(); persistSetup(); } }
  renderSetup();
}
initSetup();
