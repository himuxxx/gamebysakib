import express from 'express';
import { query, get, execute } from './db.js';
import { auth, requireAdmin } from './auth.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  const tx = await query('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50', [req.user.id]);
  res.json({ balance: req.user.balance, transactions: tx });
});

router.post('/adjust', auth, requireAdmin, async (req, res) => {
  const { user_id, amount, note } = req.body || {};
  if (!user_id || !amount) return res.status(400).json({ error: 'missing fields' });
  const user = await get('SELECT id, balance FROM users WHERE id = ?', [user_id]);
  if (!user) return res.status(404).json({ error: 'no such user' });
  if (user.balance + amount < 0) return res.status(400).json({ error: 'would go negative' });
  await execute('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, user_id]);
  await execute('INSERT INTO transactions (user_id, amount, type, note) VALUES (?, ?, ?, ?)', [user_id, amount, 'admin_adjust', note || '']);
  res.json({ ok: true, new_balance: user.balance + amount });
});

export default router;
