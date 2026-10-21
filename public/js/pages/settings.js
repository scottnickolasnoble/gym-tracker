// Settings: units, plates, goals, rest timers, body weight log, password and export.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('settings');

  let s = null;
  let bw = [];
  const PLATE_OPTIONS = { lb: [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25], kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5] };

  async function load() {
    try {
      [s, bw] = await Promise.all([api('/settings'), api('/bodyweight')]);
      render();
    } catch (err) { GL.fail(err); }
  }

  const toClock = (secs) => GL.clock(secs);
  const fromClock = (txt) => {
    const m = /^(\d{1,2}):([0-5]\d)$/.exec(txt.trim());
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const n = Number(txt);
    return Number.isFinite(n) ? Math.round(n) : NaN;
  };

  function render() {
    const options = [...new Set([...PLATE_OPTIONS[s.units], ...s.plates])].sort((a, b) => b - a);
    $('#page').innerHTML = `
      <div class="page-head"><div><h1>Settings</h1></div>
        <div class="actions"><button class="btn btn-primary" id="save">Save settings</button></div></div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(330px, 1fr)); gap:18px; align-items:start">
        <section class="card pad stack-lg">
          <h2>You</h2>
          <div class="field"><label for="name">Name</label><input class="input" id="name" value="${esc(s.name)}" maxlength="60"></div>
          <p class="small muted">Logged in as ${esc(s.email)}</p>
        </section>

        <section class="card pad stack-lg">
          <h2>Units &amp; equipment</h2>
          <div class="setting-row"><span class="name">Weight units</span>
            <div class="seg" role="group" aria-label="Weight units">
              <button data-units="lb" aria-pressed="${s.units === 'lb'}">lb</button><button data-units="kg" aria-pressed="${s.units === 'kg'}">kg</button>
            </div></div>
          <div class="setting-row"><label class="name" for="bar">Barbell weight (${s.units})</label>
            <input class="input num" id="bar" value="${s.barWeight}" inputmode="decimal" style="max-width:100px"></div>
          <div class="stack">
            <span class="name" style="font-weight:600; font-size:14px">Plates at your gym</span>
            <div class="pills" role="group" aria-label="Plates">
              ${options.map((p) => `<button class="pill mono" data-plate="${p}" aria-pressed="${s.plates.includes(p)}">${p}</button>`).join('')}
            </div>
            <p class="tiny muted">Focus mode uses these to tell you what to load on each side of the bar.</p>
          </div>
        </section>

        <section class="card pad stack-lg">
          <h2>Goals</h2>
          <div class="setting-row"><label class="name" for="goal">Workouts per week</label>
            <input class="input num" id="goal" value="${s.weeklyGoal}" inputmode="numeric" style="max-width:80px"></div>
          <div class="setting-row"><label class="name" for="bwgoal">Body weight goal (${s.units})</label>
            <input class="input num" id="bwgoal" value="${s.bodyweightGoal ?? ''}" inputmode="decimal" style="max-width:100px" placeholder="—"></div>
          <div class="setting-row">
            <div><p class="name">Suggest weight increases</p>
              <p class="desc">When you hit every rep: +${s.units === 'kg' ? '2.5' : '5'} ${s.units} upper body, +${s.units === 'kg' ? '5' : '10'} ${s.units} lower body</p></div>
            <button class="switch" id="suggest" role="switch" aria-checked="${s.suggestIncrease}" aria-label="Suggest weight increases"></button>
          </div>
        </section>

        <section class="card pad stack-lg">
          <h2>Rest timer</h2>
          <div class="setting-row"><label class="name" for="restbig">Big lifts (squat, bench, deadlift…)</label>
            <input class="input num" id="restbig" value="${toClock(s.restBig)}" style="max-width:90px"></div>
          <div class="setting-row"><label class="name" for="restother">Everything else</label>
            <input class="input num" id="restother" value="${toClock(s.restOther)}" style="max-width:90px"></div>
          <p class="tiny muted">These are the defaults when you add an exercise to a workout. You can change rest per exercise in the builder.</p>
        </section>

        <section class="card pad stack-lg">
          <h2>Body weight</h2>
          <form class="row-center" id="bw-form" style="flex-wrap:wrap">
            <input class="input num" id="bw-val" placeholder="${s.units}" inputmode="decimal" style="max-width:100px" aria-label="Weight">
            <input class="input" id="bw-date" type="date" value="${GL.todayLocal()}" style="max-width:170px" aria-label="Date">
            <button class="btn">Add</button>
          </form>
          <div class="list" style="box-shadow:none; border:1px solid var(--line); max-height:260px; overflow-y:auto">
            ${bw.length ? bw.map((e) => `
              <div class="list-row" style="padding:8px 12px">
                <span class="grow small">${GL.longDate(e.date)}</span>
                <span class="mono">${GL.num(e.weight)} ${s.units}</span>
                <button class="icon-btn danger" data-bw-del="${e.id}" aria-label="Delete entry for ${GL.shortDate(e.date)}">${GL.icon.x(14)}</button>
              </div>`).join('') : '<p class="empty">No entries yet.</p>'}
          </div>
        </section>

        <section class="card pad stack-lg">
          <h2>Account &amp; data</h2>
          <form class="stack" id="pw-form">
            <div class="field"><label for="pw-cur">Current password</label><input class="input" id="pw-cur" type="password" autocomplete="current-password"></div>
            <div class="field"><label for="pw-new">New password</label><input class="input" id="pw-new" type="password" autocomplete="new-password" minlength="8"></div>
            <button class="btn" style="align-self:flex-start">Change password</button>
          </form>
          <div class="actions">
            <a class="btn" href="/api/export/workouts.csv" download>Export workouts (CSV)</a>
            <a class="btn" href="/api/export/bodyweight.csv" download>Export body weight (CSV)</a>
          </div>
        </section>
      </div>`;
    wire();
  }

  function wire() {
    $$('[data-units]').forEach((b) => b.addEventListener('click', () => {
      const next = b.dataset.units;
      if (next === s.units) return;
      readForm();
      s.units = next;
      // Sensible defaults when switching systems.
      s.barWeight = next === 'kg' ? 20 : 45;
      s.plates = next === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
      render();
    }));
    $$('[data-plate]').forEach((b) => b.addEventListener('click', () => {
      const p = Number(b.dataset.plate);
      s.plates = s.plates.includes(p) ? s.plates.filter((x) => x !== p) : [...s.plates, p];
      b.setAttribute('aria-pressed', String(s.plates.includes(p)));
    }));
    $('#suggest').addEventListener('click', (e) => {
      s.suggestIncrease = !s.suggestIncrease;
      e.currentTarget.setAttribute('aria-checked', String(s.suggestIncrease));
    });
    $('#save').addEventListener('click', save);
    $('#bw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/bodyweight', { method: 'POST', body: { weight: $('#bw-val').value, date: $('#bw-date').value } });
        readForm();
        bw = await api('/bodyweight');
        render();
        GL.toast('Body weight saved.');
      } catch (err) { GL.fail(err); }
    });
    $$('[data-bw-del]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api(`/bodyweight/${b.dataset.bwDel}`, { method: 'DELETE' });
        readForm();
        bw = await api('/bodyweight');
        render();
      } catch (err) { GL.fail(err); }
    }));
    $('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/settings/password', { method: 'POST', body: { current: $('#pw-cur').value, next: $('#pw-new').value } });
        $('#pw-cur').value = '';
        $('#pw-new').value = '';
        GL.toast('Password changed.');
      } catch (err) { GL.fail(err); }
    });
  }

  // Copy what's typed into s, so re-rendering doesn't lose it.
  function readForm() {
    s.name = $('#name').value;
    s.barWeight = $('#bar').value;
    s.weeklyGoal = $('#goal').value;
    s.bodyweightGoal = $('#bwgoal').value === '' ? null : $('#bwgoal').value;
    s.restBig = fromClock($('#restbig').value);
    s.restOther = fromClock($('#restother').value);
  }

  async function save() {
    readForm();
    if (Number.isNaN(s.restBig) || Number.isNaN(s.restOther)) { GL.toast('Rest times should look like 2:30.', true); return; }
    if (!s.plates.length) { GL.toast('Pick at least one plate.', true); return; }
    try {
      s = await api('/settings', {
        method: 'PUT',
        body: {
          name: s.name, units: s.units, barWeight: s.barWeight, plates: s.plates, weeklyGoal: s.weeklyGoal,
          bodyweightGoal: s.bodyweightGoal, restBig: s.restBig, restOther: s.restOther, suggestIncrease: s.suggestIncrease
        }
      });
      render();
      GL.toast('Settings saved.');
    } catch (err) { GL.fail(err); }
  }

  load();
})();
