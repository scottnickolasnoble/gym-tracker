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
    if (phase === 'lift') return renderLift();
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
    if (it.isBodyweight) return 'Body weight, no plates';
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
            <div><p class="big weight">${it.isBodyweight ? 'BW' : GL.weight(it.weight)}</p><p class="lbl">${settings.units}</p></div>
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
    $('#f-prev').addEventListener('click', () => { i = Math.max(0, i - 1); restEndsAt = null; render(); });
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
        restEndsAt = null;
        renderLift();
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
