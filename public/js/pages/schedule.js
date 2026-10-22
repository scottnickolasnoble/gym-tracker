// Weekly schedule: pick a workout, stretch or rest for each day.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('schedule');

  let week = [];
  let routines = [];
  let sel = (new Date().getDay() + 6) % 7; // today, Monday = 0
  let dirty = false;
  const STRETCH_KEYS = ['full', 'push', 'pull', 'legs'];
  const STRETCH_NAMES = { full: 'Full body', push: 'Chest, shoulders & triceps', pull: 'Back & biceps', legs: 'Legs & hips' };

  async function load() {
    try {
      [week, routines] = await Promise.all([api('/schedule'), api('/routines')]);
      render();
    } catch (err) { GL.fail(err); }
  }

  const routineById = (id) => routines.find((r) => r.id === id);

  function dayInfo(d) {
    if (d.kind === 'workout') {
      const r = routineById(d.routineId);
      return { name: r ? r.name : 'Workout', type: r ? r.type : 'other', detail: r ? `${r.exerciseCount} exercises · ~${r.minutes} min` : '' };
    }
    if (d.kind === 'stretch') return { name: 'Stretch only', type: 'stretch', detail: STRETCH_NAMES[d.stretchKey || 'full'] };
    return { name: 'Rest', type: 'rest', detail: 'Recovery day' };
  }

  function render() {
    const trainDays = week.filter((d) => d.kind === 'workout').length;
    $('#page').innerHTML = `
      <div class="page-head">
        <div><h1>Schedule</h1><p>Your plan repeats every week. Pick a day to change it.</p></div>
        <div class="actions">
          <span class="btn" style="cursor:default">${trainDays} workouts a week</span>
          <button class="btn btn-primary" id="save" ${dirty ? '' : 'disabled'}>Save plan</button>
        </div>
      </div>

      <div class="week" role="group" aria-label="Days of the week">
        ${week.map((d, i) => {
          const info = dayInfo(d);
          return `<button class="day-card ${d.kind === 'rest' ? 'rest' : ''} ${i === sel ? 'selected' : ''}" data-day="${i}" aria-pressed="${i === sel}">
            <span class="dow">${GL.DOW3[i]}</span>
            <span class="chip t t-${info.type}" style="align-self:flex-start">${esc(info.name)}</span>
            <span class="note">${esc(info.detail)}${d.stretchAfter ? '<br>+ cool-down stretch' : ''}</span>
            <span class="note mono">${d.startTime ? GL.time12(d.startTime) : ''}</span>
          </button>`;
        }).join('')}
      </div>

      <div class="split">
        <section class="main">${editor()}</section>
        <aside class="side">${calendar()}</aside>
      </div>`;

    $$('[data-day]').forEach((b) => b.addEventListener('click', () => { sel = Number(b.dataset.day); render(); }));
    $$('[data-pick]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.pick)));
    const sw = $('#stretch-after');
    if (sw) sw.addEventListener('click', () => { week[sel].stretchAfter = !week[sel].stretchAfter; change(); });
    const sk = $('#stretch-key');
    if (sk) sk.addEventListener('change', () => { week[sel].stretchKey = sk.value; change(); });
    const t = $('#start-time');
    if (t) t.addEventListener('change', () => { week[sel].startTime = t.value || null; change(); });
    $('#save').addEventListener('click', save);
  }

  function editor() {
    const d = week[sel];
    const opt = (key, name, detail, type, on) => `
      <button class="list-row" data-pick="${key}" aria-pressed="${on}" style="width:100%; border:0; ${on ? 'background:var(--green-bg);' : 'background:none;'} text-align:left; min-height:52px">
        <span class="dot t t-${type}"></span>
        <span class="grow" style="font-weight:600">${esc(name)}</span>
        <span class="tiny muted">${esc(detail)}</span>
        ${on ? `<span style="color:var(--green-fg)">${GL.icon.check(18)}</span>` : ''}
      </button>`;
    return `
      <div class="card pad stack-lg">
        <h2>Edit ${GL.DOW[sel]}</h2>
        <div class="stack">
          <p class="label">Workout</p>
          <div class="list" style="box-shadow:none; border:1px solid var(--line)">
            ${routines.map((r) => opt('r' + r.id, r.name, `${r.exerciseCount} exercises · ~${r.minutes} min`, r.type, d.kind === 'workout' && d.routineId === r.id)).join('')}
            ${opt('stretch', 'Stretch only', '10–15 min', 'stretch', d.kind === 'stretch')}
            ${opt('rest', 'Rest', 'Recovery day', 'rest', d.kind === 'rest')}
          </div>
          ${routines.length ? '' : '<p class="small muted">No workouts yet. <a href="/routine.html?new=1">Build one</a> first.</p>'}
        </div>
        ${d.kind === 'workout' ? `
          <div class="setting-row">
            <div><p class="name">Cool-down stretch</p><p class="desc">Starts in focus mode right after your last set</p></div>
            <button class="switch" id="stretch-after" role="switch" aria-checked="${d.stretchAfter}" aria-label="Cool-down stretch"></button>
          </div>` : ''}
        ${d.kind === 'stretch' ? `
          <div class="setting-row">
            <label class="name" for="stretch-key">Which stretch</label>
            <select class="input" id="stretch-key" style="max-width:240px">
              ${STRETCH_KEYS.map((k) => `<option value="${k}" ${d.stretchKey === k ? 'selected' : ''}>${STRETCH_NAMES[k]}</option>`).join('')}
            </select>
          </div>` : ''}
        ${d.kind !== 'rest' ? `
          <div class="setting-row">
            <label class="name" for="start-time">Usual start time</label>
            <input class="input mono" id="start-time" type="time" value="${d.startTime || ''}" style="max-width:150px">
          </div>` : ''}
      </div>`;
  }

  function calendar() {
    const today = GL.todayLocal();
    const monday = GL.addDays(today, -GL.weekdayIndex(today));
    const cells = [];
    for (let i = 0; i < 28; i++) {
      const date = GL.addDays(monday, i);
      const d = week[i % 7];
      const info = dayInfo(d);
      cells.push(`<div class="cal-cell ${date === today ? 'today' : ''} ${(i % 7) === sel ? 'selected' : ''}">
        <span class="n">${GL.dayNum(date)}</span>
        <span class="dots">${d.kind !== 'rest' ? `<span class="dot t t-${info.type}"></span>` : ''}</span>
      </div>`);
    }
    return `
      <div class="card pad stack">
        <div class="row-between"><h2>Next 4 weeks</h2><span class="tiny muted">${GL.shortDate(monday)} – ${GL.shortDate(GL.addDays(monday, 27))}</span></div>
        <div class="cal">
          ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w) => `<span class="wd">${w}</span>`).join('')}
          ${cells.join('')}
        </div>
        <div class="legend">
          <span><span class="dot t t-push"></span>Push / Upper</span>
          <span><span class="dot t t-pull"></span>Pull</span>
          <span><span class="dot t t-legs"></span>Legs</span>
          <span><span class="dot t t-stretch"></span>Stretch / other</span>
        </div>
      </div>`;
  }

  function pick(key) {
    const d = week[sel];
    if (key === 'rest') Object.assign(d, { kind: 'rest', routineId: null, stretchAfter: false, startTime: null });
    else if (key === 'stretch') Object.assign(d, { kind: 'stretch', routineId: null, stretchKey: d.stretchKey || 'full', stretchAfter: false, startTime: d.startTime || '09:00' });
    else Object.assign(d, { kind: 'workout', routineId: Number(key.slice(1)), startTime: d.startTime || '18:00' });
    change();
  }

  function change() { dirty = true; render(); }

  async function save() {
    try {
      week = await api('/schedule', { method: 'PUT', body: { days: week } });
      dirty = false;
      render();
      GL.toast('Schedule saved.');
    } catch (err) { GL.fail(err); }
  }

  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
