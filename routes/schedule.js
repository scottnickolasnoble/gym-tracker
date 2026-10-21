const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { asyncHandler } = require('../middleware/errors');
const v = require('../middleware/validate');

const router = express.Router();
const STRETCHES = ['push', 'pull', 'legs', 'full'];

async function loadWeek(userId) {
  const { rows } = await query(
    `SELECT d.*, r.name AS routine_name, r.type AS routine_type, r.stretch_key AS routine_stretch
       FROM schedule_days d LEFT JOIN routines r ON r.id = d.routine_id
      WHERE d.user_id = $1`,
    [userId]
  );
  const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
  const week = [];
  for (let day = 0; day < 7; day++) {
    const r = byDay[day];
    // A workout whose routine was deleted turns back into a rest day.
    const kind = !r ? 'rest' : (r.kind === 'workout' && !r.routine_id ? 'rest' : r.kind);
    week.push({
      day,
      kind,
      routineId: kind === 'workout' ? r.routine_id : null,
      routineName: kind === 'workout' ? r.routine_name : null,
      routineType: kind === 'workout' ? r.routine_type : null,
      stretchKey: kind === 'stretch' ? r.stretch_key : (kind === 'workout' ? r.routine_stretch : null),
      stretchAfter: kind === 'workout' ? Boolean(r.stretch_after) : false,
      startTime: kind === 'rest' ? null : (r && r.start_time)
    });
  }
  return week;
}

router.get('/', asyncHandler(async (req, res) => {
  res.json(await loadWeek(req.userId));
}));

router.put('/', asyncHandler(async (req, res) => {
  const days = req.body.days;
  if (!Array.isArray(days) || days.length !== 7) throw v.bad('Send all 7 days.');

  const clean = days.map((d, i) => {
    const kind = v.oneOf(d.kind, `Day ${i + 1}`, ['workout', 'stretch', 'rest']);
    return {
      kind,
      routineId: kind === 'workout' ? v.id(d.routineId, `Workout for day ${i + 1}`) : null,
      stretchKey: kind === 'stretch' ? v.oneOf(d.stretchKey, `Stretch for day ${i + 1}`, STRETCHES) : null,
      stretchAfter: kind === 'workout' ? Boolean(d.stretchAfter) : false,
      startTime: kind === 'rest' ? null : v.time(d.startTime, `Time for day ${i + 1}`)
    };
  });

  const routineIds = clean.filter((d) => d.routineId).map((d) => d.routineId);
  if (routineIds.length) {
    const { rows } = await query('SELECT id FROM routines WHERE user_id = $1 AND id = ANY($2::int[])',
      [req.userId, routineIds]);
    if (rows.length !== new Set(routineIds).size) throw v.bad('One of those workouts does not exist.');
  }

  await withTransaction(async (client) => {
    for (let day = 0; day < 7; day++) {
      const d = clean[day];
      await client.query(
        `INSERT INTO schedule_days (user_id, day, kind, routine_id, stretch_key, stretch_after, start_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, day) DO UPDATE
           SET kind = EXCLUDED.kind, routine_id = EXCLUDED.routine_id, stretch_key = EXCLUDED.stretch_key,
               stretch_after = EXCLUDED.stretch_after, start_time = EXCLUDED.start_time`,
        [req.userId, day, d.kind, d.routineId, d.stretchKey, d.stretchAfter, d.startTime]
      );
    }
  });
  res.json(await loadWeek(req.userId));
}));

module.exports = router;
module.exports.loadWeek = loadWeek;
