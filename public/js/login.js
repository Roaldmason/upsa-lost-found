(function () {
  'use strict';
  var STUDENT_RE = /^103\d{5}$/;
  var form = document.getElementById('loginForm');
  var guest = document.getElementById('guestPhone');
  var index = document.getElementById('indexNo');
  var error = document.getElementById('loginError');
  var btn = document.getElementById('loginBtn');

  function clearError() {
    error.hidden = true;
    guest.removeAttribute('aria-invalid');
    index.removeAttribute('aria-invalid');
  }
  function showError(msg, field) {
    error.textContent = msg;
    error.hidden = false;
    guest.removeAttribute('aria-invalid');
    index.removeAttribute('aria-invalid');
    (field ? [field] : [guest, index]).forEach(function (f) { f.setAttribute('aria-invalid', 'true'); });
    if (field) field.focus();
  }

  [guest, index].forEach(function (el) {
    el.addEventListener('input', function () {
      el.value = el.value.replace(/\D/g, '');
      clearError();
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var phone = guest.value.trim(), id = index.value.trim(), role, value;

    if (phone && id) return showError('Fill in one box only: Guest or Index number.');
    if (!phone && !id) return showError('Enter your phone number as a Guest, or your index number.');

    if (phone) {
      if (phone.charAt(0) !== '0') return showError('Phone number must start with 0.', guest);
      if (phone.length !== 10) return showError('Phone number must be exactly 10 digits.', guest);
      role = 'guest'; value = phone;
    } else {
      if (id.length !== 8) return showError('Index number must be exactly 8 digits.', index);
      if (!STUDENT_RE.test(id)) return showError('Invalid ID. Index numbers start with 103.', index);
      role = 'student'; value = id;
    }

    btn.disabled = true; btn.textContent = 'Signing in...';
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role, id: value })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, body: j }; });
    }).then(function (res) {
      if (!res.ok) throw new Error(res.body.error || 'Could not sign in.');
      sessionStorage.setItem('upsa_token', res.body.token);
      sessionStorage.setItem('upsa_user', res.body.user.id);
      sessionStorage.setItem('upsa_role', res.body.user.role);
      window.location.href = 'dashboard.html';
    }).catch(function (err) {
      var offline = err instanceof TypeError;
      showError(offline ? 'Cannot reach the server. Check your connection and try again.' : err.message, role === 'guest' ? guest : index);
      btn.disabled = false; btn.textContent = 'Sign in';
    });
  });
})();
