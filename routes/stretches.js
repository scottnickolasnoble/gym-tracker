const express = require('express');
const { query } = require('../db/pool');
const { asyncHandler } = require('../middleware/errors');
const v = require('../middleware/validate');
const { ownWorkout } = require('../lib/stats');

const router = express.Router();

// Log a finished stretch: { key: 'pull', seconds: 720, workoutId? }
router.post('/', asyncHandler(async (req, res) => {
  const key = v.oneOf(req.body.key, 'Stretch routine', ['push', 'pull', 'legs', 'full']);
  const seconds = v.int(req.body.seconds, 'Seconds', { min: 0, max: 7200 });
  let workoutId = null;
  if (req.body.workoutId != null) workoutId = (await ownWorkout(req.userId, v.id(req.body.workoutId, 'Workout'))).id;
  const { rows } = await query(
    'INSERT INTO stretch_sessions (user_id, routine_key, seconds, workout_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [req.userId, key, seconds, workoutId]
  );
  res.status(201).json({ id: rows[0].id });
}));

module.exports = router;
