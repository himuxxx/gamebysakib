(async () => {
  const me = await api.get('/api/auth/me');
  document.getElementById('uname').textContent = me.user.username;
  document.getElementById('bal').textContent = me.user.balance;
  if (me.user.role === 'admin') document.getElementById('adminBtn').style.display = 'inline-block';

  document.getElementById('adminBtn').onclick = () => location.href = '/admin.html';
  document.getElementById('logout').onclick = async () => {
    await api.post('/api/auth/logout');
    location.href = '/login.html';
  };

  document.querySelectorAll('.game-card').forEach(card => {
    card.onclick = async () => {
      const game = card.dataset.game;
      const stake = parseInt(document.getElementById('stake').value, 10);
      try {
        const res = await api.post('/api/games/match', { game, stake });
        location.href = `/game.html?game=${game}&match=${res.match_id}`;
      } catch (e) { alert(e.message); }
    };
  });
})();
