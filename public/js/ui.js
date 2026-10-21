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
  GL.modal = (html) => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });
    const first = back.querySelector('input, select, textarea, button');
    if (first) first.focus();
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
    ['/routines.html', 'Workouts', 'routines'],
    ['/stretch.html', 'Stretch', 'stretch'],
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
          <a class="icon-btn" href="/settings.html" aria-label="Settings">${GL.icon.gear(20)}</a>
          <button class="btn btn-sm btn-ghost" id="logout-btn">Log out</button>
        </div>
      </div>`;
    document.body.prepend(header);

    const tabs = document.createElement('nav');
    tabs.className = 'tabbar';
    tabs.setAttribute('aria-label', 'Main');
    tabs.innerHTML = TABS.map(([href, label, key]) =>
      `<a href="${href}" class="${key === active ? 'active' : ''}" ${key === active ? 'aria-current="page"' : ''}>${label}</a>`).join('');
    document.body.appendChild(tabs);

    GL.$('#logout-btn').addEventListener('click', async () => {
      try { await GL.api('/auth/logout', { method: 'POST', body: {} }); } catch (e) { /* ignore */ }
      location.href = '/login.html';
    });
  };

  window.GL = GL;
})();
