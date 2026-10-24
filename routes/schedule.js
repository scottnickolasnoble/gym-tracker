const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { asyncHandler } = require('../middleware/errors');
const v = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { todayIn, addDays, daysBetween, loadWeek, resolveDays, writeOverrides, planPush } = require('../lib/plan');

const router = express.Router();
const STRETCHES = ['push', 'pull', 'legs', 'full'];

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (value, field) => {
  if (typeof value !== 'string' || !DATE.test(value)) throw v.bad(`${field} must look like 2026-10-24.`);
  return value;
};

// What's planned on real dates: ?from=2026-10-19&to=2026-11-15
router.get('/days', asyncHandler(async (req, res) => {
  const from = date(req.query.from, 'from');
  const to = date(req.query.to, 'to');
  if (to < from || daysBetween(from, to) > 70) throw v.bad('Pick a range of 70 days or less.');
  res.json(await resolveDays(req.userId, from, to));
}));

// Can't make it: { date, to?, tz }. Moves that day's workout (default: to the next day).
// Anything already on the new day gets bumped back a day too, until it reaches a rest day.
router.post('/push', asyncHandler(async (req, res) => {
  const today = todayIn(v.timezone(req.body.tz));
  const from = date(req.body.date, 'date');
  const target = req.body.to ? date(req.body.to, 'to') : addDays(from > today ? from : today, from >= today ? 1 : 0);
  if (from < addDays(today, -7)) throw v.bad('You can only push days from the last week.');
  if (target < today) throw v.bad('Pick today or a later day.');
  if (target === from) throw v.bad('Pick a different day.');
  if (daysBetween(today, target) > 14) throw v.bad('Pick a day in the next two weeks.');

  const days = await resolveDays(req.userId, from < target ? from : target, addDays(target, 21));
  const source = days.find((d) => d.date === from);
  if (!source || source.kind === 'rest') throw new HttpError(400, 'Nothing is planned that day.');
  const writes = planPush(days, from, target);
  await withTransaction((client) => writeOverrides(client, req.userId, writes));
  res.json({ moved: Object.keys(writes).filter((d) => writes[d].note === 'moved').sort() });
}));

// Skip a day: { date, tz }
router.post('/skip', asyncHandler(async (req, res) => {
  const today = todayIn(v.timezone(req.body.tz));
  const d = date(req.body.date, 'date');
  if (d < addDays(today, -7) || daysBetween(today, d) > 14) throw v.bad('Pick a day within a week or two of today.');
  await withTransaction((client) => writeOverrides(client, req.userId, { [d]: { kind: 'rest', note: 'skipped' } }));
  res.json({ ok: true });
}));

// Undo every push/skip from today on, back to the normal weekly plan: { tz }
router.post('/reset', asyncHandler(async (req, res) => {
  const today = todayIn(v.timezone(req.body.tz));
  const { rowCount } = await query('DELETE FROM schedule_overrides WHERE user_id = $1 AND on_date >= $2', [req.userId, today]);
  res.json({ cleared: rowCount });
}));

module.exports = router;
module.exports.loadWeek = loadWeek;
