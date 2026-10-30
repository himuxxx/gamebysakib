import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, get, execute } from './db.js';

export const router = express.Router();
export const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_DAYS = 30;

async function makeToken(user) {
  const token = jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: `${SESSION_DAYS}d`,
  });
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  await execute('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [
    user.id, token, expiresAt,
  ]);
  return token;
}

export async function auth(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'not logged in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT id, username, role, balance FROM users WHERE id = ?', [payload.uid]);
    if (!user) return res.status(401).json({ error: 'user gone' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid session' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'username >= 3, password >= 6' });
  }
  const existing = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) return res.status(409).json({ error: 'username taken' });
  const hash = await bcrypt.hash(password, 10);
  const startBal = parseInt(
    (await get("SELECT value FROM admin_settings WHERE key = 'starting_balance'")).value, 10
  );
  const user = await get(
    'INSERT INTO users (username, password_hash, balance) VALUES (?, ?, ?) RETURNING id, username, role, balance',
    [username, hash, startBal]
  );
  const token = await makeToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 86400 * 1000 });
  res.json({ user, token });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing fields' });
  const found = await get('SELECT * FROM users WHERE username = ?', [username]);
  if (!found) return res.status(401).json({ error: 'invalid login' });
  const ok = await bcrypt.compare(password, found.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid login' });
  const user = { id: found.id, username: found.username, role: found.role, balance: found.balance };
  const token = await makeToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 86400 * 1000 });
  res.json({ user, token });
});

router.post('/logout', auth, async (req, res) => {
  const token = req.cookies.token;
  if (token) await execute('DELETE FROM sessions WHERE token = ?', [token]);
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', auth, (req, res) => res.json({ user: req.user }));
