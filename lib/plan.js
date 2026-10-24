// What's planned on each actual date: your weekly plan, plus any days you pushed or skipped.
const { query } = require('../db/pool');

// 'YYYY-MM-DD' helpers (done in UTC so time zones can't shift the date).
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayIndex = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
// Today's date where you are, as 'YYYY-MM-DD'.
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

// The repeating weekly plan, Monday (0) to Sunday (6).
async function loadWeek(userId) {
  const { rows } = await query(
    `SELECT d.*, r.name AS routine_name, r.type AS routine_type, r.stretch_key AS routine_stretch
       FROM schedule_days d LEFT JOIN routines r ON r.id = d.routine_id
      WHERE d.user_id = $1`,
    [userId]
  );
  const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
  const week = [];
  for (let day = 0; day < 7; day++) week.push({ day, ...shape(byDay[day]) });
  return week;
}

// Turns a schedule_days or schedule_overrides row (joined with routines) into a plan entry.
function shape(r) {
  // A workout whose routine was deleted turns back into a rest day.
  const kind = !r ? 'rest' : (r.kind === 'workout' && !r.routine_id ? 'rest' : r.kind);
  return {
    kind,
    routineId: kind === 'workout' ? r.routine_id : null,
    routineName: kind === 'workout' ? r.routine_name : null,
    routineType: kind === 'workout' ? r.routine_type : null,
    stretchKey: kind === 'stretch' ? r.stretch_key : (kind === 'workout' ? r.routine_stretch : null),
    stretchAfter: kind === 'workout' ? Boolean(r.stretch_after) : false,
    startTime: kind === 'rest' ? null : (r && r.start_time) || null
  };
}

// Every date from `from` to `to` (inclusive) with what's planned. `note` is
// 'moved' (something was pushed here), 'pushed-off' (its workout was pushed away),
// 'skipped', or null (just the normal weekly plan).
async function resolveDays(userId, from, to) {
  const week = await loadWeek(userId);
  const { rows } = await query(
    `SELECT o.*, to_char(o.on_date, 'YYYY-MM-DD') AS d,
            r.name AS routine_name, r.type AS routine_type, r.stretch_key AS routine_stretch
       FROM schedule_overrides o LEFT JOIN routines r ON r.id = o.routine_id
      WHERE o.user_id = $1 AND o.on_date BETWEEN $2 AND $3`,
    [userId, from, to]
  );
  const overrides = Object.fromEntries(rows.map((r) => [r.d, r]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const o = overrides[d];
    const base = week[weekdayIndex(d)];
    out.push(o
      ? { date: d, day: weekdayIndex(d), ...shape(o), note: o.note }
      : { date: d, ...base, note: null });
  }
  return out;
}

// Saves one-off changes: { 'YYYY-MM-DD': planEntry + note }
async function writeOverrides(client, userId, writes) {
  for (const [d, p] of Object.entries(writes)) {
    await client.query(
      `INSERT INTO schedule_overrides (user_id, on_date, kind, routine_id, stretch_key, stretch_after, start_time, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, on_date) DO UPDATE
         SET kind = EXCLUDED.kind, routine_id = EXCLUDED.routine_id, stretch_key = EXCLUDED.stretch_key,
             stretch_after = EXCLUDED.stretch_after, start_time = EXCLUDED.start_time, note = EXCLUDED.note`,
      [userId, d, p.kind, p.routineId || null, p.kind === 'stretch' ? p.stretchKey : null,
        Boolean(p.stretchAfter), p.startTime || null, p.note]
    );
  }
}

// Works out the changes for pushing `date`'s plan to `target`.
// Whatever was already on the target day gets bumped to the next day, and so on,
// until something lands on a rest day. Returns the writes (nothing saved yet).
function planPush(days, date, target) {
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const source = byDate[date];
  const writes = { [date]: { kind: 'rest', note: 'pushed-off' } };
  let carry = source;
  let d = target;
  for (let guard = 0; guard < 21; guard++) {
    const current = writes[d] || byDate[d] || { kind: 'rest' };
    writes[d] = { ...carry, note: 'moved' };
    if (current.kind === 'rest') break;
    carry = current;
    d = addDays(d, 1);
  }
  return writes;
}

module.exports = { todayIn, addDays, weekdayIndex, daysBetween, loadWeek, resolveDays, writeOverrides, planPush };
