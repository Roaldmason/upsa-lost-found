'use strict';
require('dotenv').config();
const { createPool, init } = require('./db');
const { createApp } = require('./app');
const { createSender } = require('./sms');

const production = process.env.NODE_ENV === 'production';
if (production && !process.env.JWT_SECRET) { console.error('JWT_SECRET must be set in production.'); process.exit(1); }
if (!process.env.JWT_SECRET) { process.env.JWT_SECRET = 'dev-only-secret-change-me'; console.warn('JWT_SECRET not set, using a development secret.'); }

(async function () {
  console.log('Connecting to the database (a sleeping Neon database can take up to 20 seconds)...');
  const pool = createPool();
  try { await init(pool); } catch (e) {
    console.error('\nCould not connect to the database: ' + e.message);
    console.error('Check: 1) your internet, 2) the Neon database is not paused (open the Neon dashboard), 3) DATABASE_URL in .env is correct.');
    process.exit(1);
  }
  console.log('Database connected.');
  const sms = createSender(process.env);
  if (production && sms.name === 'console') console.warn('SMS_PROVIDER is "console": guests will NOT receive real texts. Set SMS_PROVIDER=arkesel.');
  const port = process.env.PORT || 3000;
  createApp(pool, { production: production, sms: sms }).listen(port, function () {
    console.log('UPSA LOST and FOUND ID running on http://localhost:' + port);
  });
})().catch(function (e) { console.error(e.message); process.exit(1); });
