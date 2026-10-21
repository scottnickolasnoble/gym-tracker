// Workouts page: your saved workouts, the builder, and the exercise library.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('routines');

  let routines = [];
  let library = [];
  let settings = null;
  let draft = null; // the workout being edited
  let dirty = false;
  let filter = 'all';
  let search = '';
  const STRETCH_NAMES = { push: 'Chest, shoulders & triceps', pull: 'Back & biceps', legs: 'Legs & hips', full: 'Full body' };

  async function load() {
    try {
      [routines, library, settings] = await Promise.all([api('/routines'), api('/exercises'), api('/settings')]);
      const want = GL.params().get('id');
      if (GL.params().get('new') || !routines.length) newDraft();
      else await open(Number(want) || routines[0].id);
    } catch (err) { GL.fail(err); }
  }

  function newDraft() {
    draft = { id: null, name: '', type: 'other', stretchKey: 'full', items: [] };
    dirty = false;
    render();
  }

  async function open(id) {
    const r = await api(`/routines/${id}`);
    draft = { id: r.id, name: r.name, type: r.type, stretchKey: r.stretchKey, items: r.items.map((i) => ({ ...i })) };
    dirty = false;
    history.replaceState(null, '', `/routines.html?id=${id}`);
    render();
  }

  const minutes = () => Math.round(draft.items.reduce((t, i) => t + (Number(i.sets) || 0) * (45 + (Number(i.restSeconds) || 0)), 0) / 60);
  const setCount = () => draft.items.reduce((t, i) => t + (Number(i.sets) || 0), 0);

  function render() {
    const units = settings.units;
    $('#page').innerHTML = `
      <div class="split">
        <aside class="side" style="flex:1 1 230px">
          <div class="stack">
            <h2>Your workouts</h2>
            <div class="list">
              ${routines.map((r) => `
                <a class="list-row ${draft.id === r.id ? 'selected' : ''}" href="/routines.html?id=${r.id}" data-open="${r.id}">
                  ${GL.typeDot(r.type)}
                  <span class="grow"><span class="title" style="font-size:14px">${esc(r.name)}</span><span class="sub">${r.exerciseCount} exercises · ~${r.minutes} min</span></span>
                </a>`).join('') || '<p class="empty">None yet.</p>'}
            </div>
            <button class="btn btn-dashed" id="new-btn">+ New workout</button>
          </div>
        </aside>

        <section class="main">
          <div class="page-head">
            <div>
              <p class="small muted">${draft.id ? (dirty ? 'Unsaved changes' : 'Saved') : 'New workout · not saved yet'}</p>
              <h1>${esc(draft.name || 'New workout')}</h1>
            </div>
            <div class="actions">
              ${draft.id ? `<button class="btn btn-danger" id="delete-btn">Delete</button>` : ''}
              ${draft.id && !dirty ? `<a class="btn" href="/plan.html?routine=${draft.id}">Start</a>` : ''}
              <button class="btn btn-primary" id="save-btn">Save workout</button>
            </div>
          </div>

          <div class="card pad" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px">
            <div class="field"><label for="r-name">Name</label>
              <input class="input" id="r-name" value="${esc(draft.name)}" maxlength="60" placeholder="e.g. Arms & core"></div>
            <div class="field"><span>Type</span>
              <div class="pills" role="group" aria-label="Type">
                ${['push', 'pull', 'legs', 'upper', 'full', 'other'].map((t) => `
                  <button class="pill" data-type="${t}" aria-pressed="${draft.type === t}">${GL.typeDot(t)}${GL.TYPE_LABEL[t]}</button>`).join('')}
              </div></div>
            <div class="field"><label for="r-stretch">Cool-down stretch</label>
              <select class="input" id="r-stretch">
                ${Object.keys(STRETCH_NAMES).map((k) => `<option value="${k}" ${draft.stretchKey === k ? 'selected' : ''}>${STRETCH_NAMES[k]}</option>`).join('')}
                <option value="" ${!draft.stretchKey ? 'selected' : ''}>None</option>
              </select></div>
          </div>

          <div class="stack">
            <div class="row-between"><h2>Exercises</h2>
              <span class="small muted" id="totals">${draft.items.length} exercises · ${setCount()} sets · about ${minutes()} min</span></div>
            <div class="card grid-table">
              <div class="ex-table">
                <div class="gt-row gt-head ex-row">
                  <span></span><span>Exercise</span><span>Sets</span><span>Reps</span><span>${units}</span><span>Rest (s)</span><span></span>
                </div>
                ${draft.items.length ? draft.items.map(itemRow).join('') : '<p class="empty">No exercises yet. Add some from the library.</p>'}
              </div>
            </div>
            <p class="tiny muted">Weights here are your starting point. The "Get ready" screen fills in what you lifted last time.</p>
          </div>
        </section>

        <aside class="side" style="flex:1 1 290px">
          <div class="stack">
            <h2>Exercise library</h2>
            <input class="input" id="lib-search" placeholder="Search exercises" aria-label="Search exercises" value="${esc(search)}">
            <div class="pills" role="group" aria-label="Muscle group">
              ${['all', 'push', 'pull', 'legs', 'core'].map((g) => `<button class="pill" data-filter="${g}" aria-pressed="${filter === g}">${g === 'all' ? 'All' : GL.GROUP_LABEL[g]}</button>`).join('')}
            </div>
            <div class="list" id="lib-list" style="max-height:560px; overflow-y:auto">${libraryRows()}</div>
            <button class="btn btn-dashed" id="custom-btn">+ Create custom exercise</button>
          </div>
        </aside>
      </div>`;
    wire();
  }

  function itemRow(it, i) {
    const n = draft.items.length;
    const cell = (label, field, value, extra = '') => `
      <label class="cell"><span class="cell-lbl">${label}</span>
        <input class="input num" data-field="${field}" data-i="${i}" value="${value}" ${extra} aria-label="${esc(it.name)} ${label}"></label>`;
    return `
      <div class="gt-row ex-row">
        <span class="ex-move">
          <button class="icon-btn" style="width:26px" data-move="${i}:-1" aria-label="Move ${esc(it.name)} up" ${i === 0 ? 'disabled' : ''}>${GL.icon.up(14)}</button>
          <button class="icon-btn" style="width:26px" data-move="${i}:1" aria-label="Move ${esc(it.name)} down" ${i === n - 1 ? 'disabled' : ''}>${GL.icon.down(14)}</button>
        </span>
        <span class="ex-name"><span style="display:block; font-weight:600; font-size:14px">${esc(it.name)}</span><span class="tiny muted">${esc(it.equipment)}</span></span>
        ${cell('Sets', 'sets', it.sets, 'inputmode="numeric"')}
        ${cell('Reps', 'reps', it.reps, 'inputmode="numeric"')}
        ${cell(settings.units, 'weight', it.isBodyweight ? '' : (it.weight ?? ''), it.isBodyweight ? 'disabled placeholder="BW" inputmode="decimal"' : 'placeholder="—" inputmode="decimal"')}
        ${cell('Rest (s)', 'restSeconds', it.restSeconds, 'inputmode="numeric"')}
        <button class="icon-btn danger ex-del" data-remove="${i}" aria-label="Remove ${esc(it.name)}">${GL.icon.x(16)}</button>
      </div>`;
  }

  function libraryRows() {
    const q = search.trim().toLowerCase();
    const rows = library.filter((e) => (filter === 'all' || e.group === filter) && (!q || e.name.toLowerCase().includes(q)));
    if (!rows.length) return '<p class="empty">Nothing matches.</p>';
    return rows.map((e) => {
      const added = draft.items.some((i) => i.exerciseId === e.id);
      return `<div class="list-row" style="padding:9px 12px; gap:10px">
        <span class="dot t t-${e.group}"></span>
        <span class="grow" style="flex:1"><span style="display:block; font-size:14px">${esc(e.name)}</span><span class="tiny muted">${esc(e.equipment)}${e.custom ? ' · yours' : ''}</span></span>
        ${added ? '<span class="small" style="color:var(--green-fg); font-weight:600">Added</span>'
          : `<button class="btn btn-sm" data-add="${e.id}" aria-label="Add ${esc(e.name)}">+ Add</button>`}
      </div>`;
    }).join('');
  }

  function wire() {
    $('#new-btn').addEventListener('click', () => { if (confirmLeave()) { history.replaceState(null, '', '/routines.html?new=1'); newDraft(); } });
    $$('[data-open]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirmLeave()) open(Number(a.dataset.open)).catch(GL.fail);
    }));
    $('#r-name').addEventListener('input', (e) => { draft.name = e.target.value; markDirty(); });
    $('#r-stretch').addEventListener('change', (e) => { draft.stretchKey = e.target.value || null; markDirty(); });
    $$('[data-type]').forEach((b) => b.addEventListener('click', () => { draft.type = b.dataset.type; dirty = true; render(); }));
    $$('[data-field]').forEach((inp) => inp.addEventListener('input', () => {
      draft.items[Number(inp.dataset.i)][inp.dataset.field] = inp.value;
      markDirty();
      $('#totals').textContent = `${draft.items.length} exercises · ${setCount()} sets · about ${minutes()} min`;
    }));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => { draft.items.splice(Number(b.dataset.remove), 1); dirty = true; render(); }));
    $$('[data-move]').forEach((b) => b.addEventListener('click', () => {
      const [i, dir] = b.dataset.move.split(':').map(Number);
      const [it] = draft.items.splice(i, 1);
      draft.items.splice(i + dir, 0, it);
      dirty = true;
      render();
    }));
    $('#lib-search').addEventListener('input', (e) => { search = e.target.value; $('#lib-list').innerHTML = libraryRows(); wireLibrary(); });
    $$('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; render(); }));
    $('#custom-btn').addEventListener('click', customModal);
    $('#save-btn').addEventListener('click', save);
    const del = $('#delete-btn');
    if (del) del.addEventListener('click', remove);
    wireLibrary();
  }

  function wireLibrary() {
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => addExercise(Number(b.dataset.add))));
  }

  function addExercise(id) {
    const e = library.find((x) => x.id === id);
    const isCore = e.group === 'core';
    draft.items.push({
      exerciseId: e.id, name: e.name, equipment: e.equipment, group: e.group, isBodyweight: e.isBodyweight,
      sets: 3, reps: e.isBigLift ? 5 : isCore ? 12 : 10, weight: null,
      restSeconds: e.isBigLift ? settings.restBig : settings.restOther
    });
    dirty = true;
    render();
  }

  function markDirty() {
    if (!dirty) {
      dirty = true;
      const p = $('.page-head .small');
      if (p && draft.id) p.textContent = 'Unsaved changes';
    }
  }

  function confirmLeave() {
    return !dirty || confirm('You have unsaved changes to this workout. Leave without saving?');
  }

  async function save() {
    const body = {
      name: draft.name, type: draft.type, stretchKey: draft.stretchKey || null,
      items: draft.items.map((i) => ({
        exerciseId: i.exerciseId, sets: i.sets, reps: i.reps,
        weight: i.isBodyweight || i.weight === '' || i.weight == null ? null : i.weight,
        restSeconds: i.restSeconds
      }))
    };
    try {
      const res = draft.id
        ? await api(`/routines/${draft.id}`, { method: 'PUT', body })
        : await api('/routines', { method: 'POST', body });
      routines = await api('/routines');
      dirty = false;
      await open(res.id);
      GL.toast('Workout saved. Add it to a day on the Schedule page.');
    } catch (err) { GL.fail(err); }
  }

  async function remove() {
    if (!confirm(`Delete "${draft.name}"? Your history stays, but it comes off your schedule.`)) return;
    try {
      await api(`/routines/${draft.id}`, { method: 'DELETE' });
      routines = await api('/routines');
      dirty = false;
      if (routines.length) await open(routines[0].id); else newDraft();
      GL.toast('Workout deleted.');
    } catch (err) { GL.fail(err); }
  }

  function customModal() {
    const m = GL.modal(`
      <h2>New exercise</h2>
      <form class="stack-lg" id="ex-form">
        <div class="field"><label for="ex-name">Name</label><input class="input" id="ex-name" maxlength="60" required></div>
        <div class="field"><label for="ex-group">Muscle group</label>
          <select class="input" id="ex-group"><option value="push">Push</option><option value="pull">Pull</option><option value="legs">Legs</option><option value="core">Core</option></select></div>
        <div class="field"><label for="ex-equip">Equipment</label>
          <select class="input" id="ex-equip">${['Barbell', 'Dumbbells', 'EZ bar', 'Cable', 'Machine', 'Kettlebell', 'Body weight', 'Band', 'Other'].map((x) => `<option>${x}</option>`).join('')}</select></div>
        <label class="row-center small"><input type="checkbox" id="ex-bw"> Body weight only (no weight to log)</label>
        <label class="row-center small"><input type="checkbox" id="ex-lower"> Lower body (suggests bigger jumps in weight)</label>
        <label class="row-center small"><input type="checkbox" id="ex-big"> Big lift (uses the longer rest time)</label>
        <div class="actions"><button type="button" class="btn" id="ex-cancel">Cancel</button><button class="btn btn-primary">Create and add</button></div>
      </form>`);
    const f = m.el;
    f.querySelector('#ex-equip').addEventListener('change', (e) => { f.querySelector('#ex-bw').checked = e.target.value === 'Body weight'; });
    f.querySelector('#ex-cancel').addEventListener('click', m.close);
    f.querySelector('#ex-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const ex = await api('/exercises', {
          method: 'POST',
          body: {
            name: f.querySelector('#ex-name').value, group: f.querySelector('#ex-group').value,
            equipment: f.querySelector('#ex-equip').value, isBodyweight: f.querySelector('#ex-bw').checked,
            lowerBody: f.querySelector('#ex-lower').checked, isBigLift: f.querySelector('#ex-big').checked
          }
        });
        library.push(ex);
        m.close();
        addExercise(ex.id);
      } catch (err) { GL.fail(err); }
    });
  }

  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
