// "Get ready": put the exercises in order and set today's numbers before focus mode starts.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('routines');

  let plan = null;
  let units = 'lb';
  let reordered = false;

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
          <p>Drag to set the order, check today's numbers, then start. In focus mode you'll see one exercise at a time.</p>
        </div>
        <div class="actions"><a class="btn" href="/routine.html?id=${plan.id}">Edit workout</a></div>
      </div>
      <div class="stack" style="max-width:720px">
        <div class="sort-list" id="items">${plan.items.map(row).join('')}</div>
        ${reordered ? `<label class="row-center small card pad-sm"><input type="checkbox" id="keep-order" checked> Keep this order next time</label>` : ''}
        <p class="form-error" id="plan-error" hidden></p>
        <div class="sticky-actions"><button class="btn btn-primary" id="start">${GL.icon.play(16)} Start workout</button></div>
      </div>`;

    $$('[data-f]').forEach((inp) => inp.addEventListener('input', () => { plan.items[Number(inp.dataset.i)][inp.dataset.f] = inp.value; }));
    GL.sortable($('#items'), (from, to) => { GL.moveItem(plan.items, from, to); reordered = true; render(); });
    $$('[data-handle]').forEach((h) => h.addEventListener('keydown', (e) => {
      const i = Number(h.dataset.i);
      const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
      if (to == null || to < 0 || to >= plan.items.length) return;
      e.preventDefault();
      GL.moveItem(plan.items, i, to);
      reordered = true;
      render();
      $(`[data-handle][data-i="${to}"]`).focus();
    }));
    $('#start').addEventListener('click', start);
  }

  function row(it, i) {
    const amount = it.isTimed
      ? `<label class="cell"><span>Time (s)</span><input class="input num" data-i="${i}" data-f="seconds" value="${it.seconds ?? ''}" inputmode="numeric"></label>`
      : `<label class="cell"><span>Reps</span><input class="input num" data-i="${i}" data-f="reps" value="${it.reps}" inputmode="numeric"></label>`;
    return `
      <div class="sort-item" data-sort>
        <button class="drag-handle" data-handle data-i="${i}" aria-label="Reorder ${esc(it.name)}. Drag, or use the arrow keys.">${GL.gripIcon()}</button>
        <div class="top">
          <span class="num-badge">${i + 1}</span>
          <span class="nm"><b>${esc(it.name)}${it.isTimed ? '<span class="timed-tag">Timed</span>' : ''}</b>
            <span class="tiny muted">Last: <span class="mono">${it.last ? esc(it.last) : 'first time'}</span></span></span>
        </div>
        <div class="fields" style="grid-template-columns:repeat(3, minmax(0, 1fr))">
          <label class="cell"><span>Sets</span><input class="input num" data-i="${i}" data-f="sets" value="${it.sets}" inputmode="numeric"></label>
          ${amount}
          <label class="cell"><span>${units}</span><input class="input num" data-i="${i}" data-f="weight" value="${it.isBodyweight ? '' : (it.weight ?? '')}" ${it.isBodyweight ? `disabled placeholder="${it.equipment === 'Band' ? 'Band' : 'BW'}"` : 'placeholder="—"'} inputmode="decimal"></label>
        </div>
        ${it.tip ? `<p class="tiny" style="grid-column:2; color:var(--green-fg); font-weight:500">${esc(it.tip)}</p>` : ''}
      </div>`;
  }

  async function start() {
    const btn = $('#start');
    btn.disabled = true;
    try {
      const keep = $('#keep-order');
      if (reordered && keep && keep.checked) {
        await api(`/routines/${plan.id}/order`, { method: 'PUT', body: { itemIds: plan.items.map((i) => i.itemId) } });
      }
      const { id } = await api('/workouts', {
        method: 'POST',
        body: {
          routineId: plan.id,
          items: plan.items.map((it) => ({
            exerciseId: it.exerciseId, sets: it.sets, restSeconds: it.restSeconds,
            reps: it.isTimed ? 1 : it.reps,
            seconds: it.isTimed ? it.seconds : null,
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
