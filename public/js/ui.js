// Shared helpers for every page: talking to the API, formatting, and the header/menu.
// Everything hangs off one global object, GL, so page scripts can use GL.api(...), GL.esc(...), etc.
(function () {
  const GL = {};

  // ---------- API ----------
  // GL.api('/routines') -> GET.  GL.api('/routines', { method: 'POST', body: {...} }) -> POST JSON.
  GL.api = async function (path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });
    if (res.status === 401 && !location.pathname.startsWith('/login')) {
      location.href = '/login.html';
      throw new Error('Please log in.');
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'Something went wrong.');
    return data;
  };

  // The browser's timezone, sent to the server so "today" and "this week" match your clock.
  GL.tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  // ---------- Safety ----------
  // Always run user-typed text through esc() before putting it in innerHTML (stops XSS).
  GL.esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  GL.$ = (sel, root = document) => root.querySelector(sel);
  GL.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  GL.params = () => new URLSearchParams(location.search);

  // ---------- Formatting ----------
  GL.num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 }));
  GL.weight = (w) => (w == null ? 'BW' : GL.num(w));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  GL.MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  GL.DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  GL.DOW3 = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  // 'YYYY-MM-DD' -> parts without timezone surprises.
  GL.parts = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return { y, m, d }; };
  GL.shortDate = (iso) => { const p = GL.parts(iso); return `${MONTHS[p.m - 1]} ${p.d}`; };
  GL.monthShort = (iso) => MONTHS[GL.parts(iso).m - 1].toUpperCase();
  GL.dayNum = (iso) => GL.parts(iso).d;
  GL.weekdayIndex = (iso) => { const p = GL.parts(iso); return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7; };
  GL.longDate = (iso) => `${GL.DOW[GL.weekdayIndex(iso)]}, ${GL.shortDate(iso)}`;
  GL.addDays = (iso, n) => { const p = GL.parts(iso); const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return d.toISOString().slice(0, 10); };
  GL.todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  GL.time12 = (hhmm) => {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  GL.clock = (secs) => `${Math.floor(secs / 60)}:${String(Math.max(0, secs) % 60).padStart(2, '0')}`;
  GL.minutes = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

  GL.TYPE_LABEL = { push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper', full: 'Full body', other: 'Other' };
  GL.GROUP_LABEL = { push: 'Push', pull: 'Pull', legs: 'Legs', core: 'Core' };
  GL.typeDot = (type) => `<span class="dot t t-${GL.esc(type || 'other')}"></span>`;
  GL.typeChip = (type, text) => `<span class="chip t t-${GL.esc(type || 'other')}">${GL.esc(text)}</span>`;

  // Estimated one-rep max, same formula as the server.
  GL.e1rm = (w, r) => (w == null ? null : Math.round(w * (1 + r / 30)));

  // Plates for one side of the bar, biggest first. Returns null if it can't be made exactly.
  GL.platesPerSide = (total, bar, plates) => {
    if (total == null || total < bar) return null;
    let left = Math.round(((total - bar) / 2) * 100) / 100;
    const out = [];
    for (const p of [...plates].sort((a, b) => b - a)) {
      while (left >= p - 1e-9) { out.push(p); left = Math.round((left - p) * 100) / 100; }
    }
    return left > 0.001 ? null : out;
  };

  // ---------- Feedback ----------
  let toastTimer;
  GL.toast = (message, isError = false) => {
    let el = document.getElementById('gl-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gl-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  };
  GL.fail = (err) => GL.toast(err && err.message ? err.message : String(err), true);

  // Simple modal. Returns { el, close }. Content is trusted HTML you build with GL.esc().
  GL.modal = (html, { sheet = false, wide = false } = {}) => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop' + (sheet ? ' as-sheet' : '');
    back.innerHTML = `<div class="modal${sheet ? ' sheet' : ''}${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });
    const first = back.querySelector('input, select, textarea');
    if (first && !sheet) first.focus();
    return { el: back.firstElementChild, close };
  };

  // ---------- Icons (inline SVG, stroke = currentColor) ----------
  const svg = (d, size = 18, w = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  GL.icon = {
    x: (s) => svg('<path d="M6 6l12 12M18 6L6 18"></path>', s),
    check: (s) => svg('<path d="M5 12l5 5L20 7"></path>', s, 2.5),
    left: (s) => svg('<path d="M15 6l-6 6 6 6"></path>', s),
    right: (s) => svg('<path d="M9 6l6 6-6 6"></path>', s),
    up: (s) => svg('<path d="M6 15l6-6 6 6"></path>', s),
    down: (s) => svg('<path d="M6 9l6 6 6-6"></path>', s),
    plus: (s) => svg('<path d="M12 5v14M5 12h14"></path>', s),
    gear: (s) => svg('<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>', s, 1.6),
    play: (s = 28) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>`,
    pause: (s = 28) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>`
  };

  // ---------- Sets, plans and time ----------
  // Seconds as "45s" or "1:30".
  GL.secs = (n) => (n == null ? '—' : n < 60 ? `${n}s` : GL.clock(n));
  // One logged set: "40×10", "BW×12", "45s" or "20×45s".
  GL.setText = (s) => (s.seconds != null
    ? `${s.weight != null ? GL.num(s.weight) + '×' : ''}${GL.secs(s.seconds)}`
    : `${GL.weight(s.weight)}×${s.reps}`);
  // A planned exercise: "3 × 10 · 40" or "3 × 45s".
  GL.planText = (it) => `${it.sets} × ${it.seconds != null && (it.isTimed || it.seconds) ? GL.secs(it.seconds) : it.reps}${it.weight != null ? ' · ' + GL.num(it.weight) : ''}`;

  GL.EQUIPMENT = {
    dumbbells: 'Dumbbells', bench: 'Adjustable bench', bands: 'Resistance bands', pullup: 'Pull-up bar',
    barbell: 'Barbell & rack', ezbar: 'EZ bar', cable: 'Cable machine', machine: 'Gym machines',
    dipstation: 'Dip station', abwheel: 'Ab wheel'
  };
  GL.canDo = (exercise, owned) => (exercise.needs || []).every((n) => owned.includes(n));

  // ---------- Drag to reorder ----------
  // Rows inside `list` need data-sort; each row's grab handle needs data-handle.
  // onMove(from, to) is called once you let go.
  GL.sortable = (list, onMove) => {
    list.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('[data-handle]');
      if (!handle || !list.contains(handle)) return;
      const item = handle.closest('[data-sort]');
      const rows = () => Array.from(list.querySelectorAll(':scope > [data-sort]'));
      const from = rows().indexOf(item);
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* window listeners still catch it */ }
      item.classList.add('dragging');
      let scrollTimer = null;
      let lastY = e.clientY;
      // Swap with neighbours until the dragged row sits where the finger is.
      // Only the neighbours move in the DOM, never the dragged row, so the pointer stays attached to it.
      const step = () => {
        for (let guard = 0; guard < 50; guard++) {
          const r = rows();
          const i = r.indexOf(item);
          const prev = r[i - 1];
          const next = r[i + 1];
          if (prev) {
            const b = prev.getBoundingClientRect();
            if (lastY < b.top + b.height / 2) { list.insertBefore(prev, item.nextSibling); continue; }
          }
          if (next) {
            const b = next.getBoundingClientRect();
            if (lastY > b.top + b.height / 2) { list.insertBefore(next, item); continue; }
          }
          break;
        }
      };
      const move = (ev) => {
        lastY = ev.clientY;
        step();
        clearInterval(scrollTimer);
        const edge = 70;
        const dir = lastY < edge ? -1 : lastY > window.innerHeight - edge ? 1 : 0;
        if (dir) scrollTimer = setInterval(() => { window.scrollBy(0, dir * 12); step(); }, 16);
      };
      const done = () => {
        clearInterval(scrollTimer);
        item.classList.remove('dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', done);
        window.removeEventListener('pointercancel', done);
        const to = rows().indexOf(item);
        if (to !== from) onMove(from, to);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', done);
      window.addEventListener('pointercancel', done);
    });
  };
  GL.moveItem = (arr, from, to) => { const [x] = arr.splice(from, 1); arr.splice(to, 0, x); return arr; };
  GL.gripIcon = () => '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"></circle><circle cx="15" cy="6" r="1.7"></circle><circle cx="9" cy="12" r="1.7"></circle><circle cx="15" cy="12" r="1.7"></circle><circle cx="9" cy="18" r="1.7"></circle><circle cx="15" cy="18" r="1.7"></circle></svg>';

  // ---------- Start sheet: one place to start anything ----------
  const STRETCH_TITLES = { full: 'Full body', push: 'Chest, shoulders & triceps', pull: 'Back & biceps', legs: 'Legs & hips' };
  GL.STRETCH_TITLES = STRETCH_TITLES;

  GL.startSheet = async () => {
    const m = GL.modal('<p class="muted">Loading…</p>', { sheet: true });
    try {
      const [routines, week, active] = await Promise.all([GL.api('/routines'), GL.api('/schedule'), GL.api('/workouts/active')]);
      const todayIdx = GL.weekdayIndex(GL.todayLocal());
      const plan = week[todayIdx];
      const planned = plan.kind === 'workout' ? routines.find((r) => r.id === plan.routineId) : null;

      let today = '';
      if (planned) {
        today = `<a class="start-today" href="/plan.html?routine=${planned.id}">
          <span><span class="label" style="color:inherit; opacity:.75">Planned today</span>
          <span class="start-today-name">${GL.esc(planned.name)}</span>
          <span class="small" style="opacity:.8">${planned.exerciseCount} exercises · ~${planned.minutes} min</span></span>
          <span class="start-go">Start ${GL.icon.right(18)}</span></a>`;
      } else if (plan.kind === 'stretch') {
        const k = plan.stretchKey || 'full';
        today = `<a class="start-today" href="/stretch.html?routine=${k}&amp;start=1">
          <span><span class="label" style="color:inherit; opacity:.75">Planned today</span>
          <span class="start-today-name">Stretch · ${STRETCH_TITLES[k]}</span></span>
          <span class="start-go">Start ${GL.icon.right(18)}</span></a>`;
      } else {
        today = `<p class="small muted">Today is a rest day on your schedule. Pick anything below to train anyway.</p>`;
      }

      m.el.innerHTML = `
        <div class="row-between" style="align-items:center"><h2>Start</h2>
          <button class="icon-btn" data-close aria-label="Close">${GL.icon.x(18)}</button></div>
        ${active ? `<a class="card pad-sm row-center" href="/focus.html?id=${active.id}" style="text-decoration:none; border:2px solid var(--ink)">
          <span style="flex:1"><b>${GL.esc(active.name)}</b> is still open</span><span class="btn btn-sm btn-primary">Resume</span></a>` : ''}
        ${today}
        <div class="stack">
          <p class="label">Your workouts</p>
          <div class="list" style="box-shadow:none; border:1px solid var(--line)">
            ${routines.map((r) => `
              <a class="list-row" href="/plan.html?routine=${r.id}" style="padding:10px 14px">
                ${GL.typeDot(r.type)}
                <span class="grow"><span class="title" style="font-size:15px">${GL.esc(r.name)}</span>
                <span class="sub">${r.exerciseCount} exercises · ~${r.minutes} min</span></span>
                <span class="btn btn-sm">Start</span>
              </a>`).join('') || '<p class="empty">No workouts yet.</p>'}
          </div>
          <a class="btn btn-dashed" href="/routine.html?new=1">+ Build a workout</a>
        </div>
        <div class="stack">
          <p class="label">Just stretch</p>
          <div class="pills">
            ${Object.keys(STRETCH_TITLES).map((k) => `<a class="pill" style="text-decoration:none" href="/stretch.html?routine=${k}&amp;start=1">${GL.typeDot(k === 'full' ? 'stretch' : k)}${STRETCH_TITLES[k]}</a>`).join('')}
          </div>
        </div>`;
      m.el.querySelector('[data-close]').addEventListener('click', m.close);
    } catch (err) { m.close(); GL.fail(err); }
  };

  // ---------- Header + phone tab bar ----------
  const NAV = [
    ['/', 'Dashboard', 'home'],
    ['/schedule.html', 'Schedule', 'schedule'],
    ['/routines.html', 'Workouts', 'routines'],
    ['/history.html', 'History', 'history'],
    ['/exercises.html', 'Exercises', 'exercises'],
    ['/stretch.html', 'Stretch', 'stretch'],
    ['/settings.html', 'Settings', 'settings']
  ];
  const TABS = [
    ['/', 'Home', 'home'],
    ['/schedule.html', 'Schedule', 'schedule'],
    ['#start', 'Start', 'start'],
    ['/routines.html', 'Workouts', 'routines'],
    ['/history.html', 'History', 'history']
  ];

  GL.shell = (active) => {
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      <div class="inner">
        <a class="brand" href="/">Gym Log</a>
        <nav class="nav" aria-label="Main">
          ${NAV.map(([href, label, key]) => `<a href="${href}" class="${key === active ? 'active' : ''}" ${key === active ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
        </nav>
        <div class="header-actions">
          <button class="btn btn-sm btn-primary header-start" data-start>${GL.icon.play(14)} Start workout</button>
          <a class="icon-btn" href="/settings.html" aria-label="Settings">${GL.icon.gear(20)}</a>
          <button class="btn btn-sm btn-ghost" id="logout-btn">Log out</button>
        </div>
      </div>`;
    document.body.prepend(header);

    const tabs = document.createElement('nav');
    tabs.className = 'tabbar';
    tabs.setAttribute('aria-label', 'Main');
    tabs.innerHTML = TABS.map(([href, label, key]) => key === 'start'
      ? `<button class="tab-start" data-start aria-label="Start a workout"><span class="tab-start-btn">${GL.icon.play(22)}</span><span>Start</span></button>`
      : `<a href="${href}" class="${key === active ? 'active' : ''}" ${key === active ? 'aria-current="page"' : ''}>${label}</a>`).join('');
    document.body.appendChild(tabs);

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-start]')) { e.preventDefault(); GL.startSheet(); }
    });
    GL.$('#logout-btn').addEventListener('click', async () => {
      try { await GL.api('/auth/logout', { method: 'POST', body: {} }); } catch (e) { /* ignore */ }
      location.href = '/login.html';
    });
  };

  window.GL = GL;
})();
