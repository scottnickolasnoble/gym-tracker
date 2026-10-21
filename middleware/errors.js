// Error handling for the whole app.

// Throw one of these from a route to send a clean message with a status code.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wraps an async route so a thrown error (or rejected promise) reaches errorHandler.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function apiNotFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 ? 'Something went wrong on the server.' : err.message;
  if (req.path.startsWith('/api')) return res.status(status).json({ error: message });
  return res.status(status).send(message);
}

module.exports = { HttpError, asyncHandler, apiNotFound, errorHandler };
