import express from 'express';
import { query, get, execute } from './db.js';
import { auth, requireAdmin } from './auth.js';

const router = express.Router();
const setting = async (k) => (await get('SELECT value FROM admin_settings WHERE key = ?', [k]))?.value;

router.post('/match', auth, async (req, res) => {
  const { game, stake } = req.body || {};
  if (!game || !stake) return res.status(400).json({ error: 'missing fields' });
  const minStake = parseInt(await setting('min_stake'), 10);
  const maxStake = parseInt(await setting('max_stake'), 10);
  if (stake < minStake || stake > maxStake) {
    return res.status(400).json({ error: `stake must be ${minStake}-${maxStake}` });
  }
  const me = await get('SELECT balance FROM users WHERE id = ?', [req.user.id]);
  if (me.balance < stake) return res.status(400).json({ error: 'insufficient balance' });

  await execute('UPDATE users SET balance = balance - ? WHERE id = ?', [stake, req.user.id]);
  await execute(
    'INSERT INTO transactions (user_id, amount, type, note) VALUES (?, ?, ?, ?)',
    [req.user.id, -stake, 'stake', `match stake ${game}`]
  );

  const open = await get(
    "SELECT * FROM matches WHERE game = ? AND stake = ? AND status = 'open' AND player_a != ? LIMIT 1",
    [game, stake, req.user.id]
  );

  if (open) {
    await execute(
      "UPDATE matches SET player_b = ?, status = 'playing' WHERE id = ? AND status = 'open'",
      [req.user.id, open.id]
    );
    return res.json({ match_id: open.id, status: 'playing' });
  }

  const created = await get(
    'INSERT INTO matches (game, player_a, stake) VALUES (?, ?, ?) RETURNING id',
    [game, req.user.id, stake]
  );
  res.json({ match_id: created.id, status: 'open' });
});

router.post('/:id/finish', auth, async (req, res) => {
  const { winner_id } = req.body || {};
  const match = await get('SELECT * FROM matches WHERE id = ?', [req.params.id]);
  if (!match) return res.status(404).json({ error: 'no match' });
  if (match.status !== 'playing') return res.status(400).json({ error: 'match not playing' });
  if (![match.player_a, match.player_b].includes(req.user.id)) {
    return res.status(403).json({ error: 'not in match' });
  }
  if (![match.player_a, match.player_b].includes(winner_id)) {
    return res.status(400).json({ error: 'invalid winner' });
  }

  const pot = match.stake * 2;
  const commission = Math.floor(pot * parseInt(await setting('commission_pct'), 10) / 100);
  const prize = pot - commission;

  await execute('UPDATE users SET balance = balance + ? WHERE id = ?', [prize, winner_id]);
  await execute(
    'INSERT INTO transactions (user_id, amount, type, note) VALUES (?, ?, ?, ?)',
    [winner_id, prize, 'win', `match ${match.id} win`]
  );
  await execute(
    "UPDATE matches SET winner = ?, status = 'finished', finished_at = strftime('%s','now') WHERE id = ?",
    [winner_id, match.id]
  );
  res.json({ ok: true, prize, commission });
});

router.get('/admin/all', auth, requireAdmin, async (req, res) => {
  const matches = await query('SELECT * FROM matches ORDER BY id DESC LIMIT 200');
  res.json({ matches });
});

router.get('/:id', auth, async (req, res) => {
  const match = await get('SELECT * FROM matches WHERE id = ?', [req.params.id]);
  if (!match) return res.status(404).json({ error: 'no match' });
  if (![match.player_a, match.player_b].includes(req.user.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'not your match' });
  }
  res.json({ match });
});

export default router;
