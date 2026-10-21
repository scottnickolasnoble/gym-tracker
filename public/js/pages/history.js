// History: month calendar, month totals, and every set for the day you pick.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('history');

  const today = GL.todayLocal();
  let selected = /^\d{4}-\d{2}-\d{2}$/.test(GL.params().get('date') || '') ? GL.params().get('date') : today;
  let month = selected.slice(0, 7); // 'YYYY-MM'
  let data = { workouts: [], stretches: [] };
  let units = 'lb';

  const monthStart = () => `${month}-01`;
  const monthEnd = () => { const { y, m } = GL.parts(monthStart()); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  const shiftMonth = (n) => { const { y, m } = GL.parts(monthStart()); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

  async function load() {
    try {
      const [d, s] = await Promise.all([
        api(`/workouts?from=${monthStart()}&to=${monthEnd()}&tz=${encodeURIComponent(GL.tz())}`),
        api('/settings')
      ]);
      data = d;
      units = s.units;
      render();
    } catch (err) { GL.fail(err); }
  }

  function render() {
    const { y, m } = GL.parts(monthStart());
    const finished = data.workouts.filter((w) => w.finished);
    const volume = finished.reduce((t, w) => t + (w.volume || 0), 0);
    const avg = finished.length ? Math.round(finished.reduce((t, w) => t + w.minutes, 0) / finished.length) : 0;
    const longest = finished.reduce((t, w) => Math.max(t, w.minutes), 0);
    const prs = [...new Set(finished.flatMap((w) => w.prs))];

    $('#page').innerHTML = `
      <div class="page-head">
        <div><h1>History</h1><p>Every workout and stretch you've logged.</p></div>
        <div class="actions">
          <a class="btn" href="/exercises.html">Exercise progress</a>
          <div class="row-center card" style="gap:2px; box-shadow:none; border:1px solid var(--line)">
            <button class="icon-btn" id="prev-m" aria-label="Previous month">${GL.icon.left(16)}</button>
            <span style="font-size:14px; font-weight:600; min-width:120px; text-align:center">${GL.MONTHS_LONG[m - 1]} ${y}</span>
            <button class="icon-btn" id="next-m" aria-label="Next month">${GL.icon.right(16)}</button>
          </div>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><p class="label">Workouts</p><p class="value">${finished.length}</p><p class="hint">Plus ${data.stretches.length} stretch session${data.stretches.length === 1 ? '' : 's'}</p></div>
        <div class="stat"><p class="label">Total volume</p><p class="value">${GL.num(volume)} <small>${units}</small></p><p class="hint">Weight × reps, all sets</p></div>
        <div class="stat"><p class="label">Average session</p><p class="value">${avg} <small>min</small></p><p class="hint">Longest: ${longest} min</p></div>
        <div class="stat"><p class="label">New records</p><p class="value">${prs.length}</p><p class="hint">${esc(prs.slice(0, 4).join(', ') || 'None this month')}</p></div>
      </div>

      <div class="split">
        <section class="card pad" style="flex:1 1 420px; min-width:0">${calendar()}</section>
        <section style="flex:1 1 380px; min-width:0" class="stack" id="day-detail"></section>
      </div>`;

    $('#prev-m').addEventListener('click', () => { month = shiftMonth(-1); selected = monthStart(); load(); });
    $('#next-m').addEventListener('click', () => { month = shiftMonth(1); selected = monthStart(); load(); });
    $$('[data-date]').forEach((b) => b.addEventListener('click', () => { selected = b.dataset.date; render(); }));
    renderDay();
  }

  function calendar() {
    const first = monthStart();
    const lead = GL.weekdayIndex(first); // Monday-first
    const last = GL.dayNum(monthEnd());
    const cells = [];
    for (let k = 0; k < lead; k++) cells.push('<span></span>');
    for (let d = 1; d <= last; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const dots = data.workouts.filter((w) => w.date === date && w.finished).map((w) => `<span class="dot t t-${esc(w.type)}"></span>`);
      if (data.stretches.some((s) => s.date === date && !s.workoutId)) dots.push('<span class="dot t t-stretch"></span>');
      cells.push(`<button class="cal-cell ${date === selected ? 'selected' : ''} ${date === today ? 'today' : ''} ${date > today ? 'future' : ''}"
        data-date="${date}" aria-label="${GL.longDate(date)}${dots.length ? ', has activity' : ''}" aria-pressed="${date === selected}">
        <span class="n">${d}</span><span class="dots">${dots.slice(0, 3).join('')}</span></button>`);
    }
    return `
      <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span class="wd">${x}</span>`).join('')}${cells.join('')}</div>
      <div class="legend" style="margin-top:12px">
        <span><span class="dot t t-push"></span>Push / Upper</span><span><span class="dot t t-pull"></span>Pull</span>
        <span><span class="dot t t-legs"></span>Legs</span><span><span class="dot t t-stretch"></span>Stretch / other</span>
      </div>`;
  }

  async function renderDay() {
    const box = $('#day-detail');
    const workouts = data.workouts.filter((w) => w.date === selected);
    const loneStretches = data.stretches.filter((s) => s.date === selected && !s.workoutId);
    if (!workouts.length && !loneStretches.length) {
      box.innerHTML = `<h2>${GL.longDate(selected)}</h2><div class="card"><p class="empty">Nothing logged this day.</p></div>`;
      return;
    }
    box.innerHTML = `<h2>${GL.longDate(selected)}</h2><p class="muted small">Loading…</p>`;
    try {
      const details = await Promise.all(workouts.map((w) => api(`/workouts/${w.id}`)));
      box.innerHTML = `<h2>${GL.longDate(selected)}</h2>
        ${details.map(workoutCard).join('')}
        ${loneStretches.map((s) => `<div class="card list-row">${GL.typeDot('stretch')}<span class="grow">Stretch · ${esc(stretchName(s.key))}</span><span class="mono small">${GL.clock(s.seconds)}</span></div>`).join('')}`;
      wireDay(details);
    } catch (err) { GL.fail(err); }
  }

  const STRETCH_NAMES = { push: 'Chest, shoulders & triceps', pull: 'Back & biceps', legs: 'Legs & hips', full: 'Full body' };
  const stretchName = (k) => STRETCH_NAMES[k] || k;

  function workoutCard(w) {
    // Group sets by exercise, in the order they were done.
    const groups = [];
    for (const s of w.sets) {
      let g = groups.find((x) => x.exerciseId === s.exerciseId);
      if (!g) { g = { exerciseId: s.exerciseId, name: s.name, sets: [] }; groups.push(g); }
      g.sets.push(s);
    }
    return `
      <div class="list">
        <div class="list-row" style="background:var(--soft)">
          <span class="grow row-center" style="font-weight:600">${GL.typeDot(w.type)} ${esc(w.name)} ${w.finishedAt ? '' : '<span class="chip plain">Not finished</span>'}</span>
          <span class="mono small">${w.minutes} min · ${GL.num(w.volume)} ${units}</span>
        </div>
        ${groups.map((g) => `
          <div class="list-row" style="display:block">
            <div class="row-between"><span style="font-weight:600; font-size:14px">${esc(g.name)}</span>
              ${w.prs.includes(g.name) ? '<span class="chip pr">PR</span>' : ''}</div>
            <p class="mono tiny" style="margin-top:3px; color:var(--ink-2)">${g.sets.map((s) => `${GL.weight(s.weight)}×${s.reps}`).join(' · ')}</p>
          </div>`).join('') || '<p class="empty">No sets logged.</p>'}
        ${w.stretches.map((s) => `<div class="list-row">${GL.typeDot('stretch')}<span class="grow">${esc(stretchName(s.key))} stretch</span><span class="mono small">${GL.clock(s.seconds)}</span></div>`).join('')}
        <div class="list-row" style="display:block">
          <label class="label" for="notes-${w.id}">Notes</label>
          <textarea class="input" id="notes-${w.id}" data-notes="${w.id}" style="margin-top:6px; min-height:60px">${esc(w.notes)}</textarea>
        </div>
        <div class="list-row" style="gap:8px">
          ${!w.finishedAt ? `<a class="btn btn-sm btn-primary" href="/focus.html?id=${w.id}">Resume</a>` : ''}
          ${w.routineId ? `<a class="btn btn-sm" href="/plan.html?routine=${w.routineId}">Repeat this workout</a>` : ''}
          <button class="btn btn-sm" data-save-notes="${w.id}">Save notes</button>
          <button class="btn btn-sm btn-danger" data-delete="${w.id}">Delete</button>
        </div>
      </div>`;
  }

  function wireDay() {
    $$('[data-save-notes]').forEach((b) => b.addEventListener('click', async () => {
      const wid = b.dataset.saveNotes;
      try {
        await api(`/workouts/${wid}`, { method: 'PATCH', body: { notes: $(`[data-notes="${wid}"]`).value } });
        GL.toast('Notes saved.');
      } catch (err) { GL.fail(err); }
    }));
    $$('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this workout and all its sets? This can\'t be undone.')) return;
      try {
        await api(`/workouts/${b.dataset.delete}`, { method: 'DELETE' });
        GL.toast('Workout deleted.');
        load();
      } catch (err) { GL.fail(err); }
    }));
  }

  load();
})();
