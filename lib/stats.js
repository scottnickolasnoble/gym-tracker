// Shared calculations used by several routes.
const { query } = require('../db/pool');
const { HttpError } = require('../middleware/errors');

// Estimated one-rep max (Epley formula): weight x (1 + reps / 30).
const E1RM_SQL = 'ws.weight * (1 + ws.reps / 30.0)';
const e1rm = (weight, reps) => (weight == null ? null : Math.round(weight * (1 + reps / 30)));

// Throws 404 unless the routine belongs to this user.
async function ownRoutine(userId, routineId) {
  const { rows } = await query('SELECT * FROM routines WHERE id = $1 AND user_id = $2', [routineId, userId]);
  if (!rows[0]) throw new HttpError(404, 'Workout not found.');
  return rows[0];
}

async function ownWorkout(userId, workoutId) {
  const { rows } = await query('SELECT * FROM workouts WHERE id = $1 AND user_id = $2', [workoutId, userId]);
  if (!rows[0]) throw new HttpError(404, 'Workout not found.');
  return rows[0];
}

// Returns {id: exercise} for the ids, making sure each is built-in or yours.
async function usableExercises(userId, ids) {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  const { rows } = await query(
    'SELECT * FROM exercises WHERE id = ANY($1::int[]) AND (user_id IS NULL OR user_id = $2)',
    [unique, userId]
  );
  if (rows.length !== unique.length) throw new HttpError(400, 'One of those exercises does not exist.');
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

// Summary line data for a list of workouts: exercise names, total sets, volume, minutes.
async function summarize(workoutIds) {
  if (!workoutIds.length) return {};
  const { rows } = await query(
    `SELECT w.id,
            EXTRACT(EPOCH FROM (COALESCE(w.finished_at, now()) - w.started_at)) / 60 AS minutes,
            COUNT(ws.id) AS set_count,
            COALESCE(SUM(ws.weight * ws.reps), 0) AS volume,
            COALESCE(array_agg(DISTINCT e.name) FILTER (WHERE e.name IS NOT NULL), '{}') AS exercises
       FROM workouts w
       LEFT JOIN workout_sets ws ON ws.workout_id = w.id
       LEFT JOIN exercises e ON e.id = ws.exercise_id
      WHERE w.id = ANY($1::int[])
      GROUP BY w.id`,
    [workoutIds]
  );
  return Object.fromEntries(rows.map((r) => [r.id, {
    minutes: Math.round(r.minutes),
    setCount: r.set_count,
    volume: Math.round(r.volume),
    exercises: r.exercises
  }]));
}

// Which workouts set a new best (estimated 1RM) for some exercise. Returns {workoutId: [exercise names]}.
async function personalRecords(userId) {
  const { rows } = await query(
    `WITH best AS (
       SELECT ws.workout_id, ws.exercise_id, w.started_at, MAX(${E1RM_SQL}) AS e1
         FROM workout_sets ws
         JOIN workouts w ON w.id = ws.workout_id
        WHERE w.user_id = $1 AND w.finished_at IS NOT NULL AND ws.weight IS NOT NULL AND ws.reps > 0
        GROUP BY ws.workout_id, ws.exercise_id, w.started_at
     ), ranked AS (
       SELECT *, MAX(e1) OVER (PARTITION BY exercise_id ORDER BY started_at
                               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous
         FROM best
     )
     SELECT r.workout_id, e.name
       FROM ranked r JOIN exercises e ON e.id = r.exercise_id
      WHERE r.previous IS NOT NULL AND r.e1 > r.previous`,
    [userId]
  );
  const out = {};
  for (const r of rows) (out[r.workout_id] = out[r.workout_id] || []).push(r.name);
  return out;
}

// Rough workout length: every set takes ~45 s plus its rest.
const estimateMinutes = (items) => Math.round(items.reduce((t, i) => t + i.sets * (45 + i.rest_seconds), 0) / 60);

module.exports = { E1RM_SQL, e1rm, ownRoutine, ownWorkout, usableExercises, summarize, personalRecords, estimateMinutes };
