require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const { pool } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { requireAuth, protectPages } = require('./middleware/auth');
const { apiNotFound, errorHandler } = require('./middleware/errors');
const { requireJson } = require('./middleware/validate');
const { authLimiter, apiLimiter } = require('./middleware/rateLimits');

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  if (isProd) throw new Error('SESSION_SECRET must be set to a long random string (32+ characters).');
  console.warn('Warning: SESSION_SECRET is short or missing. Fine for local testing, not for Render.');
}

const app = express();

// Render sits in front of the app as a proxy; this lets secure cookies and rate limits see the real visitor.
app.set('trust proxy', 1);

// Security headers. Only our own scripts may run; fonts come from Google.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      upgradeInsecureRequests: isProd ? [] : null
    }
  }
}));

app.use(express.json({ limit: '200kb' }));

// Logins are kept in a Postgres table (created automatically), so they survive restarts on Render.
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'gymlog.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

// Render pings this to know the app is alive.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---- API ----
app.use('/api', apiLimiter, requireJson);
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api', requireAuth);
app.use('/api/settings', require('./routes/settings'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/routines', require('./routes/routines'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/workouts', require('./routes/workouts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/bodyweight', require('./routes/bodyweight'));
app.use('/api/stretches', require('./routes/stretches'));
app.use('/api/export', require('./routes/export'));
app.use('/api', apiNotFound);

// ---- Pages ----
app.use(protectPages);
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use(errorHandler);

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`Gym Log running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Could not set up the database:', err.message);
    process.exit(1);
  });
