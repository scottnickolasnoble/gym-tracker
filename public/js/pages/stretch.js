// Stretch page: pick a routine, see the moves, then follow along in dark focus mode.
(function () {
  const GL = window.GL;
  const { $, $$, esc, api } = GL;
  const S = GL.Stretch;
  GL.shell('stretch');

  const params = GL.params();
  let key = S.ROUTINES[params.get('routine')] ? params.get('routine') : 'full';

  function renderList() {
    document.body.classList.remove('focus');
    $('#page').className = 'page';
    $('.site-header').hidden = false;
    $('.tabbar').hidden = false;
    const r = S.ROUTINES[key];
    $('#page').innerHTML = `
      <div class="page-head">
        <div><h1>Stretch</h1><p>Pick what you trained for a 10–15 minute routine.</p></div>
      </div>
      <div class="split">
        <section class="main">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px" role="group" aria-label="Routine">
            ${Object.entries(S.ROUTINES).map(([k, x]) => `
              <button class="card pad-sm" data-key="${k}" aria-pressed="${k === key}"
                style="text-align:left; border:${k === key ? '2px solid var(--ink)' : '2px solid transparent'}; display:flex; flex-direction:column; gap:3px">
                <span class="row-center" style="font-weight:600">${GL.typeDot(x.type)} ${esc(x.label)}</span>
                <span class="tiny muted">${S.minutes(k)} · ${x.ids.length} stretches</span>
              </button>`).join('')}
          </div>
          <div class="stack">
            <div class="row-between"><h2>${esc(r.title)}</h2><span class="mono">${S.minutes(key)}</span></div>
            <p class="tiny muted" style="margin-top:-6px">${esc(r.muscles)}</p>
            <div class="list">
              ${S.items(key).map((s) => `
                <div class="list-row" style="padding:8px 12px; gap:12px">
                  ${S.figure(s.pose, { className: 'pose-thumb' })}
                  <div class="grow"><p style="font-weight:600; font-size:14px">${esc(s.name)}</p><p class="tiny muted">${esc(s.muscle)}</p></div>
                  <span class="mono tiny" style="text-align:right">${s.hold}s${s.sides ? '<br>each side' : ''}</span>
                </div>`).join('')}
            </div>
          </div>
        </section>
        <aside class="side">
          <div class="card pad stack">
            <p class="small">Orange in each drawing is where you should feel the stretch. Ease in, breathe slowly, never bounce, and back off if anything pinches or hurts.</p>
            <button class="btn btn-primary btn-block" id="start" style="min-height:52px">Start in focus mode · ${S.minutes(key)}</button>
          </div>
        </aside>
      </div>`;
    $$('[data-key]').forEach((b) => b.addEventListener('click', () => {
      key = b.dataset.key;
      history.replaceState(null, '', `/stretch.html?routine=${key}`);
      renderList();
    }));
    $('#start').addEventListener('click', play);
  }

  function play() {
    document.body.classList.add('focus');
    $('.site-header').hidden = true;
    $('.tabbar').hidden = true;
    const root = $('#page');
    root.className = 'focus-shell';
    S.keepAwake();
    S.Player(root, {
      key,
      onExit: renderList,
      onFinish: async (seconds) => {
        try { await api('/stretches', { method: 'POST', body: { key, seconds } }); } catch (err) { GL.fail(err); }
        root.innerHTML = `
          <div class="f-center">
            <div class="f-check">${GL.icon.check(34)}</div>
            <h1 class="f-title" style="font-size:32px">Stretch done</h1>
            <p class="muted">${esc(S.ROUTINES[key].title)} · ${GL.clock(seconds)}</p>
          </div>
          <div class="f-actions"><a class="f-primary" href="/">Back to home</a>
            <button class="f-link" id="again">Pick another routine</button></div>`;
        $('#again').addEventListener('click', renderList);
      }
    });
  }

  if (params.get('start')) play(); else renderList();
})();
