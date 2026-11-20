(function () {
  'use strict';
  var token = sessionStorage.getItem('upsa_token');
  var role = sessionStorage.getItem('upsa_role');
  var user = sessionStorage.getItem('upsa_user');
  if (!token || role !== 'admin') { signOut(); return; }

  var $ = function (id) { return document.getElementById(id); };
  var users = [], items = [], removed = [], siteOn = true;
  $('whoAmI').textContent = 'Admin ' + user;
  $('logoutBtn').addEventListener('click', signOut);

  function signOut() {
    ['upsa_token', 'upsa_user', 'upsa_role'].forEach(function (k) { sessionStorage.removeItem(k); });
    window.location.replace('index.html');
  }
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { signOut(); throw new Error('Please sign in again.'); }
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Something went wrong.');
        return j;
      });
    });
  }
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
  function who(id, r) { return (r === 'guest' ? 'Guest ' : 'Index ') + id; }
  function fail(ex) { alert(ex instanceof TypeError ? 'Cannot reach the server.' : ex.message); }

  /* ---------- website on / off ---------- */
  function paintSwitch() {
    $('siteState').textContent = siteOn ? 'The website is ON. Users can see and use it.' : 'The website is OFF. Users see the maintenance page.';
    $('siteState').className = 'state ' + (siteOn ? 'on' : 'off');
    var b = $('siteBtn');
    b.disabled = false;
    b.textContent = siteOn ? 'Turn website OFF' : 'Turn website ON';
    b.className = 'btn ' + (siteOn ? 'danger' : 'primary');
  }
  $('siteBtn').addEventListener('click', function () {
    var turnOff = siteOn;
    if (turnOff && !confirm('Turn the website off? Everyone except you will see the maintenance page.')) return;
    $('siteBtn').disabled = true;
    api('POST', '/api/admin/maintenance', { on: turnOff }).then(function (r) {
      siteOn = !r.maintenance; paintSwitch();
    }).catch(function (ex) { paintSwitch(); fail(ex); });
  });

  /* ---------- users ---------- */
  function renderUsers() {
    $('userCount').textContent = users.length + (users.length === 1 ? ' person has' : ' people have') + ' posted.';
    $('userRows').innerHTML = users.length ? users.map(function (u) {
      return '<tr><th scope="row">' + esc(who(u.id, u.role)) + '</th><td>' + u.posts + '</td><td>' + ago(u.lastPost) + '</td>' +
        '<td class="row-actions"><button class="btn small" data-act="viewposts" data-id="' + esc(u.id) + '">View posts</button>' +
        '<button class="btn small danger" data-act="removeuser" data-id="' + esc(u.id) + '" aria-label="Remove user ' + esc(u.id) + ' and all their posts">Remove user</button></td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">Nobody has posted yet.</td></tr>';
  }
  $('userRows').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var id = b.dataset.id;
    if (b.dataset.act === 'viewposts') {
      $('itemSearch').value = id; renderItems();
      $('itTitle').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    var u = users.find(function (x) { return x.id === id; });
    if (!u || !confirm('Remove ' + who(u.id, u.role) + '?\n\nThis deletes the user and all ' + u.posts + ' of their posts, and they will not be able to sign in again. This cannot be undone.')) return;
    api('DELETE', '/api/admin/users/' + encodeURIComponent(id)).then(load).catch(fail);
  });

  /* ---------- posts ---------- */
  function renderItems() {
    var q = $('itemSearch').value.trim().toLowerCase();
    var list = items.filter(function (it) {
      return !q || (it.holder + ' ' + it.idType + ' ' + it.place + ' ' + it.detail + ' ' + it.note + ' ' + it.ownerId + ' ' + it.whatsapp).toLowerCase().indexOf(q) > -1;
    });
    $('itemCount').textContent = 'Showing ' + list.length + ' of ' + items.length + ' posts.';
    $('itemRows').innerHTML = list.length ? list.map(function (it) {
      var lost = it.kind === 'lost';
      return '<li class="row"><div class="row-main">' +
        '<span class="chip ' + (lost ? 'lost' : '') + '">' + (lost ? 'Missing' : 'Found') + ' &middot; ' + esc(it.idType) + '</span>' +
        '<strong>' + esc(it.holder) + '</strong>' +
        '<span class="meta">' + (lost ? 'Lost at ' : 'Found at ') + esc(it.place) + (it.detail ? ', ' + esc(it.detail) : '') + '</span>' +
        '<span class="note">' + esc(it.note) + '</span>' +
        '<span class="meta">Posted ' + ago(it.created) + ' by ' + esc(who(it.ownerId, it.ownerRole)) + ' &middot; WhatsApp ' + esc(it.whatsapp) +
        (it.hasPhoto ? ' &middot; has photo' : '') + (it.resolved ? ' &middot; resolved' : '') + '</span></div>' +
        '<button class="btn small danger" data-act="removeitem" data-id="' + esc(it.id) + '" aria-label="Remove post for ' + esc(it.holder) + '">Remove post</button></li>';
    }).join('') : '<li class="empty">No posts match.</li>';
  }
  $('itemSearch').addEventListener('input', renderItems);
  $('itemRows').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act="removeitem"]');
    if (!b) return;
    var it = items.find(function (x) { return x.id === b.dataset.id; });
    if (!it || !confirm('Remove the post for ' + it.holder + '? This cannot be undone.')) return;
    api('DELETE', '/api/admin/items/' + encodeURIComponent(it.id)).then(load).catch(fail);
  });

  /* ---------- removed accounts ---------- */
  function renderRemoved() {
    $('removedRows').innerHTML = removed.length ? removed.map(function (r) {
      return '<li class="row"><div class="row-main"><strong>' + esc(r.id) + '</strong><span class="meta">Removed ' + ago(r.removed) + '</span></div>' +
        '<button class="btn small" data-id="' + esc(r.id) + '">Allow back</button></li>';
    }).join('') : '<li class="empty">No removed accounts.</li>';
  }
  $('removedRows').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]');
    if (!b) return;
    api('DELETE', '/api/admin/removed/' + encodeURIComponent(b.dataset.id)).then(load).catch(fail);
  });

  /* ---------- load everything ---------- */
  function load() {
    return Promise.all([
      api('GET', '/api/status'), api('GET', '/api/admin/users'), api('GET', '/api/admin/items'), api('GET', '/api/admin/removed')
    ]).then(function (r) {
      siteOn = !r[0].maintenance; users = r[1]; items = r[2]; removed = r[3];
      paintSwitch(); renderUsers(); renderItems(); renderRemoved();
    }).catch(function (ex) { $('siteState').textContent = 'Could not load. ' + (ex instanceof TypeError ? 'Check your connection.' : ex.message); });
  }
  load();
  setInterval(function () { if (!document.hidden) load(); }, 30000);
})();
