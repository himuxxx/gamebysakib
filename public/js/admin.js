(async () => {
  document.getElementById('back').onclick = () => location.href = '/lobby.html';

  async function load() {
    const { users } = await api.get('/api/admin/users');
    const tbl = document.getElementById('users');
    tbl.innerHTML = '<tr><th>ID</th><th>User</th><th>Role</th><th>Balance</th><th>Actions</th></tr>';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.id}</td><td>${u.username}</td>
        <td><span class="tag ${u.role}">${u.role}</span></td>
        <td>${u.balance}</td>
        <td>
          <button style="width:auto;margin:0;padding:4px 10px;font-size:12px" data-adj="${u.id}">Adjust</button>
          ${u.role !== 'admin'
            ? `<button style="width:auto;margin:0;padding:4px 10px;font-size:12px" data-promote="${u.id}">Make Admin</button>`
            : ''}
        </td>`;
      tbl.appendChild(tr);
    });
    tbl.querySelectorAll('[data-adj]').forEach(b => {
      b.onclick = async () => {
        const amt = parseInt(prompt('Amount to add (negative to subtract):'), 10);
        if (isNaN(amt)) return;
        try {
          await api.post('/api/wallet/adjust', { user_id: +b.dataset.adj, amount: amt, note: 'admin panel' });
          load();
        } catch (e) { alert(e.message); }
      };
    });
    tbl.querySelectorAll('[data-promote]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Promote this user to admin?')) return;
        await api.post('/api/admin/promote', { user_id: +b.dataset.promote });
        load();
      };
    });

    const { matches } = await api.get('/api/games/admin/all');
    const mt = document.getElementById('matches');
    mt.innerHTML = '<tr><th>ID</th><th>Game</th><th>P1</th><th>P2</th><th>Stake</th><th>Winner</th><th>Status</th></tr>';
    matches.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.id}</td><td>${m.game}</td><td>${m.player_a}</td>
        <td>${m.player_b || '—'}</td><td>${m.stake}</td>
        <td>${m.winner || '—'}</td>
        <td><span class="tag ${m.status}">${m.status}</span></td>`;
      mt.appendChild(tr);
    });
  }
  await load();

  document.getElementById('saveSettings').onclick = async () => {
    const err = document.getElementById('err');
    err.textContent = '';
    const sets = [
      ['commission_pct', document.getElementById('s_commission').value],
      ['min_stake', document.getElementById('s_min').value],
      ['max_stake', document.getElementById('s_max').value],
      ['starting_balance', document.getElementById('s_start').value],
    ];
    try {
      for (const [k, v] of sets) if (v) await api.post('/api/admin/settings', { key: k, value: v });
      err.textContent = 'Saved.';
      err.style.color = '#6effa8';
    } catch (e) {
      err.textContent = e.message;
      err.style.color = '#ff6b81';
    }
  };
})();
