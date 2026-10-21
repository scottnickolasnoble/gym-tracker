const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { asyncHandler, HttpError } = require('../middleware/errors');
const v = require('../middleware/validate');

const router = express.Router();

async function load(userId) {
  const { rows } = await query(
    `SELECT s.*, u.email, u.display_name
       FROM user_settings s JOIN users u ON u.id = s.user_id
      WHERE s.user_id = $1`,
    [userId]
  );
  const s = rows[0];
  return {
    name: s.display_name,
    email: s.email,
    units: s.units,
    barWeight: s.bar_weight,
    plates: s.plates,
    weeklyGoal: s.weekly_goal,
    bodyweightGoal: s.bodyweight_goal,
    restBig: s.rest_big,
    restOther: s.rest_other,
    suggestIncrease: s.suggest_increase
  };
}

router.get('/', asyncHandler(async (req, res) => {
  res.json(await load(req.userId));
}));

router.put('/', asyncHandler(async (req, res) => {
  const b = req.body;
  const name = v.str(b.name, 'Name', { max: 60 });
  const units = v.oneOf(b.units, 'Units', ['lb', 'kg']);
  const barWeight = v.num(b.barWeight, 'Bar weight', { min: 0, max: 200 });
  if (!Array.isArray(b.plates) || b.plates.length > 12) throw v.bad('Plates must be a list (12 at most).');
  const plates = [...new Set(b.plates.map((p) => v.num(p, 'Plate', { min: 0.25, max: 100 })))].sort((x, y) => y - x);
  const weeklyGoal = v.int(b.weeklyGoal, 'Weekly goal', { min: 1, max: 7 });
  const bodyweightGoal = v.num(b.bodyweightGoal, 'Body weight goal', { min: 1, max: 1000, optional: true });
  const restBig = v.int(b.restBig, 'Rest for big lifts', { min: 0, max: 900 });
  const restOther = v.int(b.restOther, 'Rest for other lifts', { min: 0, max: 900 });
  const suggestIncrease = v.bool(b.suggestIncrease, 'Suggest increases');

  await query('UPDATE users SET display_name = $1 WHERE id = $2', [name, req.userId]);
  await query(
    `UPDATE user_settings
        SET units = $1, bar_weight = $2, plates = $3, weekly_goal = $4, bodyweight_goal = $5,
            rest_big = $6, rest_other = $7, suggest_increase = $8
      WHERE user_id = $9`,
    [units, barWeight, plates, weeklyGoal, bodyweightGoal, restBig, restOther, suggestIncrease, req.userId]
  );
  res.json(await load(req.userId));
}));

router.post('/password', asyncHandler(async (req, res) => {
  const current = v.str(req.body.current, 'Current password', { min: 1, max: 200 });
  const next = v.str(req.body.next, 'New password', { min: 8, max: 200 });
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  if (!(await bcrypt.compare(current, rows[0].password_hash))) throw new HttpError(400, 'Current password is wrong.');
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(next, 12), req.userId]);
  res.json({ ok: true });
}));

module.exports = router;
