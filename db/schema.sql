-- Gym Log schema. Safe to run more than once: everything is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  units            TEXT NOT NULL DEFAULT 'lb' CHECK (units IN ('lb', 'kg')),
  bar_weight       NUMERIC(6,2) NOT NULL DEFAULT 45,
  plates           NUMERIC(6,2)[] NOT NULL DEFAULT '{45,35,25,10,5,2.5}',
  weekly_goal      INTEGER NOT NULL DEFAULT 4 CHECK (weekly_goal BETWEEN 1 AND 7),
  bodyweight_goal  NUMERIC(6,1),
  rest_big         INTEGER NOT NULL DEFAULT 180,
  rest_other       INTEGER NOT NULL DEFAULT 90,
  suggest_increase BOOLEAN NOT NULL DEFAULT true
);

-- user_id NULL = built-in library exercise everyone can use.
CREATE TABLE IF NOT EXISTS exercises (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  muscle_group  TEXT NOT NULL CHECK (muscle_group IN ('push', 'pull', 'legs', 'core')),
  equipment     TEXT NOT NULL DEFAULT 'Barbell',
  is_big_lift   BOOLEAN NOT NULL DEFAULT false,
  is_bodyweight BOOLEAN NOT NULL DEFAULT false,
  lower_body    BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS exercises_builtin_name ON exercises (name) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exercises_user_name ON exercises (user_id, lower(name)) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS routines (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('push', 'pull', 'legs', 'upper', 'full', 'other')),
  stretch_key TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS routines_user ON routines (user_id);

CREATE TABLE IF NOT EXISTS routine_exercises (
  id           SERIAL PRIMARY KEY,
  routine_id   INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id  INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  sets         INTEGER NOT NULL CHECK (sets BETWEEN 1 AND 20),
  reps         INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 300),
  weight       NUMERIC(6,2),
  rest_seconds INTEGER NOT NULL DEFAULT 90 CHECK (rest_seconds BETWEEN 0 AND 900)
);
CREATE INDEX IF NOT EXISTS routine_exercises_routine ON routine_exercises (routine_id);

-- One row per weekday. day 0 = Monday ... 6 = Sunday.
CREATE TABLE IF NOT EXISTS schedule_days (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  kind          TEXT NOT NULL DEFAULT 'rest' CHECK (kind IN ('workout', 'stretch', 'rest')),
  routine_id    INTEGER REFERENCES routines(id) ON DELETE SET NULL,
  stretch_key   TEXT,
  stretch_after BOOLEAN NOT NULL DEFAULT false,
  start_time    TEXT,
  PRIMARY KEY (user_id, day)
);

-- plan = snapshot of what you meant to do (exercises, sets, reps, weight) when you hit Start.
CREATE TABLE IF NOT EXISTS workouts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_id  INTEGER REFERENCES routines(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'other',
  stretch_key TEXT,
  plan        JSONB NOT NULL DEFAULT '[]',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  notes       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS workouts_user_started ON workouts (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS workout_sets (
  id           SERIAL PRIMARY KEY,
  workout_id   INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id  INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  set_number   INTEGER NOT NULL,
  weight       NUMERIC(6,2),
  reps         INTEGER NOT NULL CHECK (reps BETWEEN 0 AND 300),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_sets_workout ON workout_sets (workout_id);
CREATE INDEX IF NOT EXISTS workout_sets_exercise ON workout_sets (exercise_id);

CREATE TABLE IF NOT EXISTS stretch_sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  routine_key TEXT NOT NULL,
  seconds     INTEGER NOT NULL CHECK (seconds BETWEEN 0 AND 7200),
  workout_id  INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
  done_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stretch_sessions_user ON stretch_sessions (user_id, done_at DESC);

CREATE TABLE IF NOT EXISTS bodyweight_entries (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_on DATE NOT NULL,
  weight    NUMERIC(6,1) NOT NULL CHECK (weight > 0),
  UNIQUE (user_id, logged_on)
);

-- ---------- Version 2 additions (safe to re-run on an existing database) ----------

-- Timed exercises (plank, wall sit...) and what equipment an exercise needs.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_timed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS needs TEXT[] NOT NULL DEFAULT '{}';

-- For timed exercises: how long each set lasts (planned and actually done).
ALTER TABLE routine_exercises ADD COLUMN IF NOT EXISTS seconds INTEGER CHECK (seconds BETWEEN 1 AND 3600);
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS seconds INTEGER CHECK (seconds BETWEEN 0 AND 7200);

-- The equipment you own. Body weight is always available.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS equipment TEXT[] NOT NULL DEFAULT '{dumbbells,bench,bands}';
