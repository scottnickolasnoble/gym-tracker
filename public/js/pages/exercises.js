// Exercises: pick a lift, see its trend, records and recent sessions.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('exercises');

  let library = [];
  let units = 'lb';
  let selectedId = Number(GL.params().get('id')) || null;
  let detail = null;
  let range = '3M';
  let filter = 'all';
  let search = '';

  async function load() {
    try {
      const [lib, s] = await Promise.all([api('/exercises'), api('/settings')]);
      library = lib;
      units = s.units;
      if (!selectedId) {
        const used = [...library].sort((a, b) => b.sessions - a.sessions)[0];
        selectedId = used ? used.id : library[0].id;
      }
      await select(selectedId);
    } catch (err) { GL.fail(err); }
  }

  async function select(id) {
    selectedId = id;
    history.replaceState(null, '', `/exercises.html?id=${id}`);
    detail = await api(`/exercises/${id}/progress?tz=${encodeURIComponent(GL.tz())}`);
    render();
  }

  function render() {
    const ex = detail.exercise;
    // What to track: hold time for timed exercises, reps for body weight, estimated 1RM otherwise.
    const mode = ex.isTimed ? 'time' : ex.isBodyweight ? 'reps' : 'weight';
    const bw = mode !== 'weight';
    const metric = (s) => (mode === 'time' ? s.maxSeconds : mode === 'reps' ? s.maxReps : s.e1rm);
    const show = (val) => (mode === 'time' ? GL.secs(val) : mode === 'reps' ? `${val} <small>reps</small>` : `${GL.num(val)} <small>${units}</small>`);
    const L = {
      time: ['Longest hold', 'Longest hold per session', 'Your longest timed set each session.', 'Longest'],
      reps: ['Most reps in a set', 'Most reps per session', 'Your highest-rep set each session.', 'Max reps'],
      weight: ['Estimated 1-rep max', 'Estimated 1-rep max', 'Worked out from your best set each session (weight × reps). Filled dots are new records.', 'Est. 1RM']
    }[mode];
    const days = { '1M': 31, '3M': 92, '1Y': 366, All: 100000 }[range];
    const cutoff = Date.now() - days * 86400000;
    const shown = detail.sessions.filter((s) => new Date(s.date).getTime() >= cutoff && metric(s) != null);
    const first = shown[0];
    const lastS = shown[shown.length - 1];
    const best = detail.sessions.reduce((b, s) => (metric(s) != null && (!b || metric(s) > metric(b)) ? s : b), null);
    const r = detail.records;

    $('#page').innerHTML = `
      <div class="split">
        <aside class="side" style="flex:1 1 260px">
          <div class="stack">
            <label class="label" for="ex-search">Find an exercise</label>
            <input class="input" id="ex-search" placeholder="Search exercises" value="${esc(search)}">
            <div class="pills" role="group" aria-label="Muscle group">
              ${['all', 'push', 'pull', 'legs', 'core'].map((g) => `<button class="pill" data-filter="${g}" aria-pressed="${filter === g}">${g === 'all' ? 'All' : GL.GROUP_LABEL[g]}</button>`).join('')}
            </div>
            <div class="list" id="ex-list" style="max-height:620px; overflow-y:auto">${listRows()}</div>
          </div>
        </aside>

        <section class="main">
          <div class="page-head">
            <div>
              <p class="small muted row-center">${GL.typeDot(ex.group)} ${GL.GROUP_LABEL[ex.group]} · ${esc(ex.equipment)}${ex.custom ? ' · yours' : ''}</p>
              <h1>${esc(ex.name)}</h1>
            </div>
            ${ex.custom ? '<div class="actions"><button class="btn btn-danger" id="del-ex">Delete exercise</button></div>' : ''}
          </div>

          <div class="stats">
            <div class="stat"><p class="label">${L[0]}</p>
              <p class="value">${lastS ? show(metric(lastS)) : '—'}</p>
              <p class="hint ${first && lastS && metric(lastS) > metric(first) ? 'good' : ''}">${first && lastS && first !== lastS ? changeText(metric(lastS) - metric(first), mode) : 'Log a few sessions to see a trend'}</p></div>
            <div class="stat"><p class="label">Best ever</p>
              <p class="value">${best ? (mode === 'weight' ? `${GL.num(best.bestSet.weight)} × ${best.bestSet.reps}` : show(metric(best))) : '—'}</p>
              <p class="hint">${best ? GL.shortDate(best.date) : ''}</p></div>
            <div class="stat"><p class="label">Sessions</p><p class="value">${detail.sessions.length}</p>
              <p class="hint">${detail.sessions.length ? 'Since ' + GL.shortDate(detail.sessions[0].date) : 'Not done yet'}</p></div>
          </div>

          <section class="card pad stack">
            <div class="row-between" style="align-items:center; flex-wrap:wrap">
              <h2>${L[1]}</h2>
              <div class="seg" role="group" aria-label="Range">
                ${['1M', '3M', '1Y', 'All'].map((x) => `<button data-range="${x}" aria-pressed="${range === x}">${x}</button>`).join('')}
              </div>
            </div>
            ${chart(shown, metric, bw)}
            <p class="tiny muted">${L[2]}</p>
          </section>

          <div class="split">
            ${bw ? '' : `<section class="stack" style="flex:1 1 240px; min-width:0">
              <h2>Records</h2>
              <div class="list">
                ${[['Heaviest single', r.single], ['Best 3 reps', r.three], ['Best 5 reps', r.five], ['Best 10 reps', r.ten]].map(([label, rec]) => `
                  <div class="list-row" style="justify-content:space-between">
                    <span style="font-weight:600; font-size:14px">${label}</span>
                    <span style="text-align:right"><span class="mono" style="display:block">${rec ? GL.num(rec.weight) + ' ' + units : '—'}</span>
                    <span class="tiny muted">${rec ? GL.shortDate(rec.date) : ''}</span></span>
                  </div>`).join('')}
              </div>
            </section>`}
            <section class="stack" style="flex:2 1 380px; min-width:0">
              <h2>Recent sessions</h2>
              <div class="card grid-table">
                <div style="min-width:420px">
                  <div class="gt-row gt-head" style="grid-template-columns:70px minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)">
                    <span>Date</span><span>Sets</span><span style="text-align:right">Volume</span><span style="text-align:right">${L[3]}</span>
                  </div>
                  ${[...detail.sessions].reverse().slice(0, 10).map((s) => `
                    <div class="gt-row" style="grid-template-columns:70px minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)">
                      <a class="small" style="font-weight:600" href="/history.html?date=${s.date.slice(0, 10)}">${GL.shortDate(s.date)}</a>
                      <span class="mono tiny">${s.sets.map(GL.setText).join(' · ')}</span>
                      <span class="mono small" style="text-align:right">${bw ? '—' : GL.num(s.volume)}</span>
                      <span class="mono small" style="text-align:right">${mode === 'time' ? GL.secs(s.maxSeconds) : mode === 'reps' ? s.maxReps : GL.num(s.e1rm)}</span>
                    </div>`).join('') || '<p class="empty">No sessions yet.</p>'}
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>`;
    wire();
  }

  const changeText = (diff, mode) => {
    const r = Math.round(diff * 10) / 10;
    const unit = mode === 'time' ? 's' : mode === 'reps' ? ' reps' : ' ' + units;
    return `${r >= 0 ? '+' : ''}${GL.num(r)}${unit} in this range`;
  };

  function listRows() {
    const q = search.trim().toLowerCase();
    const rows = library.filter((e) => (filter === 'all' || e.group === filter) && (!q || e.name.toLowerCase().includes(q)));
    return rows.map((e) => `
      <a class="list-row ${e.id === selectedId ? 'selected' : ''}" href="/exercises.html?id=${e.id}" data-id="${e.id}" style="padding:11px 14px; gap:10px">
        ${GL.typeDot(e.group)}<span style="flex:1; font-size:14px; ${e.id === selectedId ? 'font-weight:600' : ''}">${esc(e.name)}</span>
        <span class="mono tiny muted">${e.isTimed ? (e.maxSeconds ? GL.secs(e.maxSeconds) : '') : e.isBodyweight ? (e.maxReps ? e.maxReps + ' reps' : '') : (e.bestE1rm ? GL.num(e.bestE1rm) : '')}</span>
      </a>`).join('') || '<p class="empty">Nothing matches.</p>';
  }

  function chart(sessions, metric, bw) {
    if (sessions.length < 2) return '<p class="empty" style="padding:30px 0; text-align:center">Not enough sessions in this range for a chart yet.</p>';
    const W = 720, H = 240, L = 48, R = 12, T = 16, B = 30;
    const ys = sessions.map(metric);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = Math.max(1, (hi - lo) * 0.15);
    lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
    const t0 = new Date(sessions[0].date).getTime();
    const t1 = new Date(sessions[sessions.length - 1].date).getTime();
    const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let running = -Infinity;
    const pts = sessions.map((s) => {
      const v = metric(s);
      const pr = v > running; if (pr) running = v;
      return { x: x(new Date(s.date).getTime()), y: y(v), v, pr, date: s.date };
    });
    const grid = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
    const labelIdx = [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])];
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${bw ? 'Best set' : 'Estimated one-rep max'} from ${GL.num(ys[0])} to ${GL.num(ys[ys.length - 1])} over ${sessions.length} sessions`)}">
      ${grid.map((g) => `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="#E2E0D6"></line>
        <text x="${L - 8}" y="${y(g) + 4}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="11" fill="#5B6760">${Math.round(g)}</text>`).join('')}
      <polyline fill="none" stroke="#4A6FA5" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}"></polyline>
      ${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${p.pr ? 5 : 4}" fill="${p.pr ? '#4A6FA5' : '#FFFFFF'}" stroke="#4A6FA5" stroke-width="2"><title>${GL.shortDate(p.date)}: ${GL.num(p.v)}</title></circle>`).join('')}
      ${labelIdx.map((k) => `<text x="${pts[k].x}" y="${H - 8}" text-anchor="${k === 0 ? 'start' : k === pts.length - 1 ? 'end' : 'middle'}" font-family="Inter, sans-serif" font-size="11" fill="#5B6760">${GL.shortDate(pts[k].date)}</text>`).join('')}
    </svg>`;
  }

  function wire() {
    $('#ex-search').addEventListener('input', (e) => { search = e.target.value; $('#ex-list').innerHTML = listRows(); wireList(); });
    $$('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; render(); }));
    $$('[data-range]').forEach((b) => b.addEventListener('click', () => { range = b.dataset.range; render(); }));
    const del = $('#del-ex');
    if (del) del.addEventListener('click', async () => {
      if (!confirm('Delete this exercise? It also comes out of any workouts that use it.')) return;
      try {
        await api(`/exercises/${selectedId}`, { method: 'DELETE' });
        library = library.filter((e) => e.id !== selectedId);
        GL.toast('Exercise deleted.');
        await select(library[0].id);
      } catch (err) { GL.fail(err); }
    });
    wireList();
  }

  function wireList() {
    $$('[data-id]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); select(Number(a.dataset.id)).catch(GL.fail); }));
  }

  load();
})();
