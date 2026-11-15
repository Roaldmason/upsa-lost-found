'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { newDb } = require('pg-mem');
const { init } = require('../db');
const { createApp } = require('../app');
const { namesMatch } = require('../matching');

let server, base, pool;
test.before(async () => {
  const mem = newDb();
  pool = new (mem.adapters.createPg().Pool)();
  await init(pool);
  server = createApp(pool, { jwtSecret: 'test-secret' }).listen(0);
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
const login = async (role, id) => (await call('POST', '/api/login', { role, id })).body.token;
const post = (token, o) => call('POST', '/api/items', Object.assign({ kind: 'found', idType: 'Ghana Card', holder: 'Amina Mensah', place: 'Library', note: 'blue card', whatsapp: '0241234567' }, o), token);

test('name matching', () => {
  assert.ok(namesMatch('Amina Mensah', 'mensah amina'));
  assert.ok(namesMatch('Amina Mensah', 'AMINA  AKUA MENSAH'));
  assert.ok(namesMatch('Kɔfi Ɛnyan', 'kɔfi ɛnyan'));
  assert.ok(!namesMatch('Kwame', 'Kwame Asante'));
  assert.ok(!namesMatch('Amina Mensah', 'Amina Owusu'));
});

test('login validation for students and guests', async () => {
  assert.strictEqual((await call('POST', '/api/login', { role: 'guest', id: '0241234567' })).status, 200);
  assert.strictEqual((await call('POST', '/api/login', { role: 'guest', id: '1241234567' })).status, 400);
  assert.strictEqual((await call('POST', '/api/login', { role: 'guest', id: '024123456' })).status, 400);
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
  const a = await login('student', '10377777'), b = await login('student', '10388888');
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
