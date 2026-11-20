(function () {
  'use strict';
  var STUDENT_RE = /^103\d{5}$/;
  var $ = function (id) { return document.getElementById(id); };

  var studentForm = $('studentForm'), indexNo = $('indexNo'), studentError = $('studentError'), studentBtn = $('studentBtn');
  var phoneForm = $('phoneForm'), guestPhone = $('guestPhone'), phoneError = $('phoneError'), sendBtn = $('sendBtn');
  var codeForm = $('codeForm'), guestCode = $('guestCode'), codeError = $('codeError'), verifyBtn = $('verifyBtn'), codeIntro = $('codeIntro');
  var resendBtn = $('resendBtn'), changeBtn = $('changeBtn'), live = $('liveStatus');

  var pendingPhone = '';
  var timer = null;

  /* ---------- small helpers ---------- */
  function announce(msg) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 50); }

  function clearError(box, input) { box.hidden = true; if (input) input.removeAttribute('aria-invalid'); }
  function showError(box, input, msg) {
    box.textContent = msg; box.hidden = false;
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  }

  function digitsOnly(input, box) {
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '');
      clearError(box, input);
    });
  }
  digitsOnly(indexNo, studentError);
  digitsOnly(guestPhone, phoneError);
  digitsOnly(guestCode, codeError);

  function postJson(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }
  function netMsg(err) {
    return err instanceof TypeError ? 'Cannot reach the server. Check your connection and try again.' : err.message;
  }
  function finishSignIn(body) {
    sessionStorage.setItem('upsa_token', body.token);
    sessionStorage.setItem('upsa_user', body.user.id);
    sessionStorage.setItem('upsa_role', body.user.role);
    window.location.href = body.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
  }

  /* ---------- student login ---------- */
  studentForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = indexNo.value.trim();
    if (!id) return showError(studentError, indexNo, 'Enter your index number.');
    if (id.length !== 8) return showError(studentError, indexNo, 'Index number must be exactly 8 digits.');
    if (!STUDENT_RE.test(id)) return showError(studentError, indexNo, 'Invalid ID. Index numbers start with 103.');

    studentBtn.disabled = true; studentBtn.textContent = 'Signing in...';
    var passBox = $('adminPass');
    postJson('/api/login', { role: 'student', id: id, password: passBox ? passBox.value : '' }).then(function (res) {
      if (res.body.needPassword) { // the administrator login also wants a password
        $('adminPassWrap').hidden = false;
        var e = new Error(res.body.error); e.focusPass = true; throw e;
      }
      if (!res.ok) throw new Error(res.body.error || 'Could not sign in.');
      finishSignIn(res.body);
    }).catch(function (err) {
      showError(studentError, err.focusPass ? $('adminPass') : indexNo, netMsg(err));
      studentBtn.disabled = false; studentBtn.textContent = 'Sign in as student';
    });
  });

  /* ---------- guest step 1: send the code ---------- */
  function maskedPhone(p) { return p.slice(0, 3) + ' ' + '***' + ' ' + p.slice(-4); }

  /* INCLUSIVE DESIGN 3 (continued): the resend countdown is shown on the button
     but only announced to screen readers at the start and when it ends, so a
     blind user is not interrupted every second. */
  function startCountdown(seconds) {
    clearInterval(timer);
    var left = seconds;
    resendBtn.disabled = true;
    function paint() { resendBtn.textContent = left > 0 ? 'Send a new code in ' + left + 's' : 'Send a new code'; }
    paint();
    timer = setInterval(function () {
      left -= 1; paint();
      if (left <= 0) {
        clearInterval(timer); resendBtn.disabled = false;
        announce('You can now ask for a new code.');
      }
    }, 1000);
  }

  function showCodeStep(seconds, note) {
    phoneForm.hidden = true; codeForm.hidden = false;
    codeIntro.textContent = note || ('We sent a 6-digit code to ' + maskedPhone(pendingPhone) + '.');
    guestCode.value = ''; clearError(codeError, guestCode);
    startCountdown(seconds);
    guestCode.focus(); // INCLUSIVE DESIGN 3 (continued): focus moves to the new field so keyboard and screen-reader users land in the right place
    announce((note || 'Code sent to ' + maskedPhone(pendingPhone) + '.') + ' Type the 6 digits you received.');
  }

  function sendCode(isResend) {
    var phone = isResend ? pendingPhone : guestPhone.value.trim();
    if (!isResend) {
      if (!phone) return showError(phoneError, guestPhone, 'Enter your phone number.');
      if (phone.charAt(0) !== '0') return showError(phoneError, guestPhone, 'Phone number must start with 0.');
      if (phone.length !== 10) return showError(phoneError, guestPhone, 'Phone number must be exactly 10 digits.');
    }
    var btn = isResend ? resendBtn : sendBtn, label = btn.textContent;
    btn.disabled = true; if (!isResend) btn.textContent = 'Sending...';
    postJson('/api/guest/send-code', { phone: phone }).then(function (res) {
      if (res.status === 429 && res.body.retryIn) { // a code was sent a moment ago: let them type it
        pendingPhone = phone; showCodeStep(res.body.retryIn, res.body.error); return;
      }
      if (!res.ok) throw new Error(res.body.error || 'Could not send the code.');
      pendingPhone = phone; showCodeStep(res.body.resendIn || 60);
    }).catch(function (err) {
      if (isResend) { showError(codeError, guestCode, netMsg(err)); resendBtn.disabled = false; }
      else showError(phoneError, guestPhone, netMsg(err));
    }).then(function () { if (!isResend) { btn.disabled = false; btn.textContent = label; } });
  }

  phoneForm.addEventListener('submit', function (e) { e.preventDefault(); sendCode(false); });
  resendBtn.addEventListener('click', function () { sendCode(true); });

  changeBtn.addEventListener('click', function () {
    clearInterval(timer);
    codeForm.hidden = true; phoneForm.hidden = false;
    guestPhone.focus();
    announce('Enter your phone number again.');
  });

  /* ---------- guest step 2: check the code ---------- */
  codeForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = guestCode.value.trim();
    if (code.length !== 6) return showError(codeError, guestCode, 'The code is 6 digits. Check your text message.');
    verifyBtn.disabled = true; verifyBtn.textContent = 'Checking...';
    postJson('/api/guest/verify', { phone: pendingPhone, code: code }).then(function (res) {
      if (!res.ok) throw new Error(res.body.error || 'Could not verify the code.');
      announce('Phone number verified. Signing you in.');
      finishSignIn(res.body);
    }).catch(function (err) {
      showError(codeError, guestCode, netMsg(err));
      verifyBtn.disabled = false; verifyBtn.textContent = 'Verify and sign in';
    });
  });
})();
