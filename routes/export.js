const express = require('express');
const { query } = require('../db/pool');
const { asyncHandler } = require('../middleware/errors');

const router = express.Router();

const cell = (x) => {
  if (x === null || x === undefined) return '';
  const s = String(x);
  // Quote anything with commas/quotes/newlines, and defuse spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function sendCsv(res, filename, header, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send([header, ...rows].map((r) => r.map(cell).join(',')).join('\n'));
}

router.get('/workouts.csv', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT w.started_at, w.name AS workout, e.name AS exercise, ws.set_number, ws.weight, ws.reps, w.notes
       FROM workout_sets ws
       JOIN workouts w ON w.id = ws.workout_id
       JOIN exercises e ON e.id = ws.exercise_id
      WHERE w.user_id = $1
      ORDER BY w.started_at, ws.completed_at`,
    [req.userId]
  );
  sendCsv(res, 'workouts.csv', ['started_at', 'workout', 'exercise', 'set', 'weight', 'reps', 'notes'],
    rows.map((r) => [r.started_at.toISOString(), r.workout, r.exercise, r.set_number, r.weight, r.reps, r.notes]));
}));

router.get('/bodyweight.csv', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT logged_on, weight FROM bodyweight_entries WHERE user_id = $1 ORDER BY logged_on', [req.userId]);
  sendCsv(res, 'bodyweight.csv', ['date', 'weight'], rows.map((r) => [r.logged_on, r.weight]));
}));

module.exports = router;
