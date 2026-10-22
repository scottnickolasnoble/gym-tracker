const express = require('express');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../db/pool');
const { asyncHandler, HttpError } = require('../middleware/errors');
const v = require('../middleware/validate');

const router = express.Router();

// Swaps in a fresh session id on login (stops "session fixation") and stores who you are.
function startSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

const cleanEmail = (value) => {
  const email = v.str(value, 'Email', { min: 3, max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw v.bad('Enter a valid email.');
  return email;
};

router.post('/register', asyncHandler(async (req, res) => {
  if (process.env.ALLOW_SIGNUPS === 'false') throw new HttpError(403, 'Sign-ups are turned off.');
  const email = cleanEmail(req.body.email);
  const password = v.str(req.body.password, 'Password', { min: 8, max: 200 });
  const name = v.str(req.body.name, 'Name', { max: 60 }) || '';

  const existing = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing.rowCount) throw new HttpError(409, 'An account with that email already exists.');

  const hash = await bcrypt.hash(password, 12);
  const user = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, display_name',
      [email, name, hash]
    );
    await client.query('INSERT INTO user_settings (user_id) VALUES ($1)', [rows[0].id]);
    return rows[0];
  });

  await startSession(req, user.id);
  res.status(201).json({ id: user.id, email: user.email, name: user.display_name });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = v.str(req.body.password, 'Password', { min: 1, max: 200 });
  const { rows } = await query('SELECT id, email, display_name, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  // Same message either way, so nobody can test which emails have accounts.
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!ok) throw new HttpError(401, 'Email or password is wrong.');
  await startSession(req, user.id);
  res.json({ id: user.id, email: user.email, name: user.display_name });
}));

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('gymlog.sid');
    res.json({ ok: true });
  });
});

router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session.userId) throw new HttpError(401, 'Please log in.');
  const { rows } = await query('SELECT id, email, display_name FROM users WHERE id = $1', [req.session.userId]);
  if (!rows[0]) throw new HttpError(401, 'Please log in.');
  res.json({ id: rows[0].id, email: rows[0].email, name: rows[0].display_name, signupsOpen: process.env.ALLOW_SIGNUPS !== 'false' });
}));

router.get('/signups', (req, res) => res.json({ open: process.env.ALLOW_SIGNUPS !== 'false' }));

module.exports = router;
