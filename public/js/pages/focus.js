// Focus mode: one exercise per screen, dark, big numbers. Then the cool-down stretch.
(function () {
  const GL = window.GL;
  const { $, esc, api } = GL;

  const id = Number(GL.params().get('id'));
  let w = null;          // workout from the server
  let settings = null;
  let i = 0;             // which exercise we're on
  let phase = 'lift';    // lift | finish | stretch | done
  let restEndsAt = null; // rest timer
  let restTimer = null;
  let busy = false;

  const page = () => $('#page');
  const setsFor = (exId) => w.sets.filter((s) => s.exerciseId === exId);

  async function load() {
    if (!id) { location.href = '/'; return; }
    try {
      [w, settings] = await Promise.all([api(`/workouts/${id}`), api('/settings')]);
      // Pick up where you left off: first exercise that still has sets to do.
      i = w.plan.findIndex((it) => setsFor(it.exerciseId).length < it.sets);
      if (w.finishedAt) phase = w.stretches.length || !w.stretchKey ? 'done' : 'finish';
      else if (i === -1) i = w.plan.length - 1;
      GL.Stretch.keepAwake();
      render();
    } catch (err) {
      page().innerHTML = `<p>${esc(err.message)}</p><a class="f-link" href="/">Back to home</a>`;
    }
  }

  function render() {
    stopRest();
    if (phase === 'lift') return w.plan[i].isTimed ? renderTimed() : renderLift();
    if (phase === 'finish') return renderFinish();
    if (phase === 'stretch') return renderStretch();
    return renderDone();
  }

  function top(right) {
    return `
      <div class="focus-top">
        <button class="f-close" id="f-exit" aria-label="Leave focus mode">${GL.icon.x(20)}</button>
        <div class="segs" style="grid-template-columns:repeat(${w.plan.length}, minmax(0, 1fr))">
          ${w.plan.map((it, k) => {
            const full = setsFor(it.exerciseId).length >= it.sets;
            const cls = phase !== 'lift' || full ? 'done' : k === i ? 'now' : '';
            return `<span class="${cls}"></span>`;
          }).join('')}
        </div>
        <span class="count">${right}</span>
      </div>`;
  }

  function equipmentLine(it) {
    const wt = it.weight;
    if (it.equipment === 'Band') return 'Resistance band · pick the one that makes the last reps hard';
    if (it.isBodyweight) return it.equipment === 'Body weight' ? 'Body weight' : esc(it.equipment);
    if (wt == null) return esc(it.equipment);
    if (it.equipment === 'Barbell') {
      const side = GL.platesPerSide(wt, settings.barWeight, settings.plates);
      if (!side) return `Can't make ${GL.num(wt)} exactly with your plates`;
      if (!side.length) return 'Empty bar';
      return `Each side ${side.map((p) => `<span class="plate">${GL.num(p)}</span>`).join('')}`;
    }
    if (it.equipment === 'Dumbbells') return `Pair of ${GL.num(wt)}s`;
    if (it.equipment === 'Cable' || it.equipment === 'Machine') return `${esc(it.equipment)} · set the pin at ${GL.num(wt)}`;
    return esc(it.equipment);
  }

  function renderLift() {
    const it = w.plan[i];
    const done = setsFor(it.exerciseId).length;
    const all = done >= it.sets;
    const last = i === w.plan.length - 1;
    const step = settings.units === 'kg' ? 2.5 : 5;

    const dots = [];
    for (let k = 0; k < Math.max(it.sets, done); k++) {
      const cls = k < done ? 'done' : k === done ? 'now' : '';
      dots.push(`<span class="f-dot ${cls}">${k < done ? GL.icon.check(18) : k + 1}</span>`);
    }

    let message;
    if (all) message = `<p class="f-msg good">All sets done. Nice work.</p>`;
    else if (restEndsAt) message = `<div><p class="f-rest" id="rest-clock">${GL.clock(restLeft())}</p><p class="f-msg">Rest, then set ${done + 1} of ${it.sets}</p></div>`;
    else message = `<p class="f-msg">Set ${done + 1} of ${it.sets} · rest ${GL.clock(it.restSeconds)} between sets</p>`;

    page().innerHTML = `
      ${top(`${i + 1} / ${w.plan.length}`)}
      <div class="f-body">
        <div style="padding-top:18px">
          <p class="f-kicker">Exercise ${i + 1} of ${w.plan.length}</p>
          <h1 class="f-title">${esc(it.name)}</h1>
        </div>
        <div class="f-card">
          <div class="f-numbers">
            <div><p class="big">${it.sets}</p><p class="lbl">Sets</p></div>
            <div><p class="big">${it.reps}</p><p class="lbl">Reps</p></div>
            <div><p class="big weight">${it.isBodyweight ? (it.equipment === 'Band' ? 'Band' : 'BW') : it.weight == null ? '—' : GL.num(it.weight)}</p><p class="lbl">${it.isBodyweight ? '&nbsp;' : settings.units}</p></div>
          </div>
          <div class="f-equip">${equipmentLine(it)}</div>
        </div>
        <div class="f-adjust" role="group" aria-label="Adjust">
          ${it.isBodyweight ? '' : `<button data-adj="w:-${step}">−${step} ${settings.units}</button><button data-adj="w:${step}">+${step} ${settings.units}</button>`}
          <button data-adj="r:-1">−1 rep</button><button data-adj="r:1">+1 rep</button>
        </div>
        <div class="f-dots">${dots.join('')}</div>
        ${message}
      </div>
      <div class="f-actions">
        <button class="f-primary ${all ? 'green' : ''}" id="f-main">${all ? (last ? 'Finish workout' : 'Next exercise ›') : `Done set ${done + 1}`}</button>
        <div class="f-secondary-row">
          <button class="f-link" id="f-prev" ${i === 0 ? 'style="visibility:hidden"' : ''}>‹ Previous</button>
          ${restEndsAt && !all ? '<button class="f-link" id="f-skip-rest">Skip rest</button>' : `<button class="f-link" id="f-undo" ${done ? '' : 'style="visibility:hidden"'}>Undo set</button>`}
          <button class="f-link" id="f-skip">${last ? 'Finish ›' : 'Skip ›'}</button>
        </div>
      </div>`;

    $('#f-exit').addEventListener('click', () => {
      if (confirm('Leave focus mode? Your sets are saved and you can resume from the dashboard.')) location.href = '/';
    });
    $('#f-main').addEventListener('click', () => (all ? next() : logSet()));
    $('#f-prev').addEventListener('click', () => { i = Math.max(0, i - 1); restEndsAt = null; resetTimer(); render(); });
    $('#f-skip').addEventListener('click', next);
    const undo = $('#f-undo');
    if (undo) undo.addEventListener('click', undoSet);
    const skipRest = $('#f-skip-rest');
    if (skipRest) skipRest.addEventListener('click', () => { restEndsAt = null; render(); });
    document.querySelectorAll('[data-adj]').forEach((b) => b.addEventListener('click', () => {
      const [k, d] = b.dataset.adj.split(':');
      if (k === 'w') it.weight = Math.max(0, Math.round(((it.weight || 0) + Number(d)) * 100) / 100);
      else it.reps = Math.max(1, it.reps + Number(d));
      renderLift();
      if (restEndsAt) startRestTick();
    }));
    if (restEndsAt && !all) startRestTick();
  }

  const restLeft = () => Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));

  function startRestTick() {
    stopRest();
    restTimer = setInterval(() => {
      const left = restLeft();
      const el = document.getElementById('rest-clock');
      if (el) el.textContent = GL.clock(left);
      if (left <= 0) {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        beep(880, 200);
        restEndsAt = null;
        render();
      }
    }, 250);
  }
  function stopRest() { clearInterval(restTimer); restTimer = null; }

  async function logSet() {
    if (busy) return;
    busy = true;
    const it = w.plan[i];
    try {
      const weight = it.isBodyweight ? null : it.weight;
      const res = await api(`/workouts/${w.id}/sets`, { method: 'POST', body: { exerciseId: it.exerciseId, weight, reps: it.reps } });
      w.sets.push({ id: res.id, exerciseId: it.exerciseId, setNumber: res.setNumber, weight, reps: it.reps });
      const done = setsFor(it.exerciseId).length;
      restEndsAt = done < it.sets && it.restSeconds > 0 ? Date.now() + it.restSeconds * 1000 : null;
      render();
    } catch (err) { GL.fail(err); }
    busy = false;
  }


  // ================= Timed exercises (plank, wall sit...) =================
  // t.state: idle -> lead (3-2-1) -> run -> (paused) -> logs the set, then the rest timer starts.
  const LEAD = 3;
  const t = { state: 'idle', target: null, left: 0, endsAt: 0, tick: null, lastWhole: null };
  let audio = null;

  function beep(freq = 880, ms = 120) {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.25, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + ms / 1000);
    } catch (e) { /* no sound available */ }
  }

  function resetTimer() {
    clearInterval(t.tick);
    t.tick = null;
    t.state = 'idle';
    t.target = null;
  }

  const ringC = 2 * Math.PI * 96;

  function timerView(it) {
    const target = t.target ?? it.seconds;
    let val = GL.clock(target);
    let sub = 'Tap Start when ready';
    let frac = 1;
    if (t.state === 'lead') { val = String(t.left); sub = 'Get in position'; }
    if (t.state === 'run') { val = GL.clock(t.left); sub = 'Hold it'; frac = t.left / target; }
    if (t.state === 'paused') { val = GL.clock(t.left); sub = 'Paused'; frac = t.left / target; }
    return `
      <div class="f-timer">
        <div class="f-ring ${t.state === 'lead' ? 'lead' : ''}">
          <svg viewBox="0 0 220 220" aria-hidden="true">
            <circle cx="110" cy="110" r="96" fill="none" stroke="#2E3933" stroke-width="12"></circle>
            <circle id="t-arc" cx="110" cy="110" r="96" fill="none" stroke="${t.state === 'lead' ? '#E0A75E' : '#6FA383'}" stroke-width="12"
              stroke-linecap="round" stroke-dasharray="${ringC}" stroke-dashoffset="${ringC * (1 - frac)}"></circle>
          </svg>
          <div class="val" role="timer" aria-live="off"><span id="t-val">${val}</span><small id="t-sub">${sub}</small></div>
        </div>
      </div>`;
  }

  function renderTimed() {
    const it = w.plan[i];
    const done = setsFor(it.exerciseId).length;
    const all = done >= it.sets;
    const last = i === w.plan.length - 1;
    const target = t.target ?? it.seconds;
    const step = settings.units === 'kg' ? 2.5 : 5;
    const busyTimer = t.state === 'lead' || t.state === 'run' || t.state === 'paused';

    const dots = [];
    for (let k = 0; k < Math.max(it.sets, done); k++) {
      const cls = k < done ? 'done' : k === done ? 'now' : '';
      dots.push(`<span class="f-dot ${cls}">${k < done ? GL.icon.check(18) : k + 1}</span>`);
    }

    let primary;
    if (all) primary = `<button class="f-primary green" id="f-main">${last ? 'Finish workout' : 'Next exercise ›'}</button>`;
    else if (t.state === 'idle') primary = `<button class="f-primary" id="f-main">${GL.icon.play(18)}&nbsp; Start set ${done + 1} · ${GL.secs(target)}</button>`;
    else if (t.state === 'paused') primary = `<button class="f-primary" id="f-main">${GL.icon.play(18)}&nbsp; Resume</button>`;
    else if (t.state === 'lead') primary = `<button class="f-primary" id="f-main">Cancel</button>`;
    else primary = `<button class="f-primary" id="f-main">${GL.icon.pause(18)}&nbsp; Pause</button>`;

    const resting = restEndsAt && !all && t.state === 'idle';

    page().innerHTML = `
      ${top(`${i + 1} / ${w.plan.length}`)}
      <div class="f-body" style="gap:16px">
        <div style="padding-top:10px">
          <p class="f-kicker">Exercise ${i + 1} of ${w.plan.length} · timed</p>
          <h1 class="f-title">${esc(it.name)}</h1>
        </div>
        <div class="f-card">
          <div class="f-numbers">
            <div><p class="big">${it.sets}</p><p class="lbl">Sets</p></div>
            <div><p class="big">${GL.secs(target)}</p><p class="lbl">Each</p></div>
            <div><p class="big weight">${it.isBodyweight ? (it.equipment === 'Band' ? 'Band' : 'BW') : it.weight == null ? '—' : GL.num(it.weight)}</p><p class="lbl">${it.isBodyweight ? '&nbsp;' : settings.units}</p></div>
          </div>
          <div class="f-equip">${equipmentLine(it)}</div>
        </div>
        ${all ? `<div class="f-dots">${dots.join('')}</div><p class="f-msg good">All sets done. Nice work.</p>` : `
          ${resting ? `<div><p class="f-rest" id="rest-clock">${GL.clock(restLeft())}</p><p class="f-msg">Rest, then set ${done + 1} of ${it.sets}</p></div>` : timerView(it)}
          ${busyTimer ? '' : `<div class="f-adjust" role="group" aria-label="Set the time">
            <button data-t="-15">−15s</button><button data-t="-5">−5s</button><button data-t="5">+5s</button><button data-t="15">+15s</button>
            ${it.isBodyweight ? '' : `<button data-w="-${step}">−${step}</button><button data-w="${step}">+${step}</button>`}
          </div>`}
          <div class="f-dots">${dots.join('')}</div>`}
      </div>
      <div class="f-actions">
        ${primary}
        <div class="f-secondary-row">
          <button class="f-link" id="f-prev" ${i === 0 || busyTimer ? 'style="visibility:hidden"' : ''}>‹ Previous</button>
          ${t.state === 'lead' ? '' : busyTimer ? '<button class="f-link" id="f-early">Done early</button><button class="f-link" id="f-cancel">Cancel</button>'
            : resting ? '<button class="f-link" id="f-skip-rest">Skip rest</button>'
              : `<button class="f-link" id="f-undo" ${done ? '' : 'style="visibility:hidden"'}>Undo set</button>`}
          ${busyTimer ? '' : `<button class="f-link" id="f-skip">${last ? 'Finish ›' : 'Skip ›'}</button>`}
        </div>
      </div>`;

    $('#f-exit').addEventListener('click', () => {
      if (confirm('Leave focus mode? Your sets are saved and you can resume from the dashboard.')) location.href = '/';
    });
    $('#f-main').addEventListener('click', () => {
      if (all) return next();
      if (t.state === 'idle') return startTimer(it);
      if (t.state === 'paused') { t.state = 'run'; t.endsAt = Date.now() + t.left * 1000; return renderTimed(); }
      // pause (during lead-in, pausing just cancels the countdown)
      if (t.state === 'lead') { resetTimer(); t.target = target; return renderTimed(); }
      t.state = 'paused';
      t.left = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000));
      return renderTimed();
    });
    const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener('click', fn); };
    on('#f-prev', () => { i = Math.max(0, i - 1); restEndsAt = null; resetTimer(); render(); });
    on('#f-skip', next);
    on('#f-undo', undoSet);
    on('#f-skip-rest', () => { restEndsAt = null; render(); });
    on('#f-cancel', () => { const keep = target; resetTimer(); t.target = keep; renderTimed(); });
    on('#f-early', () => {
      const elapsed = t.state === 'lead' ? 0 : target - (t.state === 'paused' ? t.left : Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000)));
      if (elapsed <= 0) { const keep = target; resetTimer(); t.target = keep; return renderTimed(); }
      finishTimedSet(it, elapsed);
    });
    document.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
      t.target = Math.min(3600, Math.max(5, target + Number(b.dataset.t)));
      it.seconds = t.target;
      renderTimed();
      if (restEndsAt) startRestTick();
    }));
    document.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => {
      it.weight = Math.max(0, Math.round(((it.weight || 0) + Number(b.dataset.w)) * 100) / 100);
      renderTimed();
      if (restEndsAt) startRestTick();
    }));
    if (resting) startRestTick();
  }

  function startTimer(it) {
    restEndsAt = null;
    stopRest();
    t.target = t.target ?? it.seconds;
    t.state = 'lead';
    t.left = LEAD;
    t.endsAt = Date.now() + LEAD * 1000;
    t.lastWhole = LEAD;
    beep(660);
    renderTimed();
    clearInterval(t.tick);
    t.tick = setInterval(() => timerTick(it), 100);
  }

  function timerTick(it) {
    if (t.state === 'paused' || t.state === 'idle') return;
    const left = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000));
    if (t.state === 'lead') {
      if (left !== t.lastWhole && left > 0) { t.lastWhole = left; beep(660); }
      t.left = left;
      if (left <= 0) {
        t.state = 'run';
        t.left = t.target;
        t.endsAt = Date.now() + t.target * 1000;
        t.lastWhole = t.target;
        beep(1040, 250);
        if (navigator.vibrate) navigator.vibrate(100);
        return renderTimed();
      }
      const v = document.getElementById('t-val');
      if (v) v.textContent = String(left);
      return;
    }
    // running
    t.left = left;
    if (left !== t.lastWhole) {
      t.lastWhole = left;
      if (left > 0 && left <= 3) beep(880);
    }
    const v = document.getElementById('t-val');
    if (v) v.textContent = GL.clock(left);
    const arc = document.getElementById('t-arc');
    if (arc) arc.setAttribute('stroke-dashoffset', String(ringC * (1 - (t.endsAt - Date.now()) / (t.target * 1000))));
    if (left <= 0) {
      beep(1040, 400);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      finishTimedSet(it, t.target);
    }
  }

  async function finishTimedSet(it, seconds) {
    const keep = t.target;
    resetTimer();
    t.target = keep;
    if (busy) return;
    busy = true;
    try {
      const weight = it.isBodyweight ? null : it.weight;
      const res = await api(`/workouts/${w.id}/sets`, { method: 'POST', body: { exerciseId: it.exerciseId, weight, seconds } });
      w.sets.push({ id: res.id, exerciseId: it.exerciseId, setNumber: res.setNumber, weight, reps: 0, seconds });
      const done = setsFor(it.exerciseId).length;
      restEndsAt = done < it.sets && it.restSeconds > 0 ? Date.now() + it.restSeconds * 1000 : null;
      render();
    } catch (err) { GL.fail(err); render(); }
    busy = false;
  }

  async function undoSet() {
    const it = w.plan[i];
    const mine = setsFor(it.exerciseId);
    const lastSet = mine[mine.length - 1];
    if (!lastSet) return;
    try {
      await api(`/workouts/${w.id}/sets/${lastSet.id}`, { method: 'DELETE' });
      w.sets = w.sets.filter((s) => s.id !== lastSet.id);
      restEndsAt = null;
      render();
    } catch (err) { GL.fail(err); }
  }

  async function next() {
    restEndsAt = null;
    resetTimer();
    if (i < w.plan.length - 1) { i++; return render(); }
    try {
      await api(`/workouts/${w.id}`, { method: 'PATCH', body: { finished: true } });
      w = await api(`/workouts/${w.id}`);
      phase = 'finish';
      render();
    } catch (err) { GL.fail(err); }
  }

  function renderFinish() {
    const key = w.stretchKey;
    const S = GL.Stretch;
    page().innerHTML = `
      ${top('Done')}
      <div class="f-center">
        <div class="f-check">${GL.icon.check(34)}</div>
        <h1 class="f-title" style="font-size:34px">${esc(w.name)} done</h1>
        <p class="muted">${w.plan.length} exercises · ${w.setCount} sets · ${w.minutes} min · ${GL.num(w.volume)} ${settings.units}</p>
        ${w.prs.length ? `<p style="color:#E0A75E; font-weight:600">New record: ${esc(w.prs.join(', '))}</p>` : ''}
        <label class="sr-only" for="f-notes">Notes</label>
        <textarea class="f-textarea" id="f-notes" placeholder="Notes for next time (optional)">${esc(w.notes)}</textarea>
        ${key ? `<div class="f-note"><p style="font-weight:600">Next: cool-down stretch</p>
          <p class="small muted">${esc(S.ROUTINES[key].title)} · ${S.ROUTINES[key].ids.length} stretches · ${S.minutes(key)}</p></div>` : ''}
      </div>
      <div class="f-actions">
        ${key ? '<button class="f-primary purple" id="f-stretch">Start stretch</button>' : ''}
        <button class="${key ? 'f-link' : 'f-primary'}" id="f-save">${key ? 'Skip stretch and save' : 'Save workout'}</button>
      </div>`;
    $('#f-exit').addEventListener('click', saveAndLeave);
    $('#f-save').addEventListener('click', saveAndLeave);
    const st = $('#f-stretch');
    if (st) st.addEventListener('click', async () => { await saveNotes(); phase = 'stretch'; render(); });
  }

  async function saveNotes() {
    const el = $('#f-notes');
    if (!el) return;
    try { await api(`/workouts/${w.id}`, { method: 'PATCH', body: { notes: el.value } }); w.notes = el.value; } catch (err) { GL.fail(err); }
  }

  async function saveAndLeave() {
    await saveNotes();
    location.href = '/';
  }

  function renderStretch() {
    GL.Stretch.Player(page(), {
      key: w.stretchKey,
      onExit: () => { phase = 'finish'; render(); },
      onFinish: async (seconds) => {
        try { await api('/stretches', { method: 'POST', body: { key: w.stretchKey, seconds, workoutId: w.id } }); } catch (err) { GL.fail(err); }
        phase = 'done';
        render();
      }
    });
  }

  function renderDone() {
    page().innerHTML = `
      <div class="f-center">
        <div class="f-check">${GL.icon.check(34)}</div>
        <h1 class="f-title" style="font-size:32px">All done</h1>
        <p class="muted">${esc(w.name)} · ${w.minutes} min${w.stretchKey ? ' · stretched' : ''}</p>
      </div>
      <div class="f-actions"><a class="f-primary" href="/">Back to home</a></div>`;
  }

  load();
})();
