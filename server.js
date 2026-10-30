import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { router as authRouter, auth, requireAdmin } from './auth.js';
import walletRouter from './wallet.js';
import gamesRouter from './games.js';
import { initSchema, query, execute, get } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

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

// --- WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws' });

const matchRooms = new Map(); // matchId -> Set<ws>

wss.on('connection', (ws, req) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const matchId = String(msg.matchId);
      if (!matchRooms.has(matchId)) matchRooms.set(matchId, new Set());
      matchRooms.get(matchId).add(ws);
      ws.matchId = matchId;
      ws.userId = msg.userId;
    }

    if (msg.type === 'move') {
      const room = matchRooms.get(ws.matchId);
      if (!room) return;
      for (const client of room) {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'move', from: ws.userId, payload: msg.payload }));
        }
      }
    }
  });

  ws.on('close', () => {
    const room = matchRooms.get(ws.matchId);
    if (room) { room.delete(ws); if (!room.size) matchRooms.delete(ws.matchId); }
  });
});

// bootstrap: first user becomes admin
(async () => {
  await initSchema();
  const admin = await get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin) {
    const first = await get('SELECT id FROM users ORDER BY id LIMIT 1');
    if (first) await execute("UPDATE users SET role = 'admin' WHERE id = ?", [first.id]);
  }
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`listening ${PORT}`));
})();
