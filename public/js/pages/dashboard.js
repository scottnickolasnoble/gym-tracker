// Dashboard: this week, streak, up next, recent workouts, weekly volume.
(function () {
  const GL = window.GL;
  const { $, esc, api } = GL;
  GL.shell('home');

  async function load() {
    try {
      const d = await api(`/dashboard?tz=${encodeURIComponent(GL.tz())}`);
      render(d);
    } catch (err) { GL.fail(err); }
  }

  function render(d) {
    const u = d.units;
    const weekEnd = GL.addDays(d.weekStart, 6);
    const pct = Math.min(100, Math.round((d.thisWeek.workouts / d.weeklyGoal) * 100));
    const startHref = d.upNext && d.upNext.kind === 'workout' ? `/plan.html?routine=${d.upNext.routineId}` : '/routines.html';

    const bw = d.bodyweight;
    const bwHint = !bw ? 'Not logged yet'
      : bw.change30 == null ? `Logged ${GL.shortDate(bw.date)}`
        : `${bw.change30 > 0 ? '+' : ''}${bw.change30} ${u} over 30 days`;

    $('#page').innerHTML = `
      <div class="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Week of ${GL.shortDate(d.weekStart)} – ${GL.shortDate(weekEnd)}</p>
        </div>
        <div class="actions">
          <button class="btn" id="bw-btn">Log body weight</button>
          <a class="btn btn-primary" href="${startHref}">+ Start workout</a>
        </div>
      </div>

      ${d.active ? `
        <a class="card pad-sm row-center" href="/focus.html?id=${d.active.id}" style="text-decoration:none; border:2px solid var(--ink);">
          <span class="grow" style="flex:1"><b>${esc(d.active.name)}</b> is still open</span>
          <span class="btn btn-sm btn-primary">Resume</span>
        </a>` : ''}

      <div class="stats">
        <div class="stat">
          <p class="label">Workouts this week</p>
          <p class="value">${d.thisWeek.workouts} <small>of ${d.weeklyGoal}</small></p>
          <div class="progress" style="margin-top:10px"><div style="width:${pct}%"></div></div>
          <p class="hint">${d.upNext ? (d.upNext.kind === 'workout' ? esc(d.upNext.routineName) : 'Stretch') + (d.upNext.daysAway === 0 ? ' is today' : d.upNext.daysAway === 1 ? ' is tomorrow' : ' is next') : 'Nothing scheduled'}</p>
        </div>
        <div class="stat">
          <p class="label">Volume this week</p>
          <p class="value">${GL.num(d.thisWeek.volume)} <small>${u}</small></p>
          <p class="hint">Last week ${GL.num(d.lastWeek.volume)} ${u}</p>
        </div>
        <div class="stat">
          <p class="label">Weekly streak</p>
          <p class="value">${d.streak} <small>${d.streak === 1 ? 'week' : 'weeks'}</small></p>
          <p class="hint">Weeks in a row you hit ${d.weeklyGoal} workouts</p>
        </div>
        <div class="stat">
          <p class="label">Body weight</p>
          <p class="value">${bw ? GL.num(bw.latest) + ` <small>${u}</small>` : '—'}</p>
          <p class="hint">${esc(bwHint)}</p>
        </div>
      </div>

      <section class="stack">
        <h2>This week</h2>
        <div class="week">${d.days.map(dayCard).join('')}</div>
      </section>

      <div class="split">
        <section class="main">
          <div class="stack">
            <div class="row-between"><h2>Recent workouts</h2><a class="small" href="/history.html">See all history</a></div>
            <div class="list">
              ${d.recent.length ? d.recent.map((w) => recentRow(w, u)).join('') : '<p class="empty">No workouts yet. Start one and it shows up here.</p>'}
            </div>
          </div>
        </section>
        <aside class="side">
          <section class="stack">
            <h2>Up next</h2>
            ${upNextCard(d.upNext)}
          </section>
          <section class="stack">
            <h2>Weekly volume</h2>
            <div class="card pad">
              ${volumeChart(d.volumeWeeks, u)}
              <p class="tiny muted" style="margin-top:10px">This week so far is the lighter bar.</p>
            </div>
          </section>
        </aside>
      </div>`;

    $('#bw-btn').addEventListener('click', () => bodyweightModal(u));
  }

  function dayCard(day, i) {
    const p = day.plan;
    const label = p.kind === 'workout' ? p.routineName : p.kind === 'stretch' ? 'Stretch' : '';
    const type = day.done.length ? day.done[0].type : p.kind === 'workout' ? p.routineType : 'stretch';
    const done = day.done.length > 0 || (p.kind === 'stretch' && day.stretched);
    const past = day.date < GL.todayLocal();
    let note = 'Rest';
    if (done) note = 'Done';
    else if (p.kind !== 'rest') note = past ? 'Missed' : 'Planned';
    const chipClass = done ? `chip t t-${type}` : 'chip plain';
    const doneName = day.done.length ? day.done[0].name : label;
    return `
      <div class="day-card ${p.kind === 'rest' && !day.done.length ? 'rest' : ''} ${day.isToday ? 'today' : ''}">
        <p class="dow">${GL.DOW3[i]} <b>${GL.dayNum(day.date)}</b></p>
        ${doneName ? `<span class="${chipClass}" style="align-self:flex-start">${esc(doneName)}</span>` : ''}
        <p class="note">${note}${day.stretched && p.kind !== 'stretch' ? ' + stretch' : ''}</p>
      </div>`;
  }

  function recentRow(w, u) {
    const exercises = (w.exercises || []).slice(0, 5).join(', ');
    return `
      <a class="list-row" href="/history.html?date=${w.date}">
        <div class="date-tile"><p class="m">${GL.monthShort(w.date)}</p><p class="d">${GL.dayNum(w.date)}</p></div>
        <div class="grow">
          <p class="title">${esc(w.name)}</p>
          <p class="sub">${GL.typeDot(w.type)}${esc(exercises || 'No sets logged')}</p>
          ${w.prs.length ? `<span class="chip pr" style="margin-top:6px">PR · ${esc(w.prs[0])}${w.prs.length > 1 ? ` +${w.prs.length - 1}` : ''}</span>` : ''}
        </div>
        <div style="text-align:right; min-width:86px">
          <p class="mono" style="font-size:15px">${GL.num(w.volume)} ${u}</p>
          <p class="tiny muted">${w.minutes} min</p>
        </div>
      </a>`;
  }

  function upNextCard(n) {
    if (!n) {
      return `<div class="card pad stack"><p class="muted">Nothing on the schedule.</p><a class="btn" href="/schedule.html">Set up your week</a></div>`;
    }
    const when = n.daysAway === 0 ? 'Today' : n.daysAway === 1 ? 'Tomorrow' : GL.DOW[n.day];
    if (n.kind === 'stretch') {
      return `<div class="card pad stack">
        <div class="row-between"><p class="row-center" style="font-weight:600">${GL.typeDot('stretch')} Stretch only</p><span class="tiny muted">${when}</span></div>
        <a class="btn btn-primary" href="/stretch.html?routine=${esc(n.stretchKey || 'full')}&amp;start=1">Start stretch</a>
      </div>`;
    }
    const items = n.items || [];
    return `<div class="card pad stack">
      <div class="row-between">
        <p class="row-center" style="font-weight:600; font-size:16px">${GL.typeDot(n.routineType)} ${esc(n.routineName)}</p>
        <span class="tiny muted">${when}${n.startTime ? ' · ' + GL.time12(n.startTime) : ''}</span>
      </div>
      <div>
        ${items.map((it) => `
          <div class="row-between" style="padding:7px 0; border-top:1px solid var(--line-soft); font-size:14px">
            <span>${esc(it.name)}</span>
            <span class="mono tiny muted">${it.sets} × ${it.reps}${it.weight != null ? ' · ' + GL.num(it.weight) : ''}</span>
          </div>`).join('')}
      </div>
      <a class="btn btn-primary" href="/plan.html?routine=${n.routineId}">Start ${esc(n.routineName)}</a>
    </div>`;
  }

  function volumeChart(weeks, u) {
    const max = Math.max(1, ...weeks.map((w) => w.volume));
    const label = `Weekly volume for the last 8 weeks, from ${GL.num(weeks[0].volume)} to ${GL.num(weeks[weeks.length - 1].volume)} ${u}`;
    return `
      <div class="bars" role="img" aria-label="${esc(label)}">
        ${weeks.map((w) => `<div class="bar ${w.current ? 'current' : ''}" style="height:${Math.round((w.volume / max) * 100)}%" title="${GL.num(w.volume)} ${u}"></div>`).join('')}
      </div>
      <div class="bar-labels">${weeks.map((w) => `<span>${w.current ? 'Now' : GL.shortDate(w.week)}</span>`).join('')}</div>`;
  }

  function bodyweightModal(u) {
    const m = GL.modal(`
      <h2>Log body weight</h2>
      <form class="stack-lg" id="bw-form">
        <div class="field"><label for="bw-val">Weight (${u})</label>
          <input class="input mono" id="bw-val" inputmode="decimal" required></div>
        <div class="field"><label for="bw-date">Date</label>
          <input class="input" id="bw-date" type="date" value="${GL.todayLocal()}"></div>
        <div class="actions"><button type="button" class="btn" id="bw-cancel">Cancel</button><button class="btn btn-primary">Save</button></div>
      </form>`);
    m.el.querySelector('#bw-cancel').addEventListener('click', m.close);
    m.el.querySelector('#bw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/bodyweight', { method: 'POST', body: { weight: m.el.querySelector('#bw-val').value, date: m.el.querySelector('#bw-date').value } });
        m.close();
        GL.toast('Body weight saved.');
        load();
      } catch (err) { GL.fail(err); }
    });
  }

  load();
})();
