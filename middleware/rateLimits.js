const rateLimit = require('express-rate-limit');

// Login/sign-up: 10 tries per 15 minutes per IP, to slow down password guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Wait 15 minutes and try again.' }
});

// Everything else under /api: generous, just stops runaway scripts.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Slow down a little.' }
});

module.exports = { authLimiter, apiLimiter };
