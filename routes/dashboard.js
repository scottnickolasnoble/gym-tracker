const express = require('express');
const { query } = require('../db/pool');
const { asyncHandler } = require('../middleware/errors');
const v = require('../middleware/validate');
const { summarize, personalRecords } = require('../lib/stats');
const { loadWeek } = require('./schedule');

const router = express.Router();

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

router.get('/', asyncHandler(async (req, res) => {
  const tz = v.timezone(req.query.tz);
  const userId = req.userId;

  const { rows: [settings] } = await query('SELECT weekly_goal, units, bodyweight_goal FROM user_settings WHERE user_id = $1', [userId]);
  const { rows: [clock] } = await query(
    `SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today,
            to_char(date_trunc('week', now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS week_start,
            EXTRACT(ISODOW FROM now() AT TIME ZONE $1)::int - 1 AS weekday`,
    [tz]
  );
  const { today, week_start: weekStart, weekday } = clock;

  // Finished workouts per week for the last ~year: drives the streak and the volume chart.
  const { rows: weeks } = await query(
    `SELECT to_char(date_trunc('week', w.started_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS week,
            COUNT(DISTINCT w.id) AS workouts,
            COALESCE(SUM(ws.weight * ws.reps), 0) AS volume
       FROM workouts w LEFT JOIN workout_sets ws ON ws.workout_id = w.id
      WHERE w.user_id = $1 AND w.finished_at IS NOT NULL AND w.started_at > now() - interval '400 days'
      GROUP BY 1`,
    [userId, tz]
  );
  const byWeek = Object.fromEntries(weeks.map((w) => [w.week, w]));
  const goal = settings.weekly_goal;
  const thisWeek = byWeek[weekStart] || { workouts: 0, volume: 0 };
  const lastWeek = byWeek[addDays(weekStart, -7)] || { workouts: 0, volume: 0 };

  // Streak = weeks in a row you hit your goal. This week only counts once it's met.
  let streak = thisWeek.workouts >= goal ? 1 : 0;
  for (let i = 1; i < 60; i++) {
    const wk = byWeek[addDays(weekStart, -7 * i)];
    if (wk && wk.workouts >= goal) streak++; else break;
  }

  const volumeWeeks = [];
  for (let i = 7; i >= 0; i--) {
    const wk = addDays(weekStart, -7 * i);
    volumeWeeks.push({ week: wk, volume: Math.round((byWeek[wk] || { volume: 0 }).volume), current: i === 0 });
  }

  // This week, day by day: what's planned and what you actually did.
  const schedule = await loadWeek(userId);
  const { rows: weekWorkouts } = await query(
    `SELECT id, name, type, finished_at IS NOT NULL AS finished,
            to_char(started_at AT TIME ZONE $2, 'YYYY-MM-DD') AS d
       FROM workouts
      WHERE user_id = $1 AND (started_at AT TIME ZONE $2)::date BETWEEN $3 AND $4
      ORDER BY started_at`,
    [userId, tz, weekStart, addDays(weekStart, 6)]
  );
  const { rows: weekStretches } = await query(
    `SELECT routine_key, to_char(done_at AT TIME ZONE $2, 'YYYY-MM-DD') AS d
       FROM stretch_sessions WHERE user_id = $1 AND (done_at AT TIME ZONE $2)::date BETWEEN $3 AND $4`,
    [userId, tz, weekStart, addDays(weekStart, 6)]
  );
  const days = schedule.map((plan, i) => {
    const date = addDays(weekStart, i);
    return {
      date,
      isToday: date === today,
      plan,
      done: weekWorkouts.filter((w) => w.d === date && w.finished).map((w) => ({ id: w.id, name: w.name, type: w.type })),
      stretched: weekStretches.some((s) => s.d === date)
    };
  });

  // Up next: the first planned day from today on that isn't done yet.
  let upNext = null;
  for (let i = 0; i < 7 && !upNext; i++) {
    const idx = (weekday + i) % 7;
    const plan = schedule[idx];
    if (plan.kind === 'rest') continue;
    if (i === 0 && (days[idx].done.length || (plan.kind === 'stretch' && days[idx].stretched))) continue;
    upNext = { daysAway: i, day: idx, ...plan };
  }
  if (upNext && upNext.kind === 'workout') {
    const { rows } = await query(
      `SELECT e.name, re.sets, re.reps, re.weight, e.is_bodyweight
         FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
        WHERE re.routine_id = $1 ORDER BY re.position`,
      [upNext.routineId]
    );
    upNext.items = rows.map((r) => ({ name: r.name, sets: r.sets, reps: r.reps, weight: r.is_bodyweight ? null : r.weight }));
  }

  // Recent finished workouts.
  const { rows: recentRows } = await query(
    `SELECT id, name, type, started_at, to_char(started_at AT TIME ZONE $2, 'YYYY-MM-DD') AS d
       FROM workouts WHERE user_id = $1 AND finished_at IS NOT NULL
      ORDER BY started_at DESC LIMIT 6`,
    [userId, tz]
  );
  const sums = await summarize(recentRows.map((r) => r.id));
  const prs = await personalRecords(userId);
  const recent = recentRows.map((r) => ({ id: r.id, name: r.name, type: r.type, date: r.d, ...sums[r.id], prs: prs[r.id] || [] }));

  const { rows: active } = await query(
    `SELECT id, name FROM workouts WHERE user_id = $1 AND finished_at IS NULL AND started_at > now() - interval '12 hours'
      ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );

  const { rows: bw } = await query(
    `SELECT logged_on, weight FROM bodyweight_entries WHERE user_id = $1 ORDER BY logged_on DESC LIMIT 60`,
    [userId]
  );
  let bodyweight = null;
  if (bw.length) {
    const latest = bw[0];
    const monthAgo = bw.find((e) => e.logged_on <= addDays(latest.logged_on, -30)) || bw[bw.length - 1];
    bodyweight = {
      latest: latest.weight,
      date: latest.logged_on,
      change30: monthAgo === latest ? null : Math.round((latest.weight - monthAgo.weight) * 10) / 10,
      goal: settings.bodyweight_goal
    };
  }

  res.json({
    today, weekStart, units: settings.units, weeklyGoal: goal,
    thisWeek: { workouts: thisWeek.workouts, volume: Math.round(thisWeek.volume) },
    lastWeek: { workouts: lastWeek.workouts, volume: Math.round(lastWeek.volume) },
    streak, volumeWeeks, days, upNext, recent,
    active: active[0] || null,
    bodyweight
  });
}));

module.exports = router;
