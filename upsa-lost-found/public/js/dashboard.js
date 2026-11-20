(function () {
  'use strict';
  var token = sessionStorage.getItem('upsa_token');
  var user = sessionStorage.getItem('upsa_user');
  var role = sessionStorage.getItem('upsa_role');
  var valid = role === 'student' ? /^103\d{5}$/.test(user || '') : role === 'guest' ? /^0\d{9}$/.test(user || '') : false;
  if (role === 'admin' && token) { window.location.replace('admin.html'); return; }
  if (!token || !valid) { signOut(true); return; }

  var $ = function (id) { return document.getElementById(id); };
  var photoData = '', kind = 'found', items = [], lastSig = '';
  var POLL_MS = 20000;

  $('whoAmI').textContent = (role === 'guest' ? 'Guest ' : 'Index ') + user;
  $('logoutBtn').addEventListener('click', function () { signOut(false); });

  function signOut(quiet) {
    ['upsa_token', 'upsa_user', 'upsa_role'].forEach(function (k) { sessionStorage.removeItem(k); });
    window.location.replace('index.html');
  }

  /* ---------- server calls ---------- */
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 503) { window.location.replace('maintenance.html'); throw new Error('The website is under maintenance.'); }
      if (r.status === 401) { signOut(true); throw new Error('Please sign in again.'); }
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Something went wrong.');
        return j;
      });
    });
  }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.floor(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }
  function shrink(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 640, r = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = function () { cb(''); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  /* accepts 0241234567, +233241234567 or 233241234567; returns 233241234567 */
  function cleanPhone(v) {
    var d = String(v).replace(/[\s\-()+]/g, '');
    if (/^0\d{9}$/.test(d)) return '233' + d.slice(1);
    if (/^233\d{9}$/.test(d)) return d;
    return '';
  }
  function photoUrl(id) { return '/api/items/' + encodeURIComponent(id) + '/photo'; }
  function prefillPhone() { if (role === 'guest') $('whatsapp').value = user; }

  /* ---------- form mode: found vs lost ---------- */
  function setKind(k) {
    kind = k;
    var f = k === 'found';
    $('kindFound').setAttribute('aria-pressed', f);
    $('kindLost').setAttribute('aria-pressed', !f);
    $('lblName').textContent = f ? 'Name on the ID' : 'Your name as it appears on the ID';
    $('lblPlace').textContent = f ? 'Where did you find it?' : 'Where do you think you lost it?';
    $('lblNote').textContent = f ? 'Note (colour of the card, any marks, where it can be collected)' : 'Describe your ID (colour, marks, when you lost it)';
    $('lblPhoto').textContent = f ? 'Photo of the ID (optional)' : 'Photo of a similar ID or a copy (optional)';
    $('note').placeholder = f ? 'Found on the stairs, I have kept it safely' : 'Blue Student ID, cracked corner, lost on Monday evening';
    $('submitBtn').textContent = f ? 'Post found ID' : 'Report missing ID';
    $('submitBtn').className = 'btn primary';
  }
  $('kindFound').addEventListener('click', function () { setKind('found'); });
  $('kindLost').addEventListener('click', function () { setKind('lost'); });

  $('photo').addEventListener('change', function (e) {
    var f = e.target.files[0];
    photoData = '';
    $('preview').hidden = true;
    if (!f) return;
    shrink(f, function (data) {
      photoData = data;
      if (data) { $('preview').src = data; $('preview').hidden = false; }
    });
  });

  $('itemForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, err = $('formError'), btn = $('submitBtn'), label = btn.textContent;
    var idType = $('idType').value, holder = $('holderName').value.trim(), place = $('place').value, note = $('note').value.trim();
    var phone = cleanPhone($('whatsapp').value);
    function fail(m) { err.textContent = m; err.hidden = false; }
    if (!idType || !holder || !place || !note) return fail('Choose the ID type and fill in the name, place and note.');
    if (!phone) return fail('Enter a valid WhatsApp number, for example 0241234567.');
    btn.disabled = true; btn.textContent = 'Posting...';
    api('POST', '/api/items', {
      kind: kind, idType: idType, holder: holder, place: place, detail: $('placeDetail').value.trim(),
      note: note, photo: photoData, whatsapp: phone
    }).then(function () {
      err.hidden = true;
      form.reset(); photoData = ''; $('preview').hidden = true; prefillPhone();
      $('filter').value = 'open'; $('search').value = '';
      return refresh();
    }).then(function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (ex) {
      fail(ex instanceof TypeError ? 'Cannot reach the server. Check your connection and try again.' : ex.message);
    }).then(function () { btn.disabled = false; btn.textContent = label; });
  });

  /* ---------- browse ---------- */
  function render() {
    var q = $('search').value.trim().toLowerCase(), f = $('filter').value;
    var all = items;
    var list = all.filter(function (it) {
      if (f === 'open' && it.resolved) return false;
      if (f === 'found' && (it.kind !== 'found' || it.resolved)) return false;
      if (f === 'lost' && (it.kind !== 'lost' || it.resolved)) return false;
      if (f === 'done' && !it.resolved) return false;
      if (f === 'mine' && !it.mine) return false;
      return !q || (it.holder + ' ' + it.idType + ' ' + it.place + ' ' + it.detail + ' ' + it.note).toLowerCase().indexOf(q) > -1;
    });
    var nFound = all.filter(function (i) { return i.kind === 'found' && !i.resolved; }).length;
    var nLost = all.filter(function (i) { return i.kind === 'lost' && !i.resolved; }).length;
    $('count').textContent = nFound + ' found, ' + nLost + ' reported missing. Showing ' + list.length + '.';

    if (!list.length) {
      $('grid').innerHTML = '<p class="empty">' + (all.length ? 'Nothing matches. Try the name as printed on the ID, or another filter.' : 'No IDs posted yet. Found one or lost yours? Use the form below.') + '</p>';
      return;
    }
    $('grid').innerHTML = list.map(function (it) {
      var mine = it.mine, lost = it.kind === 'lost';
      var msg = lost
        ? 'Hi, I think I have found your ' + it.idType + ' (' + it.holder + ') that you reported on UPSA LOST and FOUND ID.'
        : 'Hi, I think the ' + it.idType + ' you found on UPSA LOST and FOUND ID with the name ' + it.holder + ' is mine.';
      var wa = it.whatsapp ? '<a class="btn small wa" target="_blank" rel="noopener" href="https://wa.me/' + esc(it.whatsapp) + '?text=' + encodeURIComponent(msg) + '">' + (lost ? 'I found this ID, message owner' : 'This is mine, message finder') + '</a>' : '';
      return '<article class="item ' + (lost ? 'lost ' : '') + (it.resolved ? 'done' : '') + '">' +
        '<div class="tag-hole" aria-hidden="true"></div>' +
        '<span class="chip">' + (lost ? 'Missing' : 'Found') + ' &middot; ' + esc(it.idType) + '</span>' +
        (it.hasPhoto ? '<img loading="lazy" src="' + photoUrl(it.id) + '" alt="Photo for ' + esc(it.idType) + ' of ' + esc(it.holder) + '">' : '') +
        '<h3>' + esc(it.holder) + '</h3>' +
        '<p class="meta">' + (lost ? 'Lost at ' : 'Found at ') + esc(it.place) + (it.detail ? ', ' + esc(it.detail) : '') + '</p>' +
        '<p class="note">' + esc(it.note) + '</p>' +
        '<p class="meta">Posted ' + ago(it.created) + ' by ' + (mine ? 'you' : esc(it.postedBy)) + '</p>' +
        (it.resolved ? '<p class="stamp">' + (lost ? 'Owner has recovered it' : 'Returned to owner') + '</p>' : wa) +
        (CAN_SPEAK ? '<div class="actions listen-row"><button class="btn small listen" type="button" data-act="listen" data-id="' + esc(it.id) + '" aria-pressed="' + (speakingId === it.id) + '" aria-label="' + (speakingId === it.id ? 'Stop reading' : 'Listen to this post about ' + esc(it.holder)) + '">' + (speakingId === it.id ? 'Stop' : 'Listen') + '</button></div>' : '') +
        (mine ? '<div class="actions"><button class="btn small" data-act="toggle" data-id="' + esc(it.id) + '">' +
          (it.resolved ? 'Reopen post' : (lost ? 'Mark as found' : 'Mark as returned')) + '</button>' +
          '<button class="btn small danger" data-act="remove" data-id="' + esc(it.id) + '">Remove</button></div>' : '') +
        '</article>';
    }).join('');
  }

  $('grid').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var it = items.find(function (i) { return i.id === b.dataset.id; });
    if (!it) return;
    if (b.dataset.act === 'listen') { toggleSpeech(it); return; }
    if (!it.mine) return;
    var req;
    if (b.dataset.act === 'toggle') req = api('PATCH', '/api/items/' + encodeURIComponent(it.id), { resolved: !it.resolved });
    else {
      if (!confirm('Remove this post for ' + it.holder + '? This cannot be undone.')) return;
      req = api('DELETE', '/api/items/' + encodeURIComponent(it.id));
    }
    req.then(refresh).catch(function (ex) { alert(ex.message); });
  });

  /* INCLUSIVE DESIGN 8: "Listen" button. Each post can be read out loud by the
     device's own voice. Helps blind and low-vision users, people with dyslexia
     or low literacy, and anyone who cannot read small text right now (walking,
     tired eyes, bright sun). Nothing is sent anywhere: the browser does the speaking. */
  var CAN_SPEAK = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  var speakingId = null;
  function describe(it) {
    var lost = it.kind === 'lost';
    return (lost ? 'Missing ' : 'Found ') + it.idType + '. Name on the ID: ' + it.holder + '. ' +
      (lost ? 'Lost at ' : 'Found at ') + it.place + (it.detail ? ', ' + it.detail : '') + '. Note: ' + it.note + '. ' +
      'Posted ' + ago(it.created) + (it.resolved ? '. This post is resolved.' : '.');
  }
  function paintListen() { // update only the buttons, so keyboard focus is not lost
    document.querySelectorAll('button[data-act="listen"]').forEach(function (b) {
      var on = b.dataset.id === speakingId;
      b.setAttribute('aria-pressed', on);
      b.textContent = on ? 'Stop' : 'Listen';
      var it = items.find(function (i) { return i.id === b.dataset.id; });
      b.setAttribute('aria-label', on ? 'Stop reading' : 'Listen to this post about ' + (it ? it.holder : ''));
    });
  }
  function toggleSpeech(it) {
    var synth = window.speechSynthesis;
    if (speakingId === it.id) { speakingId = null; synth.cancel(); paintListen(); return; }
    synth.cancel();
    var u = new SpeechSynthesisUtterance(describe(it)), myId = it.id;
    u.lang = 'en';
    u.onend = u.onerror = function () { if (speakingId === myId) { speakingId = null; paintListen(); } };
    speakingId = myId; paintListen();
    synth.speak(u);
  }
  window.addEventListener('pagehide', function () { if (CAN_SPEAK) window.speechSynthesis.cancel(); });

  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);

  /* ---------- "you have a match" prompt ---------- */
  var dlg = $('matchDialog'), queue = [], current = null, shown = {};

  function openNext() {
    if (dlg.open || !queue.length || typeof dlg.showModal !== 'function') return;
    current = queue.shift();
    shown[current.id] = true;
    var o = current.other, owner = current.role === 'owner';
    $('matchCount').textContent = owner ? 'Possible match' : 'Someone is looking for this';
    $('matchTitle').textContent = owner ? 'Good news: someone may have found your ' + o.idType : 'The owner of an ID you found is looking for it';
    $('matchText').textContent = owner
      ? 'A ' + o.idType + ' with the same name as the one you reported missing has just been posted. Check the details, then message the finder.'
      : 'Someone reported a ' + o.idType + ' with the name ' + o.holder + ' as missing, and it matches the one you posted. You can message them to arrange the return.';
    $('matchCard').innerHTML =
      (o.hasPhoto ? '<img src="' + photoUrl(o.id) + '" alt="">' : '') +
      '<div><strong>' + esc(o.holder) + '</strong><span>' + esc(o.idType) + '</span>' +
      '<span>' + (owner ? 'Found at ' : 'Lost at ') + esc(o.place) + (o.detail ? ', ' + esc(o.detail) : '') + '</span></div>';
    var msg = owner
      ? 'Hi, I saw your post on UPSA LOST and FOUND ID. I think the ' + o.idType + ' (' + o.holder + ') you found is mine.'
      : 'Hi, I found the ' + o.idType + ' (' + o.holder + ') that you reported missing on UPSA LOST and FOUND ID.';
    $('matchWa').href = 'https://wa.me/' + o.whatsapp + '?text=' + encodeURIComponent(msg);
    $('matchWa').textContent = owner ? 'Message the finder on WhatsApp' : 'Message the owner on WhatsApp';
    dlg.showModal();
  }
  function markSeen() {
    var id = current && current.id;
    if (id) api('POST', '/api/matches/' + encodeURIComponent(id) + '/seen').catch(function () {});
  }
  $('matchSeen').addEventListener('click', function () { markSeen(); dlg.close(); });
  $('matchWa').addEventListener('click', function () { markSeen(); dlg.close(); });
  $('matchLater').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () { current = null; setTimeout(openNext, 200); });

  function checkMatches() {
    return api('GET', '/api/matches').then(function (list) {
      var queued = queue.map(function (m) { return m.id; });
      list.forEach(function (m) {
        if (!shown[m.id] && queued.indexOf(m.id) < 0) queue.push(m);
      });
      openNext();
    }).catch(function () {});
  }

  /* ---------- live refresh ---------- */
  function refresh() {
    return api('GET', '/api/items').then(function (list) {
      var sig = JSON.stringify(list);
      items = list;
      if (sig !== lastSig) { lastSig = sig; render(); }
      return checkMatches();
    }).catch(function (ex) {
      if (!items.length) $('grid').innerHTML = '<p class="empty">Could not load posts. ' + esc(ex instanceof TypeError ? 'Check your connection.' : ex.message) + '</p>';
    });
  }
  setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });

  setKind('found');
  prefillPhone();
  $('count').textContent = 'Loading posts...';
  refresh();
})();
