// Login + sign-up page.
(function () {
  const { $, api } = window.GL;
  let mode = 'login';

  function setMode(next) {
    mode = next;
    $('#tab-login').setAttribute('aria-pressed', String(mode === 'login'));
    $('#tab-signup').setAttribute('aria-pressed', String(mode === 'signup'));
    $('#name-field').hidden = mode !== 'signup';
    $('#pw-hint').hidden = mode !== 'signup';
    $('#password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('#auth-submit').textContent = mode === 'signup' ? 'Create account' : 'Log in';
    $('#auth-error').hidden = true;
  }

  $('#tab-login').addEventListener('click', () => setMode('login'));
  $('#tab-signup').addEventListener('click', () => setMode('signup'));

  // Hide the sign-up tab once you've turned sign-ups off on the server.
  api('/auth/signups').then((r) => { if (!r.open) $('#tab-signup').hidden = true; }).catch(() => {});

  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#auth-submit');
    const err = $('#auth-error');
    err.hidden = true;
    btn.disabled = true;
    try {
      const body = { email: $('#email').value, password: $('#password').value };
      if (mode === 'signup') body.name = $('#name').value;
      await api(mode === 'signup' ? '/auth/register' : '/auth/login', { method: 'POST', body });
      location.href = '/';
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
})();
