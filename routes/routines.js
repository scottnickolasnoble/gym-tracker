const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { asyncHandler } = require('../middleware/errors');
const v = require('../middleware/validate');
const { ownRoutine, usableExercises, estimateMinutes } = require('../lib/stats');
const { addTemplate, TEMPLATES } = require('../db/seed');

const router = express.Router();

const TYPES = ['push', 'pull', 'legs', 'upper', 'full', 'other'];
const STRETCHES = ['push', 'pull', 'legs', 'full'];

async function loadItems(routineId) {
  const { rows } = await query(
    `SELECT re.*, e.name, e.muscle_group, e.equipment, e.is_bodyweight, e.lower_body, e.is_big_lift, e.is_timed
       FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
      WHERE re.routine_id = $1
      ORDER BY re.position`,
    [routineId]
  );
  return rows.map((r) => ({
    itemId: r.id,
    exerciseId: r.exercise_id,
    name: r.name,
    group: r.muscle_group,
    equipment: r.equipment,
    isBodyweight: r.is_bodyweight,
    lowerBody: r.lower_body,
    isBigLift: r.is_big_lift,
    isTimed: r.is_timed,
    sets: r.sets,
    reps: r.reps,
    seconds: r.seconds,
    weight: r.weight,
    restSeconds: r.rest_seconds
  }));
}

// Checks every exercise row. Timed exercises need seconds; rep exercises need reps.
async function parseItems(userId, list) {
  if (!Array.isArray(list) || list.length === 0) throw v.bad('Add at least one exercise.');
  if (list.length > 30) throw v.bad('30 exercises at most.');
  const raw = list.map((it, i) => ({ ...it, exerciseId: v.id(it.exerciseId, `Exercise ${i + 1}`) }));
  const ex = await usableExercises(userId, raw.map((i) => i.exerciseId));
  return raw.map((it, i) => {
    const e = ex[it.exerciseId];
    const n = `${e.name} (${i + 1})`;
    const timed = e.is_timed;
    return {
      exerciseId: it.exerciseId,
      sets: v.int(it.sets, `Sets for ${n}`, { min: 1, max: 20 }),
      reps: timed ? 1 : v.int(it.reps, `Reps for ${n}`, { min: 1, max: 300 }),
      seconds: timed ? v.int(it.seconds, `Seconds for ${n}`, { min: 5, max: 3600 }) : null,
      weight: e.is_bodyweight ? null : v.num(it.weight, `Weight for ${n}`, { min: 0, max: 2000, optional: true }),
      restSeconds: v.int(it.restSeconds, `Rest for ${n}`, { min: 0, max: 900 }),
      _ex: e
    };
  });
}

function parseHeader(body) {
  return {
    name: v.str(body.name, 'Name', { min: 1, max: 60 }),
    type: v.oneOf(body.type, 'Type', TYPES),
    stretchKey: v.oneOf(body.stretchKey, 'Cool-down stretch', STRETCHES, { optional: true })
  };
}

async function writeItems(client, routineId, items) {
  await client.query('DELETE FROM routine_exercises WHERE routine_id = $1', [routineId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await client.query(
      `INSERT INTO routine_exercises (routine_id, exercise_id, position, sets, reps, seconds, weight, rest_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [routineId, it.exerciseId, i, it.sets, it.reps, it.seconds, it.weight, it.restSeconds]
    );
  }
}

// List: each workout with its first few exercise names, for the cards on the Workouts page.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, COUNT(re.id) AS exercise_count,
            COALESCE(SUM(re.sets * (COALESCE(re.seconds, 45) + re.rest_seconds)), 0) / 60 AS minutes,
            COALESCE(array_agg(e.name ORDER BY re.position) FILTER (WHERE e.name IS NOT NULL), '{}') AS names
       FROM routines r
       LEFT JOIN routine_exercises re ON re.routine_id = r.id
       LEFT JOIN exercises e ON e.id = re.exercise_id
      WHERE r.user_id = $1
      GROUP BY r.id
      ORDER BY r.created_at`,
    [req.userId]
  );
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, type: r.type, stretchKey: r.stretch_key,
    exerciseCount: r.exercise_count, minutes: Math.round(r.minutes), exercises: r.names
  })));
}));

router.get('/templates', (req, res) => {
  res.json(Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, type: t.type, exercises: t.items.map((i) => i[0]) })));
});

// Add one of the ready-made home workouts: { key: 'upper' | 'lower' | 'full' }
router.post('/templates', asyncHandler(async (req, res) => {
  const key = v.oneOf(req.body.key, 'Template', Object.keys(TEMPLATES));
  const id = await withTransaction((client) => addTemplate(client, req.userId, key));
  res.status(201).json({ id });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const r = await ownRoutine(req.userId, v.id(req.params.id));
  const items = await loadItems(r.id);
  res.json({
    id: r.id, name: r.name, type: r.type, stretchKey: r.stretch_key, items,
    minutes: estimateMinutes(items)
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const head = parseHeader(req.body);
  const items = await parseItems(req.userId, req.body.items);
  const id = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO routines (user_id, name, type, stretch_key) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.userId, head.name, head.type, head.stretchKey]
    );
    await writeItems(client, rows[0].id, items);
    return rows[0].id;
  });
  res.status(201).json({ id });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const r = await ownRoutine(req.userId, v.id(req.params.id));
  const head = parseHeader(req.body);
  const items = await parseItems(req.userId, req.body.items);
  await withTransaction(async (client) => {
    await client.query('UPDATE routines SET name = $1, type = $2, stretch_key = $3 WHERE id = $4',
      [head.name, head.type, head.stretchKey, r.id]);
    await writeItems(client, r.id, items);
  });
  res.json({ id: r.id });
}));

// Save just a new exercise order (from the Get ready screen): { itemIds: [ ... ] }
router.put('/:id/order', asyncHandler(async (req, res) => {
  const r = await ownRoutine(req.userId, v.id(req.params.id));
  const ids = Array.isArray(req.body.itemIds) ? req.body.itemIds.map((x) => v.id(x, 'Item')) : [];
  const { rows } = await query('SELECT id FROM routine_exercises WHERE routine_id = $1', [r.id]);
  const mine = new Set(rows.map((x) => x.id));
  if (ids.length !== mine.size || !ids.every((x) => mine.has(x))) throw v.bad('That order doesn\'t match this workout. Reload and try again.');
  await withTransaction(async (client) => {
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE routine_exercises SET position = $1 WHERE id = $2', [i, ids[i]]);
    }
  });
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const r = await ownRoutine(req.userId, v.id(req.params.id));
  await query('DELETE FROM routines WHERE id = $1', [r.id]);
  res.status(204).end();
}));

// "Get ready" screen: each exercise with what you did last time and a suggested weight (or time).
router.get('/:id/plan', asyncHandler(async (req, res) => {
  const r = await ownRoutine(req.userId, v.id(req.params.id));
  const items = await loadItems(r.id);
  const { rows: [settings] } = await query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
  const exerciseIds = items.map((i) => i.exerciseId);

  // Latest finished workout that contains each exercise...
  const { rows: latest } = await query(
    `SELECT DISTINCT ON (ws.exercise_id) ws.exercise_id, ws.workout_id
       FROM workout_sets ws JOIN workouts w ON w.id = ws.workout_id
      WHERE w.user_id = $1 AND w.finished_at IS NOT NULL AND ws.exercise_id = ANY($2::int[])
      ORDER BY ws.exercise_id, w.started_at DESC`,
    [req.userId, exerciseIds]
  );
  // ...and the sets you did for it that day.
  const lastSets = {};
  if (latest.length) {
    const { rows } = await query(
      `SELECT ws.exercise_id, ws.weight, ws.reps, ws.seconds
         FROM workout_sets ws
        WHERE (ws.workout_id, ws.exercise_id) IN (SELECT * FROM unnest($1::int[], $2::int[]))
        ORDER BY ws.set_number`,
      [latest.map((l) => l.workout_id), latest.map((l) => l.exercise_id)]
    );
    for (const s of rows) (lastSets[s.exercise_id] = lastSets[s.exercise_id] || []).push(s);
  }

  const kg = settings.units === 'kg';
  const w = (x) => (x == null ? 'BW' : x);
  const out = items.map((it) => {
    const sets = lastSets[it.exerciseId] || [];
    let tip = null;
    let lastText = null;
    let weight = it.weight;
    let seconds = it.seconds;

    if (it.isTimed) {
      if (sets.length) {
        lastText = sets.map((s) => `${s.seconds || 0}s`).join(', ');
        const held = sets.filter((s) => (s.seconds || 0) >= it.seconds);
        if (settings.suggest_increase && held.length >= it.sets) {
          seconds = it.seconds + 5;
          tip = 'You held every set last time, so +5 s';
        }
      }
    } else if (sets.length) {
      const sameWeight = sets.every((s) => s.weight === sets[0].weight);
      lastText = sameWeight
        ? `${w(sets[0].weight)} × ${sets.map((s) => s.reps).join(', ')}`
        : sets.map((s) => `${w(s.weight)}×${s.reps}`).join(' · ');
      const weights = sets.map((s) => s.weight).filter((x) => x != null);
      const top = weights.length ? Math.max(...weights) : null;
      if (top != null) weight = top;
      const atTop = sets.filter((s) => s.weight === top);
      const hitAll = atTop.length >= it.sets && atTop.every((s) => s.reps >= it.reps);
      if (settings.suggest_increase && hitAll && !it.isBodyweight && top != null) {
        const step = it.lowerBody ? (kg ? 5 : 10) : (kg ? 2.5 : 5);
        weight = top + step;
        tip = `You hit every rep last time, so +${step} ${settings.units}`;
      }
    }
    return { ...it, weight: it.isBodyweight ? null : weight, seconds, last: lastText, tip };
  });

  res.json({ id: r.id, name: r.name, type: r.type, stretchKey: r.stretch_key, items: out });
}));

module.exports = router;
