(function () {
  'use strict';
  var ID_PATTERN = /^103\d{5}$/;
  var form = document.getElementById('loginForm');
  var input = document.getElementById('indexNo');
  var error = document.getElementById('indexError');

  if (sessionStorage.getItem('upsa_user')) { window.location.replace('dashboard.html'); return; }

  function showError(msg) { error.textContent = msg; error.hidden = false; input.setAttribute('aria-invalid', 'true'); }

  input.addEventListener('input', function () {
    input.value = input.value.replace(/\D/g, '');
    error.hidden = true;
    input.removeAttribute('aria-invalid');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = input.value.trim();
    if (!id) return showError('Enter your index number.');
    if (id.length !== 8) return showError('Index number must be exactly 8 digits.');
    if (!ID_PATTERN.test(id)) return showError('Invalid ID. Index numbers start with 103.');
    sessionStorage.setItem('upsa_user', id);
    window.location.href = 'dashboard.html';
  });
})();
