// Workouts page: just your saved workouts as cards. Tap one to edit, or Start it.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  GL.shell('routines');

  async function load() {
    try {
      const [routines, templates] = await Promise.all([api('/routines'), api('/routines/templates')]);
      render(routines, templates);
    } catch (err) { GL.fail(err); }
  }

  function render(routines, templates) {
    $('#page').innerHTML = `
      <div class="page-head">
        <div><h1>Workouts</h1><p>Tap a workout to change it. Start runs it in focus mode.</p></div>
        <div class="actions"><a class="btn btn-primary" href="/routine.html?new=1">+ New workout</a></div>
      </div>

      ${routines.length ? `
        <div class="routine-grid">
          ${routines.map((r) => `
            <div class="card routine-card">
              <a class="open" href="/routine.html?id=${r.id}">
                <span class="row-center" style="gap:8px">${GL.typeDot(r.type)}<span class="tiny muted">${GL.TYPE_LABEL[r.type]}</span></span>
                <h3 style="font-size:20px">${esc(r.name)}</h3>
                <span class="small muted">${r.exerciseCount} exercises · about ${r.minutes} min</span>
                <span class="names">${esc(r.exercises.slice(0, 4).join(' · '))}${r.exercises.length > 4 ? ` +${r.exercises.length - 4} more` : ''}</span>
              </a>
              <div class="row-actions">
                <a class="btn" href="/routine.html?id=${r.id}">Edit</a>
                <a class="btn btn-primary" href="/plan.html?routine=${r.id}">${GL.icon.play(14)} Start</a>
              </div>
            </div>`).join('')}
        </div>` : `
        <div class="card pad stack" style="max-width:640px">
          <h2>No workouts yet</h2>
          <p class="muted">Build your own, or add a ready-made home workout (dumbbells, adjustable bench and bands) and change it however you like.</p>
          <a class="btn btn-primary" href="/routine.html?new=1" style="align-self:flex-start">+ Build a workout</a>
        </div>`}

      <section class="stack">
        <h2>Home templates</h2>
        <p class="small muted" style="margin-top:-4px">One tap adds a copy to your workouts. Built for dumbbells, an adjustable bench and bands.</p>
        <div class="routine-grid">
          ${templates.map((t) => `
            <div class="card routine-card">
              <span class="row-center" style="gap:8px">${GL.typeDot(t.type)}<h3>${esc(t.name)}</h3></span>
              <span class="names">${esc(t.exercises.join(' · '))}</span>
              <div class="row-actions"><button class="btn" data-template="${t.key}">+ Add to my workouts</button></div>
            </div>`).join('')}
        </div>
      </section>`;

    $$('[data-template]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const { id } = await api('/routines/templates', { method: 'POST', body: { key: b.dataset.template } });
        location.href = `/routine.html?id=${id}`;
      } catch (err) { GL.fail(err); b.disabled = false; }
    }));
  }

  load();
})();
