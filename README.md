# Gym Log

A personal gym tracker in the same style as the Ledger budget tracker. It includes:

- workouts you build yourself (drag exercises into order), plus home templates for dumbbells, an adjustable bench and bands
- timed exercises (plank, wall sit…) with a start/pause countdown in focus mode
- a Start button everywhere: header, the middle of the phone tab bar, and a Today card on the dashboard
- a weekly schedule
- a dark one-exercise-at-a-time focus mode with plate math and a rest timer
- 10–15 minute stretching routines with drawings
- history, exercise progress charts and records
- body weight logging, and login

**Stack:** Node + Express, PostgreSQL on Neon, plain HTML/CSS/JavaScript (no framework), deployed on Render.

---

## Step-by-step setup

### Part 1 — Run it on your computer

1. **Check your tools.** In a terminal, run `node -v` (needs 20 or newer) and `psql --version`. You already have Postgres from the budget tracker.
2. **Unzip the project** somewhere sensible (for example next to your budget tracker) and open the folder in VS Code.
3. **Install the packages.** In the VS Code terminal, inside the project folder:
   ```
   npm install
   ```
4. **Get your Neon connection string.** In the Neon dashboard, open your project and click **Connect**. Copy the connection string; the **pooled** one (its host has `-pooler` in it) is best. It ends in `?sslmode=require`.
   (Prefer to test offline? Create a local database with `psql -U postgres -c "CREATE DATABASE gymlog;"` and use Option B in `.env.example` instead.)
5. **Make your `.env` file.**
   1. Copy `.env.example` to a new file called `.env`.
   2. Paste the Neon string into `DATABASE_URL` and set `DATABASE_SSL=true`.
   3. Generate a session secret by running this and pasting the result into `SESSION_SECRET`:
      ```
      node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
      ```
6. **Start it:**
   ```
   npm run dev
   ```
   You should see `Gym Log running on http://localhost:3000`. The tables are created automatically on the first start, and the 40-exercise library is loaded.
7. **Open http://localhost:3000** and click **Create account**. Every new account starts with three workouts (Push, Pull, Legs) and a Mon/Wed/Fri schedule, so there's something to click on right away.

### Part 2 — Test it (tick these off)

- [ ] Log out and back in.
- [ ] **Workouts:** edit Push day. Add an exercise from the library, create a custom one, reorder, then save.
- [ ] **Schedule:** change a day, toggle the cool-down stretch, then save.
- [ ] **Dashboard** › Start workout › **Get ready**: set weights, then press Start.
- [ ] **Focus mode:** do a few sets. Check that the rest timer runs, then try Undo set, Skip and Previous. Refresh the page mid-workout: it should resume where you were.
- [ ] Finish the workout, add a note, then do the cool-down stretch (use › to skip through quickly).
- [ ] **History:** the day shows your sets, notes and the stretch.
- [ ] **Exercises:** the lift you did shows a session (the chart needs two or more).
- [ ] **Get ready** again for the same workout. It should say "Last: …", and "+5/+10" if you hit every rep.
- [ ] **Settings:** switch plates, log body weight, export the CSV.
- [ ] Shrink the browser to phone width. You should get the bottom tab bar.

### Part 3 — Put it on GitHub

1. Create a new **private** repository on GitHub called `gym-log`. Leave it empty, with no README.
2. In the project folder:
   ```
   git init
   git add .
   git commit -m "Gym Log first version"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/gym-log.git
   git push -u origin main
   ```
   `.gitignore` already keeps `node_modules` and your `.env` out of GitHub.

### Part 4 — Deploy on Render

Use the Blueprint, which is the easy way. `render.yaml` sets up the web service; the database stays on Neon.

1. Go to the Render dashboard › **New +** › **Blueprint** and connect your GitHub account.
2. Pick the `gym-log` repo. Render reads `render.yaml` and asks for `DATABASE_URL`: paste the same Neon connection string. Click **Apply**.
3. Wait for the first deploy to finish (a few minutes). The logs should end with `Gym Log running…`.
4. Open the `https://gym-log-xxxx.onrender.com` link. If you already made an account while testing locally on Neon, it's the same database, so just log in. Otherwise create one.
5. **Lock it down:** in Render, open the gym-log service › **Environment**. Set `ALLOW_SIGNUPS` to `false` and save, and it redeploys. Now only you can log in.
6. **On your phone:** open the link in Safari or Chrome › Share › **Add to Home Screen**. It opens like an app.

**Every update after this:** `git add . && git commit -m "what changed" && git push`. Render redeploys by itself.

If you'd rather set it up by hand instead of with the Blueprint, create a **Web Service** from the repo:
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`
- Environment variables: `NODE_ENV` = `production`, `DATABASE_URL` = your Neon string, `DATABASE_SSL` = `true`, `SESSION_SECRET` = a long random string, `ALLOW_SIGNUPS` = `true` (then `false` once your account exists)

### What to know about the free plans

- **Neon's free database doesn't expire.** It has 1 GB of storage per project (years of workout logs), and a monthly compute allowance that a one-person app won't come close to.
- **Neon sleeps after 5 idle minutes.** The first request after that waits a moment while it wakes. The app is set up to wait for it and not crash.
- **Render's free web service sleeps** after 15 minutes with no visits, so the first load after that takes about a minute.

---

## How the project is laid out

```
server.js              Starts everything: security headers, sessions, routes, pages
render.yaml            Render Blueprint (web service; database is on Neon)
db/
  pool.js              Postgres connection + withTransaction helper
  schema.sql           All tables (safe to re-run)
  migrate.js           Runs schema.sql + loads the exercise library on every start
  seed.js              Exercise library + starter workouts for new accounts
middleware/
  auth.js              requireAuth (API → 401) and protectPages (pages → login redirect)
  errors.js            HttpError, asyncHandler, error handler
  validate.js          Input checkers + "must send JSON" rule
  rateLimits.js        Slows down password guessing
lib/stats.js           Ownership checks, PR detection, workout summaries
routes/                One file per area of the API (below)
public/
  *.html               One small file per page; JS fills it in
  css/styles.css       All styling, incl. phone layout and dark focus mode
  js/ui.js             Shared: api(), esc(), formatting, header + tab bar
  js/stretches.js      Stretch routines, stick-figure drawings, follow-along player
  js/pages/*.js        One script per page
```

### Database tables

| Table | What's in it |
|---|---|
| `users`, `user_settings` | Your login, plus units, plates, goals and rest times |
| `exercises` | The built-in library (`user_id` empty) plus your custom exercises |
| `routines`, `routine_exercises` | Your saved workouts and their exercises, in order |
| `schedule_days` | 7 rows, Monday to Sunday: a workout, stretch, or rest |
| `workouts`, `workout_sets` | Every workout you start and every set you tick |
| `stretch_sessions` | Finished stretches, linked to the workout when it was a cool-down |
| `bodyweight_entries` | One weight per day |
| `user_sessions` | Logins. Created automatically by connect-pg-simple |

### API

Everything except `/api/auth/*` needs you to be logged in. Requests that change data must send JSON.

| Method | Path | Does |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Account |
| GET | `/api/auth/me` | Who's logged in |
| GET, PUT | `/api/settings` | Read or update settings |
| POST | `/api/settings/password` | Change password |
| GET, POST | `/api/exercises` | Library with your bests, or create a custom exercise |
| DELETE | `/api/exercises/:id` | Delete a custom exercise (not if it's in your history) |
| GET | `/api/exercises/:id/progress` | Sessions, estimated 1RM and records for one lift |
| GET, POST | `/api/routines` | List or create workouts |
| GET, PUT, DELETE | `/api/routines/:id` | One workout |
| GET | `/api/routines/:id/plan` | "Get ready" data: last time + suggested weight |
| GET, POST | `/api/routines/templates` | List or add a home template |
| PUT | `/api/routines/:id/order` | Save a new exercise order |
| GET, PUT | `/api/schedule` | The 7-day plan |
| GET | `/api/workouts?from=&to=&tz=` | History for a date range |
| GET | `/api/workouts/active` | An unfinished workout to resume |
| POST | `/api/workouts` | Start a workout |
| GET, PATCH, DELETE | `/api/workouts/:id` | Detail, finish/notes, delete |
| POST | `/api/workouts/:id/sets` | Log a set |
| DELETE | `/api/workouts/:id/sets/:setId` | Undo a set |
| GET | `/api/dashboard?tz=` | Everything the dashboard shows |
| GET, POST | `/api/bodyweight` | Body weight log |
| DELETE | `/api/bodyweight/:id` | Delete an entry |
| POST | `/api/stretches` | Log a finished stretch |
| GET | `/api/export/workouts.csv`, `/api/export/bodyweight.csv` | Downloads |

### Security, briefly

- Passwords are hashed with bcrypt.
- Logins are server-side sessions stored in Postgres, with httpOnly, SameSite=Lax cookies that are secure on Render.
- Login and sign-up are rate-limited.
- Every query checks that the row belongs to you.
- Every page uses `esc()` before putting text into HTML (this is the XSS fix you flagged on the budget tracker).
- Helmet sets security headers.
- Changes must be sent as JSON, which blocks cross-site form posts.

---

## Troubleshooting

| You see | Fix |
|---|---|
| `DATABASE_URL is not set` | The `.env` file is missing or misnamed (it must be exactly `.env`). |
| `password authentication failed` | The password in `DATABASE_URL` is wrong. Copy the string from Neon again. |
| `self-signed certificate` or SSL errors | Use the exact Neon string, ending in `?sslmode=require`, with `DATABASE_SSL=true`. |
| `Connection terminated` once after a quiet spell | Neon was asleep. Refresh; it's awake now. |
| Logged out on every refresh on Render | `NODE_ENV` must be `production`, and you must open the `https://` link. |
| `SESSION_SECRET must be set` on Render | Add it under Environment (the Blueprint generates one). |
| Can't sign up | `ALLOW_SIGNUPS` is `false`. Flip it to `true`, sign up, then flip it back. |
