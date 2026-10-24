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
          <button class="btn btn-primary" data-start>${GL.icon.play(14)} Start workout</button>
        </div>
      </div>

      ${todayCard(d)}

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
        <div class="row-between"><h2>This week</h2>${d.days.some((x) => x.plan.note && x.date >= d.today) ? '<button class="btn btn-sm btn-ghost" id="reset-pushes">Back to normal plan</button>' : '<span class="tiny muted">Tap a day to push it</span>'}</div>
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
    // Push or skip a day (today card's "Can't make it?" and the week strip).
    GL.$$('[data-push]').forEach((b) => b.addEventListener('click', () => {
      const day = d.days.find((x) => x.date === b.dataset.push);
      GL.pushSheet({ date: day.date, ...day.plan }, load);
    }));
    const reset = $('#reset-pushes');
    if (reset) reset.addEventListener('click', () => GL.resetPushes(load));
  }

  // The first thing on the page: what's on today, with one big Start button.
  function todayCard(d) {
    if (d.active) {
      return `<div class="card today-card dark">
        <div><p class="label">In progress</p><p class="big-name">${esc(d.active.name)}</p><p class="small muted">Pick up where you left off.</p></div>
        <a class="btn btn-light" href="/focus.html?id=${d.active.id}">${GL.icon.play(16)} Resume</a></div>`;
    }
    const today = d.days.find((x) => x.isToday);
    const p = today.plan;
    if (today.done.length) {
      return `<div class="card today-card">
        <div><p class="label">Today</p><p class="big-name">${esc(today.done[0].name)} done ${GL.icon.check(22)}</p>
        <p class="small muted">${d.upNext ? 'Next up: ' + esc(d.upNext.kind === 'workout' ? d.upNext.routineName : 'Stretch') + ' (' + (d.upNext.daysAway === 1 ? 'tomorrow' : GL.DOW[d.upNext.day]) + ')' : 'Nice work.'}</p></div>
        <button class="btn" data-start>Do something else</button></div>`;
    }
    if (p.kind === 'workout') {
      return `<div class="card today-card dark">
        <div><p class="label">Today${p.startTime ? ' · ' + GL.time12(p.startTime) : ''}</p><p class="big-name">${esc(p.routineName)}</p>
        <p class="small muted">${d.upNext && d.upNext.items ? d.upNext.items.length + ' exercises' : ''}${p.stretchAfter ? ' · then a cool-down stretch' : ''}</p></div>
        <div class="stack" style="align-items:center; gap:4px">
          <a class="btn btn-light" href="/plan.html?routine=${p.routineId}">${GL.icon.play(16)} Start</a>
          <button class="cant" data-push="${today.date}">Can't make it?</button>
        </div></div>`;
    }
    if (p.kind === 'stretch') {
      const k = p.stretchKey || 'full';
      return `<div class="card today-card dark">
        <div><p class="label">Today</p><p class="big-name">Stretch · ${esc(GL.STRETCH_TITLES[k])}</p></div>
        <div class="stack" style="align-items:center; gap:4px">
          <a class="btn btn-light" href="/stretch.html?routine=${k}&amp;start=1">${GL.icon.play(16)} Start</a>
          <button class="cant" data-push="${today.date}">Can't make it?</button>
        </div></div>`;
    }
    return `<div class="card today-card">
      <div><p class="label">Today</p><p class="big-name">Rest day</p><p class="small muted">${p.note === 'skipped' ? 'You skipped today.' : p.note === 'pushed-off' ? 'You pushed today\'s workout.' : 'Nothing planned.'} Want to train anyway?</p></div>
      <button class="btn btn-primary" data-start>${GL.icon.play(14)} Pick a workout</button></div>`;
  }

  // Planned days that aren't done yet can be tapped to push or skip them.
  function dayCard(day, i) {
    const p = day.plan;
    const label = p.kind === 'workout' ? p.routineName : p.kind === 'stretch' ? 'Stretch' : '';
    const type = day.done.length ? day.done[0].type : p.kind === 'workout' ? p.routineType : 'stretch';
    const done = day.done.length > 0 || (p.kind === 'stretch' && day.stretched);
    const past = day.date < GL.todayLocal();
    let note = p.note === 'skipped' ? 'Skipped' : p.note === 'pushed-off' ? 'Pushed' : 'Rest';
    if (done) note = 'Done';
    else if (p.kind !== 'rest') note = past ? 'Missed · push?' : 'Planned';
    const chipClass = done ? `chip t t-${type}` : 'chip plain';
    const doneName = day.done.length ? day.done[0].name : label;
    const canPush = !done && p.kind !== 'rest';
    const tag = p.note === 'moved' && !done ? '<span class="note-tag">Moved</span>' : '';
    const tagName = canPush ? 'button' : 'div';
    return `
      <${tagName} class="day-card ${p.kind === 'rest' && !day.done.length ? 'rest' : ''} ${day.isToday ? 'today' : ''}"
        ${canPush ? `data-push="${day.date}" aria-label="${esc(label)} on ${GL.longDate(day.date)}. Tap to push or skip."` : ''}>
        <span class="dow">${GL.DOW3[i]} <b>${GL.dayNum(day.date)}</b></span>
        ${doneName ? `<span class="${chipClass}" style="align-self:flex-start">${esc(doneName)}</span>` : ''}
        ${tag}
        <span class="note">${note}${day.stretched && p.kind !== 'stretch' ? ' + stretch' : ''}</span>
      </${tagName}>`;
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
      return `<div class="card pad stack"><p class="muted">Nothing on the schedule.</p><a class="btn" href="/schedule.html">Set up your week</a><a class="btn" href="/routines.html">Build a workout</a></div>`;
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
            <span class="mono tiny muted">${GL.planText(it)}</span>
          </div>`).join('')}
      </div>
      <a class="btn" href="/routine.html?id=${n.routineId}">View workout</a>
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
