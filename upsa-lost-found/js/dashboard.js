(function () {
  'use strict';
  var KEY = 'upsa_ids';
  var user = sessionStorage.getItem('upsa_user');
  if (!/^103\d{5}$/.test(user || '')) { window.location.replace('index.html'); return; }

  var $ = function (id) { return document.getElementById(id); };
  var photoData = '', kind = 'found';

  $('whoAmI').textContent = 'Index ' + user;
  $('logoutBtn').addEventListener('click', function () { sessionStorage.removeItem('upsa_user'); window.location.href = 'index.html'; });

  /* ---------- storage (this browser only) ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); return true; } catch (e) { return false; } }

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
  /* accepts 0241234567, +233241234567 or 233241234567; stores 233241234567 */
  function cleanPhone(v) {
    var d = String(v).replace(/[\s\-()+]/g, '');
    if (/^0\d{9}$/.test(d)) return '233' + d.slice(1);
    if (/^233\d{9}$/.test(d)) return d;
    return '';
  }

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
    var err = $('formError');
    var idType = $('idType').value, holder = $('holderName').value.trim(), place = $('place').value, note = $('note').value.trim();
    var phone = cleanPhone($('whatsapp').value);
    function fail(m) { err.textContent = m; err.hidden = false; }
    if (!idType || !holder || !place || !note) return fail('Choose the ID type and fill in the name, place and note.');
    if (!phone) return fail('Enter a valid WhatsApp number, for example 0241234567.');
    var items = load();
    items.unshift({
      id: 'i' + Date.now() + Math.floor(Math.random() * 1000),
      kind: kind, idType: idType, holder: holder, place: place, detail: $('placeDetail').value.trim(), note: note,
      photo: photoData, whatsapp: phone, owner: user, created: Date.now(), resolved: false
    });
    if (!save(items)) return fail('Browser storage is full. Remove old posts or use a smaller photo.');
    err.hidden = true;
    e.target.reset(); photoData = ''; $('preview').hidden = true;
    $('filter').value = 'open'; $('search').value = '';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---------- browse ---------- */
  function render() {
    var q = $('search').value.trim().toLowerCase(), f = $('filter').value;
    var all = load();
    var list = all.filter(function (it) {
      if (f === 'open' && it.resolved) return false;
      if (f === 'found' && (it.kind !== 'found' || it.resolved)) return false;
      if (f === 'lost' && (it.kind !== 'lost' || it.resolved)) return false;
      if (f === 'done' && !it.resolved) return false;
      if (f === 'mine' && it.owner !== user) return false;
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
      var mine = it.owner === user, lost = it.kind === 'lost';
      var msg = lost
        ? 'Hi, I think I have found your ' + it.idType + ' (' + it.holder + ') that you reported on UPSA LOST and FOUND ID.'
        : 'Hi, I think the ' + it.idType + ' you found on UPSA LOST and FOUND ID with the name ' + it.holder + ' is mine.';
      var wa = it.whatsapp ? '<a class="btn small wa" target="_blank" rel="noopener" href="https://wa.me/' + esc(it.whatsapp) + '?text=' + encodeURIComponent(msg) + '">' + (lost ? 'I found this ID, message owner' : 'This is mine, message finder') + '</a>' : '';
      return '<article class="item ' + (lost ? 'lost ' : '') + (it.resolved ? 'done' : '') + '">' +
        '<div class="tag-hole" aria-hidden="true"></div>' +
        '<span class="chip">' + (lost ? 'Missing' : 'Found') + ' &middot; ' + esc(it.idType) + '</span>' +
        (it.photo ? '<img src="' + it.photo + '" alt="Photo for ' + esc(it.idType) + ' of ' + esc(it.holder) + '">' : '') +
        '<h3>' + esc(it.holder) + '</h3>' +
        '<p class="meta">' + (lost ? 'Lost at ' : 'Found at ') + esc(it.place) + (it.detail ? ', ' + esc(it.detail) : '') + '</p>' +
        '<p class="note">' + esc(it.note) + '</p>' +
        '<p class="meta">Posted ' + ago(it.created) + ' by ' + (mine ? 'you' : 'index ' + esc(it.owner)) + '</p>' +
        (it.resolved ? '<p class="stamp">' + (lost ? 'Owner has recovered it' : 'Returned to owner') + '</p>' : wa) +
        (mine ? '<div class="actions"><button class="btn small" data-act="toggle" data-id="' + it.id + '">' +
          (it.resolved ? 'Reopen post' : (lost ? 'Mark as found' : 'Mark as returned')) + '</button>' +
          '<button class="btn small danger" data-act="remove" data-id="' + it.id + '">Remove</button></div>' : '') +
        '</article>';
    }).join('');
  }

  $('grid').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var items = load(), idx = items.findIndex(function (i) { return i.id === b.dataset.id; });
    if (idx < 0 || items[idx].owner !== user) return;
    if (b.dataset.act === 'toggle') { items[idx].resolved = !items[idx].resolved; }
    else if (b.dataset.act === 'remove') {
      if (!confirm('Remove this post for ' + items[idx].holder + '? This cannot be undone.')) return;
      items.splice(idx, 1);
    }
    save(items); render();
  });

  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  setKind('found');
  render();
})();
