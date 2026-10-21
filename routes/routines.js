const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { asyncHandler } = require('../middleware/errors');
const v = require('../middleware/validate');
const { ownRoutine, usableExercises, estimateMinutes } = require('../lib/stats');

const router = express.Router();

const TYPES = ['push', 'pull', 'legs', 'upper', 'full', 'other'];
const STRETCHES = ['push', 'pull', 'legs', 'full'];

async function loadItems(routineId) {
  const { rows } = await query(
    `SELECT re.*, e.name, e.muscle_group, e.equipment, e.is_bodyweight, e.lower_body, e.is_big_lift
       FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
      WHERE re.routine_id = $1
      ORDER BY re.position`,
    [routineId]
  );
  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    name: r.name,
    group: r.muscle_group,
    equipment: r.equipment,
    isBodyweight: r.is_bodyweight,
    lowerBody: r.lower_body,
    isBigLift: r.is_big_lift,
    sets: r.sets,
    reps: r.reps,
    weight: r.weight,
    restSeconds: r.rest_seconds
  }));
}

function parseBody(body) {
  const name = v.str(body.name, 'Name', { min: 1, max: 60 });
  const type = v.oneOf(body.type, 'Type', TYPES);
  const stretchKey = v.oneOf(body.stretchKey, 'Cool-down stretch', STRETCHES, { optional: true });
  if (!Array.isArray(body.items) || body.items.length === 0) throw v.bad('Add at least one exercise.');
  if (body.items.length > 30) throw v.bad('30 exercises at most.');
  const items = body.items.map((it, i) => ({
    exerciseId: v.id(it.exerciseId, `Exercise ${i + 1}`),
    sets: v.int(it.sets, `Sets for exercise ${i + 1}`, { min: 1, max: 20 }),
    reps: v.int(it.reps, `Reps for exercise ${i + 1}`, { min: 1, max: 300 }),
    weight: v.num(it.weight, `Weight for exercise ${i + 1}`, { min: 0, max: 2000, optional: true }),
    restSeconds: v.int(it.restSeconds, `Rest for exercise ${i + 1}`, { min: 0, max: 900 })
  }));
  return { name, type, stretchKey, items };
}

async function writeItems(client, routineId, items) {
  await client.query('DELETE FROM routine_exercises WHERE routine_id = $1', [routineId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await client.query(
      `INSERT INTO routine_exercises (routine_id, exercise_id, position, sets, reps, weight, rest_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [routineId, it.exerciseId, i, it.sets, it.reps, it.weight, it.restSeconds]
    );
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, COUNT(re.id) AS exercise_count,
            COALESCE(SUM(re.sets * (45 + re.rest_seconds)), 0) / 60 AS minutes
       FROM routines r LEFT JOIN routine_exercises re ON re.routine_id = r.id
      WHERE r.user_id = $1
      GROUP BY r.id
      ORDER BY r.created_at`,
    [req.userId]
  );
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, type: r.type, stretchKey: r.stretch_key,
    exerciseCount: r.exercise_count, minutes: Math.round(r.minutes)
  })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const r = await ownRoutine(req.userId, v.id(req.params.id));
  const items = await loadItems(r.id);
  res.json({
    id: r.id, name: r.name, type: r.type, stretchKey: r.stretch_key, items,
    minutes: estimateMinutes(items.map((i) => ({ sets: i.sets, rest_seconds: i.restSeconds })))
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = parseBody(req.body);
  await usableExercises(req.userId, body.items.map((i) => i.exerciseId));
  const id = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO routines (user_id, name, type, stretch_key) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.userId, body.name, body.type, body.stretchKey]
    );
    await writeItems(client, rows[0].id, body.items);
    return rows[0].id;
  });
  res.status(201).json({ id });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const r = await ownRoutine(req.userId, v.id(req.params.id));
  const body = parseBody(req.body);
  await usableExercises(req.userId, body.items.map((i) => i.exerciseId));
  await withTransaction(async (client) => {
    await client.query('UPDATE routines SET name = $1, type = $2, stretch_key = $3 WHERE id = $4',
      [body.name, body.type, body.stretchKey, r.id]);
    await writeItems(client, r.id, body.items);
  });
  res.json({ id: r.id });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const r = await ownRoutine(req.userId, v.id(req.params.id));
  await query('DELETE FROM routines WHERE id = $1', [r.id]);
  res.status(204).end();
}));

// "Get ready" screen: each exercise with what you did last time and a suggested weight.
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
      `SELECT ws.exercise_id, ws.weight, ws.reps
         FROM workout_sets ws
        WHERE (ws.workout_id, ws.exercise_id) IN (SELECT * FROM unnest($1::int[], $2::int[]))
        ORDER BY ws.set_number`,
      [latest.map((l) => l.workout_id), latest.map((l) => l.exercise_id)]
    );
    for (const s of rows) (lastSets[s.exercise_id] = lastSets[s.exercise_id] || []).push(s);
  }

  const kg = settings.units === 'kg';
  const out = items.map((it) => {
    const sets = lastSets[it.exerciseId] || [];
    const weights = sets.map((s) => s.weight).filter((w) => w != null);
    const top = weights.length ? Math.max(...weights) : null;
    const atTop = sets.filter((s) => s.weight === top);
    const hitAll = sets.length > 0 && atTop.length >= it.sets && atTop.every((s) => s.reps >= it.reps);

    let suggested = top != null ? top : it.weight;
    let tip = null;
    if (settings.suggest_increase && hitAll && !it.isBodyweight && top != null) {
      const step = it.lowerBody ? (kg ? 5 : 10) : (kg ? 2.5 : 5);
      suggested = top + step;
      tip = `You hit every rep last time, so +${step} ${settings.units}`;
    }

    let lastText = null;
    if (sets.length) {
      const sameWeight = sets.every((s) => s.weight === sets[0].weight);
      const w = (x) => (x == null ? 'BW' : x);
      lastText = sameWeight
        ? `${w(sets[0].weight)} × ${sets.map((s) => s.reps).join(', ')}`
        : sets.map((s) => `${w(s.weight)}×${s.reps}`).join(' · ');
    }
    return { ...it, weight: it.isBodyweight ? null : suggested, last: lastText, tip };
  });

  res.json({ id: r.id, name: r.name, type: r.type, stretchKey: r.stretch_key, items: out });
}));

module.exports = router;
