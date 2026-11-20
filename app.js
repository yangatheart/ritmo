(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'ritmo-demand-research-v1';
  const ACTIVE = 'ritmo-demand-participant-v1';
  const SESSION = 'ritmo-session-v1';
  // Bump whenever the page stimulus changes, so results from different page versions never mix.
  const VARIANT = 'ritmo-v7';
  const SIGNED_UP = `ritmo-signed-up-${VARIANT}`;
  const VIEWED = `ritmo-viewed-${VARIANT}`;
  const PAIN_KEYS = ['H1', 'H2', 'H3'];
  // Same rule as the Apps Script backend: first character alphanumeric, so Sheets never reads it as a formula.
  const EMAIL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._%+'-]*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const mode = demo ? 'demo' : 'public';

  // ---- Configuration (signup-config.js) -------------------------------------------------
  const config = window.RITMO_SIGNUP || {};
  const endpoint = (() => {
    try {
      const url = new URL(config.endpoint || '');
      return url.protocol === 'https:' && url.hostname === 'script.google.com' && /^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname) ? url.href : null;
    } catch { return null; }
  })();
  const contactEmail = typeof config.contactEmail === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(config.contactEmail.trim()) ? config.contactEmail.trim() : '';
  const deleteBy = typeof config.deleteBy === 'string' ? config.deleteBy.trim().slice(0, 60) : '';
  const signupReady = Boolean(endpoint && contactEmail && deleteBy);

  // ---- Storage helpers (every access may throw in private modes) --------------------------
  const safeGet = (store, key) => { try { return store.getItem(key); } catch { return null; } };
  const safeSet = (store, key, value) => { try { store.setItem(key, value); return true; } catch { return false; } };
  const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

  let publicSid = safeGet(sessionStorage, SESSION);
  if (!publicSid) { publicSid = randomId(); safeSet(sessionStorage, SESSION, publicSid); }

  // In-person research data (demo panel). Never contains email addresses.
  let data = { version: 1, participants: [] };
  let participantId = null;
  let storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.version === 1 && Array.isArray(saved.participants)) data = saved;
    participantId = sessionStorage.getItem(ACTIVE);
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { storageAvailable = false; }
  const persist = () => {
    if (!storageAvailable) throw new Error('Storage unavailable');
    localStorage.setItem(KEY, JSON.stringify(data));
    if (participantId) sessionStorage.setItem(ACTIVE, participantId);
  };
  const current = () => data.participants.find(p => p.id === participantId && p.variant === VARIANT);
  const sid = () => (demo && participantId ? participantId : publicSid);
  let publicSignedUp = safeGet(localStorage, SIGNED_UP) === 'yes';
  const isSignedUp = () => (demo ? Boolean(current()?.signedUpAt) : publicSignedUp);

  // ---- Backend ------------------------------------------------------------------------
  // text/plain keeps this a "simple" CORS request, so Apps Script needs no preflight.
  const send = (payload, keepalive = false) => fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, sid: sid(), variant: VARIANT, mode }),
    keepalive
  });
  const track = (type, extra = {}) => { if (endpoint) send({ type, ...extra }, true).catch(() => {}); };

  // ---- Copy that depends on configuration ----------------------------------------------
  const mailLink = () => { const a = document.createElement('a'); a.href = `mailto:${contactEmail}`; a.textContent = contactEmail; return a; };
  if (signupReady) {
    $('consent-text').replaceChildren(
      `I agree that the Ritmo student team may email me about Ritmo’s progress, at most once. My email is stored in a private Google Sheet and deleted by ${deleteBy}. To remove it sooner, contact `,
      mailLink(), '.'
    );
    $('footer-privacy').replaceChildren(`Emails are used only for Ritmo updates and deleted by ${deleteBy}. Questions or removal: `, mailLink(), '.');
  }

  // ---- Dialog -------------------------------------------------------------------------
  const dialog = $('thanks-dialog');
  const form = $('signup-form');
  const emailInput = $('signup-email');
  const consentBox = $('signup-consent');
  const submitButton = $('signup-submit');
  const painRadios = [...document.querySelectorAll('input[name="pain"]')];
  let busy = false;
  let selectedPain = null;

  const setStatus = (message, isError = false) => {
    const status = $('signup-status');
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };
  const showStep = step => {
    const feedback = step === 'feedback';
    $('step-email').hidden = feedback;
    $('step-feedback').hidden = !feedback;
    dialog.setAttribute('aria-labelledby', feedback ? 'feedback-title' : 'signup-title');
  };
  const openDialog = () => {
    showStep(isSignedUp() ? 'feedback' : 'email');
    emailInput.removeAttribute('aria-invalid');
    consentBox.removeAttribute('aria-invalid');
    if (!signupReady && !isSignedUp()) {
      setStatus(demo ? 'Email signup is not connected yet: fill in signup-config.js.' : 'Email signup is temporarily unavailable. Please try again later.', true);
      submitButton.disabled = true;
    } else {
      setStatus('');
      submitButton.disabled = false;
    }
    if (!dialog.open) dialog.showModal();
    $(isSignedUp() ? 'feedback-title' : 'signup-title').focus();
  };

  const showPainResponse = key => {
    $('response-kicker').textContent = 'OPTIONAL FEEDBACK SAVED';
    $('response-title').textContent = 'Thank you. That helps.';
    $('response-copy').textContent = 'Your email was saved before this answer. You can close this window whenever you like.';
    const panel = $('pain-response');
    panel.classList.add('is-visible');
    panel.setAttribute('data-outcomes', key);
  };
  const clearPain = () => {
    painRadios.forEach(radio => { radio.checked = false; });
    $('pain-response').classList.remove('is-visible');
    ['response-kicker', 'response-title', 'response-copy'].forEach(id => { $(id).textContent = ''; });
  };
  const selectPain = (key, explicit = true) => {
    if (!PAIN_KEYS.includes(key)) return;
    if (explicit && !isSignedUp()) { clearPain(); return; }
    painRadios.forEach(radio => { radio.checked = radio.value === key; });
    showPainResponse(key);
    if (!explicit) return;
    selectedPain = key;
    track('pain', { pain: key });
    const p = current();
    if (demo && p && storageAvailable) { p.pain = key; try { persist(); } catch { storageAvailable = false; render(); } }
  };

  const resetForm = () => {
    form.reset();
    emailInput.removeAttribute('aria-invalid');
    consentBox.removeAttribute('aria-invalid');
    setStatus('');
  };
  const completeSignup = () => {
    if (demo) {
      const p = current();
      if (p) { p.signedUpAt = new Date().toISOString(); try { persist(); } catch { storageAvailable = false; } }
    } else {
      publicSignedUp = true;
      safeSet(localStorage, SIGNED_UP, 'yes');
    }
    resetForm(); // the address leaves the page as soon as it is saved
    showStep('feedback');
    $('feedback-title').focus();
    $('interest-status').textContent = 'You’re on the list. Thank you.';
    render();
  };

  const signupErrors = {
    bad_email: 'Please check your email address.',
    no_consent: 'Please tick the box to agree, so we can email you.',
    busy: 'Lots of people at once. Please try again in a moment.'
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const email = emailInput.value.trim();
    emailInput.removeAttribute('aria-invalid');
    consentBox.removeAttribute('aria-invalid');
    if (!signupReady) { setStatus('Email signup is not connected yet.', true); return; }
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      emailInput.setAttribute('aria-invalid', 'true');
      setStatus('Please enter a valid email address.', true);
      emailInput.focus();
      return;
    }
    if (!consentBox.checked) {
      consentBox.setAttribute('aria-invalid', 'true');
      setStatus(signupErrors.no_consent, true);
      consentBox.focus();
      return;
    }
    busy = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = 'Saving…';
    setStatus('Saving your email…');
    try {
      const response = await send({ type: 'signup', email, consent: true, hp: form.elements.company.value || '' });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'failed');
      completeSignup();
    } catch (error) {
      setStatus(signupErrors[error.message] || 'We couldn’t save your email. Please check your connection and try again.', true);
      if (error.message === 'bad_email') { emailInput.setAttribute('aria-invalid', 'true'); emailInput.focus(); }
    } finally {
      busy = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent = 'Notify me';
    }
  });

  // ---- Page state -------------------------------------------------------------------
  const render = () => {
    const participants = data.participants.filter(p => p.variant === VARIANT);
    const clicked = participants.filter(p => p.clickedAt).length;
    const signed = participants.filter(p => p.signedUpAt).length;
    $('shown-count').textContent = participants.length;
    $('click-count').textContent = clicked;
    $('signup-count').textContent = signed;
    $('rate-count').textContent = clicked ? `${Math.round(signed / clicked * 100)}%` : '—';
    $('endpoint-status').textContent = signupReady ? 'Signup connected to Google Sheets.' : 'Signup not connected: fill in endpoint, contactEmail and deleteBy in signup-config.js.';
    const p = current();
    $('participant-status').textContent = p
      ? (p.signedUpAt ? 'Current participant: email saved.' : p.clickedAt ? 'Current participant: clicked, no email yet.' : 'Current participant: presenting. A non-click is retained.')
      : 'Start a participant before presenting.';
    $('interest-button').textContent = isSignedUp() ? 'You’re on the list' : 'Notify me when it launches';
    if (demo && !storageAvailable) {
      $('next-participant').disabled = true;
      $('export-results').disabled = true;
    }
  };
  const newParticipant = () => {
    // Every participant starts clean; earlier answers never carry over.
    selectedPain = null;
    clearPain();
    resetForm();
    showStep('email');
    participantId = randomId();
    data.participants.push({ id: participantId, shownAt: new Date().toISOString(), clickedAt: null, signedUpAt: null, variant: VARIANT, pain: null });
    persist();
    track('view');
    $('interest-status').textContent = '';
    render();
  };

  $('interest-button').addEventListener('click', () => {
    if (demo) {
      try {
        if (!current()) newParticipant();
        const p = current();
        if (!p.clickedAt) p.clickedAt = new Date().toISOString();
        persist();
      } catch {
        storageAvailable = false;
        $('interest-status').textContent = 'This device cannot save the local tally. The Google Sheet still records the response.';
      }
    }
    track('click');
    render();
    openDialog();
  });
  $('dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  painRadios.forEach(radio => radio.addEventListener('change', () => { if (radio.checked) selectPain(radio.value); }));

  // ---- In-person research panel ------------------------------------------------------
  $('demo-panel').hidden = !demo;
  $('collapse-demo').addEventListener('click', () => {
    const body = $('demo-body');
    body.hidden = !body.hidden;
    $('collapse-demo').textContent = body.hidden ? '+' : '−';
    $('collapse-demo').setAttribute('aria-label', body.hidden ? 'Expand research panel' : 'Collapse research panel');
  });
  $('next-participant').addEventListener('click', () => {
    try { newParticipant(); dialog.close(); window.scrollTo({ top: 0, behavior: 'instant' }); }
    catch { storageAvailable = false; render(); }
  });
  $('export-results').addEventListener('click', () => {
    const header = 'anonymous_participant_id,presented_at,clicked_at,email_saved_at,clicked,email_saved,page_variant,selected_pain';
    const rows = data.participants.map(p => {
      const clickedAt = p.clickedAt || p.interestedAt || '';
      return [p.id, p.shownAt, clickedAt, p.signedUpAt || '', clickedAt ? 'yes' : 'no', p.signedUpAt ? 'yes' : 'no', p.variant || 'original-v1', p.pain || ''].join(',');
    });
    const url = URL.createObjectURL(new Blob([[header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ritmo-interest-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ---- Startup ------------------------------------------------------------------------
  selectedPain = demo ? current()?.pain || null : null;
  if (selectedPain) selectPain(selectedPain, false);
  if (!demo && safeGet(sessionStorage, VIEWED) !== 'yes') { track('view'); safeSet(sessionStorage, VIEWED, 'yes'); }

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-motion');
    const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } }); }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }
  const progress = document.querySelector('.reading-progress');
  const updateProgress = () => { const height = document.documentElement.scrollHeight - innerHeight; progress.style.width = `${height > 0 ? scrollY / height * 100 : 0}%`; };
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress(); render();
})();
