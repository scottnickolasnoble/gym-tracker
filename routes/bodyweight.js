const express = require('express');
const { query } = require('../db/pool');
const { asyncHandler, HttpError } = require('../middleware/errors');
const v = require('../middleware/validate');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, logged_on, weight FROM bodyweight_entries WHERE user_id = $1 ORDER BY logged_on DESC LIMIT 365',
    [req.userId]
  );
  res.json(rows.map((r) => ({ id: r.id, date: r.logged_on, weight: r.weight })));
}));

// { weight, date? } — one entry per day; logging twice in a day replaces it.
router.post('/', asyncHandler(async (req, res) => {
  const weight = v.num(req.body.weight, 'Weight', { min: 1, max: 1000 });
  let date = req.body.date;
  if (date == null || date === '') {
    const tz = v.timezone(req.body.tz);
    const { rows } = await query("SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d", [tz]);
    date = rows[0].d;
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw v.bad('Date must look like 2026-10-20.');
  }
  const { rows } = await query(
    `INSERT INTO bodyweight_entries (user_id, logged_on, weight) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, logged_on) DO UPDATE SET weight = EXCLUDED.weight
     RETURNING id, logged_on, weight`,
    [req.userId, date, weight]
  );
  res.status(201).json({ id: rows[0].id, date: rows[0].logged_on, weight: rows[0].weight });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM bodyweight_entries WHERE id = $1 AND user_id = $2',
    [v.id(req.params.id), req.userId]);
  if (!rowCount) throw new HttpError(404, 'Entry not found.');
  res.status(204).end();
}));

module.exports = router;
