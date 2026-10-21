// Stretch routines, the stick-figure drawings, and the follow-along player.
// Used by the Stretch page and by focus mode's cool-down.
(function () {
  const GL = window.GL;

  // Each pose is drawn in a 120 x 100 box. body = lines of the figure, hl = the part you
  // should feel (drawn orange), props = wall/bench/door, dash = towel or band, h = head.
  const POSES = {
    quad: { h: [60, 14], body: ['60,20 60,50 60,92', '60,26 72,40', '60,26 54,42 53,55', '61,70 53,56'], hl: ['60,50 61,70'] },
    hamstring: { h: [76, 24], body: ['50,92 50,52 70,30', '66,33 86,64'], hl: ['50,52 92,68'], props: ['82,70 112,70', '86,70 86,92', '108,70 108,92'] },
    hipflexor: { h: [55, 17], body: ['55,24 55,55', '55,55 78,58 78,91', '55,30 63,42 56,52', '42,90 22,91'], hl: ['55,55 42,90'] },
    pigeon: { h: [85, 64], body: ['50,80 79,70', '74,72 98,88', '50,82 15,90'], hl: ['50,84 76,89'] },
    butterfly: { h: [60, 47], body: ['60,54 60,86', '60,62 56,80', '60,62 64,80', '36,80 56,90', '84,80 64,90'], hl: ['60,86 36,80', '60,86 84,80'] },
    calf: { h: [86, 22], body: ['55,55 80,28', '78,32 100,30', '55,55 72,72 74,92'], hl: ['55,55 35,92'], props: ['101,8 101,93'] },
    forwardfold: { h: [86, 56], body: ['72,64 100,84'], hl: ['40,88 80,60', '40,88 104,88'] },
    figure4: { h: [13, 84], body: ['20,86 60,86', '30,85 70,66', '60,86 84,74 72,62'], hl: ['60,86 70,64 90,70'] },
    child: { h: [90, 84], body: ['48,80 74,90 48,92', '82,84 112,90'], hl: ['48,80 84,82'] },
    childside: { h: [90, 84], body: ['48,80 74,90 48,92', '82,84 108,74'], hl: ['48,80 84,82', '84,82 108,74'] },
    doorway: { h: [57, 14], body: ['57,21 55,55', '55,55 50,92', '55,55 62,92'], hl: ['57,28 71,28 71,12'], props: ['74,4 74,93'] },
    clasp: { h: [61, 15], body: ['60,58 54,92', '60,58 66,92', '60,22 60,58'], hl: ['60,28 44,52'] },
    crossbody: { h: [60, 18], body: ['60,25 60,58', '60,58 52,92', '60,58 68,92', '54,30 48,40 44,34'], hl: ['66,30 38,34'] },
    triceps: { h: [60, 16], body: ['60,23 60,58', '60,58 52,92', '60,58 68,92', '55,28 57,12 66,9'], hl: ['65,28 68,8 56,20'] },
    needle: { h: [80, 82], body: ['40,62 40,90 18,90', '68,72 70,90', '40,62 72,74'], hl: ['70,80 104,90'] },
    neck: { h: [52, 16], body: ['60,30 60,58', '60,58 52,92', '60,58 68,92', '56,31 44,14 47,9', '64,31 70,50'], hl: ['60,30 54,21'] },
    wrist: { h: [52, 14], body: ['54,21 54,58', '54,58 48,92', '54,58 60,92', '54,34 84,38 91,24'], hl: ['54,30 90,32 92,20'] },
    cobra: { h: [80, 54], body: ['72,66 76,91', '50,88 10,90'], hl: ['50,88 77,61'] },
    catcow: { h: [80, 68], body: ['30,60 30,90 10,90', '70,60 70,91'], hl: ['30,60 50,48 70,60'] },
    sidebend: { h: [76, 17], body: ['60,56 52,92', '60,56 68,92', '56,34 50,48'], hl: ['60,56 64,38 72,24', '68,28 72,8 88,14'] },
    biceps: { h: [58, 15], body: ['58,22 58,56', '58,56 52,92', '58,56 64,92'], hl: ['58,28 89,42'], props: ['91,8 91,93'] },
    twist: { h: [43, 48], body: ['40,88 95,88', '40,88 66,70 62,88', '42,62 26,86', '42,62 64,72'], hl: ['40,88 42,55'] },
    kneeschest: { h: [13, 84], body: ['30,84 64,66', '55,86 64,62 80,74'], hl: ['20,86 55,86'] },
    strap: { h: [8, 84], body: ['15,86 55,86', '55,86 100,88', '30,84 40,76'], hl: ['55,86 78,22'], dash: ['78,22 40,76'] }
  };

  // [name, pose, hold seconds, both sides?, muscle, how-to]
  const STRETCHES = {
    quad: ['Standing quad stretch', 'quad', 45, true, 'Quads', 'Stand tall and pull your heel toward your glute. Keep your knees together and squeeze the glute.'],
    hamstring: ['Bench hamstring stretch', 'hamstring', 45, true, 'Hamstrings', 'Heel up on a low bench, leg straight. Hinge at the hips with a flat back until you feel the back of the thigh.'],
    hipflexor: ['Half-kneeling hip flexor', 'hipflexor', 45, true, 'Hip flexors', 'Back knee down. Tuck your hips under and shift forward gently. Raise the same-side arm to deepen it.'],
    pigeon: ['Pigeon', 'pigeon', 60, true, 'Glutes & hips', 'Front shin across, back leg long. Keep your hips square and lean forward over the front leg.'],
    butterfly: ['Butterfly', 'butterfly', 60, false, 'Inner thighs', 'Soles of the feet together, sit tall. Let your knees drop and press lightly with your elbows.'],
    calf: ['Wall calf stretch', 'calf', 45, true, 'Calves', 'Hands on the wall, back leg straight, heel pressed into the floor.'],
    forwardfold: ['Seated forward fold', 'forwardfold', 60, false, 'Hamstrings & lower back', 'Legs straight out. Reach for your toes by folding at the hips, not by rounding your back.'],
    figure4: ['Lying figure-4', 'figure4', 60, true, 'Glutes', 'On your back, ankle over the opposite knee. Pull the bottom thigh in toward your chest.'],
    child: ["Child's pose", 'child', 60, false, 'Lower back & lats', 'Knees wide, sit back on your heels, arms long in front. Breathe into your back.'],
    childside: ["Child's pose side reach", 'childside', 45, true, 'Lats', "From child's pose, walk both hands to one side. Feel it along the opposite side of your back."],
    doorway: ['Doorway chest stretch', 'doorway', 45, true, 'Chest', 'Forearm on the door frame, elbow at shoulder height. Step through until your chest opens up.'],
    clasp: ['Behind-the-back clasp', 'clasp', 45, false, 'Chest & front shoulders', 'Clasp your hands behind you, straighten your arms and lift them a little. Chest up, shoulders down.'],
    crossbody: ['Cross-body shoulder', 'crossbody', 45, true, 'Rear shoulder', 'Pull one arm across your chest at shoulder height. Keep that shoulder down, away from your ear.'],
    triceps: ['Overhead triceps', 'triceps', 45, true, 'Triceps', 'Reach one hand down your back and use the other hand to ease the elbow back.'],
    needle: ['Thread the needle', 'needle', 45, true, 'Upper back & shoulders', 'On all fours, slide one arm under your body and let that shoulder rest on the floor.'],
    neck: ['Neck side tilt', 'neck', 30, true, 'Neck & traps', 'Tilt your ear toward your shoulder and rest your hand on your head. Let its weight do the work, no pulling.'],
    wrist: ['Wrist & forearm', 'wrist', 30, true, 'Forearms', 'Arm straight out, palm facing away. Gently pull your fingers back with the other hand.'],
    cobra: ['Cobra', 'cobra', 45, false, 'Abs & hip flexors', 'Lie face down and press up through your hands. Hips stay on the floor.'],
    catcow: ['Cat–cow', 'catcow', 60, false, 'Spine', 'On all fours, round your back up, then let it sag as you lift your chest. Move slowly with your breath.'],
    sidebend: ['Standing side bend', 'sidebend', 45, true, 'Lats & obliques', 'Reach one arm overhead and lean to the opposite side. Keep your hips still.'],
    biceps: ['Wall biceps stretch', 'biceps', 45, true, 'Biceps', 'Palm flat on a wall behind you at shoulder height, then slowly turn your body away.'],
    twist: ['Seated spinal twist', 'twist', 45, true, 'Mid back', 'Sit tall, cross one knee over the other leg, hug it and turn toward it.'],
    kneeschest: ['Knees to chest', 'kneeschest', 60, false, 'Lower back', 'On your back, hug both knees in and rock gently side to side.'],
    strap: ['Lying hamstring with towel', 'strap', 45, true, 'Hamstrings', 'On your back, loop a towel or band over one foot and raise the straight leg until you feel it.']
  };

  const ROUTINES = {
    legs: { label: 'Legs', type: 'legs', title: 'Legs & hips', muscles: 'Quads, hamstrings, hips, glutes, calves',
      ids: ['quad', 'hamstring', 'hipflexor', 'pigeon', 'butterfly', 'calf', 'forwardfold', 'figure4', 'child'] },
    push: { label: 'Push', type: 'push', title: 'Chest, shoulders & triceps', muscles: 'Chest, shoulders, triceps, neck, forearms',
      ids: ['doorway', 'clasp', 'crossbody', 'triceps', 'needle', 'neck', 'wrist', 'cobra', 'child'] },
    pull: { label: 'Pull', type: 'pull', title: 'Back & biceps', muscles: 'Back, lats, biceps, hamstrings, forearms',
      ids: ['catcow', 'childside', 'sidebend', 'biceps', 'needle', 'twist', 'strap', 'kneeschest', 'wrist'] },
    full: { label: 'Full body', type: 'full', title: 'Full body', muscles: 'A bit of everything, head to toe',
      ids: ['catcow', 'hipflexor', 'strap', 'figure4', 'quad', 'doorway', 'crossbody', 'triceps', 'sidebend', 'child'] }
  };

  const item = (id) => {
    const [name, pose, hold, sides, muscle, cue] = STRETCHES[id];
    return { id, name, pose, hold, sides, muscle, cue };
  };
  const items = (key) => ROUTINES[key].ids.map(item);
  const totalSeconds = (key) => items(key).reduce((t, s) => t + s.hold * (s.sides ? 2 : 1), 0);
  const minutes = (key) => `${Math.round(totalSeconds(key) / 60)} min`;
  const steps = (key) => {
    const out = [];
    for (const s of items(key)) {
      if (s.sides) { out.push({ ...s, side: 'Left side' }); out.push({ ...s, side: 'Right side' }); }
      else out.push({ ...s, side: '' });
    }
    return out;
  };

  // SVG for a pose. dark = colours for focus mode.
  function figure(poseKey, { dark = false, className = '', label = '' } = {}) {
    const p = POSES[poseKey];
    const c = dark
      ? { ground: '#3D4842', prop: '#5B6760', dash: '#7E8A83', body: '#EDEDE6', hl: '#E0A75E', w: 3.4, hw: 4.2, pw: 2.2 }
      : { ground: '#C9C6BA', prop: '#A9A699', dash: '#A9A699', body: '#1F2A24', hl: '#C98A3E', w: 5, hw: 6, pw: 3 };
    const line = (pts, color, width, extra = '') =>
      `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}></polyline>`;
    const a11y = label ? `role="img" aria-label="${GL.esc(label)}"` : 'aria-hidden="true"';
    return `<svg viewBox="0 0 120 100" class="${className}" ${a11y}>
      <line x1="6" y1="93" x2="114" y2="93" stroke="${c.ground}" stroke-width="1.5"></line>
      ${(p.props || []).map((x) => line(x, c.prop, c.pw)).join('')}
      ${(p.dash || []).map((x) => line(x, c.dash, c.pw * 0.75, 'stroke-dasharray="3 3"')).join('')}
      ${p.body.map((x) => line(x, c.body, c.w)).join('')}
      ${p.hl.map((x) => line(x, c.hl, c.hw)).join('')}
      <circle cx="${p.h[0]}" cy="${p.h[1]}" r="${dark ? 5.5 : 6.5}" fill="${c.body}"></circle>
    </svg>`;
  }

  // Follow-along player. Draws into `root` (inside a .focus-shell) and runs the timer.
  // opts: { key, onFinish(secondsDone), onExit() }
  function Player(root, opts) {
    const list = steps(opts.key);
    let i = 0;
    let remaining = list[0].hold;
    let playing = true;
    let endsAt = Date.now() + remaining * 1000;
    let doneSeconds = 0;
    let timer = null;

    const render = () => {
      const s = list[i];
      const next = list[i + 1];
      root.innerHTML = `
        <div class="focus-top">
          <button class="f-close" data-act="exit" aria-label="Stop stretching">${GL.icon.x(20)}</button>
          <div class="f-bar"><div style="width:${Math.round((i / list.length) * 100)}%"></div></div>
          <span class="count">${i + 1} / ${list.length}</span>
        </div>
        <div class="s-figure">${figure(s.pose, { dark: true, label: `Drawing of the ${s.name} stretch` })}</div>
        <div class="s-meta">
          <div class="row-center"><span class="s-muscle">${GL.esc(s.muscle)}</span>${s.side ? `<span class="s-side">${s.side}</span>` : ''}</div>
          <div class="s-name">${GL.esc(s.name)}</div>
          <p class="s-cue">${GL.esc(s.cue)}</p>
        </div>
        <div style="flex:1"></div>
        <div class="s-time">
          <div class="t" id="s-clock">${GL.clock(remaining)}</div>
          <div class="track"><div id="s-track" style="width:${Math.round(((s.hold - remaining) / s.hold) * 100)}%"></div></div>
          <p class="next">Up next: ${next ? GL.esc(next.name) + (next.side ? ' · ' + next.side.toLowerCase() : '') : 'Finish'}</p>
        </div>
        <div class="s-controls">
          <button class="s-round" data-act="prev" aria-label="Previous stretch">${GL.icon.left(20)}</button>
          <button class="s-play" data-act="toggle" aria-label="${playing ? 'Pause' : 'Resume'}">${playing ? GL.icon.pause() : GL.icon.play()}</button>
          <button class="s-round" data-act="next" aria-label="Next stretch">${GL.icon.right(20)}</button>
        </div>`;
    };

    const go = (n) => {
      if (n >= list.length) return finish();
      i = Math.max(0, n);
      remaining = list[i].hold;
      endsAt = Date.now() + remaining * 1000;
      render();
    };

    const tick = () => {
      if (!playing) return;
      const left = Math.ceil((endsAt - Date.now()) / 1000);
      if (left !== remaining) {
        doneSeconds += Math.max(0, remaining - Math.max(left, 0));
        remaining = Math.max(left, 0);
        const clock = document.getElementById('s-clock');
        const track = document.getElementById('s-track');
        if (clock) clock.textContent = GL.clock(remaining);
        if (track) track.style.width = `${Math.round(((list[i].hold - remaining) / list[i].hold) * 100)}%`;
      }
      if (remaining <= 0) {
        if (navigator.vibrate) navigator.vibrate(200);
        go(i + 1);
      }
    };

    function finish() {
      stop();
      opts.onFinish(Math.round(doneSeconds));
    }
    function stop() { clearInterval(timer); timer = null; }

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || !timer) return;
      const act = btn.dataset.act;
      if (act === 'exit') { stop(); opts.onExit(); }
      if (act === 'prev') go(i - 1);
      if (act === 'next') go(i + 1);
      if (act === 'toggle') {
        playing = !playing;
        if (playing) endsAt = Date.now() + remaining * 1000;
        render();
      }
    });

    render();
    timer = setInterval(tick, 250);
    return { stop };
  }

  // Keeps the phone screen on while the page is open (where the browser supports it).
  async function keepAwake() {
    try {
      if (!('wakeLock' in navigator)) return;
      let lock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && (!lock || lock.released)) {
          try { lock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
        }
      });
    } catch (e) { /* not supported or denied: fine */ }
  }

  GL.Stretch = { POSES, STRETCHES, ROUTINES, items, steps, totalSeconds, minutes, figure, Player, keepAwake };
})();
