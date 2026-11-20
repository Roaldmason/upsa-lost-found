(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* Is the website back on? If so, send people to where they belong. */
  function check() {
    fetch('/api/status').then(function (r) { return r.json(); }).then(function (s) {
      if (s.maintenance) return;
      var role = sessionStorage.getItem('upsa_role');
      window.location.replace(role === 'admin' ? 'admin.html' : sessionStorage.getItem('upsa_token') ? 'dashboard.html' : 'index.html');
    }).catch(function () {});
  }
  check();
  setInterval(check, 15000);

  /* Admin sign in (the only sign in that works during maintenance) */
  var form = $('adminForm'), idBox = $('adminId'), pass = $('adminPass'), err = $('adminError'), btn = $('adminBtn');
  idBox.addEventListener('input', function () { idBox.value = idBox.value.replace(/\D/g, ''); err.hidden = true; });
  function fail(m, input) { err.textContent = m; err.hidden = false; (input || idBox).focus(); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = idBox.value.trim();
    if (id.length !== 8) return fail('Enter the 8-digit administrator ID.');
    btn.disabled = true; btn.textContent = 'Signing in...';
    fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', id: id, password: pass.value })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (res.body.needPassword) { $('adminPassWrap').hidden = false; fail(res.body.error, pass); return; }
        if (!res.ok) return fail(res.body.error || 'Could not sign in.');
        if (res.body.user.role !== 'admin') return fail('Only the administrator can sign in right now.');
        sessionStorage.setItem('upsa_token', res.body.token);
        sessionStorage.setItem('upsa_user', res.body.user.id);
        sessionStorage.setItem('upsa_role', 'admin');
        window.location.href = 'admin.html';
      }).catch(function () { fail('Cannot reach the server. Check your connection.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  });
})();
