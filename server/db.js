'use strict';
const { Pool } = require('pg');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     role TEXT NOT NULL,
     created_at BIGINT NOT NULL
   )`,
  /* one row per phone number waiting to be verified; only a hash of the code is kept */
  `CREATE TABLE IF NOT EXISTS phone_codes (
     phone TEXT PRIMARY KEY,
     code_hash TEXT NOT NULL,
     expires_at BIGINT NOT NULL,
     sent_at BIGINT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS items (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     id_type TEXT NOT NULL,
     holder TEXT NOT NULL,
     place TEXT NOT NULL,
     detail TEXT NOT NULL DEFAULT '',
     note TEXT NOT NULL,
     photo TEXT NOT NULL DEFAULT '',
     whatsapp TEXT NOT NULL,
     owner_id TEXT NOT NULL REFERENCES users(id),
     created_at BIGINT NOT NULL,
     resolved BOOLEAN NOT NULL DEFAULT false
   )`,
  `CREATE INDEX IF NOT EXISTS items_lookup ON items (kind, resolved, id_type)`,
  `CREATE TABLE IF NOT EXISTS matches (
     id TEXT PRIMARY KEY,
     lost_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
     found_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
     created_at BIGINT NOT NULL,
     lost_seen BOOLEAN NOT NULL DEFAULT false,
     found_seen BOOLEAN NOT NULL DEFAULT false,
     UNIQUE (lost_item_id, found_item_id)
   )`
];

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
}

async function init(pool) {
  for (const sql of SCHEMA) await pool.query(sql);
}

module.exports = { createPool, init };
