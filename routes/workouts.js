const express = require('express');
const { query } = require('../db/pool');
const { asyncHandler, HttpError } = require('../middleware/errors');
const v = require('../middleware/validate');
const { ownRoutine, ownWorkout, usableExercises, summarize, personalRecords } = require('../lib/stats');

const router = express.Router();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// History list: workouts + stretch sessions between two local dates.
router.get('/', asyncHandler(async (req, res) => {
  const tz = v.timezone(req.query.tz);
  const { from, to } = req.query;
  if (!DATE.test(from || '') || !DATE.test(to || '')) throw v.bad('from and to must be dates like 2026-10-01.');

  const { rows } = await query(
    `SELECT id, routine_id, name, type, stretch_key, started_at, finished_at, notes,
            to_char(started_at AT TIME ZONE $4, 'YYYY-MM-DD') AS local_date
       FROM workouts
      WHERE user_id = $1 AND (started_at AT TIME ZONE $4)::date BETWEEN $2 AND $3
      ORDER BY started_at DESC`,
    [req.userId, from, to, tz]
  );
  const sums = await summarize(rows.map((r) => r.id));
  const prs = await personalRecords(req.userId);
  const { rows: stretches } = await query(
    `SELECT id, routine_key, seconds, workout_id, done_at,
            to_char(done_at AT TIME ZONE $4, 'YYYY-MM-DD') AS local_date
       FROM stretch_sessions
      WHERE user_id = $1 AND (done_at AT TIME ZONE $4)::date BETWEEN $2 AND $3
      ORDER BY done_at DESC`,
    [req.userId, from, to, tz]
  );

  res.json({
    workouts: rows.map((r) => ({
      id: r.id, routineId: r.routine_id, name: r.name, type: r.type, date: r.local_date,
      startedAt: r.started_at, finished: Boolean(r.finished_at), notes: r.notes,
      ...sums[r.id], prs: prs[r.id] || []
    })),
    stretches: stretches.map((s) => ({
      id: s.id, key: s.routine_key, seconds: s.seconds, workoutId: s.workout_id, date: s.local_date
    }))
  });
}));

// Most recent unfinished workout from the last 12 hours, so you can pick up where you left off.
router.get('/active', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, type, started_at FROM workouts
      WHERE user_id = $1 AND finished_at IS NULL AND started_at > now() - interval '12 hours'
      ORDER BY started_at DESC LIMIT 1`,
    [req.userId]
  );
  res.json(rows[0] ? { id: rows[0].id, name: rows[0].name, type: rows[0].type, startedAt: rows[0].started_at } : null);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const w = await ownWorkout(req.userId, v.id(req.params.id));
  const { rows: sets } = await query(
    `SELECT ws.id, ws.exercise_id, ws.set_number, ws.weight, ws.reps, e.name
       FROM workout_sets ws JOIN exercises e ON e.id = ws.exercise_id
      WHERE ws.workout_id = $1
      ORDER BY ws.completed_at, ws.id`,
    [w.id]
  );
  const { rows: stretches } = await query(
    'SELECT id, routine_key, seconds FROM stretch_sessions WHERE workout_id = $1', [w.id]
  );
  const sum = (await summarize([w.id]))[w.id];
  const prs = (await personalRecords(req.userId))[w.id] || [];
  res.json({
    id: w.id, routineId: w.routine_id, name: w.name, type: w.type, stretchKey: w.stretch_key,
    plan: w.plan, startedAt: w.started_at, finishedAt: w.finished_at, notes: w.notes,
    sets: sets.map((s) => ({ id: s.id, exerciseId: s.exercise_id, setNumber: s.set_number, weight: s.weight, reps: s.reps, name: s.name })),
    stretches: stretches.map((s) => ({ id: s.id, key: s.routine_key, seconds: s.seconds })),
    ...sum, prs
  });
}));

// Start a workout. Body: { routineId?, name?, items: [{ exerciseId, sets, reps, weight, restSeconds }] }
router.post('/', asyncHandler(async (req, res) => {
  const b = req.body;
  let name = v.str(b.name, 'Name', { max: 60 }) || 'Workout';
  let type = 'other';
  let stretchKey = null;
  let routineId = null;
  if (b.routineId != null) {
    const r = await ownRoutine(req.userId, v.id(b.routineId, 'Workout'));
    routineId = r.id; name = r.name; type = r.type; stretchKey = r.stretch_key;
  }
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) throw v.bad('Add 1–30 exercises.');
  const items = b.items.map((it, i) => ({
    exerciseId: v.id(it.exerciseId, `Exercise ${i + 1}`),
    sets: v.int(it.sets, `Sets for exercise ${i + 1}`, { min: 1, max: 20 }),
    reps: v.int(it.reps, `Reps for exercise ${i + 1}`, { min: 1, max: 300 }),
    weight: v.num(it.weight, `Weight for exercise ${i + 1}`, { min: 0, max: 2000, optional: true }),
    restSeconds: v.int(it.restSeconds, `Rest for exercise ${i + 1}`, { min: 0, max: 900 })
  }));
  const ex = await usableExercises(req.userId, items.map((i) => i.exerciseId));
  // Snapshot names/equipment so history still reads right if the routine changes later.
  const plan = items.map((i) => ({
    ...i,
    name: ex[i.exerciseId].name,
    group: ex[i.exerciseId].muscle_group,
    equipment: ex[i.exerciseId].equipment,
    isBodyweight: ex[i.exerciseId].is_bodyweight,
    weight: ex[i.exerciseId].is_bodyweight ? null : i.weight
  }));
  const { rows } = await query(
    `INSERT INTO workouts (user_id, routine_id, name, type, stretch_key, plan)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.userId, routineId, name, type, stretchKey, JSON.stringify(plan)]
  );
  res.status(201).json({ id: rows[0].id });
}));

// Log one set: { exerciseId, weight, reps }
router.post('/:id/sets', asyncHandler(async (req, res) => {
  const w = await ownWorkout(req.userId, v.id(req.params.id));
  const exerciseId = v.id(req.body.exerciseId, 'Exercise');
  await usableExercises(req.userId, [exerciseId]);
  const weight = v.num(req.body.weight, 'Weight', { min: 0, max: 2000, optional: true });
  const reps = v.int(req.body.reps, 'Reps', { min: 0, max: 300 });
  const { rows } = await query(
    `INSERT INTO workout_sets (workout_id, exercise_id, set_number, weight, reps)
     VALUES ($1, $2,
             (SELECT COALESCE(MAX(set_number), 0) + 1 FROM workout_sets WHERE workout_id = $1 AND exercise_id = $2),
             $3, $4)
     RETURNING id, set_number`,
    [w.id, exerciseId, weight, reps]
  );
  res.status(201).json({ id: rows[0].id, setNumber: rows[0].set_number });
}));

router.delete('/:id/sets/:setId', asyncHandler(async (req, res) => {
  const w = await ownWorkout(req.userId, v.id(req.params.id));
  const { rowCount } = await query('DELETE FROM workout_sets WHERE id = $1 AND workout_id = $2',
    [v.id(req.params.setId, 'Set'), w.id]);
  if (!rowCount) throw new HttpError(404, 'Set not found.');
  res.status(204).end();
}));

// { finished: true } and/or { notes: '...' }
router.patch('/:id', asyncHandler(async (req, res) => {
  const w = await ownWorkout(req.userId, v.id(req.params.id));
  if (req.body.notes !== undefined) {
    const notes = v.str(req.body.notes, 'Notes', { max: 2000 });
    await query('UPDATE workouts SET notes = $1 WHERE id = $2', [notes, w.id]);
  }
  if (req.body.finished === true && !w.finished_at) {
    await query('UPDATE workouts SET finished_at = now() WHERE id = $1', [w.id]);
  }
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const w = await ownWorkout(req.userId, v.id(req.params.id));
  await query('DELETE FROM workouts WHERE id = $1', [w.id]);
  res.status(204).end();
}));

module.exports = router;
