// Edit one workout: name, type, cool-down, and its exercises in order (drag to reorder).
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('routines');

  const params = GL.params();
  let draft = null;
  let library = [];
  let settings = null;
  let dirty = false;

  async function load() {
    try {
      [library, settings] = await Promise.all([api('/exercises'), api('/settings')]);
      const id = Number(params.get('id'));
      if (id) {
        const r = await api(`/routines/${id}`);
        draft = { id: r.id, name: r.name, type: r.type, stretchKey: r.stretchKey, items: r.items.map((i) => ({ ...i })) };
      } else {
        draft = { id: null, name: '', type: 'other', stretchKey: 'full', items: [] };
      }
      render();
      if (!draft.id) $('#r-name').focus();
    } catch (err) { GL.fail(err); }
  }

  const minutes = () => Math.round(draft.items.reduce((t, i) =>
    t + (Number(i.sets) || 0) * ((i.isTimed ? Number(i.seconds) || 0 : 45) + (Number(i.restSeconds) || 0)), 0) / 60);

  function render() {
    const u = settings.units;
    $('#page').innerHTML = `
      <a class="small" href="/routines.html" id="back-link">‹ Workouts</a>
      <div class="page-head" style="margin-top:-10px">
        <div>
          <h1 id="title">${esc(draft.name || 'New workout')}</h1>
          <p id="status">${draft.id ? (dirty ? 'Unsaved changes' : 'Saved') : 'Not saved yet'}</p>
        </div>
      </div>

      <div class="card pad" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; max-width:760px">
        <div class="field"><label for="r-name">Name</label>
          <input class="input" id="r-name" value="${esc(draft.name)}" maxlength="60" placeholder="e.g. Upper body A"></div>
        <div class="field"><label for="r-stretch">Cool-down stretch</label>
          <select class="input" id="r-stretch">
            ${Object.entries(GL.STRETCH_TITLES).map(([k, t]) => `<option value="${k}" ${draft.stretchKey === k ? 'selected' : ''}>${t}</option>`).join('')}
            <option value="" ${!draft.stretchKey ? 'selected' : ''}>None</option>
          </select></div>
        <div class="field" style="grid-column:1 / -1"><span>Type</span>
          <div class="pills" role="group" aria-label="Type">
            ${['push', 'pull', 'legs', 'upper', 'full', 'other'].map((t) => `
              <button class="pill" data-type="${t}" aria-pressed="${draft.type === t}">${GL.typeDot(t)}${GL.TYPE_LABEL[t]}</button>`).join('')}
          </div></div>
      </div>

      <section class="stack" style="max-width:760px">
        <div class="row-between" style="align-items:center">
          <h2>Exercises</h2>
          <span class="small muted" id="totals">${totalsText()}</span>
        </div>
        ${draft.items.length ? '<p class="tiny muted" style="margin-top:-4px">Drag the dots to put them in the order you\'ll do them.</p>' : ''}
        <div class="sort-list" id="items">
          ${draft.items.map((it, i) => itemCard(it, i, u)).join('')}
        </div>
        ${draft.items.length ? '' : '<div class="card"><p class="empty">No exercises yet.</p></div>'}
        <button class="btn btn-dashed" id="add-btn" style="min-height:50px">+ Add exercises</button>
        <div class="sticky-actions">
          <button class="btn btn-primary" id="save-btn">Save</button>
          <button class="btn" id="start-btn">${GL.icon.play(14)} Start</button>
        </div>
        ${draft.id ? '<button class="btn btn-ghost btn-danger" id="delete-btn" style="align-self:flex-start">Delete this workout</button>' : ''}
      </section>`;
    wire();
  }

  const totalsText = () => `${draft.items.length} exercises · about ${minutes()} min`;

  function itemCard(it, i, u) {
    const amount = it.isTimed
      ? `<label class="cell"><span>Time (s)</span><input class="input num" data-f="seconds" data-i="${i}" value="${it.seconds ?? ''}" inputmode="numeric"></label>`
      : `<label class="cell"><span>Reps</span><input class="input num" data-f="reps" data-i="${i}" value="${it.reps ?? ''}" inputmode="numeric"></label>`;
    const weight = it.isBodyweight
      ? `<label class="cell"><span>${u}</span><input class="input num" disabled placeholder="${it.equipment === 'Band' ? 'Band' : 'BW'}"></label>`
      : `<label class="cell"><span>${u}</span><input class="input num" data-f="weight" data-i="${i}" value="${it.weight ?? ''}" placeholder="—" inputmode="decimal"></label>`;
    return `
      <div class="sort-item" data-sort>
        <button class="drag-handle" data-handle data-i="${i}" aria-label="Reorder ${esc(it.name)}. Drag, or use the arrow keys.">${GL.gripIcon()}</button>
        <div class="top">
          <span class="num-badge">${i + 1}</span>
          <span class="nm"><b>${esc(it.name)}${it.isTimed ? '<span class="timed-tag">Timed</span>' : ''}</b><span class="tiny muted">${esc(it.equipment)}</span></span>
          <button class="icon-btn danger" data-remove="${i}" aria-label="Remove ${esc(it.name)}">${GL.icon.x(16)}</button>
        </div>
        <div class="fields">
          <label class="cell"><span>Sets</span><input class="input num" data-f="sets" data-i="${i}" value="${it.sets}" inputmode="numeric"></label>
          ${amount}
          ${weight}
          <label class="cell"><span>Rest (s)</span><input class="input num" data-f="restSeconds" data-i="${i}" value="${it.restSeconds}" inputmode="numeric"></label>
        </div>
      </div>`;
  }

  function markDirty() {
    dirty = true;
    $('#status').textContent = draft.id ? 'Unsaved changes' : 'Not saved yet';
    $('#totals').textContent = totalsText();
  }

  function wire() {
    $('#r-name').addEventListener('input', (e) => { draft.name = e.target.value; $('#title').textContent = draft.name || 'New workout'; markDirty(); });
    $('#r-stretch').addEventListener('change', (e) => { draft.stretchKey = e.target.value || null; markDirty(); });
    $$('[data-type]').forEach((b) => b.addEventListener('click', () => {
      draft.type = b.dataset.type;
      $$('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      markDirty();
    }));
    $$('[data-f]').forEach((inp) => inp.addEventListener('input', () => {
      draft.items[Number(inp.dataset.i)][inp.dataset.f] = inp.value;
      markDirty();
    }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      draft.items.splice(Number(b.dataset.remove), 1);
      dirty = true;
      render();
    }));
    // Drag with mouse/finger...
    GL.sortable($('#items'), (from, to) => { GL.moveItem(draft.items, from, to); dirty = true; render(); });
    // ...or arrow keys on the handle.
    $$('[data-handle]').forEach((h) => h.addEventListener('keydown', (e) => {
      const i = Number(h.dataset.i);
      const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
      if (to == null || to < 0 || to >= draft.items.length) return;
      e.preventDefault();
      GL.moveItem(draft.items, i, to);
      dirty = true;
      render();
      $(`[data-handle][data-i="${to}"]`).focus();
    }));
    $('#add-btn').addEventListener('click', openLibrary);
    $('#save-btn').addEventListener('click', () => save());
    $('#start-btn').addEventListener('click', async () => {
      const id = dirty || !draft.id ? await save() : draft.id;
      if (id) location.href = `/plan.html?routine=${id}`;
    });
    $('#back-link').addEventListener('click', (e) => {
      if (dirty && !confirm('You have unsaved changes. Leave without saving?')) e.preventDefault();
      else dirty = false;
    });
    const del = $('#delete-btn');
    if (del) del.addEventListener('click', remove);
  }

  function newItem(e) {
    return {
      exerciseId: e.id, name: e.name, equipment: e.equipment, group: e.group,
      isBodyweight: e.isBodyweight, isTimed: e.isTimed,
      sets: 3,
      reps: e.isTimed ? 1 : e.isBigLift ? 5 : e.group === 'core' ? 12 : 10,
      seconds: e.isTimed ? (e.lowerBody ? 45 : 30) : null,
      weight: null,
      restSeconds: e.isBigLift ? settings.restBig : e.isTimed ? 45 : settings.restOther
    };
  }

  // ---- Add exercises sheet ----
  function openLibrary() {
    let filter = 'all';
    let search = '';
    let ownedOnly = true;
    const m = GL.modal('', { sheet: true, wide: true });

    const rows = () => {
      const q = search.trim().toLowerCase();
      const list = library.filter((e) => (filter === 'all' || e.group === filter)
        && (!q || e.name.toLowerCase().includes(q))
        && (!ownedOnly || GL.canDo(e, settings.equipment)));
      if (!list.length) return `<p class="empty">Nothing matches${ownedOnly ? '. Try turning off "Only what I own".' : '.'}</p>`;
      return list.map((e) => {
        const count = draft.items.filter((i) => i.exerciseId === e.id).length;
        return `<div class="lib-row">
          <span class="dot t t-${e.group}"></span>
          <span class="grow"><span style="display:block; font-size:15px">${esc(e.name)}${e.isTimed ? '<span class="timed-tag">Timed</span>' : ''}</span>
          <span class="tiny muted">${esc(e.equipment)}${e.custom ? ' · yours' : ''}</span></span>
          <button class="lib-toggle" data-lib="${e.id}" aria-pressed="${count > 0}" aria-label="${count ? 'Remove' : 'Add'} ${esc(e.name)}">${count ? GL.icon.check(16) : GL.icon.plus(16)}</button>
        </div>`;
      }).join('');
    };

    const paint = () => {
      m.el.innerHTML = `
        <div class="row-between" style="align-items:center"><h2>Add exercises</h2>
          <button class="btn btn-sm btn-primary" data-done>Done</button></div>
        <input class="input" id="lib-search" placeholder="Search exercises" aria-label="Search exercises" value="${esc(search)}">
        <div class="pills" role="group" aria-label="Muscle group">
          ${['all', 'push', 'pull', 'legs', 'core'].map((g) => `<button class="pill" data-filter="${g}" aria-pressed="${filter === g}">${g === 'all' ? 'All' : GL.GROUP_LABEL[g]}</button>`).join('')}
        </div>
        <div class="setting-row">
          <span class="small"><b>Only what I own</b> <span class="muted">· ${esc(settings.equipment.map((k) => GL.EQUIPMENT[k]).join(', ') || 'body weight')}</span></span>
          <button class="switch" id="owned" role="switch" aria-checked="${ownedOnly}" aria-label="Only show exercises for equipment I own"></button>
        </div>
        <div class="lib-scroll" id="lib-list">${rows()}</div>
        <button class="btn btn-dashed" data-custom>+ Create your own exercise</button>`;
      m.el.querySelector('[data-done]').addEventListener('click', m.close);
      m.el.querySelector('[data-custom]').addEventListener('click', () => { m.close(); customModal(); });
      m.el.querySelector('#owned').addEventListener('click', () => { ownedOnly = !ownedOnly; paint(); });
      m.el.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; paint(); }));
      const s = m.el.querySelector('#lib-search');
      s.addEventListener('input', () => { search = s.value; m.el.querySelector('#lib-list').innerHTML = rows(); wireRows(); });
      wireRows();
    };

    const wireRows = () => {
      m.el.querySelectorAll('[data-lib]').forEach((b) => b.addEventListener('click', () => {
        const id = Number(b.dataset.lib);
        const at = draft.items.map((i) => i.exerciseId).lastIndexOf(id);
        if (at >= 0) draft.items.splice(at, 1);
        else draft.items.push(newItem(library.find((e) => e.id === id)));
        dirty = true;
        const on = at < 0;
        b.setAttribute('aria-pressed', String(on));
        b.innerHTML = on ? GL.icon.check(16) : GL.icon.plus(16);
        render();
      }));
    };

    paint();
  }

  // ---- Create your own exercise ----
  // [label, equipment shown, equipment needed, logs a weight?]
  const EQUIP_CHOICES = [
    ['Dumbbells', 'Dumbbells', ['dumbbells'], true],
    ['Dumbbells + bench', 'Dumbbells', ['dumbbells', 'bench'], true],
    ['Resistance band', 'Band', ['bands'], false],
    ['Body weight', 'Body weight', [], false],
    ['Bench (body weight)', 'Body weight', ['bench'], false],
    ['Pull-up bar', 'Pull-up bar', ['pullup'], false],
    ['Barbell', 'Barbell', ['barbell'], true],
    ['Cable machine', 'Cable', ['cable'], true],
    ['Gym machine', 'Machine', ['machine'], true],
    ['Other', 'Other', [], true]
  ];

  function customModal() {
    const m = GL.modal(`
      <h2>New exercise</h2>
      <form class="stack-lg" id="ex-form">
        <div class="field"><label for="ex-name">Name</label><input class="input" id="ex-name" maxlength="60" required></div>
        <div class="field"><label for="ex-group">Muscle group</label>
          <select class="input" id="ex-group"><option value="push">Push</option><option value="pull">Pull</option><option value="legs">Legs</option><option value="core">Core</option></select></div>
        <div class="field"><label for="ex-equip">Equipment</label>
          <select class="input" id="ex-equip">${EQUIP_CHOICES.map((c, i) => `<option value="${i}">${c[0]}</option>`).join('')}</select></div>
        <div class="field"><span>Measured by</span>
          <div class="seg" role="group" aria-label="Measured by" style="align-self:flex-start">
            <button type="button" data-measure="reps" aria-pressed="true">Reps</button>
            <button type="button" data-measure="time" aria-pressed="false">Time (countdown)</button>
          </div></div>
        <label class="row-center small"><input type="checkbox" id="ex-weight" checked> Log a weight</label>
        <label class="row-center small"><input type="checkbox" id="ex-lower"> Lower body (suggests bigger weight jumps)</label>
        <div class="actions"><button type="button" class="btn" id="ex-cancel">Cancel</button><button class="btn btn-primary">Create and add</button></div>
      </form>`);
    const f = m.el;
    let timed = false;
    f.querySelector('#ex-equip').addEventListener('change', (e) => { f.querySelector('#ex-weight').checked = EQUIP_CHOICES[Number(e.target.value)][3]; });
    f.querySelectorAll('[data-measure]').forEach((b) => b.addEventListener('click', () => {
      timed = b.dataset.measure === 'time';
      f.querySelectorAll('[data-measure]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    f.querySelector('#ex-cancel').addEventListener('click', m.close);
    f.querySelector('#ex-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const choice = EQUIP_CHOICES[Number(f.querySelector('#ex-equip').value)];
      try {
        const ex = await api('/exercises', {
          method: 'POST',
          body: {
            name: f.querySelector('#ex-name').value, group: f.querySelector('#ex-group').value,
            equipment: choice[1], needs: choice[2], isTimed: timed,
            isBodyweight: !f.querySelector('#ex-weight').checked, lowerBody: f.querySelector('#ex-lower').checked
          }
        });
        library.push(ex);
        draft.items.push(newItem(ex));
        dirty = true;
        m.close();
        render();
        GL.toast(`${ex.name} added.`);
      } catch (err) { GL.fail(err); }
    });
  }

  // ---- Save / delete ----
  async function save() {
    const body = {
      name: draft.name, type: draft.type, stretchKey: draft.stretchKey || null,
      items: draft.items.map((i) => ({
        exerciseId: i.exerciseId, sets: i.sets,
        reps: i.isTimed ? 1 : i.reps,
        seconds: i.isTimed ? i.seconds : null,
        weight: i.isBodyweight || i.weight === '' || i.weight == null ? null : i.weight,
        restSeconds: i.restSeconds
      }))
    };
    try {
      const res = draft.id
        ? await api(`/routines/${draft.id}`, { method: 'PUT', body })
        : await api('/routines', { method: 'POST', body });
      draft.id = res.id;
      dirty = false;
      history.replaceState(null, '', `/routine.html?id=${res.id}`);
      render();
      GL.toast('Workout saved.');
      return res.id;
    } catch (err) { GL.fail(err); return null; }
  }

  async function remove() {
    if (!confirm(`Delete "${draft.name}"? Your history stays, but it comes off your schedule.`)) return;
    try {
      await api(`/routines/${draft.id}`, { method: 'DELETE' });
      dirty = false;
      location.href = '/routines.html';
    } catch (err) { GL.fail(err); }
  }

  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
