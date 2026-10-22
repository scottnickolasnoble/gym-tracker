// Built-in exercise library + ready-made home workout templates.

// [name, muscle group, equipment shown, equipment needed, flags]
// flags: big = uses the longer rest, nw = no weight to log, low = lower body (bigger weight jumps), time = timed hold
const LIBRARY = [
  // ---- Push ----
  ['Dumbbell bench press', 'push', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Incline dumbbell press', 'push', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Dumbbell fly', 'push', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Dumbbell shoulder press', 'push', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Arnold press', 'push', 'Dumbbells', ['dumbbells'], ''],
  ['Lateral raise', 'push', 'Dumbbells', ['dumbbells'], ''],
  ['Front raise', 'push', 'Dumbbells', ['dumbbells'], ''],
  ['Dumbbell skull crusher', 'push', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Overhead dumbbell extension', 'push', 'Dumbbells', ['dumbbells'], ''],
  ['Dumbbell kickback', 'push', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Push-ups', 'push', 'Body weight', [], 'nw'],
  ['Incline push-ups', 'push', 'Body weight', ['bench'], 'nw'],
  ['Decline push-ups', 'push', 'Body weight', ['bench'], 'nw'],
  ['Bench dips', 'push', 'Body weight', ['bench'], 'nw'],
  ['Band chest press', 'push', 'Band', ['bands'], 'nw'],
  ['Band overhead press', 'push', 'Band', ['bands'], 'nw'],
  ['Band triceps pushdown', 'push', 'Band', ['bands'], 'nw'],
  ['Band lateral raise', 'push', 'Band', ['bands'], 'nw'],
  ['Bench press', 'push', 'Barbell', ['barbell', 'bench'], 'big'],
  ['Overhead press', 'push', 'Barbell', ['barbell'], 'big'],
  ['Close-grip bench press', 'push', 'Barbell', ['barbell', 'bench'], ''],
  ['Skull crushers', 'push', 'EZ bar', ['ezbar', 'bench'], ''],
  ['Cable fly', 'push', 'Cable', ['cable'], ''],
  ['Triceps pushdown', 'push', 'Cable', ['cable'], ''],
  ['Dips', 'push', 'Dip station', ['dipstation'], 'nw'],

  // ---- Pull ----
  ['Dumbbell row', 'pull', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Chest-supported dumbbell row', 'pull', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Dumbbell pullover', 'pull', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Reverse dumbbell fly', 'pull', 'Dumbbells', ['dumbbells'], ''],
  ['Dumbbell curl', 'pull', 'Dumbbells', ['dumbbells'], ''],
  ['Hammer curl', 'pull', 'Dumbbells', ['dumbbells'], ''],
  ['Incline dumbbell curl', 'pull', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Concentration curl', 'pull', 'Dumbbells', ['dumbbells', 'bench'], ''],
  ['Shrugs', 'pull', 'Dumbbells', ['dumbbells'], ''],
  ['Wrist curl', 'pull', 'Dumbbells', ['dumbbells'], ''],
  ['Band row', 'pull', 'Band', ['bands'], 'nw'],
  ['Band pull-apart', 'pull', 'Band', ['bands'], 'nw'],
  ['Band face pull', 'pull', 'Band', ['bands'], 'nw'],
  ['Band lat pulldown', 'pull', 'Band', ['bands'], 'nw'],
  ['Band curl', 'pull', 'Band', ['bands'], 'nw'],
  ['Pull-ups', 'pull', 'Pull-up bar', ['pullup'], 'nw'],
  ['Chin-ups', 'pull', 'Pull-up bar', ['pullup'], 'nw'],
  ['Dead hang', 'pull', 'Pull-up bar', ['pullup'], 'nw time'],
  ['Deadlift', 'pull', 'Barbell', ['barbell'], 'big low'],
  ['Barbell row', 'pull', 'Barbell', ['barbell'], ''],
  ['Barbell curl', 'pull', 'Barbell', ['barbell'], ''],
  ['EZ-bar curl', 'pull', 'EZ bar', ['ezbar'], ''],
  ['Lat pulldown', 'pull', 'Cable', ['cable'], ''],
  ['Seated cable row', 'pull', 'Cable', ['cable'], ''],
  ['Face pulls', 'pull', 'Cable', ['cable'], ''],
  ['Preacher curl', 'pull', 'Machine', ['machine'], ''],

  // ---- Legs ----
  ['Goblet squat', 'legs', 'Dumbbells', ['dumbbells'], 'low'],
  ['Dumbbell Romanian deadlift', 'legs', 'Dumbbells', ['dumbbells'], 'low'],
  ['Single-leg Romanian deadlift', 'legs', 'Dumbbells', ['dumbbells'], 'low'],
  ['Bulgarian split squat', 'legs', 'Dumbbells', ['dumbbells', 'bench'], 'low'],
  ['Walking lunges', 'legs', 'Dumbbells', ['dumbbells'], 'low'],
  ['Reverse lunge', 'legs', 'Dumbbells', ['dumbbells'], 'low'],
  ['Dumbbell step-up', 'legs', 'Dumbbells', ['dumbbells', 'bench'], 'low'],
  ['Dumbbell hip thrust', 'legs', 'Dumbbells', ['dumbbells', 'bench'], 'low'],
  ['Dumbbell sumo squat', 'legs', 'Dumbbells', ['dumbbells'], 'low'],
  ['Dumbbell calf raise', 'legs', 'Dumbbells', ['dumbbells'], 'low'],
  ['Bodyweight squat', 'legs', 'Body weight', [], 'nw low'],
  ['Glute bridge', 'legs', 'Body weight', [], 'nw low'],
  ['Single-leg glute bridge', 'legs', 'Body weight', [], 'nw low'],
  ['Wall sit', 'legs', 'Body weight', [], 'nw low time'],
  ['Band lateral walk', 'legs', 'Band', ['bands'], 'nw low'],
  ['Band good morning', 'legs', 'Band', ['bands'], 'nw low'],
  ['Band glute kickback', 'legs', 'Band', ['bands'], 'nw low'],
  ['Back squat', 'legs', 'Barbell', ['barbell'], 'big low'],
  ['Front squat', 'legs', 'Barbell', ['barbell'], 'big low'],
  ['Romanian deadlift', 'legs', 'Barbell', ['barbell'], 'low'],
  ['Hip thrust', 'legs', 'Barbell', ['barbell', 'bench'], 'low'],
  ['Leg press', 'legs', 'Machine', ['machine'], 'low'],
  ['Leg extension', 'legs', 'Machine', ['machine'], 'low'],
  ['Lying leg curl', 'legs', 'Machine', ['machine'], 'low'],
  ['Standing calf raise', 'legs', 'Machine', ['machine'], 'low'],

  // ---- Core ----
  ['Plank', 'core', 'Body weight', [], 'nw time'],
  ['Side plank', 'core', 'Body weight', [], 'nw time'],
  ['Hollow hold', 'core', 'Body weight', [], 'nw time'],
  ['Mountain climbers', 'core', 'Body weight', [], 'nw time'],
  ['Jumping jacks', 'core', 'Body weight', [], 'nw time'],
  ['Dead bug', 'core', 'Body weight', [], 'nw'],
  ['Bicycle crunch', 'core', 'Body weight', [], 'nw'],
  ['Lying leg raise', 'core', 'Body weight', [], 'nw'],
  ['Russian twist', 'core', 'Body weight', [], 'nw'],
  ['Burpees', 'core', 'Body weight', [], 'nw'],
  ['Dumbbell side bend', 'core', 'Dumbbells', ['dumbbells'], ''],
  ['Band Pallof press', 'core', 'Band', ['bands'], 'nw'],
  ['Hanging leg raise', 'core', 'Pull-up bar', ['pullup'], 'nw'],
  ['Cable crunch', 'core', 'Cable', ['cable'], ''],
  ['Ab wheel rollout', 'core', 'Ab wheel', ['abwheel'], 'nw']
];

async function seedLibrary(client) {
  // Version 1 called it "Plank (seconds)". Rename so workouts that use it keep working.
  await client.query(
    `UPDATE exercises SET name = 'Plank'
      WHERE user_id IS NULL AND name = 'Plank (seconds)'
        AND NOT EXISTS (SELECT 1 FROM exercises WHERE user_id IS NULL AND name = 'Plank')`
  );
  for (const [name, group, equipment, needs, flags] of LIBRARY) {
    const f = flags.split(' ');
    await client.query(
      `INSERT INTO exercises (user_id, name, muscle_group, equipment, needs, is_big_lift, is_bodyweight, lower_body, is_timed)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (name) WHERE user_id IS NULL DO UPDATE
         SET muscle_group = EXCLUDED.muscle_group, equipment = EXCLUDED.equipment, needs = EXCLUDED.needs,
             is_big_lift = EXCLUDED.is_big_lift, is_bodyweight = EXCLUDED.is_bodyweight,
             lower_body = EXCLUDED.lower_body, is_timed = EXCLUDED.is_timed`,
      [name, group, equipment, needs, f.includes('big'), f.includes('nw'), f.includes('low'), f.includes('time')]
    );
  }
}

// Home workouts (dumbbells, adjustable bench, bands) you can add with one tap.
// Items: [exercise name, sets, reps OR seconds for timed exercises, rest seconds]
const TEMPLATES = {
  upper: { name: 'Upper body', type: 'upper', stretch: 'push', items: [
    ['Dumbbell bench press', 3, 10, 90], ['Dumbbell row', 3, 10, 90], ['Dumbbell shoulder press', 3, 10, 90],
    ['Band pull-apart', 3, 15, 60], ['Dumbbell curl', 3, 12, 60], ['Overhead dumbbell extension', 3, 12, 60]
  ] },
  lower: { name: 'Lower body', type: 'legs', stretch: 'legs', items: [
    ['Goblet squat', 3, 10, 90], ['Dumbbell Romanian deadlift', 3, 10, 90], ['Bulgarian split squat', 3, 8, 90],
    ['Dumbbell hip thrust', 3, 12, 60], ['Dumbbell calf raise', 3, 15, 45], ['Plank', 3, 45, 45]
  ] },
  full: { name: 'Full body', type: 'full', stretch: 'full', items: [
    ['Goblet squat', 3, 10, 90], ['Dumbbell bench press', 3, 10, 90], ['Chest-supported dumbbell row', 3, 10, 90],
    ['Reverse lunge', 3, 10, 60], ['Band face pull', 3, 15, 60], ['Side plank', 2, 30, 30]
  ] }
};

async function addTemplate(client, userId, key) {
  const t = TEMPLATES[key];
  const { rows: lib } = await client.query('SELECT id, name, is_timed FROM exercises WHERE user_id IS NULL');
  const byName = Object.fromEntries(lib.map((r) => [r.name, r]));
  const { rows } = await client.query(
    'INSERT INTO routines (user_id, name, type, stretch_key) VALUES ($1, $2, $3, $4) RETURNING id',
    [userId, t.name, t.type, t.stretch]
  );
  let pos = 0;
  for (const [exName, sets, amount, rest] of t.items) {
    const ex = byName[exName];
    if (!ex) continue;
    await client.query(
      `INSERT INTO routine_exercises (routine_id, exercise_id, position, sets, reps, seconds, weight, rest_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`,
      [rows[0].id, ex.id, pos++, sets, ex.is_timed ? 1 : amount, ex.is_timed ? amount : null, rest]
    );
  }
  return rows[0].id;
}

module.exports = { seedLibrary, addTemplate, TEMPLATES };
