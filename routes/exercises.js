const express = require('express');
const { query } = require('../db/pool');
const { asyncHandler, HttpError } = require('../middleware/errors');
const v = require('../middleware/validate');
const { E1RM_SQL, e1rm, usableExercises } = require('../lib/stats');
const { KEYS: EQUIPMENT_KEYS } = require('../lib/equipment');

const router = express.Router();

const shape = (r) => ({
  id: r.id,
  name: r.name,
  group: r.muscle_group,
  equipment: r.equipment,
  needs: r.needs || [],
  isBigLift: r.is_big_lift,
  isBodyweight: r.is_bodyweight,
  lowerBody: r.lower_body,
  isTimed: r.is_timed,
  custom: r.user_id !== null,
  bestE1rm: r.best_e1rm == null ? null : Math.round(r.best_e1rm),
  maxReps: r.max_reps == null ? null : r.max_reps,
  maxSeconds: r.max_seconds == null ? null : r.max_seconds,
  sessions: r.sessions || 0
});

// Library: built-in + your own, with your best numbers on each.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT e.*, b.best_e1rm, b.max_reps, b.max_seconds, b.sessions
       FROM exercises e
       LEFT JOIN (
         SELECT ws.exercise_id, MAX(${E1RM_SQL}) AS best_e1rm, MAX(ws.reps) AS max_reps,
                MAX(ws.seconds) AS max_seconds, COUNT(DISTINCT w.id) AS sessions
           FROM workout_sets ws JOIN workouts w ON w.id = ws.workout_id
          WHERE w.user_id = $1 AND w.finished_at IS NOT NULL
          GROUP BY ws.exercise_id
       ) b ON b.exercise_id = e.id
      WHERE e.user_id IS NULL OR e.user_id = $1
      ORDER BY CASE e.muscle_group WHEN 'push' THEN 1 WHEN 'pull' THEN 2 WHEN 'legs' THEN 3 ELSE 4 END, e.name`,
    [req.userId]
  );
  res.json(rows.map(shape));
}));

// Create your own: { name, group, equipment, needs: [], isBodyweight, isTimed, lowerBody, isBigLift }
router.post('/', asyncHandler(async (req, res) => {
  const b = req.body;
  const name = v.str(b.name, 'Name', { min: 2, max: 60 });
  const group = v.oneOf(b.group, 'Muscle group', ['push', 'pull', 'legs', 'core']);
  const equipment = v.str(b.equipment, 'Equipment', { min: 1, max: 40 });
  const needs = Array.isArray(b.needs) ? [...new Set(b.needs.map((n) => v.oneOf(n, 'Equipment needed', EQUIPMENT_KEYS)))] : [];
  const clash = await query(
    'SELECT 1 FROM exercises WHERE lower(name) = lower($1) AND (user_id IS NULL OR user_id = $2)',
    [name, req.userId]
  );
  if (clash.rowCount) throw new HttpError(409, 'You already have an exercise with that name.');
  const { rows } = await query(
    `INSERT INTO exercises (user_id, name, muscle_group, equipment, needs, is_big_lift, is_bodyweight, lower_body, is_timed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.userId, name, group, equipment, needs, Boolean(b.isBigLift), Boolean(b.isBodyweight), Boolean(b.lowerBody), Boolean(b.isTimed)]
  );
  res.status(201).json(shape(rows[0]));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = v.id(req.params.id);
  const { rows } = await query('SELECT * FROM exercises WHERE id = $1 AND user_id = $2', [id, req.userId]);
  if (!rows[0]) throw new HttpError(404, 'You can only delete exercises you created.');
  const used = await query('SELECT 1 FROM workout_sets WHERE exercise_id = $1 LIMIT 1', [id]);
  if (used.rowCount) throw new HttpError(409, 'This exercise is in your history, so it can\'t be deleted.');
  await query('DELETE FROM exercises WHERE id = $1', [id]);
  res.status(204).end();
}));

// Everything the Exercises page needs for one lift.
router.get('/:id/progress', asyncHandler(async (req, res) => {
  const id = v.id(req.params.id);
  const ex = (await usableExercises(req.userId, [id]))[id];
  const tz = v.timezone(req.query.tz);
  const { rows } = await query(
    `SELECT w.id AS workout_id, to_char(w.started_at AT TIME ZONE $3, 'YYYY-MM-DD') AS local_date,
            json_agg(json_build_object('weight', ws.weight, 'reps', ws.reps, 'seconds', ws.seconds) ORDER BY ws.set_number) AS sets,
            COALESCE(SUM(ws.weight * ws.reps), 0) AS volume
       FROM workout_sets ws JOIN workouts w ON w.id = ws.workout_id
      WHERE w.user_id = $1 AND ws.exercise_id = $2 AND w.finished_at IS NOT NULL
      GROUP BY w.id
      ORDER BY w.started_at`,
    [req.userId, id, tz]
  );

  const sessions = rows.map((r) => {
    let best = null;
    for (const s of r.sets) {
      const est = s.reps > 0 ? e1rm(s.weight, s.reps) : null;
      if (est != null && (best == null || est > best.e1rm)) best = { weight: s.weight, reps: s.reps, e1rm: est };
    }
    return {
      workoutId: r.workout_id,
      date: r.local_date,
      sets: r.sets,
      volume: Math.round(r.volume),
      e1rm: best ? best.e1rm : null,
      bestSet: best,
      maxReps: Math.max(0, ...r.sets.map((s) => s.reps || 0)),
      maxSeconds: Math.max(0, ...r.sets.map((s) => s.seconds || 0))
    };
  });

  // Heaviest weight lifted for at least N reps.
  const bestFor = (minReps) => {
    let out = null;
    for (const s of sessions) {
      for (const set of s.sets) {
        if (set.weight != null && set.reps >= minReps && (!out || set.weight > out.weight)) {
          out = { weight: set.weight, reps: set.reps, date: s.date };
        }
      }
    }
    return out;
  };
  let mostReps = null;
  let longestHold = null;
  for (const s of sessions) {
    if (!mostReps || s.maxReps > mostReps.reps) mostReps = { reps: s.maxReps, date: s.date };
    if (s.maxSeconds && (!longestHold || s.maxSeconds > longestHold.seconds)) longestHold = { seconds: s.maxSeconds, date: s.date };
  }

  res.json({
    exercise: shape(ex),
    sessions,
    records: { single: bestFor(1), three: bestFor(3), five: bestFor(5), ten: bestFor(10), mostReps, longestHold }
  });
}));

module.exports = router;
