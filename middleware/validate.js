// Small input checkers. Each one either returns a clean value or throws a 400.
const { HttpError } = require('./errors');

function bad(message) {
  return new HttpError(400, message);
}

function str(value, field, { min = 0, max = 200, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    if (min === 0) return '';
    throw bad(`${field} is required.`);
  }
  if (typeof value !== 'string') throw bad(`${field} must be text.`);
  const v = value.trim();
  if (v.length < min) throw bad(`${field} must be at least ${min} characters.`);
  if (v.length > max) throw bad(`${field} must be ${max} characters or fewer.`);
  return v;
}

function int(value, field, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw bad(`${field} is required.`);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw bad(`${field} must be a whole number.`);
  if (n < min || n > max) throw bad(`${field} must be between ${min} and ${max}.`);
  return n;
}

function num(value, field, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw bad(`${field} is required.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw bad(`${field} must be a number.`);
  if (n < min || n > max) throw bad(`${field} must be between ${min} and ${max}.`);
  return Math.round(n * 100) / 100;
}

function bool(value, field) {
  if (typeof value !== 'boolean') throw bad(`${field} must be true or false.`);
  return value;
}

function oneOf(value, field, options, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  if (!options.includes(value)) throw bad(`${field} must be one of: ${options.join(', ')}.`);
  return value;
}

function id(value, field = 'id') {
  return int(value, field, { min: 1, max: 2147483647 });
}

// "18:00" style 24-hour time, or null.
function time(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw bad(`${field} must look like 18:00.`);
  return value;
}

// IANA timezone from the browser (e.g. America/Toronto). Falls back to UTC if it's junk.
function timezone(value) {
  if (typeof value !== 'string' || value.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

// Mutating API calls must send JSON. Together with SameSite cookies this blocks
// other websites from submitting forms to your API behind your back (CSRF).
function requireJson(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.method === 'DELETE' && !req.headers['content-length']) return next();
  if (!req.is('application/json')) return res.status(415).json({ error: 'Send JSON.' });
  return next();
}

module.exports = { str, int, num, bool, oneOf, id, time, timezone, requireJson, bad };
