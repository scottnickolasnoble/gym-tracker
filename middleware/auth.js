// Login checks.
const path = require('path');

// For /api routes: answer 401 so the browser code can send you to the login page.
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
    return next();
  }
  return res.status(401).json({ error: 'Please log in.' });
}

// For the HTML pages: redirect to the login page instead of showing a broken page.
// CSS, JS and font files pass straight through.
function protectPages(req, res, next) {
  const ext = path.extname(req.path);
  const isPage = ext === '' || ext === '.html';
  if (!isPage) return next();
  const loggedIn = Boolean(req.session && req.session.userId);
  const isLogin = req.path === '/login.html' || req.path === '/login';
  if (isLogin) return loggedIn ? res.redirect('/') : next();
  if (!loggedIn) return res.redirect('/login.html');
  return next();
}

module.exports = { requireAuth, protectPages };
