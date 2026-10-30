import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { router as authRouter, auth, requireAdmin, JWT_SECRET } from './auth.js';
import walletRouter from './wallet.js';
import gamesRouter from './games.js';
import { initSchema, query, execute, get } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cookieParser());

// --- lazy schema init ---
let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = initSchema().catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}
app.use(async (req, res, next) => {
  try { await ensureInit(); next(); }
  catch (e) {
    console.error('schema init failed:', e.message);
    res.status(500).json({ error: 'db init failed', detail: e.message });
  }
});

// --- API routes ---
app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/games', gamesRouter);

app.get('/api/admin/users', auth, requireAdmin, async (req, res) => {
  const users = await query('SELECT id, username, role, balance, created_at FROM users ORDER BY id');
  res.json({ users });
});
app.post('/api/admin/promote', auth, requireAdmin, async (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'missing user_id' });
  await execute("UPDATE users SET role = 'admin' WHERE id = ?", [user_id]);
  res.json({ ok: true });
});
app.post('/api/admin/settings', auth, requireAdmin, async (req, res) => {
  const { key, value } = req.body || {};
  if (!key || value === undefined) return res.status(400).json({ error: 'missing fields' });
  await execute(
    'INSERT INTO admin_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    env: {
      turso_url: !!process.env.TURSO_DATABASE_URL,
      turso_token: !!process.env.TURSO_AUTH_TOKEN,
      jwt: !!process.env.JWT_SECRET,
    },
  });
});

// --- static files (public/) ---
// extensions: ['html'] makes /lobby resolve to lobby.html, /game to game.html, etc.
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  index: ['index.html'],
}));

// --- root fallback ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- error handler ---
app.use((err, req, res, next) => {
  console.error('unhandled:', err);
  res.status(500).json({ error: 'server error', detail: err.message });
});

// --- admin bootstrap ---
async function ensureAdmin() {
  const admin = await get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admin) return;
  const first = await get('SELECT id FROM users ORDER BY id LIMIT 1');
  if (first) await execute("UPDATE users SET role = 'admin' WHERE id = ?", [first.id]);
}
app.use(async (req, res, next) => {
  try { await ensureAdmin(); } catch {}
  next();
});

// --- WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });
const rooms = new Map();

function parseCookie(str) {
  return Object.fromEntries(
    (str || '').split(';').map(s => s.trim().split('=')).filter(p => p[0])
  );
}

wss.on('connection', (ws, req) => {
  const cookies = parseCookie(req.headers.cookie);
  try { ws.user = jwt.verify(cookies.token, JWT_SECRET); }
  catch { ws.close(4001, 'auth required'); return; }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const id = String(msg.matchId);
      if (!rooms.has(id)) rooms.set(id, new Set());
      rooms.get(id).add(ws);
      ws.matchId = id;
    }
    if (msg.type === 'move' && ws.matchId) {
      const room = rooms.get(ws.matchId);
      if (!room) return;
      const payload = JSON.stringify({ type: 'move', from: ws.user.uid, payload: msg.payload });
      for (const c of room) if (c !== ws && c.readyState === 1) c.send(payload);
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.matchId);
    if (room) { room.delete(ws); if (!room.size) rooms.delete(ws.matchId); }
  });
});

// --- listen (local only; Vercel wraps the handler) ---
const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => console.log(`listening on ${PORT}`));
}

export default app;
