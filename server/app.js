'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { namesMatch } = require('./matching');

const STUDENT_RE = /^103\d{5}$/;
const GUEST_RE = /^0\d{9}$/;
const ID_TYPES = ['Student ID', 'Ghana Card', 'NHIS card', "Driver's licence", 'Passport', 'Voter ID', 'Other'];
const PLACES = ['Hostel', 'Classroom', 'Lecture hall', 'Library', 'Other'];
const MAX_PHOTO_CHARS = 400000;

/* accepts 0241234567, +233241234567 or 233241234567; returns 233241234567 */
function cleanPhone(v) {
  var d = String(v || '').replace(/[\s\-()+]/g, '');
  if (/^0\d{9}$/.test(d)) return '233' + d.slice(1);
  if (/^233\d{9}$/.test(d)) return d;
  return '';
}

function postedBy(user) {
  if (user.role === 'guest') return 'guest ' + user.id.slice(0, 3) + '****' + user.id.slice(-3);
  return 'index ' + user.id;
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code) => res.status(code || 400).json({ error: msg });

function createApp(pool, opts) {
  opts = opts || {};
  const secret = opts.jwtSecret || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set.');
  const app = express();
  app.set('trust proxy', 1); // Render and most hosts sit behind a proxy

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ['https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': opts.production ? [] : null
      }
    }
  }));
  app.use(express.json({ limit: '700kb' }));

  /* ---------- auth ---------- */
  function auth(req, res, next) {
    var h = req.headers.authorization || '';
    var token = h.startsWith('Bearer ') ? h.slice(7) : '';
    try {
      var p = jwt.verify(token, secret);
      req.user = { id: p.sub, role: p.role };
      next();
    } catch (e) { bad(res, 'Please sign in again.', 401); }
  }

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: opts.loginLimit || 200, standardHeaders: true, legacyHeaders: false });
  const postLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: opts.postLimit || 30, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.id) || 'anon',
    message: { error: 'You are posting too fast. Try again later.' }
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  function signIn(res, id, role) {
    var token = jwt.sign({ sub: id, role: role }, secret, { expiresIn: '7d' });
    res.json({ token: token, user: { id: id, role: role } });
  }

  /* students sign in with their index number */
  app.post('/api/login', loginLimiter, wrap(async (req, res) => {
    var role = req.body && req.body.role, id = String((req.body && req.body.id) || '').trim();
    if (role === 'guest') return bad(res, 'Guests must verify their phone number with a code first.');
    if (role !== 'student') return bad(res, 'Enter your index number.');
    if (!STUDENT_RE.test(id)) return bad(res, 'Invalid ID. Index numbers are 8 digits starting with 103.');
    await pool.query('INSERT INTO users (id, role, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [id, role, Date.now()]);
    signIn(res, id, role);
  }));

  /* ---------- guest phone verification (SMS code) ---------- */
  const sms = opts.sms || { name: 'console', send: async (p, t) => console.log('[SMS to +' + p + '] ' + t) };
  const CODE_TTL_MS = 5 * 60 * 1000;   // a code works for 5 minutes
  const RESEND_MS = opts.resendMs !== undefined ? opts.resendMs : 60 * 1000; // wait 60 s before asking for another
  const MAX_TRIES = 5;                 // wrong guesses allowed per code
  const hashCode = (phone, code) => crypto.createHmac('sha256', secret).update(phone + ':' + code).digest('hex');
  const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  const codeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: opts.codeLimit || 10, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many code requests. Please try again in a few minutes.' }
  });

  app.post('/api/guest/send-code', codeLimiter, wrap(async (req, res) => {
    var raw = String((req.body && req.body.phone) || '').trim();
    if (!GUEST_RE.test(raw)) return bad(res, 'Phone number must be 10 digits and start with 0.');
    var phone = cleanPhone(raw), now = Date.now();
    var old = (await pool.query('SELECT sent_at FROM phone_codes WHERE phone = $1', [phone])).rows[0];
    if (old && now - Number(old.sent_at) < RESEND_MS) {
      var wait = Math.ceil((RESEND_MS - (now - Number(old.sent_at))) / 1000);
      return res.status(429).json({ error: 'A code was just sent. You can ask for a new one in ' + wait + ' seconds.', retryIn: wait });
    }
    var code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await pool.query(
      `INSERT INTO phone_codes (phone, code_hash, expires_at, sent_at, attempts) VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, sent_at = EXCLUDED.sent_at, attempts = 0`,
      [phone, hashCode(phone, code), now + CODE_TTL_MS, now]);
    try {
      await sms.send(phone, 'UPSA Lost & Found: your code is ' + code + '. It expires in 5 minutes. Do not share it.');
    } catch (e) {
      console.error('SMS failed:', e.message);
      await pool.query('DELETE FROM phone_codes WHERE phone = $1', [phone]);
      return bad(res, 'We could not send the text message. Check the number and try again.', 502);
    }
    res.json({ ok: true, expiresIn: CODE_TTL_MS / 1000, resendIn: RESEND_MS / 1000 });
  }));

  app.post('/api/guest/verify', loginLimiter, wrap(async (req, res) => {
    var raw = String((req.body && req.body.phone) || '').trim(), code = String((req.body && req.body.code) || '').trim();
    if (!GUEST_RE.test(raw)) return bad(res, 'Phone number must be 10 digits and start with 0.');
    if (!/^\d{6}$/.test(code)) return bad(res, 'The code is 6 digits.');
    var phone = cleanPhone(raw);
    var row = (await pool.query('SELECT code_hash, expires_at, attempts FROM phone_codes WHERE phone = $1', [phone])).rows[0];
    if (!row) return bad(res, 'No code was sent to this number. Ask for a new code.');
    if (Number(row.expires_at) < Date.now()) {
      await pool.query('DELETE FROM phone_codes WHERE phone = $1', [phone]);
      return bad(res, 'That code has expired. Ask for a new one.');
    }
    if (row.attempts >= MAX_TRIES) {
      await pool.query('DELETE FROM phone_codes WHERE phone = $1', [phone]);
      return bad(res, 'Too many wrong tries. Ask for a new code.', 429);
    }
    if (!sameHash(row.code_hash, hashCode(phone, code))) {
      await pool.query('UPDATE phone_codes SET attempts = attempts + 1 WHERE phone = $1', [phone]);
      var left = MAX_TRIES - row.attempts - 1;
      return bad(res, 'That code is not right. ' + (left > 0 ? left + (left === 1 ? ' try' : ' tries') + ' left.' : 'Ask for a new code.'));
    }
    await pool.query('DELETE FROM phone_codes WHERE phone = $1', [phone]); // a code works once
    await pool.query('INSERT INTO users (id, role, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [raw, 'guest', Date.now()]);
    signIn(res, raw, 'guest');
  }));

  /* ---------- items ---------- */
  function toClient(r, me) {
    var owner = { id: r.owner_id, role: r.owner_role };
    return {
      id: r.id, kind: r.kind, idType: r.id_type, holder: r.holder, place: r.place, detail: r.detail, note: r.note,
      hasPhoto: !!r.has_photo, whatsapp: r.whatsapp, postedBy: postedBy(owner), mine: r.owner_id === me,
      created: Number(r.created_at), resolved: r.resolved
    };
  }
  const ITEM_COLS = `i.id, i.kind, i.id_type, i.holder, i.place, i.detail, i.note, i.whatsapp, i.owner_id, i.created_at, i.resolved,
                     u.role AS owner_role, (i.photo <> '') AS has_photo`;

  app.get('/api/items', auth, wrap(async (req, res) => {
    var r = await pool.query(`SELECT ${ITEM_COLS} FROM items i JOIN users u ON u.id = i.owner_id ORDER BY i.created_at DESC LIMIT 500`);
    res.json(r.rows.map((x) => toClient(x, req.user.id)));
  }));

  /* photos are loaded by <img>, which cannot send a sign-in header, so this
     route is open. The item id is a random UUID, so it cannot be guessed. */
  app.get('/api/items/:id/photo', wrap(async (req, res) => {
    var r = await pool.query('SELECT photo FROM items WHERE id = $1', [req.params.id]);
    var p = r.rows[0] && r.rows[0].photo;
    var m = p && /^data:image\/jpeg;base64,(.+)$/.exec(p);
    if (!m) return res.status(404).end();
    res.set('Content-Type', 'image/jpeg').set('Cache-Control', 'public, max-age=86400').send(Buffer.from(m[1], 'base64'));
  }));

  /* Look for open posts of the opposite kind with the same ID type and a
     matching name, posted by somebody else, and record each pair once. */
  async function runMatching(item) {
    var other = item.kind === 'found' ? 'lost' : 'found';
    var c = await pool.query(
      'SELECT id, holder FROM items WHERE kind = $1 AND resolved = false AND id_type = $2 AND owner_id <> $3',
      [other, item.id_type, item.owner_id]);
    var n = 0;
    for (var row of c.rows) {
      if (!namesMatch(item.holder, row.holder)) continue;
      var lostId = item.kind === 'lost' ? item.id : row.id, foundId = item.kind === 'found' ? item.id : row.id;
      var ins = await pool.query(
        'INSERT INTO matches (id, lost_item_id, found_item_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (lost_item_id, found_item_id) DO NOTHING',
        [crypto.randomUUID(), lostId, foundId, Date.now()]);
      n += ins.rowCount;
    }
    return n;
  }

  app.post('/api/items', auth, postLimiter, wrap(async (req, res) => {
    var b = req.body || {};
    var kind = b.kind, idType = b.idType, holder = String(b.holder || '').trim(), place = b.place;
    var detail = String(b.detail || '').trim(), note = String(b.note || '').trim(), photo = String(b.photo || '');
    var phone = cleanPhone(b.whatsapp);
    if (kind !== 'found' && kind !== 'lost') return bad(res, 'Choose whether you found or lost the ID.');
    if (ID_TYPES.indexOf(idType) < 0 || PLACES.indexOf(place) < 0 || !holder || !note) return bad(res, 'Choose the ID type and fill in the name, place and note.');
    if (holder.length > 80 || detail.length > 60 || note.length > 300) return bad(res, 'One of the fields is too long.');
    if (!phone) return bad(res, 'Enter a valid WhatsApp number, for example 0241234567.');
    if (photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_PHOTO_CHARS)) return bad(res, 'The photo is not valid or is too large.');
    var item = { id: crypto.randomUUID(), kind: kind, id_type: idType, holder: holder, owner_id: req.user.id };
    await pool.query(
      `INSERT INTO items (id, kind, id_type, holder, place, detail, note, photo, whatsapp, owner_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [item.id, kind, idType, holder, place, detail, note, photo, phone, req.user.id, Date.now()]);
    var matches = await runMatching(item);
    res.status(201).json({ id: item.id, matches: matches });
  }));

  app.patch('/api/items/:id', auth, wrap(async (req, res) => {
    var r = await pool.query('SELECT id, kind, id_type, holder, owner_id FROM items WHERE id = $1', [req.params.id]);
    var it = r.rows[0];
    if (!it) return bad(res, 'Post not found.', 404);
    if (it.owner_id !== req.user.id) return bad(res, 'You can only change your own posts.', 403);
    var resolved = !!(req.body && req.body.resolved);
    await pool.query('UPDATE items SET resolved = $1 WHERE id = $2', [resolved, it.id]);
    if (!resolved) await runMatching(it);
    res.json({ ok: true });
  }));

  app.delete('/api/items/:id', auth, wrap(async (req, res) => {
    var r = await pool.query('SELECT owner_id FROM items WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return bad(res, 'Post not found.', 404);
    if (r.rows[0].owner_id !== req.user.id) return bad(res, 'You can only remove your own posts.', 403);
    await pool.query('DELETE FROM matches WHERE lost_item_id = $1 OR found_item_id = $1', [req.params.id]);
    await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  }));

  /* ---------- matches (the "you have a match" prompt) ---------- */
  app.get('/api/matches', auth, wrap(async (req, res) => {
    var me = req.user.id;
    var r = await pool.query(
      `SELECT m.id AS match_id, m.created_at,
              l.id AS l_id, l.id_type AS l_type, l.holder AS l_holder, l.place AS l_place, l.detail AS l_detail, l.whatsapp AS l_wa, l.owner_id AS l_owner, (l.photo <> '') AS l_photo, m.lost_seen,
              f.id AS f_id, f.id_type AS f_type, f.holder AS f_holder, f.place AS f_place, f.detail AS f_detail, f.whatsapp AS f_wa, f.owner_id AS f_owner, (f.photo <> '') AS f_photo, m.found_seen
         FROM matches m
         JOIN items l ON l.id = m.lost_item_id
         JOIN items f ON f.id = m.found_item_id
        WHERE l.resolved = false AND f.resolved = false
          AND ((l.owner_id = $1 AND m.lost_seen = false) OR (f.owner_id = $1 AND m.found_seen = false))
        ORDER BY m.created_at DESC`, [me]);
    res.json(r.rows.map(function (x) {
      var owner = x.l_owner === me; // my post is the missing one, theirs is the found one
      var p = owner ? 'f_' : 'l_';
      return {
        id: x.match_id, role: owner ? 'owner' : 'finder', created: Number(x.created_at),
        other: { id: x[p + 'id'], kind: owner ? 'found' : 'lost', idType: x[p + 'type'], holder: x[p + 'holder'], place: x[p + 'place'], detail: x[p + 'detail'], whatsapp: x[p + 'wa'], hasPhoto: !!x[p + 'photo'] }
      };
    }));
  }));

  app.post('/api/matches/:id/seen', auth, wrap(async (req, res) => {
    var r = await pool.query(
      `SELECT l.owner_id AS l_owner, f.owner_id AS f_owner FROM matches m
         JOIN items l ON l.id = m.lost_item_id JOIN items f ON f.id = m.found_item_id WHERE m.id = $1`, [req.params.id]);
    var m = r.rows[0];
    if (!m) return bad(res, 'Match not found.', 404);
    if (m.l_owner === req.user.id) await pool.query('UPDATE matches SET lost_seen = true WHERE id = $1', [req.params.id]);
    else if (m.f_owner === req.user.id) await pool.query('UPDATE matches SET found_seen = true WHERE id = $1', [req.params.id]);
    else return bad(res, 'Not your match.', 403);
    res.json({ ok: true });
  }));

  /* ---------- website ---------- */
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', (req, res) => bad(res, 'Not found.', 404));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return bad(res, 'The photo is too large.', 413);
    if (err && err.type === 'entity.parse.failed') return bad(res, 'Bad request.');
    console.error(err);
    bad(res, 'Something went wrong on the server.', 500);
  });
  return app;
}

module.exports = { createApp, cleanPhone };
