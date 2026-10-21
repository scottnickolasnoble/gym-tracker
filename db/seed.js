// Built-in exercise library + the starter workouts/schedule every new account gets.

// [name, muscle_group, equipment, is_big_lift, is_bodyweight, lower_body]
const LIBRARY = [
  ['Bench press', 'push', 'Barbell', true, false, false],
  ['Overhead press', 'push', 'Barbell', true, false, false],
  ['Close-grip bench press', 'push', 'Barbell', false, false, false],
  ['Incline dumbbell press', 'push', 'Dumbbells', false, false, false],
  ['Dumbbell shoulder press', 'push', 'Dumbbells', false, false, false],
  ['Lateral raise', 'push', 'Dumbbells', false, false, false],
  ['Cable fly', 'push', 'Cable', false, false, false],
  ['Triceps pushdown', 'push', 'Cable', false, false, false],
  ['Skull crushers', 'push', 'EZ bar', false, false, false],
  ['Dips', 'push', 'Body weight', false, true, false],
  ['Push-ups', 'push', 'Body weight', false, true, false],

  ['Deadlift', 'pull', 'Barbell', true, false, true],
  ['Barbell row', 'pull', 'Barbell', false, false, false],
  ['Dumbbell row', 'pull', 'Dumbbells', false, false, false],
  ['Pull-ups', 'pull', 'Body weight', false, true, false],
  ['Chin-ups', 'pull', 'Body weight', false, true, false],
  ['Lat pulldown', 'pull', 'Cable', false, false, false],
  ['Seated cable row', 'pull', 'Cable', false, false, false],
  ['Face pulls', 'pull', 'Cable', false, false, false],
  ['Barbell curl', 'pull', 'Barbell', false, false, false],
  ['EZ-bar curl', 'pull', 'EZ bar', false, false, false],
  ['Hammer curl', 'pull', 'Dumbbells', false, false, false],
  ['Preacher curl', 'pull', 'Machine', false, false, false],
  ['Shrugs', 'pull', 'Dumbbells', false, false, false],
  ['Wrist curl', 'pull', 'Dumbbells', false, false, false],

  ['Back squat', 'legs', 'Barbell', true, false, true],
  ['Front squat', 'legs', 'Barbell', true, false, true],
  ['Romanian deadlift', 'legs', 'Barbell', false, false, true],
  ['Hip thrust', 'legs', 'Barbell', false, false, true],
  ['Leg press', 'legs', 'Machine', false, false, true],
  ['Walking lunges', 'legs', 'Dumbbells', false, false, true],
  ['Bulgarian split squat', 'legs', 'Dumbbells', false, false, true],
  ['Leg extension', 'legs', 'Machine', false, false, true],
  ['Lying leg curl', 'legs', 'Machine', false, false, true],
  ['Standing calf raise', 'legs', 'Machine', false, false, true],

  ['Plank (seconds)', 'core', 'Body weight', false, true, false],
  ['Hanging leg raise', 'core', 'Body weight', false, true, false],
  ['Cable crunch', 'core', 'Cable', false, false, false],
  ['Ab wheel rollout', 'core', 'Body weight', false, true, false],
  ['Russian twist', 'core', 'Body weight', false, true, false]
];

async function seedLibrary(client) {
  for (const [name, group, equipment, big, bw, lower] of LIBRARY) {
    await client.query(
      `INSERT INTO exercises (user_id, name, muscle_group, equipment, is_big_lift, is_bodyweight, lower_body)
       VALUES (NULL, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) WHERE user_id IS NULL DO NOTHING`,
      [name, group, equipment, big, bw, lower]
    );
  }
}

// [exercise name, sets, reps, rest seconds]
const STARTERS = [
  { name: 'Push day', type: 'push', stretch: 'push', items: [
    ['Bench press', 3, 5, 180], ['Overhead press', 3, 8, 120], ['Incline dumbbell press', 3, 10, 90],
    ['Triceps pushdown', 3, 12, 60], ['Lateral raise', 3, 15, 60]
  ] },
  { name: 'Pull day', type: 'pull', stretch: 'pull', items: [
    ['Deadlift', 3, 5, 180], ['Barbell row', 4, 8, 120], ['Pull-ups', 3, 10, 120],
    ['Face pulls', 3, 15, 60], ['Hammer curl', 3, 10, 60]
  ] },
  { name: 'Legs', type: 'legs', stretch: 'legs', items: [
    ['Back squat', 3, 5, 180], ['Romanian deadlift', 3, 8, 120], ['Leg press', 3, 12, 90],
    ['Lying leg curl', 3, 12, 60], ['Standing calf raise', 3, 15, 60]
  ] }
];

// Gives a brand-new user three workouts and a Mon/Wed/Fri schedule so the app isn't empty.
async function seedStarterData(client, userId) {
  const { rows: lib } = await client.query('SELECT id, name FROM exercises WHERE user_id IS NULL');
  const idByName = Object.fromEntries(lib.map((r) => [r.name, r.id]));
  const routineIds = {};

  for (const r of STARTERS) {
    const { rows } = await client.query(
      'INSERT INTO routines (user_id, name, type, stretch_key) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, r.name, r.type, r.stretch]
    );
    routineIds[r.type] = rows[0].id;
    for (let i = 0; i < r.items.length; i++) {
      const [exName, sets, reps, rest] = r.items[i];
      await client.query(
        `INSERT INTO routine_exercises (routine_id, exercise_id, position, sets, reps, weight, rest_seconds)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)`,
        [rows[0].id, idByName[exName], i, sets, reps, rest]
      );
    }
  }

  const week = [
    ['workout', routineIds.push, null, true, '18:00'],
    ['rest', null, null, false, null],
    ['workout', routineIds.pull, null, true, '18:00'],
    ['rest', null, null, false, null],
    ['workout', routineIds.legs, null, true, '18:00'],
    ['stretch', null, 'full', false, '09:00'],
    ['rest', null, null, false, null]
  ];
  for (let day = 0; day < 7; day++) {
    const [kind, routineId, stretchKey, after, time] = week[day];
    await client.query(
      `INSERT INTO schedule_days (user_id, day, kind, routine_id, stretch_key, stretch_after, start_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, day, kind, routineId, stretchKey, after, time]
    );
  }
}

module.exports = { seedLibrary, seedStarterData };
