import { connect } from '@tursodatabase/serverless';

const conn = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function query(sql, args = []) {
  const stmt = await conn.prepare(sql);
  return stmt.all(args);
}

export async function execute(sql, args = []) {
  const stmt = await conn.prepare(sql);
  return stmt.run(args);
}

export async function get(sql, args = []) {
  const rows = await query(sql, args);
  return rows[0] || null;
}

export async function initSchema() {
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      balance INTEGER NOT NULL DEFAULT 1000,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game TEXT NOT NULL,
      player_a INTEGER NOT NULL REFERENCES users(id),
      player_b INTEGER REFERENCES users(id),
      stake INTEGER NOT NULL,
      winner INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      finished_at INTEGER
    );
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
  `);
  for (const [k, v] of [
    ['commission_pct', '25'], ['min_stake', '10'],
    ['max_stake', '1000'], ['starting_balance', '1000'],
  ]) {
    await execute(
      `INSERT INTO admin_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO NOTHING`,
      [k, v]
    );
  }
}
