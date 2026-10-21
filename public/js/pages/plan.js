// "Get ready": set today's sets, reps and weights before focus mode starts.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('routines');

  let plan = null;
  let units = 'lb';

  async function load() {
    const id = Number(GL.params().get('routine'));
    if (!id) { location.href = '/routines.html'; return; }
    try {
      const [p, s] = await Promise.all([api(`/routines/${id}/plan`), api('/settings')]);
      plan = p;
      units = s.units;
      render();
    } catch (err) { GL.fail(err); }
  }

  function render() {
    $('#page').innerHTML = `
      <div class="page-head">
        <div>
          <p class="small muted row-center">${GL.typeDot(plan.type)} ${GL.longDate(GL.todayLocal())}</p>
          <h1>${esc(plan.name)}</h1>
          <p>Set today's numbers now. During the workout you'll only see one exercise at a time.</p>
        </div>
        <div class="actions"><a class="btn" href="/routines.html?id=${plan.id}">Edit workout</a></div>
      </div>
      <div class="stack" style="max-width:720px">
        ${plan.items.map((it, i) => `
          <div class="card pad-sm stack">
            <div class="row-between">
              <p style="font-weight:600"><span class="muted">${i + 1}.</span> ${esc(it.name)}</p>
              <span class="tiny muted">Last: <span class="mono">${it.last ? esc(it.last) : 'first time'}</span></span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px">
              <div class="field"><label for="s${i}">Sets</label><input class="input num" id="s${i}" data-i="${i}" data-f="sets" value="${it.sets}" inputmode="numeric"></div>
              <div class="field"><label for="r${i}">Reps</label><input class="input num" id="r${i}" data-i="${i}" data-f="reps" value="${it.reps}" inputmode="numeric"></div>
              <div class="field"><label for="w${i}">${units}</label><input class="input num" id="w${i}" data-i="${i}" data-f="weight" value="${it.isBodyweight ? '' : (it.weight ?? '')}" ${it.isBodyweight ? 'disabled placeholder="BW"' : 'placeholder="—"'} inputmode="decimal"></div>
            </div>
            ${it.tip ? `<p class="tiny" style="color:var(--green-fg); font-weight:500">${esc(it.tip)}</p>` : ''}
          </div>`).join('')}
        <p class="form-error" id="plan-error" hidden></p>
        <button class="btn btn-primary btn-block" id="start" style="min-height:52px; font-size:16px">Start workout</button>
      </div>`;

    $$('[data-f]').forEach((inp) => inp.addEventListener('input', () => { plan.items[Number(inp.dataset.i)][inp.dataset.f] = inp.value; }));
    $('#start').addEventListener('click', start);
  }

  async function start() {
    const btn = $('#start');
    btn.disabled = true;
    try {
      const { id } = await api('/workouts', {
        method: 'POST',
        body: {
          routineId: plan.id,
          items: plan.items.map((it) => ({
            exerciseId: it.exerciseId, sets: it.sets, reps: it.reps, restSeconds: it.restSeconds,
            weight: it.isBodyweight || it.weight === '' || it.weight == null ? null : it.weight
          }))
        }
      });
      location.href = `/focus.html?id=${id}`;
    } catch (err) {
      const e = $('#plan-error');
      e.textContent = err.message;
      e.hidden = false;
      btn.disabled = false;
    }
  }

  load();
})();
