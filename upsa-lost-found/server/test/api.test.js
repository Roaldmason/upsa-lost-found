'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { newDb } = require('pg-mem');
const { init } = require('../db');
const { createApp } = require('../app');
const { namesMatch } = require('../matching');

let server, base, pool;
const sent = []; // every text message the app tried to send
const lastCode = () => /\b(\d{6})\b/.exec(sent[sent.length - 1].text)[1];
test.before(async () => {
  const mem = newDb();
  pool = new (mem.adapters.createPg().Pool)();
  await init(pool);
  server = createApp(pool, { jwtSecret: 'test-secret', resendMs: 0, sms: { name: 'test', send: async (phone, text) => { sent.push({ phone, text }); } } }).listen(0);
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => server.close());

async function call(method, url, body, token) {
  const r = await fetch(base + url, {
    method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
/* students sign in with the index number; guests must verify their phone with a code */
const login = async (role, id) => {
  if (role === 'student') return (await call('POST', '/api/login', { role, id })).body.token;
  await call('POST', '/api/guest/send-code', { phone: id });
  return (await call('POST', '/api/guest/verify', { phone: id, code: lastCode() })).body.token;
};
const post = (token, o) => call('POST', '/api/items', Object.assign({ kind: 'found', idType: 'Ghana Card', holder: 'Amina Mensah', place: 'Library', note: 'blue card', whatsapp: '0241234567' }, o), token);

test('name matching', () => {
  assert.ok(namesMatch('Amina Mensah', 'mensah amina'));
  assert.ok(namesMatch('Amina Mensah', 'AMINA  AKUA MENSAH'));
  assert.ok(namesMatch('Kɔfi Ɛnyan', 'kɔfi ɛnyan'));
  assert.ok(!namesMatch('Kwame', 'Kwame Asante'));
  assert.ok(!namesMatch('Amina Mensah', 'Amina Owusu'));
});

test('login validation for students and guests', async () => {
  // a guest can no longer skip the phone check
  assert.strictEqual((await call('POST', '/api/login', { role: 'guest', id: '0241234567' })).status, 400);
  assert.strictEqual((await call('POST', '/api/login', { role: 'student', id: '10312345' })).status, 200);
  assert.strictEqual((await call('POST', '/api/login', { role: 'student', id: '20312345' })).status, 400);
  assert.strictEqual((await call('POST', '/api/login', { role: 'admin', id: '10312345' })).status, 400);
});

test('items need a sign-in and are shared by everyone', async () => {
  assert.strictEqual((await call('GET', '/api/items')).status, 401);
  const a = await login('student', '10311111'), g = await login('guest', '0200000001');
  assert.strictEqual((await post(a, { holder: 'Visible Person' })).status, 201);
  const list = (await call('GET', '/api/items', null, g)).body;
  const it = list.find((i) => i.holder === 'Visible Person');
  assert.ok(it); assert.strictEqual(it.mine, false); assert.strictEqual(it.postedBy, 'index 10311111');
  const mine = (await call('GET', '/api/items', null, a)).body.find((i) => i.holder === 'Visible Person');
  assert.strictEqual(mine.mine, true);
});

test('guest phone is masked for others', async () => {
  const g = await login('guest', '0244445555'), s = await login('student', '10322222');
  await post(g, { holder: 'Guest Poster' });
  const it = (await call('GET', '/api/items', null, s)).body.find((i) => i.holder === 'Guest Poster');
  assert.strictEqual(it.postedBy, 'guest 024****555');
});

test('match prompt reaches the owner, whichever post comes first', async () => {
  const owner = await login('student', '10333333'), finder = await login('guest', '0555555555');
  // lost first, found second
  assert.strictEqual((await post(owner, { kind: 'lost', holder: 'Kojo Boateng', idType: 'Student ID' })).body.matches, 0);
  assert.strictEqual((await post(finder, { kind: 'found', holder: 'boateng kojo', idType: 'Student ID' })).body.matches, 1);
  let m = (await call('GET', '/api/matches', null, owner)).body;
  assert.strictEqual(m.length, 1); assert.strictEqual(m[0].role, 'owner'); assert.strictEqual(m[0].other.whatsapp, '233241234567');
  let f = (await call('GET', '/api/matches', null, finder)).body;
  assert.strictEqual(f.length, 1); assert.strictEqual(f[0].role, 'finder');
  // dismissing only affects the person who dismissed
  assert.strictEqual((await call('POST', '/api/matches/' + m[0].id + '/seen', null, owner)).status, 200);
  assert.strictEqual((await call('GET', '/api/matches', null, owner)).body.length, 0);
  assert.strictEqual((await call('GET', '/api/matches', null, finder)).body.length, 1);
  // found first, lost second
  const o2 = await login('student', '10344444');
  await post(finder, { kind: 'found', holder: 'Esi Quaye', idType: 'NHIS card' });
  assert.strictEqual((await post(o2, { kind: 'lost', holder: 'Esi Quaye', idType: 'NHIS card' })).body.matches, 1);
  assert.strictEqual((await call('GET', '/api/matches', null, o2)).body.length, 1);
});

test('no match for different ID type, own posts, or resolved posts', async () => {
  const a = await login('student', '10355555'), b = await login('student', '10366666');
  await post(a, { kind: 'lost', holder: 'Yaw Darko', idType: 'Passport' });
  assert.strictEqual((await post(b, { kind: 'found', holder: 'Yaw Darko', idType: 'Ghana Card' })).body.matches, 0);
  assert.strictEqual((await post(a, { kind: 'found', holder: 'Yaw Darko', idType: 'Passport' })).body.matches, 0);
  const id = (await post(a, { kind: 'lost', holder: 'Ama Sarpong', idType: 'Voter ID' })).body.id;
  await call('PATCH', '/api/items/' + id, { resolved: true }, a);
  assert.strictEqual((await post(b, { kind: 'found', holder: 'Ama Sarpong', idType: 'Voter ID' })).body.matches, 0);
});

test('only the owner can change or delete a post; delete removes its matches', async () => {
  const a = await login('student', '10355555'), b = await login('student', '10388888');
  const id = (await post(a, { kind: 'lost', holder: 'Efua Tetteh', idType: 'Other' })).body.id;
  assert.strictEqual((await call('PATCH', '/api/items/' + id, { resolved: true }, b)).status, 403);
  assert.strictEqual((await call('DELETE', '/api/items/' + id, null, b)).status, 403);
  await post(b, { kind: 'found', holder: 'Efua Tetteh', idType: 'Other' });
  assert.strictEqual((await call('DELETE', '/api/items/' + id, null, a)).status, 200);
  assert.strictEqual((await call('GET', '/api/matches', null, b)).body.filter((x) => x.other.holder === 'Efua Tetteh').length, 0);
});

test('validation and photo route', async () => {
  const a = await login('student', '10399999');
  assert.strictEqual((await post(a, { idType: 'Bogus' })).status, 400);
  assert.strictEqual((await post(a, { whatsapp: '12345' })).status, 400);
  assert.strictEqual((await post(a, { photo: 'data:text/html;base64,AAAA' })).status, 400);
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from('fakejpegbytes').toString('base64');
  const id = (await post(a, { holder: 'Photo Person', photo: jpeg })).body.id;
  const r = await fetch(base + '/api/items/' + id + '/photo');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'image/jpeg');
  assert.strictEqual((await fetch(base + '/api/items/nope/photo')).status, 404);
});

test('guest phone verification', async () => {
  const phone = '0277000001';
  // bad numbers never send a text
  const before = sent.length;
  assert.strictEqual((await call('POST', '/api/guest/send-code', { phone: '1241234567' })).status, 400);
  assert.strictEqual((await call('POST', '/api/guest/send-code', { phone: '024123456' })).status, 400);
  assert.strictEqual(sent.length, before);
  // the text goes to the international number and holds a 6-digit code
  assert.strictEqual((await call('POST', '/api/guest/send-code', { phone })).status, 200);
  assert.strictEqual(sent[sent.length - 1].phone, '233277000001');
  const code = lastCode();
  assert.match(code, /^\d{6}$/);
  // wrong code, then right code
  const wrong = code === '000000' ? '111111' : '000000';
  const w = await call('POST', '/api/guest/verify', { phone, code: wrong });
  assert.strictEqual(w.status, 400); assert.match(w.body.error, /not right/);
  const ok = await call('POST', '/api/guest/verify', { phone, code });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.user.role, 'guest'); assert.strictEqual(ok.body.user.id, phone);
  // the token really works, and the code cannot be used twice
  assert.strictEqual((await call('GET', '/api/items', null, ok.body.token)).status, 200);
  assert.strictEqual((await call('POST', '/api/guest/verify', { phone, code })).status, 400);
});

test('too many wrong guesses burn the code', async () => {
  const phone = '0277000002';
  await call('POST', '/api/guest/send-code', { phone });
  const code = lastCode(), wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await call('POST', '/api/guest/verify', { phone, code: wrong });
  const r = await call('POST', '/api/guest/verify', { phone, code }); // even the right code is refused now
  assert.strictEqual(r.status, 429);
});

test('a new code replaces the old one', async () => {
  const phone = '0277000003';
  await call('POST', '/api/guest/send-code', { phone }); const first = lastCode();
  await call('POST', '/api/guest/send-code', { phone }); const second = lastCode();
  if (first !== second) assert.strictEqual((await call('POST', '/api/guest/verify', { phone, code: first })).status, 400);
  assert.strictEqual((await call('POST', '/api/guest/verify', { phone, code: second })).status, 200);
});

test('SMS failure reports an error and keeps no code', async () => {
  const mem = newDb(), p2 = new (mem.adapters.createPg().Pool)();
  await init(p2);
  const s2 = createApp(p2, { jwtSecret: 's', sms: { name: 'bad', send: async () => { throw new Error('provider down'); } } }).listen(0);
  const r = await fetch('http://127.0.0.1:' + s2.address().port + '/api/guest/send-code', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '0277000004' }) });
  assert.strictEqual(r.status, 502);
  assert.strictEqual((await p2.query('SELECT * FROM phone_codes')).rows.length, 0);
  s2.close();
});

test('send-code respects the wait between texts', async () => {
  const mem = newDb(), p2 = new (mem.adapters.createPg().Pool)();
  await init(p2);
  const s2 = createApp(p2, { jwtSecret: 's', sms: { name: 't', send: async () => {} } }).listen(0); // default 60 s wait
  const go = () => fetch('http://127.0.0.1:' + s2.address().port + '/api/guest/send-code', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '0277000005' }) });
  assert.strictEqual((await go()).status, 200);
  assert.strictEqual((await go()).status, 429);
  s2.close();
});

/* ---------- root login, admin powers and maintenance mode ---------- */
test('root login 10322580 signs in as admin; normal students stay students', async () => {
  const r = await call('POST', '/api/login', { role: 'student', id: '10322580' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.role, 'admin');
  const s = await call('POST', '/api/login', { role: 'student', id: '10399999' });
  assert.strictEqual(s.body.user.role, 'student');
  // a normal user cannot reach the admin API
  assert.strictEqual((await call('GET', '/api/admin/users', null, s.body.token)).status, 403);
  assert.strictEqual((await call('GET', '/api/admin/users')).status, 401);
});

test('admin sees posters, removes a post and a user (who is then blocked)', async () => {
  const admin = (await call('POST', '/api/login', { role: 'student', id: '10322580' })).body.token;
  const u = await login('student', '10399123');
  const made = await post(u, { holder: 'Remove Me Please' });
  assert.strictEqual(made.status, 201);

  const users = (await call('GET', '/api/admin/users', null, admin)).body;
  const row = users.find((x) => x.id === '10399123');
  assert.ok(row); assert.strictEqual(row.posts, 1);
  assert.ok(!users.find((x) => x.id === '10322580'));

  // remove one post
  assert.strictEqual((await call('DELETE', '/api/admin/items/' + made.body.id, null, admin)).status, 200);
  assert.strictEqual((await call('DELETE', '/api/admin/items/' + made.body.id, null, admin)).status, 404);

  // remove the user and their posts
  await post(u, { holder: 'Second Post' });
  assert.strictEqual((await call('DELETE', '/api/admin/users/10399123', null, admin)).status, 200);
  const items = (await call('GET', '/api/admin/items', null, admin)).body;
  assert.ok(!items.find((i) => i.ownerId === '10399123'));
  // their old token and a fresh login are both refused
  assert.strictEqual((await call('GET', '/api/items', null, u)).status, 401);
  assert.strictEqual((await call('POST', '/api/login', { role: 'student', id: '10399123' })).status, 403);
  // admin cannot be removed; allowing back works
  assert.strictEqual((await call('DELETE', '/api/admin/users/10322580', null, admin)).status, 400);
  assert.strictEqual((await call('DELETE', '/api/admin/removed/10399123', null, admin)).status, 200);
  assert.strictEqual((await call('POST', '/api/login', { role: 'student', id: '10399123' })).status, 200);
});

test('maintenance mode: users are blocked, admin still works, turning it on again restores the site', async () => {
  const admin = (await call('POST', '/api/login', { role: 'student', id: '10322580' })).body.token;
  const u = (await call('POST', '/api/login', { role: 'student', id: '10344444' })).body.token;
  assert.strictEqual((await call('GET', '/api/status')).body.maintenance, false);

  assert.strictEqual((await call('POST', '/api/admin/maintenance', { on: true }, u)).status, 403); // users cannot flip it
  assert.strictEqual((await call('POST', '/api/admin/maintenance', { on: true }, admin)).status, 200);
  assert.strictEqual((await call('GET', '/api/status')).body.maintenance, true);

  assert.strictEqual((await call('GET', '/api/items', null, u)).status, 503);
  assert.strictEqual((await call('POST', '/api/login', { role: 'student', id: '10344444' })).status, 503);
  assert.strictEqual((await call('GET', '/api/items', null, admin)).status, 200);
  assert.strictEqual((await call('POST', '/api/login', { role: 'student', id: '10322580' })).status, 200);
  const home = await fetch(base + '/');
  assert.strictEqual(home.status, 503);
  assert.ok((await home.text()).includes('under maintenance'));

  assert.strictEqual((await call('POST', '/api/admin/maintenance', { on: false }, admin)).status, 200);
  assert.strictEqual((await call('GET', '/api/items', null, u)).status, 200);
  assert.strictEqual((await fetch(base + '/')).status, 200);
});

test('optional ROOT_PASSWORD is enforced when set', async () => {
  const mem = newDb(); const p2 = new (mem.adapters.createPg().Pool)(); await init(p2);
  const s2 = createApp(p2, { jwtSecret: 'x', rootPassword: 'open-sesame' }).listen(0);
  const b2 = 'http://127.0.0.1:' + s2.address().port;
  const go = (pw) => fetch(b2 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student', id: '10322580', password: pw }) });
  assert.strictEqual((await go('')).status, 401);
  assert.strictEqual((await go('wrong')).status, 401);
  assert.strictEqual((await go('open-sesame')).status, 200);
  s2.close();
});
